// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0
import type { APIRoute, GetStaticPaths } from "astro";
import { registryModules, type Module } from "../../../../../../lib/registry";

export const getStaticPaths = (async () =>
  (await registryModules()).map((m) => ({ params: { namespace: m.namespace, name: m.name, system: "conn3x" }, props: { m } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
  const m = (props as { m: Module }).m;
  const body = { modules: [{ versions: m.versions.map((version) => ({ version })) }] };
  return new Response(JSON.stringify(body) + "\n", { headers: { "content-type": "application/json" } });
};
