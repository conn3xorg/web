// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { merge } from "../apps/site/src/lib/contributors.js";

const user = (login, type = "User") => ({ login, type, avatar_url: `https://avatars.example/${login}` });

test("contributors are merged across repositories, bots dropped, A to Z", () => {
  const people = merge([
    [user("zed"), user("dependabot[bot]", "Bot"), user("Amy")],
    [user("amy"), user("bob"), user("renovate", "Bot")],
  ]);
  assert.deepEqual(people.map((p) => p.login), ["amy", "bob", "zed"]);
  assert.equal(people[0].avatar, "https://avatars.example/amy");
});

test("the fallback list is already merged", () => {
  const file = JSON.parse(readFileSync(new URL("../apps/site/src/data/contributors.json", import.meta.url), "utf8"));
  assert.ok(file.length > 0);
  assert.deepEqual(merge([file]), file);
});
