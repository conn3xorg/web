// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Renders the scrub-it-before-the-model-sees-it card, diagram and social kit.
//   node scripts/post-graphics/scrub-it-before-the-model-sees-it/render.mjs
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderKit } from "../ai-you-can-account-for/kit.mjs";

await renderKit(dirname(fileURLToPath(import.meta.url)), "scrub-it-before-the-model-sees-it", ["scrub"]);
