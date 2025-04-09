import {
  sendAttendeeRequestEmailAndSMS,
  sendOrganizerRequestEmail,
  sendRescheduledEmailsAndSMS,
  sendRoundRobinCancelledEmailsAndSMS,
  sendRoundRobinRescheduledEmailsAndSMS,
  sendRoundRobinScheduledEmailsAndSMS,
  sendScheduledEmailsAndSMS,
} from "@calcom/emails/email-manager";
import logger from "@calcom/lib/logger";
import type { CalendarEvent } from "@calcom/types/Calendar";
import { scheduleWorkflowReminders } from "@calcom/features/ee/workflows/lib/reminders/reminderScheduler";
import {
  allowDisablingAttendeeConfirmationEmails,
  allowDisablingHostConfirmationEmails,
} from "@calcom/features/ee/workflows/lib/allowDisablingStandardEmails";
import { scheduleMandatoryReminder } from "@calcom/ee/workflows/lib/reminders/scheduleMandatoryReminder";
import { createLoggerWithEventDetails } from "../logger";
import { safeStringify } from "@calcom/lib/safeStringify";

const _log = logger.getSubLogger({ prefix: ["[NotificationManager]"] });

export class NotificationManager {
  constructor() {
    /* 初期化処理 */
  }

  async sendNotifications({
    evt,
    booking,
    isReschedule,
    isFirstRecurringSlot,
    changedOrganizer,
    noEmail,
    rescheduleReason,
    bookerEmail,
    organizerUser,
    originalRescheduledBooking,
    additionalNotes,
    workflows,
    loggerWithEventDetails,
    isDryRun,
  }: {
    evt: CalendarEvent;
    booking: any;
    isReschedule: boolean;
    isFirstRecurringSlot: boolean;
    changedOrganizer: boolean;
    noEmail: boolean;
    rescheduleReason?: string;
    bookerEmail: string;
    organizerUser: any;
    originalRescheduledBooking: any;
    additionalNotes?: string;
    workflows: any[];
    loggerWithEventDetails: ReturnType<typeof createLoggerWithEventDetails>;
    isDryRun: boolean;
  }) {
    if (isDryRun) {
      return;
    }

    if (booking.attendees.length > 1 && booking.attendees[0].email !== bookerEmail) {
      return;
    }

    const disableStandardEmails = {
      all: {
        attendee: await allowDisablingAttendeeConfirmationEmails(workflows),
        host: await allowDisablingHostConfirmationEmails(workflows),
      }
    };

    if (isReschedule) {
      if (changedOrganizer) {
        await sendRoundRobinRescheduledEmailsAndSMS(
          evt,
          [organizerUser],
          { disableStandardEmails }
        );
      } else {
        await sendRescheduledEmailsAndSMS(
          evt,
          { disableStandardEmails }
        );
      }
    } else {
      if (evt.requiresConfirmation) {
        if (evt.team?.name) {
          await sendOrganizerRequestEmail(evt);
        }

        if (!noEmail) {
          await sendAttendeeRequestEmailAndSMS(
            evt,
            evt.attendees[0],
            { disableStandardEmails }
          );
        }
      } else {
        if (evt.team?.name) {
          if (evt.schedulingType === "ROUND_ROBIN") {
            await sendRoundRobinScheduledEmailsAndSMS({
              calEvent: evt,
              members: evt.team.members,
              eventTypeMetadata: { disableStandardEmails }
            });
          } else {
            await sendScheduledEmailsAndSMS(
              evt,
              undefined,
              noEmail,
              noEmail,
              { disableStandardEmails }
            );
          }
        } else {
          await sendScheduledEmailsAndSMS(
            evt,
            undefined,
            noEmail,
            noEmail,
            { disableStandardEmails }
          );
        }
      }
    }

    if (isFirstRecurringSlot && workflows.length > 0) {
      await scheduleWorkflowReminders({
        workflows,
        smsReminderNumber: booking.smsReminderNumber,
        calendarEvent: evt as any,
      });
    }

    if (isFirstRecurringSlot) {
      const extendedEvt = evt as any;
      
      await scheduleMandatoryReminder({
        evt: extendedEvt as any,
        workflows: workflows || [],
        requiresConfirmation: evt.requiresConfirmation || false,
        hideBranding: false,
        seatReferenceUid: undefined,
      });
    }
  }
}
