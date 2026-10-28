// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Everyone with a commit in conn3x, web or a circuit-* repository, read from
// the GitHub API when the site builds. If the API fails or is rate-limited,
// the build uses the last good list in data/contributors.json instead, so a
// GitHub outage never fails a deploy.
//
// Refresh that file with: node apps/site/src/lib/contributors.js

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import fallback from "../data/contributors.json" with { type: "json" };

const ORG = "conn3xorg";
const FALLBACK = new URL("../data/contributors.json", import.meta.url);

const counted = (repo) => repo === "conn3x" || repo === "web" || repo.startsWith("circuit-");
const isBot = (c) => c.type === "Bot" || c.login.endsWith("[bot]");

// One entry per person across every repository, bots dropped, A to Z.
export function merge(lists) {
  const people = new Map();
  for (const c of lists.flat()) {
    if (!isBot(c)) people.set(c.login.toLowerCase(), { login: c.login, avatar: c.avatar_url ?? c.avatar });
  }
  return [...people.values()].sort((a, b) => a.login.localeCompare(b.login, "en", { sensitivity: "base" }));
}

async function get(path) {
  const headers = { accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  // 204 means a repository with no commits yet.
  return res.status === 204 ? [] : res.json();
}

// ponytail: one page of 100 per call; add Link-header paging past 100 repos or people.
export async function fetchContributors() {
  const repos = (await get(`/orgs/${ORG}/repos?type=public&per_page=100`)).map((r) => r.name).filter(counted);
  return merge(await Promise.all(repos.map((r) => get(`/repos/${ORG}/${r}/contributors?per_page=100`))));
}

export async function contributors() {
  try {
    const people = await fetchContributors();
    if (people.length) return people;
    throw new Error("no contributors returned");
  } catch (err) {
    console.warn(`contributors: ${err.message}; using data/contributors.json`);
    return fallback;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(FALLBACK, JSON.stringify(await fetchContributors(), null, 2) + "\n");
}
