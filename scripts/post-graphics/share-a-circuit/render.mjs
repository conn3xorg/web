// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Renders the circuits post card from their HTML sources.
//   node scripts/post-graphics/share-a-circuit/render.mjs [card]
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const site = join(dir, "../../../apps/site/public/media/blog/share-a-circuit");
const jobs = {
  card: { html: "card.html", out: join(site, "card.png"), width: 1200, height: 630 },
};
const want = process.argv[2] ?? "all";
const browser = await chromium.launch();
for (const [name, job] of Object.entries(jobs)) {
  if (want !== "all" && want !== name) continue;
  const page = await browser.newPage({ viewport: { width: job.width, height: job.height ?? 900 } });
  await page.goto("file://" + join(dir, job.html));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: job.out, fullPage: Boolean(job.fullPage) });
  console.log(`${name}: ${job.out}`);
  await page.close();
}
await browser.close();
