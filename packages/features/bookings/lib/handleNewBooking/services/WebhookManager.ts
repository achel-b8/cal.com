import logger from "@calcom/lib/logger";
import type { CalendarEvent } from "@calcom/types/Calendar";
import { WebhookTriggerEvents } from "@calcom/prisma/enums";
import { createLoggerWithEventDetails } from "../logger";
import sendPayload from "@calcom/features/webhooks/lib/sendPayload";

const _log = logger.getSubLogger({ prefix: ["[WebhookManager]"] });

import prisma from "@calcom/prisma";
import type { Webhook } from "@prisma/client";

export class WebhookManager {
  constructor() {
    /* 初期化処理 */
  }

  async sendWebhooks({
    evt,
    booking,
    subscriberOptions,
    eventTrigger,
    loggerWithEventDetails,
    isDryRun,
  }: {
    evt: CalendarEvent;
    booking: any;
    subscriberOptions: {
      userId: number | null;
      eventTypeId: number;
      triggerEvent: WebhookTriggerEvents;
      teamId: number | null;
      orgId: number | null;
      oAuthClientId: string | null;
    };
    eventTrigger: WebhookTriggerEvents;
    loggerWithEventDetails: ReturnType<typeof createLoggerWithEventDetails>;
    isDryRun: boolean;
  }) {
    if (isDryRun) {
      return;
    }

    const subscribers = await this.getWebhookSubscribers(subscriberOptions);
    
    const promises = subscribers.map((subscriber) => {
      return sendPayload(
        subscriber.secret,
        eventTrigger,
        new Date().toISOString(),
        subscriber,
        {
          ...evt,
          ...booking,
        }
      ).catch((error) => {
        loggerWithEventDetails.error(
          `Error executing webhook for event: ${eventTrigger}`,
          subscriber.subscriberUrl,
          error
        );
      });
    });

    await Promise.all(promises);
  }

  private async getWebhookSubscribers({
    userId,
    eventTypeId,
    triggerEvent,
    teamId,
    orgId,
    oAuthClientId,
  }: {
    userId: number | null;
    eventTypeId: number;
    triggerEvent: WebhookTriggerEvents;
    teamId: number | null;
    orgId: number | null;
    oAuthClientId: string | null;
  }) {
    const where = {
      OR: [
        {
          userId,
          eventTypeId,
        },
        {
          userId,
          eventTypeId: null,
        },
        {
          teamId,
          eventTypeId,
        },
        {
          teamId,
          eventTypeId: null,
        },
        {
          orgId,
          eventTypeId,
        },
        {
          orgId,
          eventTypeId: null,
        },
        {
          oAuthClientId,
          eventTypeId,
        },
        {
          oAuthClientId,
          eventTypeId: null,
        },
      ],
      active: true,
      eventTriggers: {
        has: triggerEvent,
      },
    };

    return await prisma.webhook.findMany({
      where,
      select: {
        id: true,
        subscriberUrl: true,
        payloadTemplate: true,
        appId: true,
        secret: true,
      },
    });
  }

  async setupWebhookScheduling({
    booking,
    subscriberOptions,
    loggerWithEventDetails,
    isDryRun,
  }: {
    booking: any;
    subscriberOptions: {
      userId: number | null;
      eventTypeId: number;
      triggerEvent: WebhookTriggerEvents;
      teamId: number | null;
      orgId: number | null;
      oAuthClientId: string | null;
    };
    loggerWithEventDetails: ReturnType<typeof createLoggerWithEventDetails>;
    isDryRun: boolean;
  }) {
    if (isDryRun) {
      return;
    }

    const subscriberOptionsMeetingStarted = {
      ...subscriberOptions,
      triggerEvent: WebhookTriggerEvents.MEETING_STARTED,
    };

    const subscriberOptionsMeetingEnded = {
      ...subscriberOptions,
      triggerEvent: WebhookTriggerEvents.MEETING_ENDED,
    };

  }
}
