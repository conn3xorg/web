// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = process.env.BLOG_TEST_REPO_ROOT
  ? resolve(process.env.BLOG_TEST_REPO_ROOT)
  : fileURLToPath(new URL("../", import.meta.url));
const blogRoot = join(repoRoot, "apps/site/src/content/blog");

function attribute(tag, name) {
  return new RegExp(`\\b${name}\\s*=\\s*([\"'])(.*?)\\1`, "i").exec(tag)?.[2];
}

test("1600-pixel PNGs in blog figures link to their full-size image", () => {
  let checked = 0;
  for (const filename of readdirSync(blogRoot).filter((name) => name.endsWith(".md"))) {
    const markdown = readFileSync(join(blogRoot, filename), "utf8")
      .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
      .replace(/^```[\s\S]*?^```.*$/gm, "");

    for (const [, figure] of markdown.matchAll(/<figure\b[^>]*>([\s\S]*?)<\/figure>/gi)) {
      const images = [...figure.matchAll(/<img\b[^>]*>/gi)];
      for (const [imageTag] of images) {
        const src = attribute(imageTag, "src");
        if (attribute(imageTag, "width") !== "1600" || !/\.png(?:[?#].*)?$/i.test(src ?? "")) continue;
        checked++;
        const linkedToSelf = [...figure.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].some(([, attrs, anchor]) =>
          attribute(`<a ${attrs}>`, "href") === src
          && [...anchor.matchAll(/<img\b[^>]*>/gi)].some(([linkedImage]) => attribute(linkedImage, "src") === src),
        );
        assert.ok(linkedToSelf, `${filename}: ${src} should link to itself inside its figure`);
      }
    }
  }
  assert.ok(checked > 0, "expected at least one 1600-pixel PNG in a blog figure");
});
