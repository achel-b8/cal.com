import { EventManager } from "@calcom/lib/EventManager";
import type { CalendarEvent } from "@calcom/types/Calendar";
import { addVideoCallDataToEvent } from "../addVideoCallDataToEvent";
import { getVideoCallDetails } from "../getVideoCallDetails";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import { createLoggerWithEventDetails } from "../logger";
import { eventTypeAppMetadataOptionalSchema } from "@calcom/prisma/zod-utils";
import { MeetLocationType } from "@calcom/app-store/locations";
import { metadata as GoogleMeetMetadata } from "@calcom/app-store/googlevideo/_metadata";
import { CalendarEventBuilder } from "@calcom/features/CalendarEventBuilder";

const _log = logger.getSubLogger({ prefix: ["[CalendarIntegrationManager]"] });

export class CalendarIntegrationManager {
  constructor() {
    /* 初期化処理 */
  }

  async handleEventCreation({
    evt,
    credentials,
    eventTypeApps,
    originalRescheduledBooking,
    bookingLocation,
    loggerWithEventDetails,
    isDryRun,
  }: {
    evt: CalendarEvent;
    credentials: any[];
    eventTypeApps: any;
    originalRescheduledBooking: any | null;
    bookingLocation: string;
    loggerWithEventDetails: ReturnType<typeof createLoggerWithEventDetails>;
    isDryRun: boolean;
  }) {
    if (isDryRun) {
      return {
        results: [],
        referencesToCreate: [],
      };
    }

    const apps = eventTypeAppMetadataOptionalSchema.parse(eventTypeApps);
    const eventManager = new EventManager({ ...evt.organizer, credentials }, apps);
    let results: any[] = [];
    let referencesToCreate: any[] = [];

    if (originalRescheduledBooking?.uid) {
      log.silly("Rescheduling booking", originalRescheduledBooking.uid);

      const evtWithVideoCallData = addVideoCallDataToEvent(originalRescheduledBooking.references, evt);
      const previousHostDestinationCalendar = originalRescheduledBooking?.destinationCalendar
        ? [originalRescheduledBooking?.destinationCalendar]
        : [];

      const changedOrganizer =
        originalRescheduledBooking &&
        evt.schedulingType === "ROUND_ROBIN" &&
        originalRescheduledBooking.userId !== evt.organizer.id;

      if (changedOrganizer) {
        evtWithVideoCallData.title = evt.title;
        evtWithVideoCallData.videoCallData = undefined;
        evtWithVideoCallData.iCalUID = undefined;
      } else {
        evtWithVideoCallData.destinationCalendar = originalRescheduledBooking?.destinationCalendar
          ? [originalRescheduledBooking?.destinationCalendar]
          : evt.destinationCalendar;
      }

      const updateManager = await eventManager.reschedule(
        evtWithVideoCallData,
        originalRescheduledBooking.uid,
        undefined,
        changedOrganizer,
        previousHostDestinationCalendar
      );

      results = updateManager.results;
      referencesToCreate = updateManager.referencesToCreate;

      const isThereAnIntegrationError = results && results.some((res) => !res.success);
      if (isThereAnIntegrationError) {
        const error = {
          errorCode: "BookingReschedulingMeetingFailed",
          message: "Booking Rescheduling failed",
        };

        loggerWithEventDetails.error(
          `EventManager.reschedule failure in some of the integrations ${evt.organizer.username}`,
          safeStringify({ error, results })
        );
      } else if (results.length) {
        if (bookingLocation === MeetLocationType) {
          const googleMeetResult = {
            appName: GoogleMeetMetadata.name,
            type: "conferencing",
            uid: results[0].uid,
            originalEvent: results[0].originalEvent,
          };

          const googleCalIndex = updateManager.referencesToCreate.findIndex(
            (ref) => ref.type === "google_calendar"
          );
          const googleCalResult = results[googleCalIndex];

          if (!googleCalResult) {
            loggerWithEventDetails.warn("Google Calendar not installed but using Google Meet as location");
            results.push({
              ...googleMeetResult,
              success: false,
              calWarnings: ["google_meet_warning"],
            });
          }

          const googleHangoutLink = Array.isArray(googleCalResult?.updatedEvent)
            ? googleCalResult.updatedEvent[0]?.hangoutLink
            : googleCalResult?.updatedEvent?.hangoutLink ?? googleCalResult?.createdEvent?.hangoutLink;

          if (googleHangoutLink) {
            results.push({
              ...googleMeetResult,
              success: true,
            });

            updateManager.referencesToCreate[googleCalIndex] = {
              ...updateManager.referencesToCreate[googleCalIndex],
              meetingUrl: googleHangoutLink,
            };

            updateManager.referencesToCreate.push({
              type: "google_meet_video",
              meetingUrl: googleHangoutLink,
              uid: googleCalResult.uid,
              credentialId: updateManager.referencesToCreate[googleCalIndex].credentialId,
            });
          } else if (googleCalResult && !googleHangoutLink) {
            results.push({
              ...googleMeetResult,
              success: false,
            });
          }
        }
      }
    } else {
      const createManager = await eventManager.create(evt);
      results = createManager.results;
      referencesToCreate = createManager.referencesToCreate;

      const isThereAnIntegrationError = results.some((res) => !res.success);
      if (isThereAnIntegrationError) {
        const error = {
          errorCode: "BookingCreatingMeetingFailed",
          message: "Booking creating failed",
        };

        loggerWithEventDetails.error(
          `EventManager.create failure in some of the integrations ${evt.organizer.username}`,
          safeStringify({ error, results })
        );
      }
    }

    const { videoCallUrl, metadata } = getVideoCallDetails({
      results,
    });

    return {
      results,
      referencesToCreate,
      videoCallUrl,
      metadata,
    };
  }
}
