// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

import { test } from "node:test";
import assert from "node:assert/strict";
import { bareLinks } from "./bare-links.mjs";

const origin = "https://docs.conn3x.org";

test("own pages lose .html, and the root's index becomes /", () => {
  assert.equal(bareLinks('<a href="/modules/file.html">', origin), '<a href="/modules/file">');
  assert.equal(bareLinks('<a href="/modules/file.html#arguments">', origin), '<a href="/modules/file#arguments">');
  assert.equal(bareLinks('<a href="https://docs.conn3x.org/circuits/zeek.html">', origin), '<a href="https://docs.conn3x.org/circuits/zeek">');
  assert.equal(bareLinks('<a href="/index.html">', origin), '<a href="/">');
  assert.equal(bareLinks('<a href="/guides/index.html">', origin), '<a href="/guides">');
  assert.equal(bareLinks('<a href="https://docs.conn3x.org/index.html">', origin), '<a href="https://docs.conn3x.org/">');
});

test("other sites and other files are left alone", () => {
  for (const html of ['<a href="https://example.com/a.html">', '<link href="/style.css">', '<a href="https://docs.conn3x.org.evil.com/a.html">', '<a href="/a.htmlx">']) {
    assert.equal(bareLinks(html, origin), html);
  }
});
