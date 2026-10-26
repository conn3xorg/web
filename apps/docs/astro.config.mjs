// @ts-check
// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://docs.conn3x.org",
  output: "static",
  trailingSlash: "never",
  build: {
    format: "file",
    // Stylesheets ship as files so the CSP needs no style hashes.
    inlineStylesheets: "never",
  },
  integrations: [
    starlight({
      title: "Conn3x",
      description: "Docs for Conn3x: one plan for your cloud and the servers it creates.",
      logo: { light: "./src/logo.svg", dark: "./src/logo-dark.svg", replacesTitle: true },
      favicon: "/favicon.svg",
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/conn3xorg/conn3x" },
        { icon: "x.com", label: "X", href: "https://x.com/conn3xone" },
      ],
      editLink: { baseUrl: "https://github.com/conn3xorg/web/edit/main/apps/docs/" },
      customCss: ["./src/styles/brand.css"],
      lastUpdated: false,
      head: [
        { tag: "meta", attrs: { property: "og:image", content: "https://docs.conn3x.org/og.png" } },
        { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
        { tag: "meta", attrs: { name: "twitter:image", content: "https://docs.conn3x.org/og.png" } },
      ],
      sidebar: [
        { label: "Start here", items: ["install", "get-started", "concepts"] },
        {
          label: "Guides",
          items: ["guides/provision-and-configure", "guides/bastions", "guides/drift", "guides/migrate-from-ansible", "guides/migrate-from-terraform"],
        },
        { label: "Circuit language", items: ["reference/circuits", "reference/host-facts"] },
        {
          label: "CLI",
          collapsed: true,
          items: [
            { slug: "reference/cli", label: "Overview" },
            ...["init", "validate", "plan", "apply", "destroy", "drift", "convert-ansible", "show", "state", "output", "fmt", "providers", "version"].map(
              (cmd) => `reference/cli/${cmd}`,
            ),
          ],
        },
        { label: "Modules", collapsed: true, items: [{ autogenerate: { directory: "modules" } }] },
      ],
    }),
  ],
});
