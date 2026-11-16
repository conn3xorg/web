// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0
import { existsSync } from "node:fs";

// webpFor is the WebP beside a PNG under public/, such as a blog cover, or
// undefined when there isn't one. Pages offer it first and keep the PNG as
// the fallback and for og:image, which every link preview reads.
export function webpFor(png) {
  if (!png?.endsWith(".png")) return undefined;
  const webp = png.replace(/\.png$/, ".webp");
  return existsSync(`public${webp}`) ? webp : undefined;
}
