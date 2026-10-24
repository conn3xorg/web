// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://conn3x.org",
  output: "static",
  trailingSlash: "never",
  build: {
    format: "file",
    // Every stylesheet ships as a file so the CSP needs no style hashes.
    inlineStylesheets: "never",
  },
  integrations: [sitemap()],
});
