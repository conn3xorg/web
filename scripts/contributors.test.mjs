// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { authors, issueBody, ISSUE_TITLE, merge, newPeople, syncIssue } from "../apps/site/src/lib/contributors.js";

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

const found = (login, id = 7, type = "User") => authors([{ user: { login, id, type } }])[0];
const BOT = "github-actions[bot]";

// A stand-in for the GitHub API: a list of issues, and a record of every write.
function client(issues = []) {
  const writes = [];
  const api = async (method, path, body) => {
    if (method === "GET") {
      assert.match(path, /state=open/);
      return issues;
    }
    writes.push({ method, path, body });
    return { number: 99 };
  };
  return { api, writes };
}
const amy = { login: "amy", avatar: "https://avatars.githubusercontent.com/u/7?v=4" };

test("only people who aren't listed yet are new, whatever their capitals", () => {
  const listed = [{ login: "Bob", avatar: "x" }];
  const people = newPeople(listed, [found("bob"), found("amy"), found("claude-code"), found("helper", 9, "Bot"), found("copilot")]);
  assert.deepEqual(people, [amy]);
});

test("the issue body links people without mentioning them", () => {
  const body = issueBody([amy, { login: "zed" }]);
  assert.match(body, /^- \[amy\]\(https:\/\/github\.com\/amy\)$/m);
  assert.match(body, /^- \[zed\]\(https:\/\/github\.com\/zed\)$/m);
  assert.doesNotMatch(body, /@/);
});

test("someone new opens an issue when none is open", async () => {
  const { api, writes } = client();
  assert.equal(await syncIssue([amy], api), "Opened #99.");
  assert.deepEqual(writes, [{ method: "POST", path: "/repos/conn3xorg/web/issues", body: { title: ISSUE_TITLE, body: issueBody([amy]) } }]);
});

test("an open issue is updated, never duplicated", async () => {
  const { api, writes } = client([{ number: 5, title: ISSUE_TITLE, body: "old", user: { login: BOT } }]);
  assert.equal(await syncIssue([amy], api), "Updated #5.");
  assert.deepEqual(writes, [{ method: "PATCH", path: "/repos/conn3xorg/web/issues/5", body: { body: issueBody([amy]) } }]);
});

test("an issue already saying the right thing is left alone", async () => {
  const { api, writes } = client([{ number: 5, title: ISSUE_TITLE, body: issueBody([amy]), user: { login: BOT } }]);
  assert.equal(await syncIssue([amy], api), "#5 is up to date.");
  assert.deepEqual(writes, []);
});

test("a stranger's issue with the same title, or a pull request, isn't ours", async () => {
  const { api, writes } = client([
    { number: 5, title: ISSUE_TITLE, body: "x", user: { login: "mallory" } },
    { number: 6, title: ISSUE_TITLE, body: "x", user: { login: BOT }, pull_request: {} },
  ]);
  assert.equal(await syncIssue([amy], api), "Opened #99.");
  assert.equal(writes[0].method, "POST");
});

test("nobody new closes our open issue, and otherwise does nothing", async () => {
  const idle = client();
  assert.equal(await syncIssue([], idle.api), "Nobody new.");
  assert.deepEqual(idle.writes, []);
  const done = client([{ number: 5, title: ISSUE_TITLE, body: "x", user: { login: BOT } }]);
  assert.equal(await syncIssue([], done.api), "Nobody new. Closed #5.");
  assert.deepEqual(done.writes, [{ method: "PATCH", path: "/repos/conn3xorg/web/issues/5", body: { state: "closed", state_reason: "completed" } }]);
});

test("the workflow can read code and write issues, and nothing else", () => {
  const yml = readFileSync(new URL("../.github/workflows/contributors.yml", import.meta.url), "utf8");
  assert.deepEqual(yml.match(/^ +[a-z-]+: (read|write)$/gm).map((l) => l.trim()), ["contents: read", "issues: write"]);
  assert.match(yml, /^permissions: \{\}$/m);
  for (const uses of yml.match(/uses: \S+/g)) assert.match(uses, /@[0-9a-f]{40}$/);
});
