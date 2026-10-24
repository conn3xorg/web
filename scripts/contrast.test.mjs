// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0
//
// Checks the brand colour tokens against WCAG 2.2 contrast minimums in
// both themes: 4.5:1 for text, 3:1 for the accent as a UI colour.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../apps/site/src/brand/tokens.css", import.meta.url), "utf8");

function block(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `missing ${selector} block`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/(--c-[\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const themes = { light: block(":root"), dark: block(':root[data-theme="dark"]') };
const text = [
  ["--c-text", "--c-bg"], ["--c-text", "--c-surface"],
  ["--c-text-muted", "--c-bg"], ["--c-text-muted", "--c-surface"],
  ["--c-link", "--c-bg"], ["--c-accent-contrast", "--c-accent"],
];

for (const [name, t] of Object.entries(themes)) {
  for (const [fg, bg] of text) {
    test(`${name}: ${fg} on ${bg} is at least 4.5:1`, () => {
      const r = ratio(t[fg], t[bg]);
      assert.ok(r >= 4.5, `${t[fg]} on ${t[bg]} is ${r.toFixed(2)}:1`);
    });
  }
  test(`${name}: --c-accent on --c-bg is at least 3:1`, () => {
    const r = ratio(t["--c-accent"], t["--c-bg"]);
    assert.ok(r >= 3, `${t["--c-accent"]} on ${t["--c-bg"]} is ${r.toFixed(2)}:1`);
  });
}

test("ratio matches the WCAG reference values", () => {
  assert.equal(ratio("#000000", "#ffffff").toFixed(2), "21.00");
  assert.equal(ratio("#777777", "#ffffff").toFixed(2), "4.48");
});

test("system dark theme matches the explicit dark theme", () => {
  assert.deepEqual(block(':root:not([data-theme="light"])'), themes.dark);
});
