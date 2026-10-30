// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Renders the "AI you can account for" card, diagrams and social kit.
//   node scripts/post-graphics/ai-you-can-account-for/render.mjs
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderKit } from "./kit.mjs";

await renderKit(dirname(fileURLToPath(import.meta.url)), "ai-you-can-account-for", ["map", "stack"]);
