// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

import { test } from "node:test";
import assert from "node:assert/strict";
import { addLastmod, candidates } from "./sitemap-lastmod.mjs";

test("candidates map each kind of page to its source", () => {
  assert.equal(candidates("/")[0], "src/content/docs/index.md");
  assert.ok(candidates("/").includes("src/pages/index.astro"));
  assert.ok(candidates("/modules/file").includes("src/content/docs/modules/file.md"));
  assert.ok(candidates("/blog/a-server-for-every-test").includes("src/content/blog/a-server-for-every-test.md"));
  assert.ok(candidates("/circuits/nginx/grade").includes("src/data/circuits/nginx.json"));
  assert.ok(candidates("/community/giving-back").includes("src/pages/community/giving-back.astro"));
});

test("addLastmod dates what it can and leaves the rest alone", () => {
  const xml = '<urlset><url><loc>https://conn3x.org/faq</loc></url><url><loc>https://conn3x.org/x</loc></url></urlset>';
  const out = addLastmod(xml, (p) => (p === "/faq" ? "2026-11-25" : undefined));
  assert.equal(out, '<urlset><url><loc>https://conn3x.org/faq</loc><lastmod>2026-11-25</lastmod></url><url><loc>https://conn3x.org/x</loc></url></urlset>');
  // Running it twice doesn't add a second lastmod.
  assert.equal(addLastmod(out, () => "2026-11-26"), out.replace("<url><loc>https://conn3x.org/x</loc>", "<url><loc>https://conn3x.org/x</loc><lastmod>2026-11-26</lastmod>"));
});
