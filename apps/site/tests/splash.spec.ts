// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

import { test, expect } from "@playwright/test";

const REPO = "https://github.com/conn3xorg/conn3x";

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("renders the whole page", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();
    const star = page.locator(`main a[href="${REPO}"]`).first();
    await expect(star).toBeVisible();
    await expect(star).toContainText("Star");
    await expect(page.locator("footer")).toBeVisible();
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("runs no animations", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const running = await page.evaluate(() => document.getAnimations().length);
    expect(running).toBe(0);
  });
});

test("animates once with motion allowed", async ({ page }) => {
  await page.goto("/");
  const count = await page.evaluate(() => document.getAnimations().length);
  expect(count).toBeGreaterThan(0);
});

test("sends the security headers", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["content-security-policy"]).toBeTruthy();
  expect(h["content-security-policy"]).not.toContain("unsafe-inline");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["cross-origin-opener-policy"]).toBe("same-origin");
  expect(h["cross-origin-resource-policy"]).toBe("same-origin");
});

test("logs no console errors or CSP violations", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(m.text()); });
  page.on("pageerror", (e) => problems.push(e.message));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
});

test("serves a branded 404", async ({ page }) => {
  const res = await page.goto("/nope");
  expect(res?.status()).toBe(404);
  await expect(page.locator("h1")).toContainText("not found");
  await expect(page.locator('a[href="/"]').first()).toBeVisible();
});

test("has complete SEO metadata", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://conn3x.org/");
  const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(ogImage).toBe("https://conn3x.org/og.png");
  expect((await request.get("/og.png")).status()).toBe(200);
  for (const ld of await page.locator('script[type="application/ld+json"]').allTextContents()) {
    expect(() => JSON.parse(ld)).not.toThrow();
  }
  for (const path of ["/sitemap-index.xml", "/robots.txt", "/llms.txt", "/favicon.ico", "/apple-touch-icon.png"]) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
});

test.describe("reduced motion on interaction", () => {
  test.use({ reducedMotion: "reduce" });

  test("the button has no hover transition", async ({ page }) => {
    await page.goto("/");
    const duration = await page.locator("main .button").first().evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration).toBe("0s");
  });
});

test("an explicit dark theme shows the dark logo", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await expect(page.locator(".logo-dark")).toBeVisible();
  await expect(page.locator(".logo-light")).toBeHidden();
});

test("an explicit light theme shows the light logo in a dark system", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await expect(page.locator(".logo-light")).toBeVisible();
  await expect(page.locator(".logo-dark")).toBeHidden();
});

test("the 404 page has a skip link", async ({ page }) => {
  await page.goto("/nope");
  await expect(page.locator('a.skip[href="#main"]')).toHaveCount(1);
  await expect(page.locator("main#main")).toHaveCount(1);
});
