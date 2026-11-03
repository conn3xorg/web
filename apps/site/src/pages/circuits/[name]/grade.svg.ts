// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0
import type { APIRoute } from "astro";
import { allGrades } from "../../../lib/grade-data";
import { badge } from "../../../lib/grades.js";

export async function getStaticPaths() {
  const all = await allGrades();
  return Object.values(all).map((g: any) => ({ params: { name: g.name }, props: { grade: g.grade } }));
}

export const GET: APIRoute = ({ props }) =>
  new Response(badge(props.grade), { headers: { "content-type": "image/svg+xml" } });
