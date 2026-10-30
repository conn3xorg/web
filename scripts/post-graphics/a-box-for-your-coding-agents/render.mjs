// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Renders the a-box-for-your-coding-agents card, diagram and social kit.
//   node scripts/post-graphics/a-box-for-your-coding-agents/render.mjs
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderKit } from "../ai-you-can-account-for/kit.mjs";

await renderKit(dirname(fileURLToPath(import.meta.url)), "a-box-for-your-coding-agents", ["agentbox"]);
