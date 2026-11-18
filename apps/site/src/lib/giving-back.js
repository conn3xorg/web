// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

/** How much we've given back, from giving-back.json: pieces of work and the projects they went to. */
export function given(data) {
  const items = data.items.length;
  const projects = new Set(data.items.map((i) => i.repo)).size;
  return `${items} ${items === 1 ? "piece" : "pieces"} of work for ${projects} ${projects === 1 ? "project" : "projects"}`;
}
