// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Hand-built SVG pieces for the meme set: one original character and a few props.
// Every function returns an SVG fragment string positioned with a transform.

const SKIN = "#f4c7a1", SKIN_D = "#e2a983", INK = "#1d1d1f";

function g(x, y, s, body) {
  return `<g transform="translate(${x} ${y}) scale(${s})">${body}</g>`;
}

// The character: drawn in a 240x300 box, head centred at (120,110).
// opts: mood (happy|grin|worried|tired|cool|nope|smug|panic), shirt, glasses, headphones,
// arms (down|up|chin|point|palm|thumb|type), sweat, bags.
function dev(x, y, s, o = {}) {
  const shirt = o.shirt ?? "#2e3a59";
  const mood = o.mood ?? "happy";
  let p = "";
  // body
  p += `<path d="M38 300 Q38 200 120 192 Q202 200 202 300 Z" fill="${shirt}"/>`;
  p += `<path d="M100 196 L120 222 L140 196" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="4"/>`;
  // neck + head
  p += `<rect x="104" y="170" width="32" height="30" fill="${SKIN_D}"/>`;
  p += `<ellipse cx="120" cy="112" rx="84" ry="80" fill="${SKIN}" stroke="${INK}" stroke-width="4"/>`;
  p += `<ellipse cx="38" cy="120" rx="12" ry="18" fill="${SKIN}" stroke="${INK}" stroke-width="4"/>`;
  p += `<ellipse cx="202" cy="120" rx="12" ry="18" fill="${SKIN}" stroke="${INK}" stroke-width="4"/>`;
  // hair
  p += `<path d="M36 112 Q30 28 120 26 Q212 28 204 112 L196 80 L182 96 L174 62 L156 84 L148 52 L128 78 L114 48 L98 80 L84 56 L72 88 L58 66 L48 98 Z" fill="${INK}"/>`;
  // eyes
  const ey = 118;
  const eye = (cx) => {
    let e = "";
    if (mood === "nope") return `<path d="M${cx - 16} ${ey} q16 10 32 0" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`;
    e += `<ellipse cx="${cx}" cy="${ey}" rx="19" ry="23" fill="#fff" stroke="${INK}" stroke-width="4"/>`;
    const pr = mood === "panic" ? 5 : 9;
    const dx = mood === "smug" ? 6 : 0;
    e += `<circle cx="${cx + dx}" cy="${ey + 4}" r="${pr}" fill="${INK}"/><circle cx="${cx + dx + 3}" cy="${ey}" r="3" fill="#fff"/>`;
    if (mood === "tired" || mood === "smug") e += `<path d="M${cx - 21} ${ey - 26} H${cx + 21} V${ey + 1} Q${cx} ${ey + 6} ${cx - 21} ${ey + 1} Z" fill="${SKIN}" stroke="${INK}" stroke-width="4"/>`;
    if (mood === "tired" || o.bags) e += `<path d="M${cx - 16} ${ey + 30} q16 9 32 0" fill="none" stroke="#9b6b8f" stroke-width="4" stroke-linecap="round"/><path d="M${cx - 12} ${ey + 37} q12 6 24 0" fill="none" stroke="#9b6b8f" stroke-width="3" stroke-linecap="round" opacity=".6"/>`;
    if (mood === "panic") e += `<path d="M${cx - 12} ${ey - 4} l6 6 M${cx + 12} ${ey - 4} l-6 6 M${cx - 10} ${ey + 14} l5 -4 M${cx + 10} ${ey + 14} l-5 -4" stroke="#d64545" stroke-width="2"/>`;
    return e;
  };
  p += eye(88) + eye(152);
  // brows
  const brow = {
    worried: [`M66 86 L104 96`, `M174 86 L136 96`].map((d, i) => d),
    panic: [`M66 84 L104 96`, `M174 84 L136 96`],
    nope: [`M68 98 L104 92`, `M172 98 L136 92`],
    smug: [`M68 96 L104 92`, `M136 84 L172 94`],
    tired: [`M68 90 L104 92`, `M136 92 L172 90`],
  }[mood] ?? [`M68 88 Q86 78 104 86`, `M136 86 Q154 78 172 88`];
  p += brow.map((d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`).join("");
  // glasses
  if (o.glasses) p += `<g fill="none" stroke="${INK}" stroke-width="6"><rect x="62" y="96" width="52" height="44" rx="10"/><rect x="126" y="96" width="52" height="44" rx="10"/><path d="M114 112 h12 M62 110 l-20 -4 M178 110 l20 -4"/></g>`;
  if (mood === "cool") p += `<path d="M58 100 H182 V112 Q178 146 150 144 Q128 142 124 116 H116 Q112 142 90 144 Q62 146 58 112 Z" fill="${INK}"/><path d="M70 108 l20 0" stroke="#fff" stroke-width="4" opacity=".7"/>`;
  // mouth
  const mouth = {
    happy: `<path d="M94 156 Q120 186 146 156 Z" fill="#7a1f2b" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M102 166 Q120 178 138 166" fill="#e86a7a"/>`,
    grin: `<path d="M90 152 Q120 190 150 152 Z" fill="#fff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M98 162 H142" stroke="${INK}" stroke-width="2"/>`,
    worried: `<path d="M98 166 q8 -8 16 0 t16 0 t12 -2" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
    panic: `<ellipse cx="120" cy="166" rx="16" ry="14" fill="#7a1f2b" stroke="${INK}" stroke-width="4"/>`,
    tired: `<path d="M104 166 H136" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
    cool: `<path d="M100 160 Q124 174 146 154" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
    smug: `<path d="M100 162 Q126 172 146 154" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
    nope: `<path d="M100 170 Q120 156 140 170" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
  }[mood];
  p += mouth;
  if (o.sweat || mood === "panic" || mood === "worried") p += `<path d="M196 70 q10 18 0 26 q-10 -8 0 -26 Z" fill="#7cc7ff" stroke="${INK}" stroke-width="3"/>`;
  if (o.headphones) p += `<path d="M40 112 Q40 20 120 18 Q200 20 200 112" fill="none" stroke="#333" stroke-width="12"/><rect x="22" y="96" width="26" height="46" rx="10" fill="#444"/><rect x="192" y="96" width="26" height="46" rx="10" fill="#444"/>`;
  // arms
  const arm = (d, hx, hy) => `<path d="${d}" fill="none" stroke="${shirt}" stroke-width="28" stroke-linecap="round"/><circle cx="${hx}" cy="${hy}" r="17" fill="${SKIN}" stroke="${INK}" stroke-width="4"/>`;
  const arms = o.arms ?? "down";
  if (arms === "up") p += arm("M58 230 Q20 170 18 110", 18, 104) + arm("M182 230 Q220 170 222 110", 222, 104);
  if (arms === "chin") p += arm("M70 290 Q60 230 98 196", 104, 192);
  if (arms === "point") p += arm("M182 236 Q236 222 262 196", 268, 190) + `<path d="M278 184 l28 -18" stroke="${INK}" stroke-width="15" stroke-linecap="round"/><path d="M278 184 l28 -18" stroke="${SKIN}" stroke-width="8" stroke-linecap="round"/>`;
  if (arms === "palm") p += arm("M182 236 Q232 220 244 150", 246, 150) + [0, 1, 2, 3].map((i) => `<rect x="${222 + i * 13}" y="${92 - (i === 1 || i === 2 ? 8 : 0)}" width="13" height="48" rx="6.5" fill="${SKIN}" stroke="${INK}" stroke-width="3.5"/>`).join("") + `<rect x="220" y="120" width="54" height="42" rx="14" fill="${SKIN}" stroke="${INK}" stroke-width="4"/><rect x="206" y="122" width="12" height="32" rx="6" transform="rotate(-30 212 138)" fill="${SKIN}" stroke="${INK}" stroke-width="3.5"/>`;
  if (arms === "thumb") p += arm("M182 240 Q228 236 236 200", 238, 196) + `<rect x="232" y="164" width="12" height="28" rx="6" fill="${SKIN}" stroke="${INK}" stroke-width="3"/>`;
  if (arms === "headhold") p += arm("M58 236 Q14 180 40 96", 40, 90) + arm("M182 236 Q226 180 200 96", 200, 90);
  return g(x, y, s, p);
}

function laptop(x, y, w, screen = "", stickers = []) {
  const h = w * 0.62;
  let p = `<path d="M0 ${h} L${w} ${h} L${w * 0.93} 0 L${w * 0.07} 0 Z" fill="#c9ced6" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
  p += `<circle cx="${w / 2}" cy="${h * 0.48}" r="${w * 0.07}" fill="#e9ecf1"/>`;
  stickers.forEach((t, i) => {
    const sw = t[0].length * 8.4 + 16;
    const sx = w * (stickers.length === 1 ? 0.5 : 0.3 + (i % 2) * 0.4), sy = h * (0.28 + (i % 2) * 0.34 + Math.floor(i / 2) * 0.3);
    p += `<g transform="translate(${sx} ${sy}) rotate(${i % 2 ? 8 : -7})"><rect x="${-sw / 2}" y="-13" width="${sw}" height="26" rx="8" fill="${t[1]}" stroke="${INK}" stroke-width="2.5"/><text x="0" y="5" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="13" fill="${t[2] ?? "#fff"}">${t[0]}</text></g>`;
  });
  p += `<rect x="-${w * 0.06}" y="${h}" width="${w * 1.12}" height="12" rx="5" fill="#9aa2ad" stroke="${INK}" stroke-width="4"/>`;
  return `<g transform="translate(${x} ${y})">${p}${screen}</g>`;
}

function mug(x, y, lines, color = "#fff", rot = 0) {
  const t = lines.map((l, i) => `<text x="40" y="${34 + i * 16 - (lines.length - 1) * 8}" text-anchor="middle" font-family="Schibsted Grotesk" font-weight="900" font-size="13" fill="${INK}">${l}</text>`).join("");
  return `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M78 18 q26 0 26 22 q0 22 -26 22" fill="none" stroke="${INK}" stroke-width="8"/><path d="M0 0 H80 V70 Q80 84 66 84 H14 Q0 84 0 70 Z" fill="${color}" stroke="${INK}" stroke-width="4"/>${t}<path d="M24 -10 q6 -12 0 -22 M44 -10 q6 -12 0 -22" stroke="#bbb" stroke-width="3" fill="none"/></g>`;
}

function sticky(x, y, lines, rot = -4, color = "#ffe27a") {
  const t = lines.map((l, i) => `<text x="10" y="${26 + i * 19}" font-family="Comic Sans MS, Chalkboard SE, Marker Felt, cursive" font-size="16" fill="${INK}">${l}</text>`).join("");
  const h = 22 + lines.length * 19;
  const w = Math.max(108, Math.max(...lines.map((l) => l.length)) * 9 + 20);
  return `<g transform="translate(${x} ${y}) rotate(${rot})"><rect width="${w}" height="${h}" fill="${color}" stroke="rgba(0,0,0,.25)" stroke-width="2"/><rect x="${w / 2 - 20}" y="-6" width="40" height="12" fill="rgba(255,255,255,.6)"/>${t}</g>`;
}

function books(x, y, items) {
  return `<g transform="translate(${x} ${y})">${items.map(([t, c], i) => {
    const yy = -(i + 1) * 30, xx = (i % 2) * 8;
    return `<rect x="${xx}" y="${yy}" width="150" height="28" rx="3" fill="${c}" stroke="${INK}" stroke-width="3"/><rect x="${xx + 140}" y="${yy + 3}" width="7" height="22" fill="#fff8e6"/><text x="${xx + 10}" y="${yy + 20}" font-family="Schibsted Grotesk" font-weight="700" font-size="15" fill="#fff">${t}</text>`;
  }).join("")}</g>`;
}

function monitor(x, y, w, h, inner) {
  return `<g transform="translate(${x} ${y})"><rect width="${w}" height="${h}" rx="8" fill="#14181f" stroke="${INK}" stroke-width="5"/><rect x="${w / 2 - 14}" y="${h}" width="28" height="22" fill="#555"/><rect x="${w / 2 - 50}" y="${h + 20}" width="100" height="10" rx="4" fill="#555"/><g transform="translate(10 10)">${inner}</g></g>`;
}

function term(lines, size = 14, lh = 19) {
  return lines.map(([t, c], i) => `<text x="4" y="${size + i * lh}" font-family="JetBrains Mono" font-weight="600" font-size="${size}" fill="${c ?? "#d6e2f0"}" xml:space="preserve">${t}</text>`).join("");
}

function desk(w, y, color = "#a0683e") {
  return `<rect x="0" y="${y}" width="${w}" height="400" fill="${color}"/><rect x="0" y="${y}" width="${w}" height="10" fill="rgba(255,255,255,.18)"/>`;
}
