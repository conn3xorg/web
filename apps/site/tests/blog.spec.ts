// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

import { test, expect, type Page } from "@playwright/test";

const POST = "/blog/why-conn3x";
const CARD = "/media/blog/why-conn3x/card.png";

const meta = (page: Page, key: string) =>
  page.locator(`meta[property="${key}"], meta[name="${key}"]`).getAttribute("content");

test("a post shows its byline", async ({ page }) => {
  await page.goto("/blog/conn3x-v0-1");
  await expect(page.locator(".meta")).toContainText("James Conway");
});

test("a post without an image uses the site card", async ({ page }) => {
  await page.goto("/blog/conn3x-v0-1");
  expect(await meta(page, "og:image")).toMatch(/\/og\.png$/);
});

test("a post with an image uses its own card", async ({ page, request }) => {
  await page.goto(POST);
  expect(await meta(page, "og:image")).toMatch(new RegExp(`${CARD}$`));
  expect(await meta(page, "og:image:alt")).toBeTruthy();
  expect(await meta(page, "twitter:image:alt")).toBe(await meta(page, "og:image:alt"));
  expect((await request.get(CARD)).status()).toBe(200);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("a clip doesn't play", async ({ page }) => {
    await page.goto(POST);
    const video = page.locator("[data-clip] video").first();
    await expect(video).toHaveAttribute("poster", /\.webp$/);
    await page.waitForTimeout(500);
    expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  });
});

test("a clip can be paused", async ({ page }) => {
  await page.goto(POST);
  const video = page.locator("[data-clip] video").first();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  const toggle = page.locator("[data-clip-toggle]").first();
  await toggle.click();
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await expect(toggle).toHaveText("Play");
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("a clip can still be played", async ({ page }) => {
    await page.goto(POST);
    await expect(page.locator("[data-clip] video").first()).toHaveAttribute("controls", "");
  });
});

test("the clip's button sits outside its caption", async ({ page }) => {
  await page.goto(POST);
  await expect(page.locator("figcaption [data-clip-toggle]")).toHaveCount(0);
  expect(await page.locator("[data-clip] video").first().evaluate((v: HTMLVideoElement) => v.controls)).toBe(false);
});
