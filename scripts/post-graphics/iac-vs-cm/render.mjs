// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Renders the square IaC-and-CM video: screenshots index.html at 30 fps,
// lays the sound cues from the page over the music, and encodes with ffmpeg.
//   node scripts/post-graphics/iac-vs-cm/render.mjs [out.mp4]
//   ONLY=3,8,15 node ... renders stills at those seconds instead.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? join(dir, "iac-vs-cm.mp4");
const FPS = 30, DUR = 30;
const frames = mkdtempSync(join(tmpdir(), "conn3x-sq-"));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
await page.goto("file://" + join(dir, "index.html"));
await page.evaluate(() => document.fonts.ready);
const cues = await page.evaluate(() => window.cues());
const only = process.env.ONLY?.split(",").map(Number);
const times = only ?? Array.from({ length: DUR * FPS }, (_, i) => i / FPS);
for (const [i, t] of times.entries()) {
  await page.evaluate((t) => window.seek(t), t);
  await page.screenshot({ path: join(frames, only ? `t${t}.png` : `f${String(i).padStart(4, "0")}.png`) });
}
await browser.close();
if (only) {
  console.log(frames);
  process.exit(0);
}

// Music under everything, faded at both ends; each cue delayed to its time.
const audio = join(dir, "audio");
const inputs = ["-i", join(audio, "music-oldskool.mp3")];
const filters = [`[1:a]atrim=0:${DUR},afade=t=in:d=0.4,afade=t=out:st=${DUR - 2}:d=2,volume=0.22[m]`];
cues.forEach(({ t, sfx }, i) => {
  inputs.push("-i", join(audio, sfx + (sfx === "whoosh" ? ".wav" : ".ogg")));
  const ms = Math.max(Math.round(t * 1000) - (sfx === "whoosh" ? 250 : 0), 0);
  filters.push(`[${i + 2}:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay=${ms}|${ms},volume=1.0[c${i}]`);
});
const mix = ["[m]", ...cues.map((_, i) => `[c${i}]`)].join("");
filters.push(`${mix}amix=inputs=${cues.length + 1}:normalize=0,alimiter=limit=0.89,loudnorm=I=-16:TP=-1.5[a]`);

execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", join(frames, "f%04d.png"), ...inputs,
  "-filter_complex", filters.join(";"), "-map", "0:v", "-map", "[a]", "-t", String(DUR),
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "slow",
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", out]);
rmSync(frames, { recursive: true });
console.log(out);
