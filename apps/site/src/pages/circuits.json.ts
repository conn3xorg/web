// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0
//
// The circuit catalogue as data, for tools such as conn3x mcp. The fields
// in format_version 1 only get added to, never renamed or removed.
import type { APIRoute } from "astro";
import { allGrades } from "../lib/grade-data";

type Circuit = {
  name: string;
  repo: string;
  description: string;
  version: string;
  tags: string[];
  category: string;
  official: boolean;
};

export const GET: APIRoute = async () => {
  const grades = (await allGrades()) as Record<string, { grade: string; passing: boolean }>;
  const files = import.meta.glob<{ default: Circuit }>("../data/circuits/*.json", { eager: true });
  const circuits = Object.values(files)
    .map((f) => f.default)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      name: c.name,
      description: c.description,
      repo: c.repo,
      repo_url: `https://github.com/${c.repo}`,
      version: c.version,
      category: c.category,
      tags: c.tags,
      official: c.official,
      grade: grades[c.name]?.grade ?? null,
      passing: grades[c.name]?.passing ?? null,
      page: `https://conn3x.org/circuits/${c.name}`,
    }));
  return new Response(JSON.stringify({ format_version: "1", circuits }, null, 2) + "\n", {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
