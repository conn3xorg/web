// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Renders the an-audit-trail-for-every-prompt card, diagram and social kit.
//   node scripts/post-graphics/an-audit-trail-for-every-prompt/render.mjs
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderKit } from "../ai-you-can-account-for/kit.mjs";

await renderKit(dirname(fileURLToPath(import.meta.url)), "an-audit-trail-for-every-prompt", ["trace"]);
