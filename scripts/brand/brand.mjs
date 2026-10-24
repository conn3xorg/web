// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Conn3x "Junction" brand geometry. One source of truth for every asset.
import opentype from "opentype.js";

export const COLORS = {
  light: { bg: "#f3f5f7", grid: "#dfe5ec", text: "#13233a", muted: "#4a5a70", accent: "#e85d0c" },
  dark: { bg: "#0f1a2b", grid: "#1b2a42", text: "#e6ecf3", muted: "#9fb0c5", accent: "#ff7a2e" },
};

// Mark on a unit grid: traces at y = -1 and +1, junction at (J, 0).
// Horizontal tangents at both ends of each curve keep the joins smooth.
export function markPaths(u, stroke) {
  const lead = 1.1 * u, bend = 1.15 * u, out = 1.25 * u;
  const x0 = stroke / 2, xJ = x0 + lead + bend, xEnd = xJ + out;
  const c1 = x0 + lead + bend * 0.55;
  const top = `M${x0} ${-u}H${x0 + lead}C${c1} ${-u} ${c1} 0 ${xJ} 0`;
  const bottom = `M${x0} ${u}H${x0 + lead}C${c1} ${u} ${c1} 0 ${xJ} 0`;
  const outLine = `M${xJ} 0H${xEnd}`;
  return { top, bottom, outLine, xJ, width: xEnd + stroke / 2, height: 2 * u + stroke, nodeR: stroke * 0.82 };
}

export function wordmark(fontFile, size) {
  const font = opentype.loadSync(fontFile);
  const word = font.getPath("conn3x", 0, 0, size).getBoundingBox();
  const c = font.getPath("c", 0, 0, size).getBoundingBox();
  const xHeight = c.y2 - c.y1;
  return {
    // Path drawn with its top-left at (0, 0).
    d: (dx = 0, dy = 0) => font.getPath("conn3x", dx - word.x1, dy - word.y1, size).toPathData(3),
    width: word.x2 - word.x1,
    height: word.y2 - word.y1,
    // Vertical centre of the lowercase c, measured from the top of the wordmark.
    cCenter: (c.y1 + c.y2) / 2 - word.y1,
    xHeight,
  };
}

// Lockup: mark + wordmark, junction line on the centre of the c.
export function lockup(fontFile, size) {
  const w = wordmark(fontFile, size);
  const stroke = w.xHeight * 0.25;
  const u = w.xHeight * 0.42;
  const m = markPaths(u, stroke);
  const gap = w.xHeight * 0.5;
  const top = Math.min(0, w.cCenter - m.height / 2);
  const markY = w.cCenter - top;      // y of the junction inside the lockup
  const wordY = -top;
  const width = m.width + gap + w.width;
  const height = Math.max(w.height - top, markY + m.height / 2);
  return { w, m, stroke, gap, markY, wordY, width, height };
}

export function markSvg(m, stroke, colors, extra = "") {
  const s = `stroke="${colors.text}" stroke-width="${stroke.toFixed(3)}" stroke-linecap="round" fill="none"`;
  return `<path class="trace" pathLength="1" d="${m.top}" ${s}/><path class="trace" pathLength="1" d="${m.bottom}" ${s}/><path class="out" pathLength="1" d="${m.outLine}" ${s}/><circle class="node" cx="${m.xJ}" cy="0" r="${m.nodeR.toFixed(3)}" fill="${colors.accent}"/>${extra}`;
}
