import { ImageResponse } from "next/og";
import { ShieldGlyph } from "../_icon/shieldIcon";

export const runtime = "edge";
export const contentType = "image/png";
export const size = { width: 512, height: 512 };

// Slightly more inset padding than the 192px icon — this is also used as the
// "maskable" icon in the manifest, and Android's adaptive-icon mask can crop
// up to ~20% from each edge, so the glyph needs safe-zone margin.
export function GET() {
  return new ImageResponse(<ShieldGlyph size={512} padding={96} />, size);
}
