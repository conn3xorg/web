// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

import { defineRouteMiddleware } from "@astrojs/starlight/route-data";

// With build.format "file", Starlight's canonical and og:url end in .html,
// which the host 307s to the bare path. Google then reads every page as an
// alternate of a redirect, so point both at the URL the page is served at.
const bare = (url: string) => url.replace(/\/index\.html$/, "/").replace(/\.html$/, "");

export const onRequest = defineRouteMiddleware((context) => {
  for (const { tag, attrs } of context.locals.starlightRoute.head) {
    if (!attrs) continue;
    if (tag === "link" && attrs.rel === "canonical" && typeof attrs.href === "string") {
      attrs.href = bare(attrs.href);
    }
    if (tag === "meta" && attrs.property === "og:url" && typeof attrs.content === "string") {
      attrs.content = bare(attrs.content);
    }
  }
});
