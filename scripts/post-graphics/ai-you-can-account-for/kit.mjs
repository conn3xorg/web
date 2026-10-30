// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Renders one post of the "AI you can account for" series: the site card and
// diagrams into apps/site/public/media/blog/<slug>, and the social kit (card,
// square, tall and each diagram) into $KIT_DIR/<slug>, by default
// ~/Desktop/conn3x-social/<slug>. Each post's render.mjs calls renderKit.
import { chromium } from "@playwright/test";
import { copyFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export async function renderKit(dir, slug, diagrams, { site = true, card = "card.html" } = {}) {
  const media = join(dir, "../../../apps/site/public/media/blog", slug);
  const kit = join(process.env.KIT_DIR ?? join(homedir(), "Desktop/conn3x-social"), slug);
  mkdirSync(media, { recursive: true });
  mkdirSync(kit, { recursive: true });

  const jobs = [
    ...(site ? [{ html: card, out: join(media, "card.png"), width: 1200, height: 630 }] : []),
    { html: card, out: join(kit, site ? "card.png" : "card-1200x675.png"), width: 1200, height: 675 },
    { html: card, out: join(kit, "square.png"), width: 1080, height: 1080 },
    { html: card, out: join(kit, "tall.png"), width: 1080, height: 1350 },
    ...diagrams.map((name) => ({ html: `${name}.html`, out: join(media, `${name}.png`), width: 1600, fullPage: true, copy: join(kit, `${name}.png`) })),
  ];

  const browser = await chromium.launch();
  for (const job of jobs) {
    const page = await browser.newPage({ viewport: { width: job.width, height: job.height ?? 900 } });
    await page.goto("file://" + join(dir, job.html));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: job.out, fullPage: Boolean(job.fullPage) });
    if (job.copy) copyFileSync(job.out, job.copy);
    console.log(job.out);
    await page.close();
  }
  await browser.close();
}
