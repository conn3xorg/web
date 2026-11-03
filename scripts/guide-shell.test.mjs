// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// The share-a-circuit guide's shell gets copied into circuits as written.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const guide = readFileSync(new URL("../apps/docs/src/content/docs/guides/share-a-circuit.md", import.meta.url), "utf8");
const shell = [...guide.matchAll(/```sh\n(.*?)```/gs)].map((m) => m[1]).join("\n");

test("the path walk follows one link at a time", () => {
  assert.match(shell, /t=\$\(readlink -- "\$p"\)/);
  assert.doesNotMatch(shell, /readlink -[fme]\b/);
});

test("a password in a curl config line is escaped", () => {
  assert.match(shell, /sed 's\/\[\\\\"\]\/\\\\&\/g'/);
  assert.doesNotMatch(shell, /user = "[^"]*%s"\\n' "\$\(cat/);
});
