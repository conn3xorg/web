// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Every entry on /circuits and /providers is a data file anyone can add
// by pull request, so check each one has what the pages render.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const dir = new URL("../apps/site/src/data/circuits/", import.meta.url);
const distros = new Set(["rocky10", "fedora45", "ubuntu2404", "debian13"]);
const categories = new Set(JSON.parse(readFileSync(new URL("../apps/site/src/data/categories.json", import.meta.url), "utf8")));

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  test(`circuit ${file}`, () => {
    const c = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
    assert.deepEqual(Object.keys(c).sort(), ["category", "description", "name", "official", "repo", "tags", "tested", "version"]);
    assert.equal(file, `${c.name}.json`, "file is named after the circuit");
    assert.match(c.name, /^[a-z0-9][a-z0-9-]*$/);
    assert.match(c.repo, /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/, "repo is OWNER/NAME on GitHub");
    assert.match(c.version, /^v\d+\.\d+\.\d+$/, "version is a release tag like v1.2.3");
    assert.ok(c.description.length >= 20 && c.description.length <= 140, "description is one line");
    assert.ok(Array.isArray(c.tags) && c.tags.every((t) => /^[a-z0-9-]+$/.test(t)));
    assert.ok(c.tested.length > 0 && c.tested.every((d) => distros.has(d)), "tested names known distros");
    assert.ok(categories.has(c.category), "category is one of data/categories.json");
    assert.equal(typeof c.official, "boolean");
    if (c.official) assert.ok(c.repo.startsWith("conn3xorg/"), "only conn3xorg circuits are official");
    if (c.official) assert.ok(existsSync(new URL(`../apps/docs/src/content/docs/circuits/${c.name}.md`, import.meta.url)), "official circuits have a docs page");
  });
}

test("providers", () => {
  const ps = JSON.parse(readFileSync(new URL("../apps/site/src/data/providers.json", import.meta.url), "utf8"));
  const seen = new Set();
  for (const p of ps) {
    assert.match(p.source, /^[a-z0-9-]+\/[a-z0-9-]+$/);
    assert.ok(!seen.has(p.source), `${p.source} is listed once`);
    seen.add(p.source);
    assert.ok(p.name && p.description);
    assert.equal(typeof p.inDocs, "boolean");
  }
});
