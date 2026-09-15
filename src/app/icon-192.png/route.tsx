import { ImageResponse } from "next/og";
import { ShieldGlyph } from "../_icon/shieldIcon";

export const runtime = "edge";
export const contentType = "image/png";
export const size = { width: 192, height: 192 };

export function GET() {
  return new ImageResponse(<ShieldGlyph size={192} padding={28} />, size);
}
