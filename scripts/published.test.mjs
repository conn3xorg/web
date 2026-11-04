// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublished } from "../apps/site/src/lib/published.js";

const post = (date) => ({ data: { date: new Date(date) } });

test("a post is published from 14:00 UTC on its date", () => {
  const now = new Date("2026-11-08T14:00:00Z");
  assert.equal(isPublished(post("2026-11-08"), now), true);
  assert.equal(isPublished(post("2026-10-25"), now), true);
});

test("a post waits until 14:00 UTC on its date", () => {
  assert.equal(isPublished(post("2026-11-08"), new Date("2026-11-08T13:59:59Z")), false);
  assert.equal(isPublished(post("2026-11-08"), new Date("2026-11-07T23:59:59Z")), false);
});
