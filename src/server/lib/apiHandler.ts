import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { toSafeErrorResponse } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";

/**
 * Wraps a route handler so every failure — validation error, AppError, or an
 * unexpected exception — becomes a consistent, safe JSON response. Raw
 * internal error text (stack traces, DB constraint messages) never reaches
 * the client; it's logged server-side instead. See spec §34.
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json(
          { success: false, error: "VALIDATION_ERROR", message: "Invalid request data.", details: error.flatten() },
          { status: 400 }
        );
      }
      const { status, body } = toSafeErrorResponse(error);
      if (status >= 500) {
        logger.error("UNHANDLED_API_ERROR", { message: (error as Error)?.message, stack: (error as Error)?.stack });
      }
      return NextResponse.json(body, { status });
    }
  };
}
