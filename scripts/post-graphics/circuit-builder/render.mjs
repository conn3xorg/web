// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Renders the Circuit Builder post graphics from their HTML sources. The
// site gets card, flow and safety; pass a folder to also write the social kit.
//   node scripts/post-graphics/circuit-builder/render.mjs [kitDir]
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const site = join(dir, "../../../apps/site/public/media/blog/circuit-builder");
const kit = process.argv[2];
const jobs = [
  { html: "card.html#card", out: [join(site, "card.png")], width: 1200, height: 630 },
  { html: "flow.html", out: [join(site, "flow.png")], kit: "flow.png", width: 1600, fullPage: true },
  { html: "safety.html", out: [join(site, "safety.png")], kit: "safety.png", width: 1600, fullPage: true },
  { html: "card.html#x", kit: "card.png", width: 1200, height: 675 },
  { html: "card.html#square", kit: "square.png", width: 1080, height: 1080 },
  { html: "card.html#tall", kit: "tall.png", width: 1080, height: 1350 },
];
const browser = await chromium.launch();
for (const job of jobs) {
  const outs = [...(job.out ?? []), ...(kit && job.kit ? [join(kit, job.kit)] : [])];
  if (!outs.length) continue;
  const page = await browser.newPage({ viewport: { width: job.width, height: job.height ?? 900 } });
  await page.goto("file://" + join(dir, job.html));
  await page.evaluate(() => document.fonts.ready);
  for (const path of outs) {
    await page.screenshot({ path, fullPage: Boolean(job.fullPage) });
    console.log(path);
  }
  await page.close();
}
await browser.close();
