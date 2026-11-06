// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Once a release ships something, no page may still call it "next".
// When a feature ships, add the phrases that announced it as future work.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SHIPPED = [
  { feature: "Windows Server preview (v0.7.0)", stale: [/Windows (?:servers?|Server) (?:comes?|is) next/i, /Windows support is coming/i, /Windows comes next/i] },
  { feature: "network-device circuits (N1)", stale: [/Then network devices\./] },
];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(astro|md|mdx|json)$/.test(name) ? [p] : [];
  });
}

const pages = [...files("apps/site/src/pages"), ...files("apps/site/src/components")];

test("no page calls a shipped feature future work", () => {
  const hits = [];
  for (const p of pages) {
    const text = readFileSync(p, "utf8");
    for (const { feature, stale } of SHIPPED)
      for (const re of stale) if (re.test(text)) hits.push(`${p}: ${feature} matches ${re}`);
  }
  assert.deepEqual(hits, []);
});

test("the check catches the old homepage line", () => {
  const old = "Windows servers come next, with Azure examples tested end to end. Then network devices.";
  assert.ok(SHIPPED.some(({ stale }) => stale.some((re) => re.test(old))));
});
