import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";

import getBookingDataSchema from "../../getBookingDataSchema";
import type { AwaitedBookingData, EventTypeInfo } from "../getBookingData";
import { getBookingData } from "../getBookingData";
import type { NewBookingEventType } from "../getEventTypesFromDB";
import { createLoggerWithEventDetails } from "../logger";
import { validateBookingTimeIsNotOutOfBounds } from "../validateBookingTimeIsNotOutOfBounds";
import { validateEventLength } from "../validateEventLength";
import { checkIfBookerEmailIsBlocked } from "../checkIfBookerEmailIsBlocked";

const _log = logger.getSubLogger({ prefix: ["[BookingDataValidator]"] });

export class BookingDataValidator {
  constructor() {
    /* 初期化処理 */
  }

  async validateBookingData({
    rawBookingData,
    eventType,
    userId,
    bookingDataSchemaGetter = getBookingDataSchema,
  }: {
    rawBookingData: Record<string, any>;
    eventType: NewBookingEventType;
    userId?: number;
    bookingDataSchemaGetter?: typeof getBookingDataSchema;
  }): Promise<AwaitedBookingData> {
    const bookingDataSchema = bookingDataSchemaGetter({
      view: rawBookingData.rescheduleUid ? "reschedule" : "booking",
      bookingFields: eventType.bookingFields,
    });

    const bookingData = await getBookingData({
      reqBody: rawBookingData,
      eventType,
      schema: bookingDataSchema,
    });

    return bookingData;
  }

  async validateBookingConstraints({
    bookingData,
    eventType,
    userId,
    eventTypeId,
    loggerWithEventDetails,
  }: {
    bookingData: AwaitedBookingData;
    eventType: NewBookingEventType;
    userId?: number;
    eventTypeId: number;
    loggerWithEventDetails?: ReturnType<typeof createLoggerWithEventDetails>;
  }): Promise<void> {
    const { email: bookerEmail, _isDryRun: isDryRun = false } = bookingData;
    
    await checkIfBookerEmailIsBlocked({ loggedInUserId: userId, bookerEmail });

    const reqBody = this.extractReqBody(bookingData);
    
    const user = eventType.users.find((user) => user.id === eventType.userId);
    const userSchedule = user?.schedules.find((schedule) => schedule.id === user?.defaultScheduleId);
    const eventTimeZone = eventType.schedule?.timeZone ?? userSchedule?.timeZone;

    await validateBookingTimeIsNotOutOfBounds(
      reqBody.start,
      reqBody.timeZone,
      eventType,
      eventTimeZone,
      loggerWithEventDetails
    );

    validateEventLength({
      reqBodyStart: reqBody.start,
      reqBodyEnd: reqBody.end,
      eventTypeMultipleDuration: eventType.metadata?.multipleDuration,
      eventTypeLength: eventType.length,
      logger: loggerWithEventDetails,
    });
  }

  private extractReqBody(bookingData: AwaitedBookingData): any {
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
      _isDryRun: isDryRun = false,
      _shouldServeCache,
      ...reqBody
    } = bookingData;

    return reqBody;
  }
}
