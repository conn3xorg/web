// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// The circuit grader. Reads each directory circuit at its latest tag and from
// the GitHub API when the site builds, and scores it against RUBRIC. Every
// point comes from something a machine read: a CI file, a workflow run, a
// signature. Nothing here reads a README. If the API fails, a circuit keeps
// its last good result in data/grades.json, so an outage never fails a deploy.
// The page says when each result was read.
//
// Refresh that file with: node apps/site/src/lib/grades.js

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

import fallback from "../data/grades.json" with { type: "json" };

const DATA = new URL("../data/", import.meta.url);
const FALLBACK = new URL("grades.json", DATA);

// A circuit below this percentage doesn't pass: C or better does.
export const PASS_MARK = 70;
export const BANDS = [["A", 90], ["B", 80], ["C", PASS_MARK], ["D", 60], ["F", 0]];

// Off: every grade shows, and the Circuit Builder leaves everything in. On:
// the builder drops a circuit that doesn't pass, and says why.
export const ENFORCE_GRADES = false;

// Results for these checks stay out of the published data and out of the
// score, for every circuit, until the fixes they would point at have shipped.
// Holding only the failures would give the failures away.
export const HELD = new Set(["privileged-shell", "listen-address", "images-by-digest"]);

const DAY = 86_400_000;
const FRESH_DAYS = 180;
const KEY_WARN_DAYS = 90;
const REAL_HOST_DAYS = 180;

// --- Reading a CI file ---------------------------------------------------------

