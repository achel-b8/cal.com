import { createBooking } from "../createBooking";
import logger from "@calcom/lib/logger";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { NewBookingEventType } from "../getEventTypesFromDB";
import type { OriginalRescheduledBooking } from "../originalRescheduledBookingUtils";
import { safeStringify } from "@calcom/lib/safeStringify";
import { BookingStatus } from "@calcom/prisma/enums";
import { getErrorFromUnknown } from "@calcom/lib/errors";
import { HttpError } from "@calcom/lib/http-error";
import { createLoggerWithEventDetails } from "../logger";
import type { PaymentAppData } from "../types";
import type { CreationSource } from "@calcom/prisma/enums";

const _log = logger.getSubLogger({ prefix: ["[BookingCreator]"] });

export class BookingCreator {
  constructor() {
  }

  async createBooking({
    uid,
    rescheduledBy,
    routingFormResponseId,
    reroutingFormResponses,
    eventType,
    reqBody,
    bookerEmail,
    rescheduleReason,
    changedOrganizer,
    smsReminderNumber,
    responses,
    evt,
    originalRescheduledBooking,
    creationSource,
    tracking,
    loggerWithEventDetails,
    isDryRun,
  }: {
    uid: string | any;
    rescheduledBy?: string;
    routingFormResponseId?: number;
    reroutingFormResponses?: any;
    eventType: {
      eventTypeData: NewBookingEventType;
      id: number;
      slug: string;
      organizerUser: any;
      isConfirmedByDefault: boolean;
      paymentAppData: PaymentAppData;
    };
    reqBody: any;
    bookerEmail: string;
    rescheduleReason?: string;
    changedOrganizer: boolean;
    smsReminderNumber?: string;
    responses: any;
    evt: CalendarEvent;
    originalRescheduledBooking: OriginalRescheduledBooking;
    creationSource?: CreationSource;
    tracking?: any;
    loggerWithEventDetails: ReturnType<typeof createLoggerWithEventDetails>;
    isDryRun: boolean;
  }) {
    try {
      if (isDryRun) {
        return null; // ドライランモードではデータベースに書き込まない
      }
      
      const booking = await createBooking({
        uid,
        rescheduledBy,
        routingFormResponseId,
        reroutingFormResponses,
        reqBody: {
          user: reqBody.user,
          metadata: reqBody.metadata,
          recurringEventId: reqBody.recurringEventId,
        },
        eventType: {
          eventTypeData: eventType.eventTypeData,
          id: eventType.id,
          slug: eventType.slug,
          organizerUser: eventType.organizerUser,
          isConfirmedByDefault: eventType.isConfirmedByDefault,
          paymentAppData: eventType.paymentAppData,
        },
        input: {
          bookerEmail,
          rescheduleReason,
          changedOrganizer,
          smsReminderNumber,
          responses,
        },
        evt,
        originalRescheduledBooking,
        creationSource,
        tracking,
      });

      loggerWithEventDetails.debug(
        "Created booking in DB",
        safeStringify({
          bookingId: booking.id,
          bookingUid: booking.uid,
          bookingStatus: booking.status,
        })
      );

      return booking;
    } catch (_err) {
      const err = getErrorFromUnknown(_err);
      loggerWithEventDetails.error(
        `Booking creation failed`,
        "Error when saving booking to db",
        err.message
      );
      if (err.code === "P2002") {
        throw new HttpError({ statusCode: 409, message: "booking_conflict" });
      }
      throw err;
    }
  }
}
