// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Adds <lastmod> to each URL in the built sitemaps: the date of the last
// commit to the file the page is built from. Without it Google has no
// signal that a page changed, and reads the sitemap rarely. A URL whose
// source file can't be found gets no lastmod rather than a guessed one,
// and a shallow clone gets none at all, since every file there would show
// the same, latest date.
//
//   node scripts/sitemap-lastmod.mjs <distDir> <appDir>

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Source files a page at path may be built from, most likely first. */
export function candidates(path) {
  const p = path.replace(/^\/+|\/+$/g, "") || "index";
  const [first, second] = p.split("/");
  const files = [];
  for (const ext of ["md", "mdx"]) files.push(`src/content/docs/${p}.${ext}`, `src/content/docs/${p}/index.${ext}`);
  if (first === "blog" && second) for (const ext of ["md", "mdx"]) files.push(`src/content/blog/${second}.${ext}`);
  // /circuits/<name> and /circuits/<name>/grade are built from its data file.
  if (first === "circuits" && second) files.push(`src/data/circuits/${second}.json`);
  files.push(`src/pages/${p}.astro`, `src/pages/${p}/index.astro`);
  return files;
}

/** sitemap XML with a <lastmod> after each <loc> that dateOf can date. */
export function addLastmod(xml, dateOf) {
  return xml.replace(/<url><loc>([^<]+)<\/loc>(?!<lastmod>)/g, (whole, loc) => {
    const date = dateOf(new URL(loc).pathname);
    return date ? `<url><loc>${loc}</loc><lastmod>${date}</lastmod>` : whole;
  });
}

function main(dist, app) {
  const git = (...args) => execFileSync("git", args, { cwd: app, encoding: "utf8" }).trim();
  if (git("rev-parse", "--is-shallow-repository") === "true") {
    console.warn("sitemap-lastmod: shallow clone, so no lastmod is written");
    return;
  }
  const dateOf = (path) => {
    const file = candidates(path).find((f) => existsSync(join(app, f)));
    return file ? git("log", "-1", "--format=%cs", "--", file) || undefined : undefined;
  };
  for (const name of readdirSync(dist).filter((n) => /^sitemap-\d+\.xml$/.test(n))) {
    const file = join(dist, name);
    const xml = readFileSync(file, "utf8");
    const out = addLastmod(xml, dateOf);
    writeFileSync(file, out);
    const total = (xml.match(/<url>/g) || []).length;
    const dated = (out.match(/<lastmod>/g) || []).length;
    console.log(`sitemap-lastmod: ${name}: ${dated} of ${total} URLs dated`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv[2], process.argv[3]);
