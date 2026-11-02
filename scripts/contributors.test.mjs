// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { authors, merge } from "../apps/site/src/lib/contributors.js";

const user = (login, type = "User") => ({ login, type, avatar_url: `https://avatars.example/${login}` });

test("contributors are merged across repositories, bots dropped, A to Z", () => {
  const people = merge([
    [user("zed"), user("dependabot[bot]", "Bot"), user("Amy")],
    [user("amy"), user("bob"), user("renovate", "Bot")],
  ]);
  assert.deepEqual(people.map((p) => p.login), ["amy", "bob", "zed"]);
  assert.equal(people[0].avatar, "https://avatars.example/amy");
});

test("bots and AI tools never count, even as ordinary users", () => {
  const notPeople = ["claude", "Claude", "claude-code", "anthropic-bot", "copilot", "Copilot-swe-agent", "chatgpt-codex", "openai-agent", "cursoragent", "devin-ai-integration", "goreleaserbot", "github-actions", "some-bot", "x[bot]"];
  assert.deepEqual(merge([notPeople.map((l) => user(l))]), []);
  // People whose names only look close stay.
  const real = ["abbot", "claudeb", "claudia", "cursorfan", "robot42"];
  assert.deepEqual(merge([real.map((l) => user(l))]).map((p) => p.login), real);
});

test("search results give people, with nothing odd in a login or an avatar", () => {
  const item = (login, id = 7, type = "User") => ({ user: { login, id, type, avatar_url: "https://evil.example/x" } });
  const found = authors([item("amy"), item("$(touch x)"), item("a/../b"), item("bob", "7"), item("dependabot[bot]", 8, "Bot"), {}]);
  assert.deepEqual(found, [{ login: "amy", type: "User", avatar: "https://avatars.githubusercontent.com/u/7?v=4" }]);
  assert.deepEqual(merge([authors([item("claude-code"), item("helper", 9, "Bot")])]), []);
});

test("the list is already merged", () => {
  const file = JSON.parse(readFileSync(new URL("../apps/site/src/data/contributors.json", import.meta.url), "utf8"));
  assert.ok(file.length > 0);
  assert.deepEqual(merge([file]), file);
});
