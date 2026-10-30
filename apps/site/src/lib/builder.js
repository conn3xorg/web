// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// The Circuit Builder's engine, shared by the page at /build, the unit
// tests and the CI job that validates generated configs. Plain JavaScript
// with no imports, so all three run exactly the same code.
//
// Nothing a person types becomes HCL except through hcl(), which writes
// every value as a quoted string, a number, a bool, a list or an object.

/** Writes a value as HCL. Strings are escaped, including ${ and %{. */
export function hcl(v, indent = "") {
  if (v === null) return "null";
  if (v instanceof Ref) return v.code;
  if (typeof v === "boolean") return String(v);
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`not a number: ${v}`);
    return String(v);
  }
  if (typeof v === "string") return quote(v);
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x !== "object" || x === null)) return `[${v.map((x) => hcl(x)).join(", ")}]`;
    const inner = indent + "  ";
    return `[\n${v.map((x) => `${inner}${inline(x)},\n`).join("")}${indent}]`;
  }
  if (typeof v === "object") {
    const keys = Object.keys(v);
    if (!keys.length) return "{}";
    return `{\n${attrs(keys.map((k) => [key(k), v[k]]), indent + "  ")}${indent}}`;
  }
  throw new Error(`can't write ${typeof v} as HCL`);
}

function quote(s) {
  return `"${s.replace(/[\\"\n\r\t]|[\u0000-\u001f\u007f]|\$\{|%\{/g, (c) =>
    c === "\\" ? "\\\\"
    : c === '"' ? '\\"'
    : c === "\n" ? "\\n"
    : c === "\r" ? "\\r"
    : c === "\t" ? "\\t"
    : c === "${" ? "$${"
    : c === "%{" ? "%%{"
    : `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  )}"`;
}

// An object on one line, for the elements of a list.
function inline(v) {
  if (v === null || typeof v !== "object" || Array.isArray(v) || v instanceof Ref) return hcl(v);
  return `{ ${Object.entries(v).map(([k, x]) => `${key(k)} = ${inline(x)}`).join(", ")} }`;
}

// A reference such as local.hosts. Only this module makes them, never from
// anything typed, so typed text can't turn into a reference.
class Ref {
  constructor(code) {
    this.code = code;
  }
}

const key = (k) => (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(k) ? k : quote(k));

/** Attribute lines, with = aligned the way `conn3x fmt` aligns them. */
export function attrs(pairs, indent) {
  let out = "";
  let run = [];
  const flush = () => {
    const w = Math.max(...run.map(([k]) => k.length));
    for (const [k, s] of run) out += `${indent}${k.padEnd(w)} = ${s}\n`;
    run = [];
  };
  for (const [k, v] of pairs) {
    const s = hcl(v, indent);
    // A value over several lines stands on its own: fmt doesn't align it.
    if (!s.includes("\n")) run.push([k, s]);
    else {
      if (run.length) flush();
      out += `${indent}${k} = ${s}\n`;
    }
  }
  if (run.length) flush();
  return out;
}

// --- Types ------------------------------------------------------------------

/** Parses a type constraint such as map(object({ a = optional(string) })). */
export function parseType(src) {
  let i = 0;
  const ws = () => {
    while (/\s/.test(src[i] ?? "")) i++;
  };
  const eat = (c) => {
    ws();
    if (src[i] !== c) throw new Error(`type: expected ${c} at ${i} in ${src}`);
    i++;
  };
  const word = () => {
    ws();
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (!m) throw new Error(`type: expected a name at ${i} in ${src}`);
    i += m[0].length;
    return m[0];
  };
  // Skips an optional() default, which can hold strings and brackets.
  const skip = () => {
    let depth = 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '"') {
        for (i++; src[i] !== '"'; i++) if (src[i] === "\\") i++;
      } else if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) {
        if (depth === 0) return;
        depth--;
      }
    }
  };
  const type = () => {
    const w = word();
    if (["string", "number", "bool", "any"].includes(w)) return { kind: w };
    eat("(");
    let t;
    if (w === "object") {
      eat("{");
      const fields = [];
      for (ws(); src[i] !== "}"; ws()) {
        const name = word();
        eat("=");
        ws();
        let optional = false;
        let ft;
        if (src.startsWith("optional", i)) {
          word();
          eat("(");
          optional = true;
          ft = type();
          ws();
          if (src[i] === ",") {
            i++;
            skip();
          }
          eat(")");
        } else ft = type();
        fields.push({ name, type: ft, optional });
        ws();
        if (src[i] === ",") i++;
      }
      eat("}");
      t = { kind: "object", fields };
    } else if (["list", "set", "map"].includes(w)) {
      t = { kind: w, of: type() };
    } else {
      skip();
      t = { kind: w };
    }
    eat(")");
    return t;
  };
  const t = type();
  ws();
  if (i !== src.length) throw new Error(`type: unexpected ${src.slice(i)}`);
  return t;
}

