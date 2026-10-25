// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0
import { isPublished } from "../lib/published.js";
import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

export async function GET(context) {
  const posts = (await getCollection("blog", (p) => isPublished(p))).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
  return rss({
    title: "Conn3x",
    description: "Releases and notes from building Conn3x in public.",
    site: context.site,
    trailingSlash: false,
    items: posts.map((p) => ({ title: p.data.title, description: p.data.description, pubDate: p.data.date, link: `/blog/${p.id}` })),
  });
}
