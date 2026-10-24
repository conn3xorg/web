// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  use: { baseURL: "http://127.0.0.1:8787" },
  webServer: {
    command: "pnpm exec wrangler dev --port 8787 --ip 127.0.0.1",
    url: "http://127.0.0.1:8787",
    reuseExistingServer: !process.env.CI,
    env: { WRANGLER_SEND_METRICS: "false" },
  },
});
