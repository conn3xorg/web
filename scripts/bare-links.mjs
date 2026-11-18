// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Rewrites links to this site's own pages, /page.html and
// https://docs.conn3x.org/page.html, to the path the host serves, /page.
// Pages are built as files (build.format "file"), so Astro and Starlight
// write .html into every link, and the host answers that with a 307 to the
// bare path. Search engines then crawl two URLs per page.
//
//   node scripts/bare-links.mjs <distDir> <siteOrigin>

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(path);
    else if (entry.name.endsWith(".html")) yield path;
  }
}

/** html with every href to one of origin's pages given without .html. */
export function bareLinks(html, origin) {
  const own = origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const link = new RegExp(`href="((?:${own})?/[^"#?]*?)\\.html([#?][^"]*)?"`, "g");
  // The root's index.html is served at /; any other dir/index.html at
  // /dir, since a trailing slash redirects too.
  const bare = (path) => (path.endsWith("/index") ? path.slice(0, -"/index".length) || "/" : path);
  return html.replace(link, (_, path, rest = "") => `href="${bare(path).replace(new RegExp(`^(${own})$`), "$1/")}${rest}"`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dist, origin] = process.argv.slice(2);
  let n = 0;
  for (const file of htmlFiles(dist)) {
    const html = readFileSync(file, "utf8");
    const out = bareLinks(html, origin);
    if (out !== html) {
      writeFileSync(file, out);
      n++;
    }
  }
  console.log(`bare-links: ${n} pages rewritten`);
}
