// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Renders the square and tall social images for the private AI box, in the
// "AI you can account for" series style. The site card and box.png come
// from render.mjs and stay as they are.
//   node scripts/post-graphics/private-ai-box/render-kit.mjs
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderKit } from "../ai-you-can-account-for/kit.mjs";

await renderKit(dirname(fileURLToPath(import.meta.url)), "private-ai-box", [], { site: false, card: "kit-card.html" });
