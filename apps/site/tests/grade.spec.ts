// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0
import { test, expect } from "@playwright/test";

test("a grade page says what was checked, when, and what a grade isn't", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/circuits/postgres/grade");
  await expect(page.locator("h1")).toContainText(/postgres: [A-F]/);
  await expect(page.locator(".page-hero")).toContainText("conn3xorg/circuit-postgres at v");
  await expect(page.locator(".page-hero")).toContainText("doesn't tell you the circuit is safe");
  await expect(page.locator("tbody tr")).toHaveCount(16);
  await expect(page.locator("tbody tr", { hasText: "CI is green on main" })).toContainText(/Run of \d{4}-\d{2}-\d{2}/);
  await expect(page.locator('img[src="/circuits/postgres/grade.svg"]')).toBeVisible();
  await expect(page.locator("pre code")).toContainText("https://conn3x.org/circuits/postgres/grade.svg");
  expect(errors).toEqual([]);
});

test("a held check shows no result for anyone", async ({ page }) => {
  for (const name of ["postgres", "nginx"]) {
    await page.goto(`/circuits/${name}/grade`);
    for (const title of ["Default listen address", "Container images pinned by digest", "Privileged shell patterns"]) {
      const row = page.locator("tbody tr", { hasText: title });
      await expect(row).toContainText("Held");
      await expect(row).toContainText("We're not publishing this result yet");
    }
  }
});

test("a circuit that fails a must-pass check says so and isn't a pass", async ({ page }) => {
  await page.goto("/circuits/proxmox/grade");
  await expect(page.locator("h1")).toContainText("proxmox: F");
  await expect(page.locator(".page-hero")).toContainText("That's not a pass");
});

test("the badge is an SVG another site can embed", async ({ request }) => {
  const res = await request.get("/circuits/postgres/grade.svg");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/svg+xml");
  expect(res.headers()["cross-origin-resource-policy"]).toBe("cross-origin");
  expect(await res.text()).toContain("not a security guarantee");
});

test("the directory links each circuit's grade", async ({ page }) => {
  await page.goto("/circuits");
  await expect(page.locator('a[href="/circuits/nginx/grade"]')).toHaveText(/^Grade [A-F]$/);
});

test("with enforcement off, the builder still offers a failing circuit", async ({ page }) => {
  await page.goto("/build");
  await expect(page.locator('input[name=pick][value="nginx"]')).toHaveCount(1);
});
