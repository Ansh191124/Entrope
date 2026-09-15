import { ImageResponse } from "next/og";
import { ShieldGlyph } from "../_icon/shieldIcon";

export const runtime = "edge";
export const contentType = "image/png";
export const size = { width: 180, height: 180 };

// iOS applies its own corner-rounding to home-screen icons, so this is a
// plain filled square (no transparency, minimal inset) rather than the
// safe-zone padding the maskable Android icon needs.
export function GET() {
  return new ImageResponse(<ShieldGlyph size={180} padding={22} />, size);
}
