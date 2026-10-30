// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Renders the private-chat-that-stays-private card, diagram and social kit.
//   node scripts/post-graphics/private-chat-that-stays-private/render.mjs
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderKit } from "../ai-you-can-account-for/kit.mjs";

await renderKit(dirname(fileURLToPath(import.meta.url)), "private-chat-that-stays-private", ["access"]);
