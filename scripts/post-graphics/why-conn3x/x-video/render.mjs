// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Renders the X video: screenshots index.html at 30 fps, then encodes with ffmpeg.
//   node scripts/post-graphics/why-conn3x/x-video/render.mjs [out.mp4]
//   ONLY=3,8,15 node ... renders stills at those seconds instead.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? join(dir, "../../../../../specs/launch/why-conn3x-x.mp4");
const FPS = 30, DUR = 31;
const frames = mkdtempSync(join(tmpdir(), "conn3x-x-"));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto("file://" + join(dir, "index.html"));
await page.evaluate(() => document.fonts.ready);
const only = process.env.ONLY?.split(",").map(Number);
const times = only ?? Array.from({ length: DUR * FPS }, (_, i) => i / FPS);
for (const [i, t] of times.entries()) {
  await page.evaluate((t) => window.seek(t), t);
  await page.screenshot({ path: join(frames, only ? `t${t}.png` : `f${String(i).padStart(4, "0")}.png`) });
}
await browser.close();
if (only) {
  console.log(frames);
} else {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", join(frames, "f%04d.png"),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "slow", "-movflags", "+faststart", out]);
  rmSync(frames, { recursive: true });
  console.log(out);
}
