// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const script = new URL("./csp.mjs", import.meta.url).pathname;
const base = "/*\n  X-Content-Type-Options: nosniff\n";

function site(pages) {
  const dir = mkdtempSync(join(tmpdir(), "csp-"));
  const dist = join(dir, "dist");
  for (const [name, html] of Object.entries(pages)) {
    const file = join(dist, name);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, html);
  }
  const baseFile = join(dir, "headers.base");
  writeFileSync(baseFile, base);
  return { dist, baseFile };
}

function run(pages) {
  const { dist, baseFile } = site(pages);
  const r = spawnSync(process.execPath, [script, dist, baseFile], { encoding: "utf8" });
  let headers = "";
  try { headers = readFileSync(join(dist, "_headers"), "utf8"); } catch {}
  return { code: r.status, stderr: r.stderr, headers };
}

const sha = (s) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;
const page = (body) => `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`;

test("hashes inline script", () => {
  const r = run({ "index.html": page("<script>a()</script>") });
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.headers.startsWith(base), "keeps the base headers");
  assert.match(r.headers, /^  Content-Security-Policy: default-src 'self'; script-src 'self' /m);
  assert.ok(r.headers.includes(sha("a()")));
});

test("hashes inline style", () => {
  const r = run({ "index.html": page("<style>b{c:d}</style>") });
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.headers.includes(`style-src 'self' ${sha("b{c:d}")}`));
});

test("dedupes hashes across pages", () => {
  const r = run({ "index.html": page("<script>a()</script>"), "x/y.html": page("<script>a()</script>") });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.headers.split(sha("a()")).length - 1, 1);
});

test("ignores json-ld and external scripts", () => {
  const r = run({ "index.html": page('<script type="application/ld+json">{"a":1}</script><script src="/x.js"></script>') });
  assert.equal(r.code, 0, r.stderr);
  assert.ok(!r.headers.includes("sha256-"), r.headers);
});

test("fails on style attribute", () => {
  const r = run({ "index.html": page('<p style="color:red">x</p>') });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /inline style attribute in index\.html/);
});

test("fails on onclick", () => {
  const r = run({ "index.html": page('<button onclick="go()">x</button>') });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /inline event handler onclick in index\.html/);
});

test("no unsafe-inline ever", () => {
  const r = run({ "index.html": page("<script>a()</script><style>b{}</style>") });
  assert.equal(r.code, 0, r.stderr);
  assert.ok(!r.headers.includes("unsafe-inline"));
  assert.ok(!r.headers.includes("unsafe-eval"));
});

test("line length guard", () => {
  const scripts = Array.from({ length: 40 }, (_, i) => `<script>f${i}()</script>`).join("");
  const r = run({ "index.html": page(scripts) });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /longer than 2000 characters/);
});
