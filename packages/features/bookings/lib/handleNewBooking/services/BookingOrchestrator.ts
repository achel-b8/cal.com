import { randomUUID } from "crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { BookingStatus } from "@calcom/prisma/enums";
import { createLoggerWithEventDetails } from "../logger";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { HttpError } from "@calcom/lib/http-error";
import { getErrorFromUnknown } from "@calcom/lib/errors";
import { CalendarEventBuilder } from "@calcom/features/CalendarEventBuilder";
import type { CalendarEvent } from "@calcom/types/Calendar";

import { BookingDataValidator } from "./BookingDataValidator";
import { UserAvailabilityChecker } from "./UserAvailabilityChecker";
import { BookingCreator } from "./BookingCreator";
import { CalendarIntegrationManager } from "./CalendarIntegrationManager";
import { NotificationManager } from "./NotificationManager";
import { WebhookManager } from "./WebhookManager";

const _log = logger.getSubLogger({ prefix: ["[BookingOrchestrator]"] });

export class BookingOrchestrator {
  private bookingDataValidator: BookingDataValidator;
  private userAvailabilityChecker: UserAvailabilityChecker;
  private bookingCreator: BookingCreator;
  private calendarIntegrationManager: CalendarIntegrationManager;
  private notificationManager: NotificationManager;
  private webhookManager: WebhookManager;

  constructor() {
    this.bookingDataValidator = new BookingDataValidator();
    this.userAvailabilityChecker = new UserAvailabilityChecker();
    this.bookingCreator = new BookingCreator();
    this.calendarIntegrationManager = new CalendarIntegrationManager();
    this.notificationManager = new NotificationManager();
    this.webhookManager = new WebhookManager();
  }

  async orchestrateBookingCreation({
    rawBookingData,
    eventType,
    userId,
    isPlatform,
    hostname,
    forcedSlug,
    isDryRun = false,
  }: {
    rawBookingData: Record<string, any>;
    eventType: any;
    userId?: number;
    isPlatform: boolean;
    hostname?: string;
    forcedSlug?: string;
    isDryRun?: boolean;
  }) {
    const bookingData = await this.bookingDataValidator.validateBookingData({
      rawBookingData,
      eventType,
      userId,
    });

    const {
      recurringCount,
      noEmail,
      eventTypeId,
      eventTypeSlug,
      hasHashedBookingLink,
      language,
      appsStatus: reqAppsStatus,
      name: bookerName,
      attendeePhoneNumber: bookerPhoneNumber,
      email: bookerEmail,
      guests: reqGuests,
      location,
      notes: additionalNotes,
      smsReminderNumber,
      rescheduleReason,
      luckyUsers,
      routedTeamMemberIds,
      reroutingFormResponses,
      routingFormResponseId,
      _isDryRun: isDryRunFromBookingData = false,
      _shouldServeCache,
      ...reqBody
    } = bookingData;

    const loggerWithEventDetails = createLoggerWithEventDetails({
      eventTypeId,
      eventTypeSlug,
      userId,
      teamId: eventType.teamId,
      hashedLink: hasHashedBookingLink,
      bookerEmail,
      isDryRun: isDryRun || isDryRunFromBookingData,
    });

    await this.bookingDataValidator.validateBookingConstraints({
      bookingData,
      eventType,
      userId,
      eventTypeId,
      loggerWithEventDetails,
    });

    const { users, currentUser, rescheduleUid, isConfirmedByDefault } = await this.userAvailabilityChecker.loadAndValidateUsers({
      hostname,
      forcedSlug,
      isPlatform,
      eventType,
      eventTypeId,
      dynamicUserList: luckyUsers || [],
      logger: loggerWithEventDetails,
      routedTeamMemberIds,
      contactOwnerEmail: bookerEmail,
      rescheduleUid: reqBody.rescheduleUid,
      routingFormResponse: reroutingFormResponses,
    });

    const originalRescheduledBooking = rescheduleUid
      ? await prisma.booking.findUnique({
          where: {
            uid: rescheduleUid,
          },
          include: {
            attendees: true,
            user: true,
            references: true,
            destinationCalendar: true,
          },
        })
      : null;

    const uid = isDryRun || isDryRunFromBookingData ? "dry-run-booking-uid" : randomUUID();

    const eventTypeWithUsers = { ...eventType, users };
    const isFirstRecurringSlot = !reqBody.recurringEventId || recurringCount === 1;
    const isReschedule = !!rescheduleUid;
    const changedOrganizer = originalRescheduledBooking?.userId !== currentUser.id;

    const calendarEventBuilder = new CalendarEventBuilder({
      eventType: eventTypeWithUsers,
      eventTypeId,
      reqBody,
      bookerName,
      bookerEmail,
      bookerPhoneNumber,
      bookerUrl: "",
      additionalNotes,
      location,
      guests: reqGuests || [],
      rescheduleUid,
      rescheduleReason,
      language,
      currentUser,
      smsReminderNumber,
      hasHashedBookingLink,
      responses: bookingData.responses,
      metadata: reqBody.metadata,
      customInputs: reqBody.customInputs,
      dynamicEventSlugRef: reqBody.eventSlug,
      dynamicGroupSlugRef: reqBody.teamSlug,
      hashedLink: hasHashedBookingLink,
    });

    const evt = calendarEventBuilder.build();

    const { results, referencesToCreate, videoCallUrl, metadata } = await this.calendarIntegrationManager.handleEventCreation({
      evt,
      credentials: currentUser.credentials,
      eventTypeApps: eventType.apps,
      originalRescheduledBooking,
      bookingLocation: location,
      loggerWithEventDetails,
      isDryRun: isDryRun || isDryRunFromBookingData,
    });

    const booking = await this.bookingCreator.createBooking({
      uid,
      rescheduledBy: isReschedule ? currentUser.id.toString() : undefined,
      routingFormResponseId,
      reroutingFormResponses,
      eventType: {
        eventTypeData: eventType,
        id: eventTypeId,
        slug: eventTypeSlug,
        organizerUser: currentUser,
        isConfirmedByDefault,
        paymentAppData: {},
      },
      reqBody,
      bookerEmail,
      rescheduleReason,
      changedOrganizer,
      smsReminderNumber,
      responses: bookingData.responses,
      evt,
      originalRescheduledBooking,
      creationSource: "WEB",
      tracking: {},
      loggerWithEventDetails,
      isDryRun: isDryRun || isDryRunFromBookingData,
    });

    await this.notificationManager.sendNotifications({
      evt,
      booking,
      isReschedule,
      isFirstRecurringSlot,
      changedOrganizer,
      noEmail,
      rescheduleReason,
      bookerEmail,
      organizerUser: currentUser,
      originalRescheduledBooking,
      additionalNotes,
      workflows: [],
      loggerWithEventDetails,
      isDryRun: isDryRun || isDryRunFromBookingData,
    });

    await this.webhookManager.sendWebhooks({
      evt,
      booking,
      subscriberOptions: {
        userId: currentUser.id,
        eventTypeId,
        triggerEvent: isReschedule ? "BOOKING_RESCHEDULED" : "BOOKING_CREATED",
        teamId: eventType.teamId,
        orgId: currentUser.organizationId,
        oAuthClientId: null,
      },
      eventTrigger: isReschedule ? "BOOKING_RESCHEDULED" : "BOOKING_CREATED",
      loggerWithEventDetails,
      isDryRun: isDryRun || isDryRunFromBookingData,
    });

    return {
      booking,
      results,
      referencesToCreate,
      videoCallUrl,
      metadata,
    };
  }
}