const scalar = (t) => ["string", "number", "bool"].includes(t.kind);
const lines = (t) => ["list", "set"].includes(t.kind) && ["string", "number"].includes(t.of.kind);

/**
 * How the builder asks for a value of this type: "string", "number",
 * "bool", "lines" (one per line), "pairs" (key = value per line) or
 * "entry" (one entry of a map of objects). null when it can't ask.
 */
export function fieldKind(t) {
  if (scalar(t)) return t.kind;
  if (lines(t)) return "lines";
  if (t.kind === "map" && (scalar(t.of) || lines(t.of))) return "pairs";
  if (t.kind === "map" && t.of.kind === "object" && t.of.fields.every((f) => scalar(f.type) || lines(f.type))) return "entry";
  return null;
}

/** Turns what was typed into a value of type t, or throws a plain message. */
export function convert(t, raw) {
  const kind = fieldKind(t);
  const one = (t, s) => {
    s = s.trim();
    if (t.kind === "number") {
      if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`"${s}" isn't a number`);
      return Number(s);
    }
    if (t.kind === "bool") return s === "true";
    return s;
  };
  const split = (s) => s.split("\n").map((l) => l.trim()).filter(Boolean);
  switch (kind) {
    case "string":
      return raw === "" ? undefined : raw;
    case "number":
      return raw.trim() === "" ? undefined : one(t, raw);
    case "bool":
      return Boolean(raw);
    case "lines": {
      const xs = split(raw);
      return xs.length ? xs.map((s) => one(t.of, s)) : undefined;
    }
    case "pairs": {
      const out = {};
      for (const l of split(raw)) {
        const m = /^([^=]+?)\s*=\s*(.*)$/.exec(l);
        if (!m) throw new Error(`write each line as name = value, not "${l}"`);
        out[m[1]] = lines(t.of) ? m[2].split(",").map((s) => s.trim()).filter(Boolean).map((s) => one(t.of.of, s)) : one(t.of, m[2]);
      }
      return Object.keys(out).length ? out : undefined;
    }
    case "entry": {
      const name = (raw.key ?? "").trim();
      const obj = {};
      for (const f of t.of.fields) {
        const r = raw.fields?.[f.name] ?? (f.type.kind === "bool" ? false : "");
        const v = f.type.kind === "bool" ? (r ? true : undefined) : lines(f.type) ? convert(f.type, r) : r.trim() === "" ? undefined : one(f.type, r);
        if (v === undefined && !f.optional) {
          if (!name) continue;
          throw new Error(`${f.name} is needed`);
        }
        if (v !== undefined) obj[f.name] = v;
      }
      if (!name) {
        if (Object.keys(obj).length) throw new Error("give it a name");
        return undefined;
      }
      return { [name]: obj };
    }
  }
  throw new Error("the builder can't take this value");
}

// --- Picks --------------------------------------------------------------------

/**
 * data: { circuits: {name: directory entry}, inputs: {name: circuit-inputs},
 * builder: builder.json }. Says why a circuit can't be picked on a distro,
 * or returns null when it can.
 */
export function unavailable(data, name, distro) {
  const c = data.circuits[name];
  if (!c || !c.official || !data.inputs[name]) return "It isn't an official circuit.";
  if (data.builder.excluded[name]) return data.builder.excluded[name];
  const d = data.builder.distros.find((x) => x.id === distro);
  if (!d) return "Pick a distribution first.";
  if (!c.tested.includes(distro)) return `Not tested on ${d.name} yet.`;
  const required = data.inputs[name].inputs.filter((v) => v.required && !secret(v) && !roleOf(data, name, v.name));
  for (const v of required) if (!fieldKind(parseType(v.type))) return `Needs ${v.name}, which the builder can't ask for yet.`;
  for (const r of [...(data.builder.requires[name] ?? []), ...(data.builder.companions?.[name] ?? []).map((co) => co.circuit)]) {
    const why = unavailable(data, r, distro);
    if (why) return `Needs ${r}: ${why}`;
  }
  return null;
}

