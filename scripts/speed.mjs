// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Runs Lighthouse's mobile performance check on the pages people land on
// most and fails when one takes 2 seconds or more to show its largest
// content (LCP). Every page has to load in under 2 seconds.
//
//   node scripts/speed.mjs site http://127.0.0.1:8787
//   node scripts/speed.mjs docs http://127.0.0.1:8788
//
// One site at a time, since two wrangler dev servers can't run at once. A
// page over budget gets one more try before it counts, since a shared
// runner is noisy.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BUDGET_MS = 2000;
const LIGHTHOUSE = "lighthouse@12.6.1";

const PAGES = {
  site: ["/", "/community", "/circuits", "/blog", "/blog/circuit-builder", "/blog/why-conn3x"],
  docs: ["/", "/install", "/get-started", "/guides/migrate-from-ansible"],
};

const [group, base] = process.argv.slice(2);
if (!PAGES[group] || !base) {
  console.error("usage: node scripts/speed.mjs site|docs <url>");
  process.exit(2);
}

const dir = mkdtempSync(join(tmpdir(), "speed-"));

function lcp(url) {
  const out = join(dir, "report.json");
  execFileSync("npx", ["--yes", LIGHTHOUSE, url, "--quiet", "--only-categories=performance", "--output=json", `--output-path=${out}`, "--chrome-flags=--headless=new --no-sandbox"], { stdio: ["ignore", "ignore", "inherit"] });
  return JSON.parse(readFileSync(out, "utf8")).audits["largest-contentful-paint"].numericValue;
}

let failed = 0;
for (const path of PAGES[group]) {
  const url = base + path;
  let ms = lcp(url);
  if (ms >= BUDGET_MS) ms = Math.min(ms, lcp(url));
  const ok = ms < BUDGET_MS;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "SLOW"} ${String(Math.round(ms)).padStart(5)} ms  ${url}`);
}
if (failed) {
  console.error(`\n${failed} page(s) take ${BUDGET_MS} ms or more to show their largest content on Lighthouse's mobile run.`);
  process.exit(1);
}
