// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Renders the one-gateway-for-every-model card, diagram and social kit.
//   node scripts/post-graphics/one-gateway-for-every-model/render.mjs
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderKit } from "../ai-you-can-account-for/kit.mjs";

await renderKit(dirname(fileURLToPath(import.meta.url)), "one-gateway-for-every-model", ["gateway"]);