/** The circuits a builder picks, in order: its own picks plus what they need. */
export function withRequired(data, picks) {
  const out = [];
  const add = (n) => {
    if (out.includes(n)) return;
    for (const r of data.builder.requires[n] ?? []) add(r);
    out.push(n);
  };
  for (const n of picks) add(n);
  return out;
}

/** Why `name` can't go with what's picked already, or null. */
export function conflict(data, name, picks) {
  const want = withRequired(data, [name]);
  const have = withRequired(data, picks.filter((p) => p !== name));
  for (const g of data.builder.conflicts) {
    for (const a of want) {
      if (!g.circuits.includes(a)) continue;
      const b = have.find((h) => h !== a && g.circuits.includes(h));
      if (b) return `Can't go with ${b}: ${g.reason}.`;
    }
  }
  return null;
}

export const secret = (v) => v.sensitive || v.ephemeral;

/** A circuit's kinds of host from builder.json, such as k3s's servers and agents. */
export const rolesOf = (data, name) => data.builder.roles?.[name] ?? [];
const roleOf = (data, name, input) => rolesOf(data, name).find((r) => r.input === input);

/** Boxes among the picks that still need ticking, as "circuit.input". */
export function unticked(data, picks, values) {
  return withRequired(data, picks).flatMap((n) => (data.builder.mustTick?.[n] ?? []).map((i) => `${n}.${i}`)).filter((k) => values?.[k] !== true);
}

/**
 * Inputs set for a pick by another pick, from builder.json's wiring, such
 * as infisical's database URL pointing at circuit-postgres. Returns
 * { values: {circuit: {input: value}}, secrets: [{name, circuit, input}] }.
 * "${x}" in a wiring string is the wiring's own secret x, and
 * "${circuit.input}" is that circuit's secret input.
 */
export function wiring(data, picks) {
  const values = {};
  const secrets = [];
  for (const owner of picks) {
    const w = data.builder.wiring?.[owner];
    if (!w) continue;
    for (const s of w.secrets) secrets.push({ name: varName(owner, s), circuit: owner, input: { name: s }, ephemeral: true });
    const ref = (x) => `var.${x.includes(".") ? varName(...x.split(".")) : varName(owner, x)}`;
    const resolve = (v) => {
      if (Array.isArray(v)) return v.map(resolve);
      if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x)]));
      if (typeof v !== "string" || !v.includes("${")) return v;
      const whole = /^\$\{([\w.-]+)\}$/.exec(v);
      if (whole) return new Ref(ref(whole[1]));
      const parts = v.split(/\$\{([\w.-]+)\}/);
      return new Ref(`"${parts.map((x, i) => (i % 2 ? `\${${ref(x)}}` : quote(x).slice(1, -1))).join("")}"`);
    };
    // Two picks can wire the same input, such as postgres users: lists add up, maps merge.
    const merge = (a, b) =>
      Array.isArray(a) ? [...a, ...b] : a && typeof a === "object" && !(a instanceof Ref) ? { ...a, ...b } : b;
    for (const [c, inputs] of Object.entries(resolve(w.values))) {
      values[c] ??= {};
      for (const [k, v] of Object.entries(inputs)) values[c][k] = merge(values[c][k], v);
    }
  }
  return { values, secrets };
}
const ident = (s) => s.replace(/-/g, "_");
export const varName = (circuit, input) => `${ident(circuit)}_${input}`;

// --- Links ------------------------------------------------------------------

/** The page address fragment for a build: its distribution and picks, nothing typed. */
export function linkFor(distro, picks) {
  return `#distro=${encodeURIComponent(distro)}&picks=${picks.map(encodeURIComponent).join(",")}`;
}

/**
 * Reads a fragment from linkFor(), or returns null when it isn't one. A link
 * can be edited or out of date, so a pick that can't be offered, or that
 * clashes with an earlier one, is dropped rather than trusted.
 */