/** Jobs and their steps from a workflow, by indentation, comments dropped. */
export function parseWorkflow(text) {
  const lines = text.split("\n").filter((l) => !/^\s*#/.test(l));
  const jobs = [];
  let job = null;
  let stepIndent = -1;
  let inJobs = false;
  for (const line of lines) {
    if (/^jobs:\s*$/.test(line)) inJobs = true;
    else if (/^\S/.test(line)) inJobs = false;
    if (!inJobs) continue;
    const start = /^  ([\w-]+):\s*$/.exec(line);
    if (start) {
      job = { name: start[1], head: [], steps: [] };
      jobs.push(job);
      stepIndent = -1;
      continue;
    }
    if (!job) continue;
    if (stepIndent < 0) {
      if (/^\s+steps:\s*$/.test(line)) stepIndent = line.search(/\S/);
      else job.head.push(line);
      continue;
    }
    const item = /^(\s*)- /.exec(line);
    if (item && item[1].length <= stepIndent + 2) job.steps.push({ name: "", lines: [] });
    const step = job.steps.at(-1);
    if (!step) continue;
    const name = /^\s*(?:- )?name:\s*(.*)$/.exec(line);
    if (name && !step.name && !step.lines.length) step.name = name[1].trim();
    else step.lines.push(line.replace(/^\s*- /, "").trim());
  }
  return jobs;
}

const APPLY = /\bconn3x\s+apply\b/;
const CLEAN_PLAN = /\bconn3x\s+plan\b[^|;&\n]*-detailed-exitcode\b(?!.*\|\|\s*true)/;

// Every line a job runs after its first apply, with the scripts it calls
// pasted in. Steps that only run on failure or to clean up don't count.
function afterApply(job, files) {
  const out = [];
  let seen = false;
  for (const step of job.steps) {
    if (step.lines.some((l) => /^if:\s*(failure|always)\(\)/.test(l))) continue;
    if (!step.lines.some((l) => !/^(uses|with|env|working-directory):/.test(l))) continue;
    let body = step.lines;
    if (!seen) {
      const at = body.findIndex((l) => APPLY.test(l));
      if (at < 0) continue;
      seen = true;
      body = body.slice(at + 1);
    }
    const joined = body.join("\n").replace(/\\\n\s*/g, " ").split("\n");
    const lines = joined.flatMap((l) => [l, ...scriptLines(l, files)]);
    out.push({ name: step.name, lines });
  }
  return out;
}

function scriptLines(line, files) {
  const m = /(?:^|[\s/])([\w-]+\.(?:sh|py))\b/.exec(line);
  if (!m || /^(up|down)\.sh$/.test(m[1])) return [];
  for (const [path, text] of files) {
    if (path.endsWith(`/${m[1]}`)) return text.split("\n").filter((l) => !/^\s*#/.test(l)).map((l) => l.trim());
  }
  return [];
}

// Commands that only look at a host: they can pass on a service that doesn't work.
const LOOKING = /^(?:(?:systemctl\s+(?:is-active|is-enabled|status|show|cat|list-\S+)|service\s+\S+\s+status|sysctl|apt-config|systemd-detect-virt|cmp|diff|sha256sum|mkdir|rm|export|ufw\s+status|firewall-cmd\s+--(?:list|query|state)\S*|pgrep|pidof|test|stat|ls|cat|grep|egrep|command\s+-v|which|type|getent|id|find|head|tail|readlink|ps|ss|wc|file|dpkg|rpm|journalctl|echo|printf|sleep|set|cd|for|while|until|do|done|if|then|else|elif|fi|case|esac|exit|true|false|run|conn3x)(?=[\s;]|$)|\[\[?\s|\S+:(?:\s|$)|[A-Za-z_]+=\S*$|[{})]|&\w+\s*\|?$|[\w-]+\(\)\s*\{|\.\/(?:up|down)\.sh|(?:(?:sudo\s+)?[\w.-]+\s+)?(?:--?version|version)(?:\s|$)|(?:docker\s+compose|docker|podman|crictl|ctr)\s+(?:ps|images|inspect|logs)(?=\s|$)|(?:k3s\s+)?kubectl\s+(?:--\S+\s+\S+\s+)*(?:get|wait|describe|logs)(?=\s|$)|(?:sh|bash)(?:\s+-\S+)*(?:\s+\S+)*\s*<<?-?\s*\S+$|\S*(?:check|settled)[\w-]*\.(?:sh|py)(?=\s|$))/;
const WRAPPER = /^(!\s*|[\w-]+\(\)\s*\{\s*|[A-Za-z_]\w*=\$\(\s*|"|'|\|\s*|run:\s*\|?\s*|sudo\s+(-\S+\s+)*|timeout\s+\S+\s+|(?:podman|docker|\$\w+)\s+exec\s+(?:-[weu]\s+\S+\s+|--\S+\s+|-\w+\s+)*\S+\s+|\$\{?\w+\}?\s+|sh\s+-\w*c\s+|bash\s+-\w*c\s+|if\s+!?\s*|until\s+|while\s+|for\s+.*;\s*do\s+|do\s+|then\s+)/;

function unwrap(line) {
  let s = line.trim();
  for (let was; was !== s; ) {
    was = s;
    s = s.replace(WRAPPER, "");
  }
  return s;
}

/** The first line that does something a stopped service couldn't, if any. */
export function behaviourLine(lines) {
  // A function is judged by its body. Calling one, by name, shows nothing.
  // shortcut: a body counts even if nothing calls it; good enough while the page shows the line.
  const fns = new Set(lines.flatMap((l) => /^\s*([\w-]+)\(\)\s*\{/.exec(l)?.[1] ?? []));
  for (const raw of lines) {
    const s = unwrap(raw);
    if (!s || /^(#|\/\/)/.test(s) || fns.has(s.split(/\s/)[0])) continue;
    if (!LOOKING.test(s)) return s;
  }
  return null;
}

// Hardcoded and defaulted secrets are both caught: what matters is that the
// run looks inside state for them.
const STATE_ASSERT = /(!\s*(sudo\s+)?grep\b.*tfstate|grep\b.*tfstate.*(then|&&)\s*(exit|false)|if\s+(sudo\s+)?grep\b.*tfstate|conn3x\s+(state\s+pull|show)\b.*\|.*grep|(state\s+pull|tfstate).*\|\s*!?\s*grep|!\s*.*state\s+pull)/;

// --- Keys ----------------------------------------------------------------------

function keyId(body) {
  const head = Buffer.from([0x99, body.length >> 8, body.length & 0xff]);
  return createHash("sha1").update(head).update(body).digest("hex").slice(-16);
}

function* packets(buf) {
  let i = 0;
  while (i < buf.length) {
    const head = buf[i++];
    if (!(head & 0x80)) return;
    let tag, len;
    if (head & 0x40) {
      tag = head & 0x3f;
      const o = buf[i++];
      if (o < 192) len = o;
      else if (o < 224) len = ((o - 192) << 8) + buf[i++] + 192;
      else if (o === 255) {
        len = buf.readUInt32BE(i);
        i += 4;
      } else return; // partial lengths don't appear in key files
    } else {
      tag = (head >> 2) & 0xf;
      const n = head & 3;
      if (n === 3) return;
      const size = 1 << n;
      len = buf.readUIntBE(i, size);
      i += size;
    }
    yield { tag, body: buf.subarray(i, i + len) };
    i += len;
  }
}

/**
 * When a key file stops being usable, as a time in ms, or null if it never
 * does. shortcut: reads expiry from the newest self-signature without checking
 * it or looking for revocations; these are files we pinned, not a trust decision.
 */
export function keyExpiry(armored) {
  const keys = [];
  for (const m of armored.matchAll(/-----BEGIN PGP PUBLIC KEY BLOCK-----([\s\S]*?)-----END PGP/g)) {
    const b64 = m[1].split("\n").filter((l) => l && !l.includes(":") && !l.startsWith("=")).join("");
    let cur = null;
    let primary = null;
    for (const { tag, body } of packets(Buffer.from(b64, "base64"))) {
      if (tag === 6 || tag === 14) {
        cur = { created: body.readUInt32BE(1) * 1000, signed: 0, expires: null, subs: [], body };
        if (tag === 6) {
          primary = cur;
          keys.push(primary);
        } else primary?.subs.push(cur);
      } else if (tag === 2 && cur && body[0] === 4 && [0x10, 0x11, 0x12, 0x13, 0x18, 0x1f].includes(body[1])) {
        const end = 6 + body.readUInt16BE(4);
        const unhashedEnd = end + 2 + body.readUInt16BE(end);
        let made = 0;
        let life = null;
        let issuer = null;
        for (const [from, to] of [[6, end], [end + 2, unhashedEnd]]) {
          for (let i = from; i < to; ) {
            let n = body[i++];
            if (n >= 192 && n < 255) n = ((n - 192) << 8) + body[i++] + 192;
            else if (n === 255) {
              n = body.readUInt32BE(i);
              i += 4;
            }
            const type = body[i] & 0x7f;
            if (from === 6 && type === 2) made = body.readUInt32BE(i + 1) * 1000;
            if (from === 6 && type === 9) life = body.readUInt32BE(i + 1) * 1000;
            if (type === 16) issuer = body.toString("hex", i + 1, i + 9);
            i += n;
          }
        }
        // Someone else's certification says nothing about when this key ends.
        if (issuer && body[1] !== 0x18 && issuer !== keyId(primary.body)) continue;
        if (made >= cur.signed) {
          cur.signed = made;
          cur.expires = life ? cur.created + life : null;
        }
      }
    }
  }
  const usable = keys.map((k) => {
    const sub = k.subs.length ? k.subs.map((s) => s.expires ?? Infinity).reduce((a, b) => Math.max(a, b)) : Infinity;
    return Math.min(k.expires ?? Infinity, sub);
  });
  if (!usable.length) return undefined;
  const best = Math.max(...usable);
  return best === Infinity ? null : best;
}

// --- The rubric ----------------------------------------------------------------

const pass = (detail) => ({ state: "pass", fraction: 1, detail });
const fail = (detail) => ({ state: "fail", fraction: 0, detail });
const na = (detail) => ({ state: "na", detail });
const date = (ms) => new Date(ms).toISOString().slice(0, 10);

const code = (ev, ...exts) => [...ev.files].filter(([p]) => exts.some((x) => p.endsWith(x)) && !p.startsWith("examples/") && !p.startsWith("test/")).map(([, t]) => t.split("\n").filter((l) => !/^\s*(#|\/\/)/.test(l)).join("\n")).join("\n");

function downloadBlocks(hcl) {
  const out = [];
  for (const m of hcl.matchAll(/\bdownload\s*\{/g)) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    do {
      if (hcl[i] === "{") depth++;
      else if (hcl[i] === "}") depth--;
      i++;
    } while (depth && i < hcl.length);
    out.push(hcl.slice(m.index, i));
  }
  return out;
}

/** Each check: what it reads, what it's worth, and how to read it. */
export const RUBRIC = [
  {
    id: "ci-green", group: "Testing", points: 15, gate: true,
    title: "CI is green on main",
    test: (ev) => {
      if (!ev.run) return fail("No finished CI run on main.");
      const on = `Run of ${date(Date.parse(ev.run.date))}`;
      return ev.run.conclusion === "success" ? pass(`${on} passed.`) : fail(`${on} ended: ${ev.run.conclusion}.`);
    },
  },
  {
    id: "matrix", group: "Testing", points: 10,
    title: "Applied on real distributions in CI",
    test: (ev) => {
      const ids = new Set();
      for (const job of ev.applyJobs) for (const l of job.head) for (const m of l.matchAll(/\b(rocky\d+|fedora\d+|ubuntu\d{4}|debian\d+)\b/g)) ids.add(m[1]);
      if (ev.applyJobs.length && !ids.size) ids.add("one host");
      const n = ids.size;
      if (!n) return fail("CI never applies this circuit to a host.");
      const list = [...ids].sort().join(", ");
      return { state: n >= 4 ? "pass" : "partial", fraction: Math.min(n, 4) / 4, detail: `${n} in the matrix: ${list}.` };
    },
  },
  {
    id: "second-plan", group: "Testing", points: 15, gate: true,
    title: "A second plan comes back clean",
    test: (ev) => {
      const hit = ev.applyJobs.some((j) => ev.after(j).some((s) => s.lines.some((l) => CLEAN_PLAN.test(l))) || j.steps.some((s) => {
        const at = s.lines.findIndex((l) => APPLY.test(l));
        return at >= 0 && s.lines.slice(at).some((l) => CLEAN_PLAN.test(l));
      }));
      return hit ? pass("CI fails if a plan after apply shows changes.") : fail("CI doesn't run plan -detailed-exitcode after an apply.");
    },
  },
  {
    id: "behaviour", group: "Testing", points: 20, gate: true,
    title: 'CI uses the thing, past "service is active"',
    test: (ev) => {
      for (const j of ev.applyJobs) {
        for (const s of ev.after(j)) {
          const line = behaviourLine(s.lines);
          if (line) return pass(`Step "${s.name || "unnamed"}" runs: ${line.slice(0, 80)}`);
        }
      }
      return fail("After apply, CI only looks at the host: it never uses what was installed.");
    },
  },
  {
    id: "secrets-in-state", group: "Testing", points: 10,
    title: "CI checks secrets stay out of state",
    test: (ev) => {
      if (!/(sensitive|ephemeral)\s*=\s*true/.test(code(ev, ".tf"))) return na("No sensitive or ephemeral inputs.");
      const hit = ev.applyJobs.some((j) => ev.after(j).some((s) => s.lines.some((l) => STATE_ASSERT.test(l))));
      return hit ? pass("CI fails if a secret shows up in state.") : fail("Has secret inputs, and CI never looks for them in state.");
    },
  },
  {
    id: "restart", group: "Testing", points: 5,
    title: "Restart or reboot tested",
    test: (ev) => {
      if (!/\bservice\s*\{|\bcontainer\s*\{|\bcompose\b|systemctl|\.service\b|\bquadlet\b/.test(code(ev, ".hcl"))) return na("Runs no service.");
      const hit = ev.applyJobs.some((j) => ev.after(j).some((s) => s.lines.some((l) => /\b(restart|reboot)\b/.test(l) && !/^(run:\s*)?echo\b/.test(l))));
      return hit ? pass("CI restarts it and checks again.") : fail("CI never restarts it after apply.");
    },
  },
  {
    id: "upgrade", group: "Testing", points: 5,
    title: "Upgrade tested",
    test: (ev) => {
      const hit = ev.applyJobs.some((j) => ev.after(j).some((s) => /\bupgrade\b/i.test(s.name) && s.lines.some((l) => APPLY.test(l))));
      return hit ? pass("A CI step upgrades it with a second apply.") : fail("No CI step upgrades an existing install.");
    },
  },
  {
    id: "real-host", group: "Testing", points: 5,
    title: "Recent run on a real host",
    test: (ev) => {
      if (!ev.realHost) return fail("No real-host workflow has passed. A README saying so doesn't count.");
      const days = (ev.now - Date.parse(ev.realHost.date)) / DAY;
      return days <= REAL_HOST_DAYS ? pass(`Passed on ${date(Date.parse(ev.realHost.date))}.`) : fail(`Last passed on ${date(Date.parse(ev.realHost.date))}, over ${REAL_HOST_DAYS} days ago.`);
    },
  },
  {
    id: "downloads", group: "Supply chain", points: 5,
    title: "Downloads are checksummed",
    test: (ev) => {
      const hcl = code(ev, ".hcl");
      const blocks = downloadBlocks(hcl);
      const missing = blocks.filter((b) => !/\bsha256\s*=/.test(b)).length;
      if (!blocks.length) return na("Downloads nothing through a download step.");
      return missing ? fail(`${missing} of ${blocks.length} download steps have no checksum.`) : pass(`All ${blocks.length} download steps have a checksum.`);
    },
  },
  {
    id: "images-by-digest", group: "Supply chain", points: 5,
    title: "Container images pinned by digest",
    test: (ev) => {
      const hcl = code(ev, ".hcl", ".tf");
      const images = hcl.match(/"(?:docker\.io|ghcr\.io|quay\.io|registry\.[\w.-]+|mcr\.microsoft\.com)\/[^"\s]+"/g) ?? [];
      const loose = images.filter((i) => !i.includes("@") && /:[^/]+"$/.test(i));
      if (!images.length) return na("Pulls no images.");
      return loose.length ? fail(`${loose.length} image references have a tag and no digest.`) : pass("Every image reference has a digest, or is a repository whose digest is set elsewhere.");
    },
  },
  {
    id: "repo-keys", group: "Supply chain", points: 5,
    title: "Pinned repo keys aren't near expiry",
    test: (ev) => {
      const keys = [...ev.files].filter(([p, t]) => t.includes("BEGIN PGP PUBLIC KEY BLOCK") && !p.startsWith("examples/"));
      if (!keys.length) return na("Pins no signing keys.");
      let soonest = null;
      for (const [path, text] of keys) {
        const at = keyExpiry(text);
        if (at && (!soonest || at < soonest.at)) soonest = { at, path };
      }
      if (!soonest) return pass(`${keys.length} pinned, none expires.`);
      const days = Math.floor((soonest.at - ev.now) / DAY);
      const when = `${soonest.path} ${days < 0 ? "expired" : "expires"} on ${date(soonest.at)}.`;
      return days < KEY_WARN_DAYS ? fail(when) : pass(when);
    },
  },
  {
    id: "listen-address", group: "Supply chain", points: 5,
    title: "Default listen address",
    test: (ev) => {
      const all = /(default\s*=\s*"(0\.0\.0\.0|::|\[::\])"|0\.0\.0\.0(?![/\d]))/.test(code(ev, ".hcl", ".tf"));
      return all ? fail("Listens on every address by default.") : pass("Doesn't default to every address.");
    },
  },
  {
    id: "privileged-shell", group: "Supply chain", points: 10,
    title: "Privileged shell patterns",
    // shortcut: the patterns stay out of this public file while the check is held; add them here when it's released.
    test: () => na("Not published yet."),
  },
  {
    id: "signed-tags", group: "Repository", points: 5,
    title: "Release tag is signed",
    test: (ev) => (ev.tagVerified ? pass(`GitHub verified the signature on ${ev.tag}.`) : fail(`GitHub has no verified signature on ${ev.tag}.`)),
  },
  {
    id: "branch-protection", group: "Repository", points: 5,
    title: "Main is protected",
    test: (ev) => {
      const types = new Set(ev.rules);
      const ok = types.has("pull_request") && types.has("required_status_checks");
      return ok ? pass("A ruleset requires pull requests and passing checks.") : fail("No ruleset requires both pull requests and passing checks on main.");
    },
  },
  {
    id: "fresh", group: "Repository", points: 5,
    title: "Released recently",
    test: (ev) => {
      if (!ev.tagDate) return fail("Couldn't date the latest tag.");
      const days = Math.floor((ev.now - Date.parse(ev.tagDate)) / DAY);
      const text = `${ev.tag} is ${days} days old.`;
      return days <= FRESH_DAYS ? pass(text) : fail(text);
    },
  },
];

/** Score from checks that apply; a failed gate is an F whatever the rest says. */
export function gradeOf(checks) {
  const scored = checks.filter((c) => c.state !== "na" && c.state !== "held");
  const max = scored.reduce((n, c) => n + c.max, 0);
  const got = scored.reduce((n, c) => n + c.points, 0);
  const score = max ? Math.round((got / max) * 100) : 0;
  const gateFailed = checks.filter((c) => c.gate && c.state === "fail").map((c) => c.id);
  const grade = gateFailed.length ? "F" : BANDS.find(([, min]) => score >= min)[0];
  return { grade, score, passing: score >= PASS_MARK && !gateFailed.length, gateFailed };
}

/** Grades one circuit from what was read. `held` says which results to leave out. */
export function evaluate(ev, { held = HELD, extra = [] } = {}) {
  const jobs = parseWorkflow(ev.files.get(".github/workflows/ci.yml") ?? "");
  const applyJobs = jobs.filter((j) => j.steps.some((s) => s.lines.some((l) => APPLY.test(l))));
  const full = { ...ev, applyJobs, after: (j) => afterApply(j, ev.files) };
  const checks = [...RUBRIC, ...extra].map((r) => {
    const base = { id: r.id, max: r.points, ...(r.gate && { gate: true }) };
    if (held.has(r.id)) return { ...base, state: "held", points: 0 };
    const { state, fraction = 0, detail } = r.test(full);
    return { ...base, state, points: state === "na" ? 0 : Math.round(r.points * fraction * 10) / 10, detail };
  });
  return { ...gradeOf(checks), checks };
}

// --- Reading GitHub ------------------------------------------------------------

function tarFiles(gz) {
  const buf = gunzipSync(gz, { maxOutputLength: 200 * 1024 * 1024 });
  const files = new Map();
  const str = (o, n) => buf.toString("latin1", o, o + n).replace(/\0.*$/s, "");
  for (let o = 0; o + 512 <= buf.length; ) {
    const name = str(o, 100);
    if (!name) break;
    const size = parseInt(str(o + 124, 12).trim(), 8) || 0;
    const type = str(o + 156, 1);
    const prefix = str(o + 345, 155);
    const path = (prefix ? `${prefix}/${name}` : name).split("/").slice(1).join("/");
    if ((type === "0" || type === "") && /^(\.github\/workflows\/|test\/|examples\/local\/|files\/)|\.(hcl|tf)$/.test(path) && size < 2_000_000) {
      files.set(path, buf.toString("utf8", o + 512, o + 512 + size));
    }
    o += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

async function get(path, { raw = false, allow404 = false } = {}) {
  const headers = { accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const ask = () => fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(30_000) });
  // One retry: with hundreds of requests, a dropped connection is routine.
  const res = await ask().catch(ask);
  if (allow404 && res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return raw ? Buffer.from(await res.arrayBuffer()) : res.json();
}

const semver = (t) => t.slice(1).split(".").map(Number);
/** The highest vX.Y.Z tag; other tag names are ignored. */
export function latestTag(names) {
  const tags = names.filter((t) => /^v\d+\.\d+\.\d+$/.test(t));
  return tags.sort((a, b) => {
    const [x, y] = [semver(a), semver(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  }).at(-1);
}

async function read(repo) {
  const tags = await get(`/repos/${repo}/tags?per_page=100`);
  const tag = latestTag(tags.map((t) => t.name));
  if (!tag) throw new Error(`${repo} has no release tag`);
  const files = tarFiles(await get(`/repos/${repo}/tarball/${tag}`, { raw: true }));
  const ref = await get(`/repos/${repo}/git/ref/tags/${tag}`);
  const signed = ref.object.type === "tag"
    ? await get(`/repos/${repo}/git/tags/${ref.object.sha}`)
    : (await get(`/repos/${repo}/git/commits/${ref.object.sha}`));
  const runs = await get(`/repos/${repo}/actions/runs?branch=main&event=push&status=completed&per_page=20`);
  const run = runs.workflow_runs.find((r) => r.name === "CI");
  const rules = (await get(`/repos/${repo}/rules/branches/main?per_page=100`, { allow404: true })) ?? [];
  let realHost = null;
  if (files.has(".github/workflows/real-host.yml")) {
    const hosts = await get(`/repos/${repo}/actions/workflows/real-host.yml/runs?branch=main&status=success&per_page=1`, { allow404: true });
    if (hosts?.workflow_runs?.[0]) realHost = { date: hosts.workflow_runs[0].updated_at };
  }
  return {
    tag, files,
    tagVerified: Boolean(signed.verification?.verified),
    tagDate: signed.tagger?.date ?? signed.committer?.date,
    run: run && { conclusion: run.conclusion, date: run.updated_at, url: run.html_url },
    rules: rules.map((r) => r.type),
    realHost,
    now: Date.now(),
  };
}

/** Every entry in the directory, for the command line; the site passes its own. */
const directory = () =>
  readdirSync(new URL("circuits/", DATA))
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(new URL(`circuits/${f}`, DATA), "utf8")));

// The API allows bursts, not 600 requests at once.
async function pool(items, size, fn) {
  const out = [];
  const queue = [...items];
  await Promise.all(Array.from({ length: size }, async () => {
    while (queue.length) {
      const item = queue.shift();
      out.push(await fn(item));
    }
  }));
  return out;
}

/** One circuit's published entry. */
export const entry = (c, ev, opts) => ({
  name: c.name, repo: c.repo, tag: ev.tag, checkedAt: new Date(ev.now).toISOString(),
  ...(ev.run?.url && { ciRun: ev.run.url }),
  ...evaluate(ev, opts),
});

export async function fetchGrades(list, keepOld = fallback) {
  const out = {};
  let fresh = 0;
  await pool(list, 8, async (c) => {
    try {
      out[c.name] = entry(c, await read(c.repo));
      fresh++;
    } catch (err) {
      console.warn(`grades: ${c.name}: ${err.message}; keeping the last good result`);
      if (keepOld[c.name]) out[c.name] = keepOld[c.name];
    }
  });
  return { grades: Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b))), fresh };
}

let memo;
/** Grades for this build: live with a token, else the last good file. */
export function grades(list) {
  return (memo ??= (async () => {
    // Anonymous, 600 requests would hit the limit a tenth of the way through.
    if (!process.env.GITHUB_TOKEN) return fallback;
    try {
      const { grades: all, fresh } = await fetchGrades(list);
      if (fresh) return all;
      throw new Error("no circuit could be read");
    } catch (err) {
      console.warn(`grades: ${err.message}; using data/grades.json`);
      return fallback;
    }
  })());
}

/** What the builder has to refuse, and why: nothing while enforcement is off. */
export function blocked(names, all, enforce = ENFORCE_GRADES) {
  if (!enforce) return {};
  const out = {};
  for (const n of names) {
    const g = all[n];
    if (!g) out[n] = `${n} hasn't been graded yet, and a circuit needs a passing grade to be here.`;
    else if (!g.passing) out[n] = `${n} has a grade of ${g.grade}, and a circuit needs a passing grade to be here.`;
  }
  return out;
}

const COLOURS = { A: "#1a7f37", B: "#2f6f3e", C: "#7a5c00", D: "#b35900", F: "#b42318" };

/** The badge. It holds a letter from our own grading and nothing else from the repo. */
export function badge(grade) {
  const value = COLOURS[grade] ? grade : "none";
  const left = 84;
  const right = value === "none" ? 42 : 24;
  const w = left + right;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="Conn3x grade: ${value}"><title>Conn3x grade: ${value}. Reflects the checks done, not a security guarantee.</title><rect width="${left}" height="20" fill="#333"/><rect x="${left}" width="${right}" height="20" fill="${COLOURS[grade] ?? "#666"}"/><g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle"><text x="${left / 2}" y="14">conn3x grade</text><text x="${left + right / 2}" y="14" font-weight="700">${value}</text></g></svg>\n`;
}

export { read as readRepo, directory as directoryCircuits };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { grades: all } = await fetchGrades(directory());
  writeFileSync(FALLBACK, JSON.stringify(all, null, 2) + "\n");
}
