// @ts-check
// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { readdirSync } from "node:fs";

// Module pages are generated flat, so the Windows ones are split out here rather than by folder.
const modules = readdirSync(new URL("./src/content/docs/modules/", import.meta.url))
  .filter((f) => f.endsWith(".md"))
  .map((f) => `modules/${f.slice(0, -3)}`)
  .sort();
const isWindows = (slug) => slug.startsWith("modules/windows_");

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
      description: "Docs for Conn3x, the IaCC tool: infrastructure as code and configuration management in one plan.",
      logo: { light: "./src/logo.svg", dark: "./src/logo-dark.svg", replacesTitle: true },
      favicon: "/favicon.svg",
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/conn3xorg/conn3x" },
        { icon: "x.com", label: "X", href: "https://x.com/conn3xone" },
        { icon: "youtube", label: "YouTube", href: "https://www.youtube.com/@conn3xlabs" },
      ],
      editLink: { baseUrl: "https://github.com/conn3xorg/web/edit/main/apps/docs/" },
      customCss: ["./src/styles/brand.css"],
      components: {
        ThemeProvider: "./src/components/ThemeProvider.astro",
        ThemeSelect: "./src/components/ThemeSelect.astro",
      },
      lastUpdated: false,
      head: [
        { tag: "meta", attrs: { property: "og:image", content: "https://docs.conn3x.org/og.png" } },
        { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
        { tag: "meta", attrs: { name: "twitter:image", content: "https://docs.conn3x.org/og.png" } },
        // Cloudflare Web Analytics, shared with conn3x.org; filter by host to see the docs.
        { tag: "script", attrs: { type: "module", src: "https://static.cloudflareinsights.com/beacon.min.js", "data-cf-beacon": '{"token": "a6d1b39fdbab4414a50520fcbe318d8a"}' } },
      ],
      sidebar: [
        { label: "Start here", items: ["install", "get-started", "concepts"] },
        {
          label: "Tutorials",
          items: [
            { slug: "tutorials", label: "Overview" },
            ...["try-locally", "first-server", "digitalocean", "google-cloud", "azure", "aws", "bastion", "secrets", "drift-in-ci", "migrate-ansible", "bigquery"].map((page) => `tutorials/${page}`),
          ],
        },
        {
          label: "Guides",
          items: ["guides/provision-and-configure", "guides/bastions", "guides/drift", "guides/paths-as-root", "guides/share-a-circuit", "guides/migrate-from-ansible", "guides/migrate-from-terraform"],
        },
        {
          label: "Circuits",
          collapsed: true,
          items: [{ slug: "circuits", label: "Overview" }, { slug: "reference/circuit-grades", label: "How grades work" }, { autogenerate: { directory: "circuits" } }],
        },
        {
          label: "Circuit language",
          items: [
            { slug: "reference/circuits", label: "Overview" },
            ...["hosts", "ssh", "steps", "handlers", "removal", "secrets", "addresses", "expressions"].map((page) => `reference/circuits/${page}`),
            "reference/host-facts",
          ],
        },
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
        {
          label: "Modules",
          collapsed: true,
          items: [
            ...modules.filter((m) => !isWindows(m)),
            {
              label: "Windows (preview)",
              collapsed: true,
              badge: { text: "Experimental", variant: "caution" },
              items: modules.filter(isWindows),
            },
          ],
        },
        {
          label: "Internals",
          collapsed: true,
          items: ["plan-reads", "state", "revision-and-handlers", "connections"].map((page) => `internals/${page}`),
        },
        "reference/glossary",
        { label: "Get involved", items: ["contribute", "style", "roadmap"] },
      ],
    }),
  ],
});
