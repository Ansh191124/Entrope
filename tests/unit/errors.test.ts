import { describe, it, expect } from "vitest";
import { AppError, toSafeErrorResponse } from "@/server/lib/errors";

describe("Error safety (§34: never leak raw internal errors)", () => {
  it("maps a known AppError to its stable code and status", () => {
    const { status, body } = toSafeErrorResponse(new AppError("QR_EXPIRED", "This QR code has expired."));
    expect(status).toBe(409);
    expect(body).toEqual({
      success: false,
      error: "QR_EXPIRED",
      message: "This QR code has expired.",
      details: undefined,
    });
  });

  it("never leaks raw internal error text for unexpected exceptions", () => {
    const dbError = new Error(
      'insert or update on table "students" violates foreign key constraint "students_user_id_fkey" — connection string: postgres://user:supersecret@host'
    );
    const { status, body } = toSafeErrorResponse(dbError);
    expect(status).toBe(500);
    expect(body.error).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("supersecret");
    expect(JSON.stringify(body)).not.toContain("constraint");
  });
});
