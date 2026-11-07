// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Every entry on /circuits and /providers is a data file anyone can add
// by pull request, so check each one has what the pages render.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const dir = new URL("../apps/site/src/data/circuits/", import.meta.url);
const distros = new Set(["rocky10", "fedora45", "ubuntu2404", "debian13", "windows2022", "windows2025"]);
const categories = new Set(JSON.parse(readFileSync(new URL("../apps/site/src/data/categories.json", import.meta.url), "utf8")));

// The docs index lists every official circuit under its category heading.
const index = readFileSync(new URL("../apps/docs/src/content/docs/circuits/index.md", import.meta.url), "utf8");
const indexed = new Map();
for (const section of index.split(/^### /m).slice(1)) {
  const cat = section.slice(0, section.indexOf("\n"));
  for (const [, name, version] of section.matchAll(/^\| \[[^\]]+\]\(\/circuits\/([a-z0-9-]+)\) \|.*\| (v[\d.]+) \|$/gm)) indexed.set(name, { cat, version });
}

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  test(`circuit ${file}`, () => {
    const c = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
    const { device, ...rest } = c;
    assert.deepEqual(Object.keys(rest).sort(), ["category", "description", "name", "official", "repo", "tags", "tested", "version"]);
    assert.equal(file, `${c.name}.json`, "file is named after the circuit");
    assert.match(c.name, /^[a-z0-9][a-z0-9-]*$/);
    assert.match(c.repo, /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/, "repo is OWNER/NAME on GitHub");
    assert.match(c.version, /^v\d+\.\d+\.\d+$/, "version is a release tag like v1.2.3");
    assert.ok(c.description.length >= 20 && c.description.length <= 140, "description is one line");
    assert.ok(Array.isArray(c.tags) && c.tags.every((t) => /^[a-z0-9-]+$/.test(t)));
    // A network device circuit names the device it was tested on and the provider it uses instead.
    if (device) {
      assert.deepEqual(Object.keys(device).sort(), ["maintainer", "provider", "providerVersion", "tested"]);
      assert.ok(Object.values(device).every((v) => typeof v === "string" && v.length > 0));
      assert.match(device.provider, /^[a-z0-9-]+\/[a-z0-9-]+$/, "provider is NAMESPACE/NAME");
      assert.equal(c.tested.length, 0, "a device circuit tests on its device, not a distribution");
    } else assert.ok(c.tested.length > 0, "tested names a distribution");
    assert.ok(c.tested.every((d) => distros.has(d)), "tested names known distros");
    assert.ok(categories.has(c.category), "category is one of data/categories.json");
    assert.equal(typeof c.official, "boolean");
    if (c.official) assert.ok(c.repo.startsWith("conn3xorg/"), "only conn3xorg circuits are official");
    if (c.official) assert.ok(existsSync(new URL(`../apps/docs/src/content/docs/circuits/${c.name}.md`, import.meta.url)), "official circuits have a docs page");
    if (c.official) {
      assert.ok(indexed.has(c.name), "official circuits are on the docs circuits index");
      assert.equal(indexed.get(c.name).cat, c.category, "the index lists it under its category");
      assert.equal(indexed.get(c.name).version, c.version, "the index shows the directory's version");
    }
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
    assert.ok(p.tutorial === null || /^[a-z-]+$/.test(p.tutorial), `${p.source} names a tutorial or null`);
  }
  // Only clouds with a tutorial and a Builder test applied on real servers count as tested, DigitalOcean last.
  assert.deepEqual(ps.filter((p) => p.tutorial).map((p) => p.name), ["AWS", "Azure", "Google Cloud", "DigitalOcean"]);
});
