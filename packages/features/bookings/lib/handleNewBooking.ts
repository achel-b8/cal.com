import { ErrorCode } from "@calcom/lib/errorCodes";
import { getErrorFromUnknown } from "@calcom/lib/errors";
import { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";

import { TRPCError } from "@trpc/server";

import { getEventTypesFromDB } from "./handleNewBooking/getEventTypesFromDB";
import { BookingOrchestrator } from "./handleNewBooking/services/BookingOrchestrator";

const log = logger.getSubLogger({ prefix: ["[handleNewBooking]"] });

/**
 * リファクタリングされた予約作成ハンドラー
 * 各責務を分離したサービスクラスを使用して予約プロセスを管理します
 */
export async function handler(req: {
  input: Record<string, unknown>;
  ctx: {
    user?: { id: number; email: string; username: string };
    res?: { statusCode: number };
    hostname?: string;
    forcedSlug?: string;
    isPlatform?: boolean;
  };
}) {
  const { input, ctx } = req;
  const { user } = ctx;
  const userId = user?.id;

  try {
    const eventType = await getEventTypesFromDB(input.eventTypeId as number);
    if (!eventType) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Event type not found" });
    }

    const bookingOrchestrator = new BookingOrchestrator();
    const result = await bookingOrchestrator.orchestrateBookingCreation({
      rawBookingData: input as Record<string, any>,
      eventType,
      userId,
      isPlatform: ctx.isPlatform || false,
      hostname: ctx.hostname,
      forcedSlug: ctx.forcedSlug,
    });

    return {
      ...result,
      success: true,
    };
  } catch (err) {
    const error = getErrorFromUnknown(err);
    log.error("Error in handleNewBooking", error, safeStringify(err));

    if (error instanceof HttpError) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error.message,
        cause: error.statusCode,
      });
    }

    if (error instanceof TRPCError) {
      throw error;
    }

    if (error.code === ErrorCode.InternalServerError) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
        cause: error,
      });
    }

    throw new TRPCError({
      code: "BAD_REQUEST",
      message: error.message,
      cause: error,
    });
  }
}

/**
 * 従来のhandleNewBooking関数をリファクタリングされた新しいハンドラーにリダイレクトします
 * 後方互換性のために維持されています
 */
export default async function handleNewBooking(req: {
  input: Record<string, unknown>;
  ctx: {
    user?: { id: number; email: string; username: string };
    res?: { statusCode: number };
    hostname?: string;
    forcedSlug?: string;
    isPlatform?: boolean;
  };
}) {
  return await handler(req);
}
