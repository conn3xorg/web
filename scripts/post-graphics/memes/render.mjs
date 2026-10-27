// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Renders every section.m in the given HTML files to <out-dir>/<id>.png.
//   node scripts/post-graphics/memes/render.mjs <out-dir> lifecycle.html [more.html…]
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const [out, ...files] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1500 } });
for (const f of files) {
  await page.goto("file://" + join(dir, f));
  await page.evaluate(() => document.fonts.ready);
  for (const el of await page.$$("section.m")) {
    const id = await el.getAttribute("id");
    await el.screenshot({ path: join(out, `${id}.png`) });
    console.log(id);
  }
}
await browser.close();
