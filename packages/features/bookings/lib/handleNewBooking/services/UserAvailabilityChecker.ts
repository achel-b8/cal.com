import dayjs from "@calcom/dayjs";
import type { NewBookingEventType } from "../getEventTypesFromDB";
import { ensureAvailableUsers } from "../ensureAvailableUsers";
import { loadAndValidateUsers } from "../loadAndValidateUsers";
import type { OriginalRescheduledBooking } from "../originalRescheduledBookingUtils";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { createLoggerWithEventDetails } from "../logger";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import type { IsFixedAwareUser } from "../types";
import { getLuckyUser } from "@calcom/lib/server/getLuckyUser";
import { SchedulingType } from "@calcom/prisma/enums";
import { enrichHostsWithDelegationCredentials } from "@calcom/lib/delegationCredential/server";
import getOrgIdFromMemberOrTeamId from "@calcom/lib/getOrgIdFromMemberOrTeamId";
import type { z } from "zod";
import type { routingFormResponseInDbSchema } from "@calcom/app-store/routing-forms/zod";

const _log = logger.getSubLogger({ prefix: ["[UserAvailabilityChecker]"] });

export class UserAvailabilityChecker {
  constructor() {
    /* 初期化処理 */
  }

  async loadAndValidateUsers({
    hostname,
    forcedSlug,
    isPlatform,
    eventType,
    eventTypeId,
    dynamicUserList,
    logger,
    routedTeamMemberIds,
    contactOwnerEmail,
    rescheduleUid,
    routingFormResponse,
  }: {
    hostname?: string;
    forcedSlug?: string;
    isPlatform: boolean;
    eventType: NewBookingEventType;
    eventTypeId: number;
    dynamicUserList: string[];
    logger: ReturnType<typeof createLoggerWithEventDetails>;
    routedTeamMemberIds: number[] | null;
    contactOwnerEmail: string | null;
    rescheduleUid: string | null;
    routingFormResponse: any;
  }) {
    return await loadAndValidateUsers({
      hostname,
      forcedSlug,
      isPlatform,
      eventType,
      eventTypeId,
      dynamicUserList,
      logger,
      routedTeamMemberIds,
      contactOwnerEmail,
      rescheduleUid,
      routingFormResponse,
    });
  }

  async ensureAvailableUsers({
    eventTypeWithUsers,
    dateFrom,
    dateTo,
    timeZone,
    originalRescheduledBooking,
    logger,
    shouldServeCache,
  }: {
    eventTypeWithUsers: any;
    dateFrom: string;
    dateTo: string;
    timeZone: string;
    originalRescheduledBooking: OriginalRescheduledBooking | null;
    logger: ReturnType<typeof createLoggerWithEventDetails>;
    shouldServeCache: boolean;
  }) {
    return await ensureAvailableUsers(
      eventTypeWithUsers,
      {
        dateFrom,
        dateTo,
        timeZone,
        originalRescheduledBooking,
      },
      logger,
      shouldServeCache
    );
  }

  async determineLuckyUsers({
    availableUsers,
    luckyUserPool,
    notAvailableLuckyUsers,
    eventTypeWithUsers,
    eventType,
    allRecurringDates,
    numSlotsToCheckForAvailability,
    timeZone,
    originalRescheduledBooking,
    logger,
    shouldServeCache,
    routingFormResponse,
  }: {
    availableUsers: IsFixedAwareUser[];
    luckyUserPool: IsFixedAwareUser[];
    notAvailableLuckyUsers: IsFixedAwareUser[];
    eventTypeWithUsers: any;
    eventType: NewBookingEventType;
    allRecurringDates?: { start: string; end: string }[];
    numSlotsToCheckForAvailability?: number;
    timeZone: string;
    originalRescheduledBooking: OriginalRescheduledBooking | null;
    logger: ReturnType<typeof createLoggerWithEventDetails>;
    shouldServeCache: boolean;
    routingFormResponse: z.infer<typeof routingFormResponseInDbSchema> | null;
  }) {
    const luckyUsers: IsFixedAwareUser[] = [];
    const userIdsSet = new Set(eventTypeWithUsers.users.map((user: any) => user.id));
    
    const firstUserOrgId = await getOrgIdFromMemberOrTeamId({
      memberId: eventTypeWithUsers.users[0].id ?? null,
      teamId: eventType.teamId,
    });

    while (luckyUserPool.length > 0 && luckyUsers.length < 1) {
      const freeUsers = luckyUserPool.filter(
        (user) => !luckyUsers.concat(notAvailableLuckyUsers).find((existing) => existing.id === user.id)
      );
      
      if (freeUsers.length === 0) break;
      
      const newLuckyUser = await getLuckyUser({
        availableUsers: freeUsers,
        allRRHosts: (
          await enrichHostsWithDelegationCredentials({
            orgId: firstUserOrgId ?? null,
            hosts: eventTypeWithUsers.hosts,
          })
        ).filter((host) => !host.isFixed && userIdsSet.has(host.user.id)),
        eventType,
        routingFormResponse,
      });
      
      if (!newLuckyUser) {
        break; // prevent infinite loop
      }
      
      if (
        allRecurringDates && 
        numSlotsToCheckForAvailability && 
        eventType.schedulingType === SchedulingType.ROUND_ROBIN
      ) {
        try {
          for (
            let i = 0;
            i < allRecurringDates.length &&
            i < numSlotsToCheckForAvailability;
            i++
          ) {
            const start = allRecurringDates[i].start;
            const end = allRecurringDates[i].end;
            
            await this.ensureAvailableUsers({
              eventTypeWithUsers: { ...eventTypeWithUsers, users: [newLuckyUser] },
              dateFrom: dayjs(start).tz(timeZone).format(),
              dateTo: dayjs(end).tz(timeZone).format(),
              timeZone,
              originalRescheduledBooking,
              logger,
              shouldServeCache,
            });
          }
          luckyUsers.push(newLuckyUser);
        } catch {
          notAvailableLuckyUsers.push(newLuckyUser);
          logger.info(
            `Round robin host ${newLuckyUser.name} not available for first two slots. Trying to find another host.`
          );
        }
      } else {
        luckyUsers.push(newLuckyUser);
      }
    }
    
    return luckyUsers;
  }
}
