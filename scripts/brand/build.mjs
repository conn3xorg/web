// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Rebuilds every brand asset from the geometry in brand.mjs.
//
//   node scripts/brand/build.mjs [--readme <dir>]
//
// Writes the logo, mark and favicon SVGs, the PNG icons, favicon.ico and
// the social card into apps/site. With --readme, also renders the animated
// README header GIFs (needs gifski) into <dir>.

import { optimize } from "svgo";
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { COLORS, LINE, loadFont, lockup, markPaths, markSvg } from "./brand.mjs";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url).pathname;
const site = join(root, "apps/site");
const staticFonts = join(require.resolve("@fontsource/schibsted-grotesk/package.json"), "../files");
const BOLD = join(staticFonts, "schibsted-grotesk-latin-800-normal.woff");
const MEDIUM = join(staticFonts, "schibsted-grotesk-latin-500-normal.woff");

const f = (n) => n.toFixed(2);
const opt = (s) =>
  optimize(s, { multipass: true, plugins: [{ name: "preset-default", params: { overrides: { mergePaths: false } } }] }).data;

function vectors() {
  const L = lockup(BOLD, 64);
  const logo = (c) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(L.width)} ${f(L.height)}" role="img" aria-label="Conn3x"><g transform="translate(0 ${f(L.markY)})">${markSvg(L.m, L.stroke, c)}</g><path fill="${c.text}" d="${L.w.d(L.m.width + L.gap, L.wordY)}"/></svg>`;

  const u = 10, stroke = 5.2, m = markPaths(u, stroke), pad = 2;
  const mark = (c) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${f(-m.height / 2 - pad)} ${f(m.width + 2 * pad)} ${f(m.height + 2 * pad)}" role="img" aria-label="Conn3x">${markSvg(m, stroke, c)}</svg>`;

  // Heavier stroke so the favicon holds up at 16px; follows the browser theme.
  const fu = 9, fs = 6.4, fm = markPaths(fu, fs), side = fm.width + 4;
  const line = (d) => `<path class="t" d="${d}" stroke-width="${fs}" ${LINE} fill="none"/>`;
  const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(side)} ${f(side)}"><style>.t{stroke:${COLORS.light.text}}@media (prefers-color-scheme:dark){.t{stroke:${COLORS.dark.text}}}</style><g transform="translate(2 ${f(side / 2)})">${line(fm.top)}${line(fm.bottom)}${line(fm.outLine)}<circle cx="${fm.xJ}" cy="0" r="${f(fm.nodeR)}" fill="${COLORS.light.accent}"/></g></svg>`;

  const out = {
    "src/brand/logo.svg": logo(COLORS.light),
    "src/brand/logo-dark.svg": logo(COLORS.dark),
    "src/brand/mark.svg": mark(COLORS.light),
    "src/brand/mark-dark.svg": mark(COLORS.dark),
    "public/favicon.svg": favicon,
  };
  for (const [path, svg] of Object.entries(out)) writeFileSync(join(site, path), opt(svg));
  return out;
}

