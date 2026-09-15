import { NextRequest, NextResponse } from "next/server";
import { loginSchema } from "@/validations/auth";
import { login } from "@/server/modules/auth/auth.service";
import { AppError } from "@/server/lib/errors";
import { withErrorHandling } from "@/server/lib/apiHandler";
import { enforceRateLimit, getClientIp } from "@/server/middleware/rateLimit";

// Every route here depends on session/DB state — never statically cached.
export const dynamic = "force-dynamic";

// Mobile-specific login: returns the JWT in the response body instead of an
// httpOnly cookie, since a mobile client can't read that cookie. The token
// is meant to be stored in the device's secure storage (Keychain/Keystore
// via expo-secure-store), never plain AsyncStorage, and sent back as
// `Authorization: Bearer <token>` — see src/server/middleware/auth.ts.
//
// Scoped to STUDENT accounts only: the mobile app has no admin/officer UI,
// so there's no reason to ever hand a staff-capable token over this channel.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const ip = getClientIp(req.headers);
  enforceRateLimit(`mobile:${ip}`, { scope: "login", limit: 10, windowMs: 60_000 });

  const body = loginSchema.parse(await req.json());
  const { token, user } = await login(body, ip);

  if (user.role !== "STUDENT") {
    throw new AppError("FORBIDDEN", "This app is for students only.");
  }

  return NextResponse.json({ success: true, token, user });
});
