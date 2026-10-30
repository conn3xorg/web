// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Records the Circuit Builder picking Rocky + nginx + docker + fail2ban +
// firewall, and takes the two stills the post uses. Serve the built site
// first (pnpm -C apps/site build, then wrangler dev in apps/site).
//   node scripts/post-graphics/circuit-builder/record.mjs [baseURL] [kitDir]
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] ?? "http://127.0.0.1:8787";
const kit = process.argv[3];
const site = join(dir, "../../../apps/site/public/media/blog/circuit-builder");
const W = 1280, H = 720;

const pick = (page, value) => page.locator(`label.chip:has(input[value="${value}"])`);
async function glide(page, locator, block = "center") {
  await locator.evaluate((el, block) => el.scrollIntoView({ behavior: "smooth", block }), block);
  await page.waitForTimeout(700);
}

const browser = await chromium.launch();

// Stills, at 2x for sharp text, with the header out of the way.
const top = (page, sel, i = 0) =>
  page.evaluate(([sel, i]) => {
    const r = document.querySelectorAll(sel)[i].getBoundingClientRect();
    return { y: r.top + scrollY, bottom: r.bottom + scrollY };
  }, [sel, i]);
{
  const page = await browser.newPage({ viewport: { width: W, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(base + "/build");
  await page.locator(".site-header").evaluate((el) => el.style.setProperty("position", "static", "important"));
  for (const n of ["rocky10", "nginx", "docker", "fail2ban", "firewall"]) await pick(page, n).click();
  const a = await top(page, "#s-circuits");
  const b = await top(page, "fieldset.group", 6);
  await page.screenshot({ path: join(site, "picks.png"), fullPage: true, clip: { x: 0, y: a.y - 32, width: W, height: b.bottom - a.y + 56 } });
  await page.fill("#hosts", "web1 203.0.113.10\nweb2 203.0.113.11");
  await page.fill("#ssh-user", "deploy");
  await page.fill("#ssh-key", "~/.ssh/id_ed25519");
  await page.check("#ssh-become");
  await page.click("button[type=submit]");
  await page.waitForTimeout(1500);
  const o = await top(page, "#s-out");
  const e = await top(page, "#out .actions");
  await page.screenshot({ path: join(site, "config.png"), fullPage: true, clip: { x: 0, y: o.y - 32, width: W, height: e.bottom - o.y + 64 } });
  await page.close();
}

// The recording.
const raw = mkdtempSync(join(tmpdir(), "conn3x-build-"));
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: raw, size: { width: W, height: H } } });
const page = await ctx.newPage();
await page.goto(base + "/build");
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1500);
await glide(page, page.locator("#s-distro"), "start");
await page.waitForTimeout(400);
await pick(page, "rocky10").click();
await page.waitForTimeout(600);
await glide(page, page.locator("fieldset.group").first(), "start");
await page.mouse.wheel(0, -120);
await page.waitForTimeout(400);
await pick(page, "nginx").click();
await page.waitForTimeout(1800); // apache, caddy, haproxy and traefik grey out, with the reason
await glide(page, pick(page, "docker"));
await pick(page, "docker").click();
await page.waitForTimeout(600);
await glide(page, pick(page, "fail2ban"));
await pick(page, "fail2ban").click();
await page.waitForTimeout(400);
await pick(page, "firewall").click();
await page.waitForTimeout(1600); // keepalived greys out: no VRRP rule
await glide(page, page.locator("#s-hosts"), "start");
await page.mouse.wheel(0, -100);
await page.locator("#hosts").pressSequentially("web1 203.0.113.10\nweb2 203.0.113.11", { delay: 35 });
await page.locator("#ssh-user").pressSequentially("deploy", { delay: 50 });
await page.locator("#ssh-key").pressSequentially("~/.ssh/id_ed25519", { delay: 35 });
await page.check("#ssh-become");
await page.waitForTimeout(500);
await glide(page, page.locator("button[type=submit]"));
await page.waitForTimeout(500);
await page.click("button[type=submit]");
await page.waitForTimeout(1600);
await page.locator("#code").evaluate((el) => el.parentElement.scrollIntoView({ behavior: "smooth", block: "start" }));
await page.mouse.wheel(0, -90);
await page.waitForTimeout(2600);
await page.locator("#code").hover();
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(250); }
await page.waitForTimeout(2200);
await page.locator("#tabs button", { hasText: "README.md" }).click();
await page.locator("#code").evaluate((el) => (el.parentElement.scrollTop = 0));
await page.waitForTimeout(2600);
await ctx.close();
await browser.close();

const webm = join(raw, readdirSync(raw).find((f) => f.endsWith(".webm")));
const mp4 = join(site, "build.mp4");
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "slow", "-movflags", "+faststart", "-an", mp4]);
execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "18.5", "-i", mp4, "-frames:v", "1", join(raw, "poster.png")]);
execFileSync("cwebp", ["-quiet", "-q", "82", join(raw, "poster.png"), "-o", join(site, "build.webp")]);
if (kit) {
  execFileSync("cp", [mp4, join(kit, "build.mp4")]);
  const frames = join(raw, "gif");
  execFileSync("mkdir", ["-p", frames]);
  execFileSync("ffmpeg", ["-v", "error", "-i", mp4, "-vf", "fps=12,scale=800:-1", join(frames, "f%04d.png")]);
  const pngs = readdirSync(frames).sort().map((f) => join(frames, f));
  execFileSync("gifski", ["--quiet", "--fps", "12", "--quality", "80", "-o", join(kit, "build.gif"), ...pngs]);
}
rmSync(raw, { recursive: true });
console.log(mp4);
