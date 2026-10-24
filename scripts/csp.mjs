// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Writes <dist>/_headers: the base headers plus one site-wide
// Content-Security-Policy that allows exactly the inline scripts and
// styles the build produced, by hash. Inline style attributes and event
// handler attributes can't be hashed into a header, so they fail the build.
//
//   node scripts/csp.mjs <distDir> <headersBaseFile>

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "parse5";

const MAX_LINE = 2000;

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(path);
    else if (entry.name.endsWith(".html")) yield path;
  }
}

function* elements(node) {
  if (node.tagName) yield node;
  // <template> keeps its children in a separate fragment.
  for (const child of node.content?.childNodes ?? []) yield* elements(child);
  for (const child of node.childNodes ?? []) yield* elements(child);
}

const attr = (el, name) => el.attrs.find((a) => a.name === name)?.value;
const text = (el) => el.childNodes.map((c) => c.value ?? "").join("");
const hash = (s) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;

function scan(dist) {
  const scripts = new Set();
  const styles = new Set();
  const errors = [];
  for (const file of htmlFiles(dist)) {
    const name = relative(dist, file);
    // Parse as if scripting were off so <noscript> content is real markup.
    for (const el of elements(parse(readFileSync(file, "utf8"), { scriptingEnabled: false }))) {
      for (const { name: a } of el.attrs) {
        if (a === "style") errors.push(`inline style attribute in ${name} <${el.tagName}>`);
        else if (a.startsWith("on")) errors.push(`inline event handler ${a} in ${name} <${el.tagName}>`);
      }
      if (el.tagName === "script" && attr(el, "src") === undefined) {
        const type = attr(el, "type");
        if (type === "application/ld+json") continue;
        scripts.add(hash(text(el)));
      } else if (el.tagName === "style") {
        styles.add(hash(text(el)));
      }
    }
  }
  return { scripts: [...scripts].sort(), styles: [...styles].sort(), errors };
}

export function policy({ scripts, styles }) {
  const src = (list) => ["'self'", ...list].join(" ");
  return [
    "default-src 'self'",
    `script-src ${src(scripts)}`,
    `style-src ${src(styles)}`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function main([dist, baseFile]) {
  if (!dist || !baseFile) {
    console.error("usage: node scripts/csp.mjs <distDir> <headersBaseFile>");
    return 2;
  }
  const found = scan(dist);
  if (found.errors.length) {
    for (const e of found.errors) console.error(`csp: ${e}`);
    return 1;
  }
  const line = `  Content-Security-Policy: ${policy(found)}`;
  if (line.length > MAX_LINE) {
    console.error(`csp: policy line is ${line.length} chars, longer than ${MAX_LINE} characters (Cloudflare _headers limit). Move inline code into files.`);
    return 1;
  }
  const base = readFileSync(baseFile, "utf8").replace(/\n*$/, "\n");
  writeFileSync(join(dist, "_headers"), base + line + "\n");
  console.log(`csp: ${found.scripts.length} script and ${found.styles.length} style hashes`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
