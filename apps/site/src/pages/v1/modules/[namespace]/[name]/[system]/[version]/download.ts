// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0
import type { APIRoute, GetStaticPaths } from "astro";
import { location, registryModules, type Module } from "../../../../../../../lib/registry";

export const getStaticPaths = (async () =>
  (await registryModules()).flatMap((m) =>
    m.versions.map((version) => ({ params: { namespace: m.namespace, name: m.name, system: "conn3x", version }, props: { m, version } })),
  )) satisfies GetStaticPaths;

// A 200 with the location in the body: static hosting can't set
// X-Terraform-Get, and OpenTofu reads the body first anyway.
export const GET: APIRoute = ({ props }) => {
  const { m, version } = props as { m: Module; version: string };
  return new Response(JSON.stringify({ location: location(m, version) }) + "\n", { headers: { "content-type": "application/json" } });
};
