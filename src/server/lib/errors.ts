export type ErrorCode =
  | "QR_EXPIRED"
  | "QR_ALREADY_USED"
  | "INVALID_QR"
  | "STUDENT_NOT_FOUND"
  | "STUDENT_INACTIVE"
  | "ALREADY_INSIDE"
  | "ALREADY_OUTSIDE"
  | "STUDENT_SUSPENDED"
  | "DEVICE_UNAUTHORIZED"
  | "GATE_INACTIVE"
  | "SESSION_REVOKED"
  | "EXIT_CODE_INACTIVE"
  | "RATE_LIMITED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  QR_EXPIRED: 409,
  QR_ALREADY_USED: 409,
  INVALID_QR: 400,
  STUDENT_NOT_FOUND: 404,
  STUDENT_INACTIVE: 403,
  ALREADY_INSIDE: 409,
  ALREADY_OUTSIDE: 409,
  STUDENT_SUSPENDED: 403,
  DEVICE_UNAUTHORIZED: 403,
  GATE_INACTIVE: 403,
  SESSION_REVOKED: 409,
  EXIT_CODE_INACTIVE: 409,
  RATE_LIMITED: 429,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

/** Application error carrying a stable machine-readable code + safe user-facing message. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

/** Never leak raw internal error text to clients — map to a generic safe message. */
export function toSafeErrorResponse(error: unknown): { status: number; body: { success: false; error: ErrorCode; message: string; details?: unknown } } {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: { success: false, error: error.code, message: error.message, details: error.details },
    };
  }
  return {
    status: 500,
    body: { success: false, error: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
  };
}