export function readLink(data, hash) {
  const q = new URLSearchParams(hash.replace(/^#/, ""));
  const distro = q.get("distro");
  if (!data.builder.distros.some((d) => d.id === distro)) return null;
  const picks = [];
  for (const n of (q.get("picks") ?? "").split(",").filter(Boolean)) {
    if (picks.includes(n) || unavailable(data, n, distro) || conflict(data, n, picks)) continue;
    picks.push(n);
  }
  return { distro, picks };
}

// --- Generation -------------------------------------------------------------

/**
 * Writes main.tf, variables.tf and README.md.
 *
 * build: {
 *   distro: "rocky10",
 *   hosts: "web1 203.0.113.10\n203.0.113.11",   one per line, name optional
 *   ssh: { user, key, knownHosts, become },
 *   picks: ["nginx", ...],
 *   values: { "nginx.port": "8080", "k3s.servers": "cp1 203.0.113.20", ... },
 *   network: "192.168.1.0/24",                    for private firewall ports
 *   cloud: { region, size, adminCidrs, publicKey, tags }, create the hosts on
 *     DigitalOcean; hosts and role hosts are then names, one per line
 * }
 *
 * Returns { files } or { errors: [[field, message], ...] }.
 */
export function generate(data, build) {
  const errors = [];
  const fail = (field, msg) => errors.push([field, msg]);
  const distro = data.builder.distros.find((d) => d.id === build.distro);
  if (!distro) return { errors: [["distro", "Pick a distribution."]] };

  const picks = withRequired(data, build.picks ?? []);
  if (!picks.length) fail("picks", "Pick at least one circuit.");
  for (const p of picks) {
    const why = unavailable(data, p, distro.id) ?? conflict(data, p, picks);
    if (why) fail("picks", `${p}: ${why}`);
  }
  if (errors.length) return { errors };

  const cloud = build.cloud;
  const image = cloud && data.builder.cloud.images[distro.id];
  if (cloud && !image) fail("cloud", `DigitalOcean has no ${distro.name} image.`);
  // The droplet's address and host key aren't known until it exists, so os stands in for its facts.
  const created = (n) => ({
    address: new Ref(`digitalocean_droplet.host[${quote(n)}].ipv4_address`),
    host_key: new Ref(`tls_private_key.host[${quote(n)}].public_key_openssh`),
    os: distro.os,
  });

  // Hosts: "name address" or just "address" per line, or just a name when
  // they're being created. Returns { name: address }, or { name: name }.
  const parseHosts = (text, field, prefix) => {
    const out = {};
    (text ?? "").split("\n").map((l) => l.trim()).filter(Boolean).forEach((l, n) => {
      const parts = l.split(/\s+/);
      if (cloud) {
        // Droplet names can't hold an underscore.
        if (parts.length > 1 || !/^[A-Za-z][A-Za-z0-9-]*$/.test(l)) return fail(field, `Write just a name for each new server, with letters, digits and -, not "${l}".`);
        if (out[l]) return fail(field, `${l} is there twice.`);
        out[l] = l;
        return;
      }
      const [name, address] = parts.length === 1 ? [`${prefix}${n + 1}`, parts[0]] : parts;
      if (parts.length > 2) return fail(field, `Write "name address" or just the address, not "${l}".`);
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) return fail(field, `"${name}" can't be a host name: use letters, digits, - and _.`);
      if (out[name]) return fail(field, `${name} is there twice.`);
      out[name] = address;
    });
    return out;
  };

  // Circuits with roles keep to their own hosts, so only the others use the shared list.
  const hosts = {};
  if (picks.some((p) => !rolesOf(data, p).length)) {
    for (const [n, address] of Object.entries(parseHosts(build.hosts, "hosts", "host"))) hosts[n] = cloud ? created(n) : { address, os: distro.os };
    if (!Object.keys(hosts).length) fail("hosts", "Add at least one host.");
  }

  const placed = {};
  const claims = Object.entries(hosts).map(([n, h]) => ({ address: cloud ? n : h.address, owner: "the shared hosts", light: false }));
  for (const name of picks) {
    placed[name] = {};
    const own = new Set();
    for (const r of rolesOf(data, name)) {
      const field = `${name}.${r.input}`;
      const got = parseHosts(build.values?.[field], field, r.prefix);
      const n = Object.keys(got).length;
      if (n < (r.min ?? 0)) fail(field, `${name} needs ${r.one ? "a host" : "at least one host"} in ${r.input}.`);
      if (r.one && n > 1) fail(field, `${r.input} takes one host.`);
      if (r.odd && n % 2 === 0 && n > 0) fail(field, `${r.input} needs an odd number of hosts: ${r.oddWhy}`);
      for (const a of Object.values(got)) {
        if (own.has(a) && !r.sameHost) fail(field, `${a} is in ${name} twice. Each host has one role.`);
        own.add(a);
        claims.push({ address: a, owner: name, light: !!r.light, field });
      }
      // A circuit that reads these hosts after another finishes can't look up the distribution, so it's told.
      if (n) {
        placed[name][r.input] = cloud
          ? Object.fromEntries(Object.keys(got).map((h) => [h, new Ref(inline(created(h)))]))
          : r.os
            ? Object.fromEntries(Object.entries(got).map(([h, address]) => [h, new Ref(inline({ address, os: distro.os }))]))
            : got;
      }
    }
  }
  // Agents and clients can sit beside anything else. Anything heavier gets a host of its own.
  for (const [i, c] of claims.entries()) {
    const other = claims.slice(0, i).find((o) => o.address === c.address && o.owner !== c.owner && !o.light && !c.light);
    if (other) fail(c.field ?? "hosts", `${c.address} is in both ${other.owner} and ${c.owner}. Give each its own host, since they can want the same ports.`);
  }

  const ssh = build.ssh ?? {};
  // DigitalOcean's images log in as root.
  const user = cloud ? "root" : (ssh.user ?? "").trim() || "root";
  if (!/^[a-z_][a-z0-9_.-]*$/i.test(user)) fail("ssh.user", `"${user}" isn't a user name.`);
  const shared = [];
  if (user !== "root") shared.push(["ssh_user", user]);
  if (ssh.key?.trim()) shared.push(["ssh_private_key_file", ssh.key.trim()]);
  if (ssh.knownHosts?.trim() && !cloud) shared.push(["ssh_known_hosts_file", ssh.knownHosts.trim()]);
  if (ssh.become && !cloud) shared.push(["ssh_become", true]);

  const wired = wiring(data, picks);
  const variables = [...wired.secrets];
  const modules = [];
  const open = [];
  const closed = [];
  for (const name of picks) {
    const c = data.circuits[name];
    const body = [...(rolesOf(data, name).length ? Object.entries(placed[name]) : [["hosts", new Ref("local.hosts")]]), ...shared];
    const managed = name === "firewall" ? ["allow"] : [];
    for (const v of data.inputs[name].inputs) {
      if (managed.includes(v.name) || roleOf(data, name, v.name)) continue;
      if (wired.values[name] && v.name in wired.values[name]) {
        body.push([v.name, wired.values[name][v.name]]);
        continue;
      }
      if (secret(v)) {
        if (!v.required) continue;
        const n = varName(name, v.name);
        variables.push({ name: n, circuit: name, input: v, ephemeral: v.ephemeral });
        body.push([v.name, new Ref(`var.${n}`)]);
        continue;
      }
      const t = parseType(v.type);
      if (!fieldKind(t)) continue;
      const raw = build.values?.[`${name}.${v.name}`];
      if (raw === undefined && !v.required) continue;
      let value;
      try {
        value = convert(t, raw ?? (t.kind === "bool" ? false : fieldKind(t) === "entry" ? {} : ""));
      } catch (e) {
        fail(`${name}.${v.name}`, e.message);
        continue;
      }
      // A licence has to be accepted by a person ticking the box, never by default.
      if (data.builder.mustTick?.[name]?.includes(v.name) && raw !== true) {
        fail(`${name}.${v.name}`, `${v.name} has to be ticked by you.`);
        continue;
      }
      const choices = data.builder.choices?.[name]?.[v.name];
      if (choices && value !== undefined && !choices.includes(value)) {
        fail(`${name}.${v.name}`, `${v.name} can be ${choices.join(", ")}.`);
        continue;
      }
      if (fieldKind(t) === "bool" && value === v.default) continue;
      if (value === undefined) {
        if (v.required) fail(`${name}.${v.name}`, `${v.name} is needed.`);
        continue;
      }
      body.push([v.name, value]);
    }
    for (const p of data.builder.ports[name] ?? []) {
      const set = p.input && body.find(([k]) => k === p.input);
      const port = set ? `${set[1]}/${p.port.split("/")[1]}` : p.port;
      (p.private ? closed : open).push({ port, circuit: name });
    }
    // A second copy of a circuit that goes with one role's hosts, such as the database on Zabbix's server.
    const companions = data.builder.companions?.[name] ?? [];
    for (const co of companions) {
      const coBody = [["hosts", placed[name][co.role]], ...shared, ...Object.entries(wired.values[co.as] ?? {})];
      modules.push({ name: co.as, doc: co.circuit, c: data.circuits[co.circuit], body: coBody, needs: [] });
    }
    modules.push({ name, c, body, needs: [...(data.builder.requires[name] ?? []), ...companions.map((co) => co.as)] });
  }

  const net = (build.network ?? "").trim();
  if (net && !/^[0-9a-fA-F:.]+\/\d{1,3}$/.test(net)) fail("network", `"${net}" isn't a network such as 192.168.1.0/24.`);
  let admin = [];
  if (cloud) {
    admin = (cloud.adminCidrs ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    if (!admin.length) fail("cloud.adminCidrs", "Say which addresses can reach SSH, such as 203.0.113.7/32.");
    for (const a of admin) if (!/^[0-9a-fA-F:.]+\/\d{1,3}$/.test(a)) fail("cloud.adminCidrs", `"${a}" isn't an address such as 203.0.113.7/32.`);
    if (!/^[a-z0-9]+$/.test(cloud.region?.trim() || "lon1")) fail("cloud.region", `"${cloud.region}" isn't a region such as lon1.`);
    if (!/^[a-z0-9-]+$/.test(cloud.size?.trim() || "s-2vcpu-4gb")) fail("cloud.size", `"${cloud.size}" isn't a size such as s-2vcpu-4gb.`);
  }
  if (errors.length) return { errors };

  const fw = modules.find((m) => m.name === "firewall");
  const allowed = [];
  if (fw) {
    const seen = new Set();
    for (const p of open) if (!seen.has(p.port)) seen.add(p.port), allowed.push({ port: p.port });
    if (net) for (const p of closed) if (!seen.has(`${p.port} ${net}`)) seen.add(`${p.port} ${net}`), allowed.push({ port: p.port, from: net });
    if (allowed.length) fw.body.push(["allow", allowed]);
  }

  return {
    files: {
      "main.tf": mainTf(distro, hosts, modules, cloud && {
        image,
        names: [...new Set(claims.map((c) => c.address))].sort(),
        region: cloud.region?.trim() || "lon1",
        size: cloud.size?.trim() || "s-2vcpu-4gb",
        admin,
        publicKey: cloud.publicKey?.trim() || "~/.ssh/id_ed25519.pub",
        tags: (cloud.tags ?? "").split("\n").map((l) => l.trim()).filter(Boolean),
        open: [...new Set(open.map((p) => p.port))].map((port) => ({ port, from: ["0.0.0.0/0", "::/0"] })),
        closed: net ? [...new Set(closed.map((p) => p.port))].map((port) => ({ port, from: [net] })) : [],
      }),
      ...(variables.length ? { "variables.tf": variablesTf(variables) } : {}),
      "README.md": readme(data, distro, new Set(claims.map((c) => c.address)).size, placed, modules, variables, { fw: !!fw, open, closed, net, roles: Object.values(placed).some((p) => Object.keys(p).length), cloud: !!cloud }),
    },
  };
}

// Droplets, their host keys and a cloud firewall, the way the private AI box example does it.
function cloudTf(c) {
  let out = `\nterraform {\n  required_providers {\n`;
  out += `    digitalocean = { source = "digitalocean/digitalocean", version = "~> 2.0" }\n`;
  out += `    tls          = { source = "hashicorp/tls", version = "~> 4.0" }\n`;
  out += `  }\n}\n`;
  out += `\n# Each droplet's SSH host key, made here and installed by cloud-init, so\n# Conn3x can check it on the very first connection.\n`;
  out += `resource "tls_private_key" "host" {\n  for_each  = toset(${hcl(c.names)})\n  algorithm = "ED25519"\n}\n`;
  out += `\nresource "digitalocean_ssh_key" "admin" {\n  name       = "conn3x"\n  public_key = trimspace(file(pathexpand(${hcl(c.publicKey)})))\n}\n`;
  out += `\nresource "digitalocean_droplet" "host" {\n  for_each = tls_private_key.host\n\n`;
  out += attrs([
    ["name", new Ref("each.key")],
    ["image", c.image],
    ["region", c.region],
    ["size", c.size],
    ...(c.tags.length ? [["tags", c.tags]] : []),
    ["ssh_keys", new Ref("[digitalocean_ssh_key.admin.id]")],
  ], "  ");
  out += `\n  user_data = "#cloud-config\\n\${yamlencode({\n    ssh_deletekeys = true\n    ssh_keys = {\n      ed25519_private = each.value.private_key_openssh\n      ed25519_public  = each.value.public_key_openssh\n    }\n  })}"\n}\n`;
  const rule = (kind, protocol, port, addrs) =>
    `\n  ${kind}_rule {\n${attrs([["protocol", protocol], ...(port ? [["port_range", port]] : []), [`${kind === "inbound" ? "source" : "destination"}_addresses`, addrs]], "    ")}  }\n`;
  const everywhere = ["0.0.0.0/0", "::/0"];
  out += `\n# SSH from your addresses, what your picks serve, and the droplets to each other.\n`;
  out += `resource "digitalocean_firewall" "hosts" {\n  name        = "conn3x"\n  droplet_ids = [for d in digitalocean_droplet.host : d.id]\n`;
  out += rule("inbound", "tcp", "22", c.admin);
  for (const p of [...c.open, ...c.closed]) {
    const [port, protocol] = p.port.split("/");
    out += rule("inbound", protocol, port, p.from);
  }
  for (const protocol of ["tcp", "udp"]) {
    out += `\n  inbound_rule {\n    protocol           = ${hcl(protocol)}\n    port_range         = "1-65535"\n    source_droplet_ids = [for d in digitalocean_droplet.host : d.id]\n  }\n`;
  }
  out += rule("outbound", "tcp", "1-65535", everywhere);
  out += rule("outbound", "udp", "1-65535", everywhere);
  out += rule("outbound", "icmp", null, everywhere);
  out += `}\n`;
  return out;
}

function mainTf(distro, hosts, modules, cloud) {
  let out = `# Written by the Circuit Builder at https://conn3x.org/build for ${distro.name}.\n`;
  out += "# Each circuit is pinned to a release. Read its README before you apply.\n";
  if (cloud) out += cloudTf(cloud);
  const names = Object.keys(hosts);
  const w = Math.max(...names.map((n) => n.length));
  if (names.length) out += `\nlocals {\n  hosts = {\n${names.map((n) => `    ${n.padEnd(w)} = ${inline(hosts[n])}\n`).join("")}  }\n}\n`;
  for (const m of modules) {
    out += `\nmodule "${m.name}" {\n  source = ${hcl(`github.com/${m.c.repo}?ref=${m.c.version}`)}\n\n`;
    out += attrs(m.body, "  ");
    if (m.needs.length) out += `\n  depends_on = [${m.needs.map((n) => `module.${n}`).join(", ")}]\n`;
    out += "}\n";
  }
  return out;
}

function variablesTf(variables) {
  return variables
    .map((v) => {
      const body = [
        ["type", new Ref("string")],
        ["description", `${v.input.name} for ${v.circuit}. Set TF_VAR_${v.name}; it never goes in a file.`],
        ["sensitive", true],
        ...(v.ephemeral ? [["ephemeral", true]] : []),
      ];
      return `variable "${v.name}" {\n${attrs(body, "  ")}}\n`;
    })
    .join("\n");
}

function readme(data, distro, n, placed, modules, variables, fw) {
  let out = "# Your Conn3x config\n\n";
  out += `Written by the Circuit Builder at https://conn3x.org/build, for ${distro.name} on ${n} host${n === 1 ? "" : "s"}. `;
  out += fw.cloud
    ? "It's configuration only: nothing exists yet. `conn3x apply` creates the droplets on DigitalOcean, once you say yes, and they cost money until you run `conn3x destroy`.\n\n"
    : "It's configuration only: nothing has touched your servers yet, and nothing will until you run `conn3x apply` and say yes.\n\n";
  out += "## What's in it\n\n";
  for (const m of modules) {
    out += `- **${m.name}** ${m.c.version}: ${m.c.description} Docs: https://docs.conn3x.org/circuits/${m.doc ?? m.name}\n`;
  }
  if (fw.roles) {
    out += "\n## Which host does what\n\n";
    for (const m of modules) {
      const ps = Object.entries(placed[m.name] ?? {});
      if (ps.length) out += `- **${m.name}**: ${ps.map(([r, h]) => `${r} on ${Object.keys(h).join(", ")}`).join("; ")}\n`;
    }
    out += "\nEvery other circuit in this config runs on all the hosts in `local.hosts`.\n";
  }
  out += "\n## Run it\n\n";
  out += "1. Install Conn3x: https://docs.conn3x.org/get-started\n";
  out += fw.cloud
    ? "2. Set your DigitalOcean token: `export DIGITALOCEAN_TOKEN=...`. Conn3x makes each droplet's SSH host key and checks it from the first connection.\n"
    : "2. Log in to each host with `ssh` once, so its key is in your known_hosts. Conn3x checks it.\n";
  if (variables.length) {
    out += "3. Set the secrets. They stay in your shell, never in a file:\n\n   ```sh\n";
    for (const v of variables) out += `   export TF_VAR_${v.name}='...'\n`;
    out += "   ```\n\n";
  } else out += "3. There are no secrets to set.\n";
  out += "4. Fetch the circuits and check the config:\n\n   ```sh\n   conn3x init\n   conn3x validate\n   ```\n\n";
  out += "5. See every step it would take, then apply:\n\n   ```sh\n   conn3x plan\n   conn3x apply\n   ```\n";
  if (fw.fw) {
    out += "\n## The firewall\n\n";
    if (fw.roles) out += "It covers the hosts in `local.hosts` only. The hosts with roles above keep whatever firewall they have.\n\n";
    out += "SSH stays open. ";
    out += fw.open.length
      ? `It also opens ${fw.open.map((p) => `${p.port} (${p.circuit})`).join(", ")} to everyone.\n`
      : "Nothing you picked needs a port open to everyone.\n";
    if (fw.closed.length) {
      out += fw.net
        ? `\nThese open to ${fw.net} only: ${fw.closed.map((p) => `${p.port} (${p.circuit})`).join(", ")}.\n`
        : `\nThese stay closed, since they're meant for your own network: ${fw.closed.map((p) => `${p.port} (${p.circuit})`).join(", ")}. Add them to \`allow\` with \`from\` set to your network.\n`;
    }
  }
  if (fw.cloud) {
    out += "\n## The state file\n\n";
    out += "It holds each droplet's private SSH host key, so turn on state encryption, or store it where you'd store a secret: https://opentofu.org/docs/language/state/encryption/\n";
  }
  const hints = modules.map((m) => data.builder.hints[m.name] && `- **${m.name}**: ${data.builder.hints[m.name]}`).filter(Boolean);
  if (hints.length) out += `\n## Worth knowing\n\n${hints.join("\n")}\n`;
  return out;
}

// --- Zip --------------------------------------------------------------------

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** A zip of { path: text }, stored without compression. A few KB doesn't need it. */
export function zip(files, folder = "conn3x") {
  const enc = new TextEncoder();
  const parts = [];
  const dir = [];
  let offset = 0;
  for (const [path, text] of Object.entries(files)) {
    const name = enc.encode(`${folder}/${path}`);
    const body = enc.encode(text);
    const crc = crc32(body);
    // Version, flags (UTF-8 names), method 0, time, date 1980-01-01, crc, sizes, name length.
    const head = (sig, extra) => {
      const h = new DataView(new ArrayBuffer(extra ? 46 : 30));
      let i = 0;
      const u32 = (v) => (h.setUint32(i, v, true), (i += 4));
      const u16 = (v) => (h.setUint16(i, v, true), (i += 2));
      u32(sig);
      if (extra) u16(20);
      u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(body.length), u32(body.length), u16(name.length), u16(0);
      if (extra) u16(0), u16(0), u16(0), u32(0), u32(offset);
      return new Uint8Array(h.buffer);
    };
    dir.push(head(0x02014b50, true), name);
    const local = head(0x04034b50, false);
    parts.push(local, name, body);
    offset += local.length + name.length + body.length;
  }
  const size = dir.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  const count = Object.keys(files).length;
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, count, true);
  end.setUint16(10, count, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...dir, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0));
  let at = 0;
  for (const b of all) out.set(b, at), (at += b.length);
  return out;
}
