// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Everyone with a merged pull request in a conn3xorg repository. The community
// page reads data/contributors.json, and a scheduled workflow keeps one issue
// open listing anyone this script finds who isn't in that file yet.
//
// Refresh that file with: node apps/site/src/lib/contributors.js
// Update the issue with:  node apps/site/src/lib/contributors.js --issue

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ORG = "conn3xorg";
const REPO = `${ORG}/web`;
const FILE = new URL("../data/contributors.json", import.meta.url);

// GitHub marks only some automation as Bot, so accounts for bots and AI tools
// that look like ordinary users are named here. The page lists people.
const NOT_PEOPLE = /^(claude|claude-.*|anthropic.*|copilot|copilot-.*|chatgpt.*|codex|openai.*|cursor|cursoragent|cursor-.*|devin.*|gemini.*|aider.*|.*-bot|.*\[bot\]|goreleaserbot|github-actions|web-flow|renovate|dependabot)$/i;
const isBot = (c) => c.type === "Bot" || NOT_PEOPLE.test(c.login);

// Logins come from the API and end up in a page and an issue, so anything
// that isn't the shape GitHub allows is dropped.
const LOGIN = /^[a-z\d][a-z\d-]{0,38}$/i;

/** The authors of search results, with avatars built from the numeric ID alone. */
export function authors(items) {
  return items
    .map((i) => i.user)
    .filter((u) => u && LOGIN.test(u.login) && Number.isInteger(u.id))
    .map((u) => ({ login: u.login, type: u.type, avatar: `https://avatars.githubusercontent.com/u/${u.id}?v=4` }));
}

// One entry per person across every repository, bots dropped, A to Z.
export function merge(lists) {
  const people = new Map();
  for (const c of lists.flat()) {
    if (!isBot(c)) people.set(c.login.toLowerCase(), { login: c.login, avatar: c.avatar_url ?? c.avatar });
  }
  return [...people.values()].sort((a, b) => a.login.localeCompare(b.login, "en", { sensitivity: "base" }));
}

// jamesconwaydev is already listed. Leaving out his PRs and Dependabot's keeps
// the search well under its limit of 1000 results.
const QUERY = `org:${ORG} is:pr is:merged -author:jamesconwaydev -author:app/dependabot`;

export async function fetchContributors() {
  const headers = { accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const found = [];
  for (let page = 1; ; page++) {
    const url = `https://api.github.com/search/issues?q=${encodeURIComponent(QUERY)}&per_page=100&page=${page}`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`search: ${res.status}`);
    const { items, total_count: total, incomplete_results: incomplete } = await res.json();
    // Past either of these someone could be missed without anyone knowing.
    if (incomplete || total > 1000) throw new Error(`search can't see everyone: ${total} results, incomplete ${incomplete}`);
    found.push(...authors(items));
    if (items.length < 100) return found;
  }
}

/** People in the search results who aren't listed yet, bots and AI tools dropped. */
export function newPeople(listed, found) {
  const known = new Set(listed.map((p) => p.login.toLowerCase()));
  return merge([found]).filter((p) => !known.has(p.login.toLowerCase()));
}

export const ISSUE_TITLE = "New contributors missing from the community page";
const ISSUE_AUTHOR = "github-actions[bot]";

// Profile links, not @mentions: nobody should get a notification for this.
export const issueBody = (people) => `The Contributors workflow found merged pull requests from people who aren't on the community page yet:

${people.map((p) => `- [${p.login}](https://github.com/${p.login})`).join("\n")}

To add them, run \`node apps/site/src/lib/contributors.js\` and open a pull request with the change to \`apps/site/src/data/contributors.json\`. The next weekly run after that merges closes this issue.
`;

/** Keeps at most one issue open for `people`, and says what it did. */
export async function syncIssue(people, api) {
  // The list endpoint, because search can lag behind an issue opened moments ago.
  // Only our own issue counts: anyone can open one with this title.
  const open = await api("GET", `/repos/${REPO}/issues?state=open&creator=${encodeURIComponent(ISSUE_AUTHOR)}&per_page=100`);
  const issue = open.find((i) => i.title === ISSUE_TITLE && i.user?.login === ISSUE_AUTHOR && !i.pull_request);
  const path = `/repos/${REPO}/issues`;
  if (!people.length) {
    if (!issue) return "Nobody new.";
    await api("PATCH", `${path}/${issue.number}`, { state: "closed", state_reason: "completed" });
    return `Nobody new. Closed #${issue.number}.`;
  }
  const body = issueBody(people);
  if (!issue) {
    const made = await api("POST", path, { title: ISSUE_TITLE, body });
    return `Opened #${made.number}.`;
  }
  if (issue.body === body) return `#${issue.number} is up to date.`;
  await api("PATCH", `${path}/${issue.number}`, { body });
  return `Updated #${issue.number}.`;
}

async function github(method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${process.env.GITHUB_TOKEN}` },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status}`);
  return res.json();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const listed = JSON.parse(readFileSync(FILE, "utf8"));
  if (process.argv[2] === "--issue") console.log(await syncIssue(newPeople(listed, await fetchContributors()), github));
  else writeFileSync(FILE, JSON.stringify(merge([listed, await fetchContributors()]), null, 2) + "\n");
}
