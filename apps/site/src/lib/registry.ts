// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0
//
// The official circuits as an OpenTofu module registry, so a circuit can be
// used by a short name with a version constraint:
//
//   module "db" {
//     source  = "conn3x.org/conn3xorg/postgresql/conn3x"
//     version = "~> 0.2"
//   }
//
// It's the registry protocol's two read endpoints, built as static files:
// versions, from the tags the grade build reads, and download, whose JSON
// body points at the circuit's repository at that tag. The system is always
// "conn3x".
import { allGrades } from "./grade-data";

type Circuit = { name: string; repo: string; version: string; official: boolean };

export type Module = { namespace: string; name: string; repo: string; versions: string[] };

const files = import.meta.glob<{ default: Circuit }>("../data/circuits/*.json", { eager: true });

export async function registryModules(): Promise<Module[]> {
  const grades = (await allGrades()) as Record<string, { versions?: string[] }>;
  return Object.values(files)
    .map((f) => f.default)
    .filter((c) => c.official)
    .map((c) => ({
      namespace: c.repo.split("/")[0],
      name: c.name,
      repo: c.repo,
      // Without a token the build has no tag lists; the latest still installs.
      versions: grades[c.name]?.versions ?? [c.version.replace(/^v/, "")],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const location = (m: Module, version: string) => `git::https://github.com/${m.repo}?ref=v${version}`;
