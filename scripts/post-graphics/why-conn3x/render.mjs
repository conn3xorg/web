// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Renders the why-Conn3x graphics from their HTML sources.
//   node scripts/post-graphics/why-conn3x/render.mjs [card|preview|infographic|all]
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const site = join(dir, "../../../apps/site/public/media/blog/why-conn3x");
const launch = join(dir, "../../../../specs/launch");

const jobs = {
  card: { html: "card.html", out: join(site, "card.png"), width: 1200, height: 630 },
  preview: { html: "card.html?preview", out: join(launch, "github-preview.png"), width: 1280, height: 640 },
  infographic: { html: "infographic.html", out: join(site, "infographic.png"), width: 1600, fullPage: true },
};

const want = process.argv[2] ?? "all";
const browser = await chromium.launch();
for (const [name, job] of Object.entries(jobs)) {
  if (want !== "all" && want !== name) continue;
  const page = await browser.newPage({ viewport: { width: job.width, height: job.height ?? 900 } });
  const [file, query = ""] = job.html.split("?");
  await page.goto("file://" + join(dir, file) + (query && "?" + query));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: job.out, fullPage: Boolean(job.fullPage) });
  console.log(`${name}: ${job.out}`);
  await page.close();
}
await browser.close();