async function rasters(browser, svgs) {
  const font = (file) => `data:font/woff2;base64,${readFileSync(join(site, "src/fonts", file)).toString("base64")}`;
  const fontCss = `@font-face{font-family:S;src:url(${font("schibsted-grotesk-latin-wght-normal.woff2")});font-weight:100 900}
@font-face{font-family:M;src:url(${font("jetbrains-mono-latin-wght-normal.woff2")});font-weight:100 900}`;

  async function render(html, w, h) {
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    await p.setContent(`<!doctype html><style>${fontCss}*{margin:0;box-sizing:border-box}html,body{width:${w}px;height:${h}px;overflow:hidden}</style>${html}`);
    await p.evaluate(() => document.fonts.ready);
    const png = await p.screenshot({ type: "png" });
    await p.close();
    return png;
  }
  const fill = (svg) => svg.replace("<svg", '<svg style="width:100%;height:auto"');
  const tile = (svg, pad) =>
    `<div style="width:100%;height:100%;background:${COLORS.light.bg};display:grid;place-items:center;padding:${pad}">${fill(svg)}</div>`;

  writeFileSync(join(site, "public/apple-touch-icon.png"), await render(tile(svgs["src/brand/mark.svg"], "18%"), 180, 180));
  writeFileSync(join(site, "public/logo.png"), await render(tile(svgs["src/brand/mark.svg"], "16%"), 512, 512));

  // favicon.ico holding 16, 32 and 48px PNGs.
  const sizes = [16, 32, 48];
  const pngs = [];
  for (const s of sizes) pngs.push(await render(tile(svgs["public/favicon.svg"], s === 16 ? "0px" : "6%"), s, s));
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach((png, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(sizes[i], e);
    header.writeUInt8(sizes[i], e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  writeFileSync(join(site, "public/favicon.ico"), Buffer.concat([header, ...pngs]));

  const grid = `background-image:linear-gradient(${COLORS.light.grid} 1px,transparent 1px),linear-gradient(90deg,${COLORS.light.grid} 1px,transparent 1px);background-size:30px 30px`;
  const og = `<div style="width:1200px;height:630px;background:${COLORS.light.bg};${grid};padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between;font-family:S;color:${COLORS.light.text}">
  <div style="width:420px">${fill(svgs["src/brand/logo.svg"])}</div>
  <div style="font-weight:800;font-size:76px;line-height:1.02;letter-spacing:-0.03em;max-width:16ch">One plan for your cloud and the servers it creates.</div>
  <div style="display:flex;justify-content:space-between;font-family:M;font-size:24px;color:${COLORS.light.muted}"><span>Open source, MPL-2.0</span><span>conn3x.org</span></div></div>`;
  writeFileSync(join(site, "public/og.png"), await render(og, 1200, 630));
}

async function readmeHeaders(browser, outDir) {
  const W = 1280, H = 300, SCALE = 2, FPS = 30, DURATION = 3.4;
  const L = lockup(BOLD, 112);
  const medium = loadFont(MEDIUM);
  const tag = "One plan for your cloud and the servers it creates.";
  const tb = medium.getPath(tag, 0, 0, 30).getBoundingBox();
  const tagD = medium.getPath(tag, (W - (tb.x2 - tb.x1)) / 2 - tb.x1, 222 - tb.y1, 30).toPathData(2);
  const x0 = (W - L.width) / 2, y0 = 70;

  // Animated with CSS; frames are captured by seeking every animation.
  const svg = (c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * SCALE}" height="${H * SCALE}">
<style>
.trace{stroke-dasharray:1;animation:draw .9s cubic-bezier(.4,0,.2,1) both}
.out{stroke-dasharray:1;animation:draw .35s .8s ease-out both}
.node{transform-box:fill-box;transform-origin:center;animation:pop .4s .95s cubic-bezier(.3,1.6,.6,1) both}
.word{animation:fade .6s .6s ease-out both}
.tag{animation:fade .6s 1.15s ease-out both}
@keyframes draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@keyframes pop{from{transform:scale(0)}to{transform:scale(1)}}
@keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
</style>
<defs><pattern id="g" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0v28" fill="none" stroke="${c.grid}" stroke-width="1"/></pattern></defs>
<rect width="${W}" height="${H}" fill="${c.bg}"/><rect width="${W}" height="${H}" fill="url(#g)"/>
<g transform="translate(${f(x0)} ${f(y0 + L.markY)})">${markSvg(L.m, L.stroke, c)}</g>
<path class="word" fill="${c.text}" d="${L.w.d(x0 + L.m.width + L.gap, y0 + L.wordY)}"/>
<path class="tag" fill="${c.muted}" d="${tagD}"/>
</svg>`;

  mkdirSync(outDir, { recursive: true });
  for (const [name, c] of Object.entries(COLORS)) {
    const frames = mkdtempSync(join(tmpdir(), `conn3x-header-${name}-`));
    const page = await browser.newPage({ viewport: { width: W * SCALE, height: H * SCALE } });
    await page.setContent(`<!doctype html><style>*{margin:0}svg{display:block}</style>${svg(c)}`);
    const files = [];
    for (let i = 0; i < Math.round(DURATION * FPS); i++) {
      await page.evaluate((t) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t; }), (i / FPS) * 1000);
      const file = join(frames, `${String(i).padStart(4, "0")}.png`);
      await page.screenshot({ path: file });
      files.push(file);
    }
    await page.close();
    // Plays once, then holds on the final frame.
    execFileSync("gifski", ["--fps", String(FPS), "--width", String(W), "--quality", "90", "--repeat", "-1", "-o", join(outDir, `header-${name}.gif`), ...files], { stdio: "ignore" });
    rmSync(frames, { recursive: true, force: true });
  }
}

const args = process.argv.slice(2);
const readme = args.includes("--readme") ? args[args.indexOf("--readme") + 1] : null;
const svgs = vectors();
const browser = await chromium.launch();
try {
  await rasters(browser, svgs);
  if (readme) await readmeHeaders(browser, readme);
} finally {
  await browser.close();
}
console.log(`brand assets written${readme ? `, README headers in ${readme}` : ""}`);
