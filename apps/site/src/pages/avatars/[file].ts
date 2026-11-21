// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0
//
// Contributors' avatars as files on this site: the CSP allows images from
// here, and a file loads lazily where an inlined data: URL grew the page.
import type { APIRoute, GetStaticPaths } from "astro";
import { avatars } from "../../lib/avatars";

export const getStaticPaths: GetStaticPaths = async () =>
  (await avatars()).flatMap((p) => (p.file && p.type && p.body ? [{ params: { file: p.file }, props: { type: p.type, body: p.body } }] : []));

export const GET: APIRoute = ({ props }) =>
  new Response(props.body, { headers: { "Content-Type": props.type } });
