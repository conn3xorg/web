// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// The grades for this build, for pages. The glob is why this isn't in
// grades.js, which also runs under plain Node.
import { grades } from "./grades.js";

const files = import.meta.glob<{ default: { name: string; repo: string } }>("../data/circuits/*.json", { eager: true });

export const allGrades = () => grades(Object.values(files).map((f) => f.default));
