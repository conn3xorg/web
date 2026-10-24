// @ts-check
import { defineConfig, fontProviders } from "astro/config";
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
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Schibsted Grotesk",
      cssVariable: "--font-schibsted",
      fallbacks: ["system-ui", "sans-serif"],
      options: {
        variants: [{ src: ["./src/fonts/schibsted-grotesk-latin-wght-normal.woff2"], weight: "400 900", style: "normal" }],
      },
    },
    {
      provider: fontProviders.local(),
      name: "JetBrains Mono",
      cssVariable: "--font-jetbrains",
      fallbacks: ["ui-monospace", "monospace"],
      options: {
        variants: [{ src: ["./src/fonts/jetbrains-mono-latin-wght-normal.woff2"], weight: "100 800", style: "normal" }],
      },
    },
  ],
});
