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
 *   cloud: { provider, project, region, size, adminCidrs, publicKey, tags },
 *     create the hosts on a cloud in `clouds`, DigitalOcean when provider is
 *     left out; hosts and role hosts are then names, one per line, and region
 *     is a zone on Google Cloud
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
  const provider = cloud && (cloud.provider ?? "digitalocean");
  if (cloud && !Object.hasOwn(clouds, provider)) return { errors: [["cloud", "The builder can't create servers there."]] };
  const def = cloud && clouds[provider];
  const image = cloud && data.builder.cloud[provider][distro.id];
  if (cloud && !image) fail("cloud", `${def.name} has no ${distro.name} image.`);
  // The server's address and host key aren't known until it exists, so os stands in for its facts.
  const created = (n) => ({
    address: new Ref(def.address(quote(n))),
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
        // Droplet names can't hold an underscore, and Google Cloud's can't hold a capital either.
        if (parts.length > 1 || !def.nameOk.test(l)) return fail(field, `Write just a name for each new server, with ${def.nameRule}, not "${l}".`);
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
  // DigitalOcean's images log in as root. The others keep root out of SSH.
  const user = cloud ? def.user : (ssh.user ?? "").trim() || "root";
  if (!/^[a-z_][a-z0-9_.-]*$/i.test(user)) fail("ssh.user", `"${user}" isn't a user name.`);
  const shared = [];
  if (user !== "root") shared.push(["ssh_user", user]);
  if (ssh.key?.trim()) shared.push(["ssh_private_key_file", ssh.key.trim()]);
  if (ssh.knownHosts?.trim() && !cloud) shared.push(["ssh_known_hosts_file", ssh.knownHosts.trim()]);
  if (cloud ? user !== "root" : ssh.become) shared.push(["ssh_become", true]);

  const wired = wiring(data, picks);
  const variables = [...wired.secrets];
  const modules = [];
  const open = [];
  const closed = [];
  for (const name of picks) {
    const c = data.circuits[name];
    const body = [...(rolesOf(data, name).length ? Object.entries(placed[name]) : [["hosts", new Ref("local.hosts")]]), ...shared];
    const managed = name === "firewall" ? ["allow"] : [];
    // circuit-firewall opens this circuit's port, and running both at once can
    // catch ufw half installed.
    const ownFirewall = name === "nginx" && picks.includes("firewall") ? [["firewall", "none"]] : [];
    for (const v of data.inputs[name].inputs) {
      if (managed.includes(v.name) || roleOf(data, name, v.name)) continue;
      if (ownFirewall.some(([k]) => k === v.name)) {
        body.push(...ownFirewall);
        continue;
      }
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
      if (cloud && !/^\d{1,5}\/(tcp|udp)$/.test(port)) fail(`${name}.${p.input}`, `"${set[1]}" isn't a port.`);
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
    if (def.ipv4Only) {
      for (const a of admin) if (/^[0-9a-fA-F:.]+\/\d{1,3}$/.test(a) && !ipv4Network(a)) fail("cloud.adminCidrs", `"${a}" isn't an IPv4 network such as 203.0.113.7/32. These servers only have IPv4 addresses.`);
      if (admin.some((a) => a.endsWith("/0"))) fail("cloud.adminCidrs", "That opens SSH to everyone. Name your own address instead.");
      if (net && !ipv4Network(net)) fail("network", `"${net}" isn't an IPv4 network such as 192.168.1.0/24. These servers only have IPv4 addresses.`);
    }
    if (!def.regionOk.test(cloud.region?.trim() || def.region)) fail("cloud.region", `"${cloud.region}" isn't a ${def.regionLabel.toLowerCase()} such as ${def.region}.`);
    if (!def.sizeOk.test(cloud.size?.trim() || def.size)) fail("cloud.size", `"${cloud.size}" isn't ${/^[aeiou]/i.test(def.sizeLabel) ? "an" : "a"} ${def.sizeLabel.toLowerCase()} such as ${def.size}.`);
    if (def.notArm?.test(cloud.size?.trim() || def.size)) fail("cloud.size", `${cloud.size?.trim()} runs on Arm, and these images are for x86. Pick an x86 ${def.sizeLabel.toLowerCase()}.`);
    if (def.projectOk && !def.projectOk.test(cloud.project?.trim() ?? "")) fail("cloud.project", cloud.project?.trim() ? `"${cloud.project}" isn't a project ID such as my-project-123.` : "Say which project to create the servers in.");
  }
  const tagLines = (cloud?.tags ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const tags = cloud && (def.tags ? def.tags(tagLines, (m) => fail("cloud.tags", m)) : tagLines);
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
        def,
        image,
        project: cloud.project?.trim(),
        names: [...new Set(claims.map((c) => c.address))].sort(),
        region: cloud.region?.trim() || def.region,
        size: cloud.size?.trim() || def.size,
        admin,
        publicKey: cloud.publicKey?.trim() || "~/.ssh/id_ed25519.pub",
        tags,
        net,
        open: [...new Set(open.map((p) => p.port))].map((port) => ({ port, from: ["0.0.0.0/0", "::/0"] })),
        closed: net ? [...new Set(closed.map((p) => p.port))].map((port) => ({ port, from: [net] })) : [],
      }),
      ...(variables.length ? { "variables.tf": variablesTf(variables) } : {}),
      "README.md": readme(data, distro, new Set(claims.map((c) => c.address)).size, placed, modules, variables, { fw: !!fw, open, closed, net, roles: Object.values(placed).some((p) => Object.keys(p).length), cloud: def }),
    },
  };
}

// A network written as a.b.c.d/n, with no bits set past the prefix, since the
// clouds refuse or rewrite one that has them.
function ipv4Network(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(s);
  if (!m || m.slice(1, 5).some((o) => Number(o) > 255) || Number(m[5]) > 32) return false;
  const n = m.slice(1, 5).reduce((a, o) => a * 256 + Number(o), 0);
  return n % 2 ** (32 - Number(m[5])) === 0;
}

// Google Cloud labels: "name" or "name=value", per line, lowercase by its rules.
function gcpLabels(lines, fail) {
  const out = {};
  for (const l of lines) {
    const [k, v = ""] = l.split("=");
    if (!/^[a-z][a-z0-9_-]{0,62}$/.test(k) || !/^[a-z0-9_-]{0,63}$/.test(v) || l.split("=").length > 2) fail(`"${l}" isn't a label. Write name or name=value, in lowercase letters, digits, - and _.`);
    else out[k] = v;
  }
  return out;
}

// AWS tags: "name" or "name=value", per line. Name is each server's own.
function awsTags(lines, fail) {
  const out = {};
  for (const l of lines) {
    const at = l.indexOf("=");
    const [k, v] = at < 0 ? [l, ""] : [l.slice(0, at), l.slice(at + 1)];
    if (!/^[A-Za-z0-9 _.:/=+@-]{1,128}$/.test(k) || !/^[A-Za-z0-9 _.:/=+@-]{0,256}$/.test(v) || /^aws:/i.test(k) || k === "Name") fail(`"${l}" isn't a tag we can set. Write name or name=value, in letters, digits, spaces and _ . : / = + @ -. Name and anything starting aws: are taken.`);
    else out[k] = v;
  }
  return out;
}

// Everything that differs between clouds. The images are in builder.json.
export const clouds = {
  digitalocean: {
    name: "DigitalOcean",
    server: "droplet",
    servers: "droplets",
    user: "root",
    region: "lon1",
    regionLabel: "Region",
    size: "s-2vcpu-4gb",
    sizeLabel: "Size",
    tagsLabel: "Tags, one per line",
    tagsHolder: "",
    nameOk: /^[A-Za-z][A-Za-z0-9-]*$/,
    nameRule: "letters, digits and -",
    regionOk: /^[a-z0-9]+$/,
    sizeOk: /^[a-z0-9-]+$/,
    keyInstalledBy: "cloud-init",
    providers: { digitalocean: `{ source = "digitalocean/digitalocean", version = "~> 2.0" }` },
    address: (n) => `digitalocean_droplet.host[${n}].ipv4_address`,
    note: "Droplets cost money until you run conn3x destroy. Your token never goes in the config: you set it in your shell when you run it.",
    credentials: "Set your DigitalOcean token: `export DIGITALOCEAN_TOKEN=...`. Conn3x makes each droplet's SSH host key and checks it from the first connection. If the apply says `SSH Key is already in use`, that public key is already in your account: remove it there, or use another key.",
    tf: digitaloceanTf,
  },
  gcp: {
    name: "Google Cloud",
    server: "instance",
    servers: "instances",
    user: "conn3x",
    ipv4Only: true,
    region: "us-central1-a",
    regionLabel: "Zone",
    // Two vCPUs and 4 GB, the same as DigitalOcean's default, on 50 GB of disk.
    size: "e2-medium",
    sizeLabel: "Machine type",
    tagsLabel: "Labels, one per line",
    tagsHolder: "team=web",
    tags: gcpLabels,
    nameOk: /^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/,
    nameRule: "lowercase letters, digits and -, ending in a letter or digit",
    regionOk: /^[a-z]+-[a-z]+\d+-[a-z]$/,
    sizeOk: /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/,
    notArm: /^[a-z]\d+a-/,
    projectOk: /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/,
    keyInstalledBy: "its startup script",
    providers: { google: `{ source = "hashicorp/google", version = "~> 7.0" }`, time: `{ source = "hashicorp/time", version = "~> 0.13" }` },
    // Through the wait below, so nothing connects until the host key is in place.
    address: (n) => `time_sleep.boot[${n}].triggers["address"]`,
    note: "Instances cost money until you run conn3x destroy. Your Google credentials never go in the config: they stay on your machine.",
    credentials: "Sign in to Google Cloud: `gcloud auth application-default login`, or point `GOOGLE_APPLICATION_CREDENTIALS` at a service account key. Either way the credentials stay out of this config. The project needs the Compute Engine API turned on, and you need to be able to create instances and firewall rules in it: `roles/compute.admin` is enough. Conn3x makes each instance's SSH host key and checks it from the first connection.",
    readme: `
## On Google Cloud

Everything goes in a network of its own, called \`conn3x\`, so the rules on your project's \`default\` network, which let SSH in from anywhere, don't apply. That name is fixed, so keep to one of these configs per project.

Each instance gets 50 GB of balanced disk and a public IPv4 address. Its startup script makes a user called \`conn3x\`, with your public key and sudo, because that's who Conn3x logs in as: these images keep root out of SSH. Keys added to your whole project stay off the instance.

Debian's and Rocky's images on Google Cloud have no cloud-init, so the startup script does the job on all of them, a moment after SSH first starts. That's why the config waits 90 seconds before connecting: an earlier connection would meet the image's own host key and be refused. If an apply stops with a host key error anyway, run it again.

The private host key sits in the instance's metadata as well as in state. Anything running on the instance can read it, and so can anyone who can view the instance in your project.
`,
    tf: gcpTf,
  },
  aws: {
    name: "AWS",
    server: "instance",
    servers: "instances",
    user: "conn3x",
    ipv4Only: true,
    region: "eu-west-2",
    regionLabel: "Region",
    // Two vCPUs and 4 GB, the same as DigitalOcean's default, on 50 GB of disk.
    size: "t3.medium",
    sizeLabel: "Instance type",
    tagsLabel: "Tags, one per line",
    tagsHolder: "team=web",
    tags: awsTags,
    nameOk: /^[A-Za-z][A-Za-z0-9-]*$/,
    nameRule: "letters, digits and -",
    regionOk: /^[a-z]{2}(-[a-z]+)+-\d+$/,
    sizeOk: /^[a-z][a-z0-9-]*\.[a-z0-9]+$/,
    notArm: /^(a1|[a-z]+\d+g[a-z]*)\./,
    keyInstalledBy: "cloud-init",
    providers: { aws: `{ source = "hashicorp/aws", version = "~> 6.0" }` },
    address: (n) => `aws_instance.host[${n}].public_ip`,
    note: "Instances cost money until you run conn3x destroy. Your AWS credentials never go in the config: they stay on your machine.",
    credentials: "Sign in to AWS: set `AWS_PROFILE`, or `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, in your shell. Either way the credentials stay out of this config. You need to be able to create instances and security groups, and to read images and VPCs. Conn3x makes each instance's SSH host key and checks it from the first connection.",
    readme: `
## On AWS

The instances go in your region's default VPC, so there's no network to pay for or look after. A security group called \`conn3x\` keeps them apart from anything else in there, and that name is fixed, so keep to one of these configs per region. If you've deleted the default VPC, the plan stops saying so; \`aws ec2 create-default-vpc\` brings it back.

Each instance gets 50 GB of gp3 disk and a public IPv4 address. Cloud-init makes a user called \`conn3x\`, with your public key and sudo, because that's who Conn3x logs in as: these images keep root out of SSH.

The image is the newest one its publisher has out when you first apply. Later releases don't replace a running server, because the config ignores changes to it.

The private host key sits in the instance's user data as well as in state. Anything running on the instance can read it, and so can anyone who can view the instance's attributes in your account.
`,
    tf: awsTf,
  },
};

const cloudKeysComment = (c) =>
  `\n# Each ${c.def.server}'s SSH host key, made here and installed by ${c.def.keyInstalledBy}, so\n# Conn3x can check it on the very first connection.\n`;

// Droplets, their host keys and a cloud firewall, the way the private AI box example does it.
function digitaloceanTf(c) {
  let out = `\nresource "digitalocean_ssh_key" "admin" {\n  name       = "conn3x"\n  public_key = trimspace(file(pathexpand(${hcl(c.publicKey)})))\n}\n`;
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

// Instances in a network of their own, the way circuit-caddy's example does it,
// except that the startup script replaces cloud-init, which most images here lack.
function gcpTf(c) {
  const labels = Object.keys(c.tags).length ? [["labels", c.tags]] : [];
  const firewall = (name, ranges, ports) => {
    let out = `\nresource "google_compute_firewall" ${hcl(name)} {\n`;
    out += attrs([["name", `conn3x-${name}`], ["network", new Ref("google_compute_network.hosts.id")], ["source_ranges", ranges]], "  ");
    for (const protocol of ["tcp", "udp"]) {
      const list = ports.map((p) => p.split("/")).filter(([, x]) => x === protocol).map(([n]) => n);
      if (list.length) out += `\n  allow {\n${attrs([["protocol", protocol], ["ports", list]], "    ")}  }\n`;
    }
    return `${out}}\n`;
  };
  const ports = (list) => [...new Set(list.map((p) => p.port))];
  let out = `\nprovider "google" {\n${attrs([["project", c.project], ["region", c.region.slice(0, c.region.lastIndexOf("-"))], ["zone", c.region]], "  ")}}\n`;
  out += `\nlocals {\n  admin_key = trimspace(file(pathexpand(${hcl(c.publicKey)})))\n}\n`;
  out += `\n# A network of its own, so the default network's allow-SSH-from-anywhere\n# rule doesn't apply.\n`;
  out += `resource "google_compute_network" "hosts" {\n  name                    = "conn3x"\n  auto_create_subnetworks = false\n}\n`;
  out += `\nresource "google_compute_subnetwork" "hosts" {\n  name          = "conn3x"\n  network       = google_compute_network.hosts.id\n  ip_cidr_range = "10.10.0.0/24"\n}\n`;
  out += `\n# SSH from your addresses, what your picks serve, and the instances to each other.`;
  out += firewall("ssh", c.admin, ["22/tcp"]);
  if (c.open.length) out += firewall("public", ["0.0.0.0/0"], ports(c.open));
  if (c.closed.length) out += firewall("network", [c.net], ports(c.closed));
  // Circuits join each other on public addresses, such as k3s agents reaching
  // their server, so those count as server-to-server too.
  out += `\nresource "google_compute_firewall" "internal" {\n  name          = "conn3x-internal"\n  network       = google_compute_network.hosts.id\n  source_ranges = concat(["10.10.0.0/24"], [for i in google_compute_instance.host : "\${i.network_interface[0].access_config[0].nat_ip}/32"])\n`;
  for (const protocol of ["tcp", "udp", "icmp"]) out += `\n  allow {\n    protocol = ${hcl(protocol)}\n  }\n`;
  out += `}\n`;
  out += `\nresource "google_compute_instance" "host" {\n  for_each = tls_private_key.host\n\n`;
  out += attrs([["name", new Ref("each.key")], ["machine_type", c.size], ...labels], "  ");
  out += `\n  boot_disk {\n    initialize_params {\n`;
  out += attrs([["image", c.image], ["type", "pd-balanced"], ["size", 50], ...labels], "      ");
  out += `    }\n  }\n\n  network_interface {\n    subnetwork = google_compute_subnetwork.hosts.id\n\n    access_config {}\n  }\n\n  metadata = {\n    # Keys added to the whole project don't get onto this instance.\n    block-project-ssh-keys = true\n    enable-oslogin         = "FALSE"\n\n`;
  // base64, so nothing in a key can be read as shell.
  out += `    startup-script = <<-EOT
      #!/bin/bash
      set -eu
      [ -e /var/lib/conn3x-ready ] && exit 0
      rm -f /etc/ssh/ssh_host_*
      echo \${base64encode(each.value.private_key_openssh)} | base64 -d > /etc/ssh/ssh_host_ed25519_key
      chmod 600 /etc/ssh/ssh_host_ed25519_key
      echo \${base64encode(each.value.public_key_openssh)} | base64 -d > /etc/ssh/ssh_host_ed25519_key.pub
      id ${c.def.user} > /dev/null 2>&1 || useradd -m -s /bin/bash ${c.def.user}
      install -d -m 700 -o ${c.def.user} -g ${c.def.user} /home/${c.def.user}/.ssh
      echo \${base64encode(local.admin_key)} | base64 -d > /home/${c.def.user}/.ssh/authorized_keys
      chown ${c.def.user}: /home/${c.def.user}/.ssh/authorized_keys
      chmod 600 /home/${c.def.user}/.ssh/authorized_keys
      echo '${c.def.user} ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/${c.def.user}
      chmod 440 /etc/sudoers.d/${c.def.user}
      if command -v restorecon > /dev/null; then restorecon -R /etc/ssh /home/${c.def.user}/.ssh; fi
      systemctl try-restart sshd ssh || true
      touch /var/lib/conn3x-ready
    EOT
  }
}
`;
  out += `\n# Long enough for the startup script. SSH starts first, with the image's own\n# host key, and Conn3x rightly stops if it meets that one.\n`;
  out += `resource "time_sleep" "boot" {\n  for_each = google_compute_instance.host\n\n  create_duration = "90s"\n  triggers = {\n    address = each.value.network_interface[0].access_config[0].nat_ip\n  }\n}\n`;
  return out;
}

// Instances in the default VPC, with every rule its own resource: the provider
// fights over a group that mixes inline rules with separate ones, and the
// rules for public addresses can't be inline, since they need the instances.
function awsTf(c) {
  const tags = (extra = {}) => {
    const all = { ...extra, ...c.tags };
    return Object.keys(all).length ? [["tags", all]] : [];
  };
  const named = tags({ Name: new Ref("each.key") });
  const group = new Ref("aws_security_group.hosts.id");
  let out = `\nprovider "aws" {\n${attrs([["region", c.region]], "  ")}}\n`;
  out += `\nlocals {\n  admin_key = trimspace(file(pathexpand(${hcl(c.publicKey)})))\n}\n`;
  out += `\ndata "aws_vpc" "default" {\n  default = true\n}\n`;
  out += `\ndata "aws_ami" "os" {\n  most_recent = true\n  owners      = ${hcl([c.image.owner])}\n`;
  for (const [name, value] of [["name", c.image.name], ["architecture", "x86_64"], ["virtualization-type", "hvm"], ["state", "available"]]) {
    out += `\n  filter {\n${attrs([["name", name], ["values", [value]]], "    ")}  }\n`;
  }
  out += `}\n`;
  out += `\n# SSH from your addresses, what your picks serve, and the instances to each other.\n`;
  out += `resource "aws_security_group" "hosts" {\n${attrs([["name", "conn3x"], ["description", "Conn3x servers"], ["vpc_id", new Ref("data.aws_vpc.default.id")], ...tags()], "  ")}}\n`;
  out += `\nresource "aws_vpc_security_group_ingress_rule" "ssh" {\n  for_each = toset(${hcl(c.admin)})\n\n`;
  out += attrs([["security_group_id", group], ["cidr_ipv4", new Ref("each.value")], ["ip_protocol", "tcp"], ["from_port", 22], ["to_port", 22]], "  ");
  out += `}\n`;
  const served = Object.fromEntries([...c.open.map((p) => [p, "0.0.0.0/0"]), ...c.closed.map((p) => [p, c.net])].map(([p, from]) => {
    const [port, protocol] = p.port.split("/");
    return [`${p.port} ${from}`, { port: Number(port), protocol, from }];
  }));
  if (Object.keys(served).length) {
    out += `\nresource "aws_vpc_security_group_ingress_rule" "served" {\n  for_each = ${hcl(served, "  ")}\n\n`;
    out += attrs([["security_group_id", group], ["cidr_ipv4", new Ref("each.value.from")], ["ip_protocol", new Ref("each.value.protocol")], ["from_port", new Ref("each.value.port")], ["to_port", new Ref("each.value.port")]], "  ");
    out += `}\n`;
  }
  out += `\nresource "aws_vpc_security_group_ingress_rule" "internal" {\n${attrs([["security_group_id", group], ["referenced_security_group_id", group], ["ip_protocol", "-1"]], "  ")}}\n`;
  // Circuits join each other on public addresses, such as k3s agents reaching
  // their server, and a group reference doesn't match those.
  out += `\nresource "aws_vpc_security_group_ingress_rule" "peers" {\n  for_each = aws_instance.host\n\n`;
  out += attrs([["security_group_id", group], ["cidr_ipv4", new Ref('"${each.value.public_ip}/32"')], ["ip_protocol", "-1"]], "  ");
  out += `}\n`;
  out += `\nresource "aws_vpc_security_group_egress_rule" "all" {\n${attrs([["security_group_id", group], ["cidr_ipv4", "0.0.0.0/0"], ["ip_protocol", "-1"]], "  ")}}\n`;
  out += `\nresource "aws_instance" "host" {\n  for_each = tls_private_key.host\n\n`;
  out += attrs([
    ["ami", new Ref("data.aws_ami.os.id")],
    ["instance_type", c.size],
    ["vpc_security_group_ids", new Ref("[aws_security_group.hosts.id]")],
    ["associate_public_ip_address", true],
    ...named,
  ], "  ");
  out += `\n  root_block_device {\n${attrs([["volume_type", "gp3"], ["volume_size", 50], ...named], "    ")}  }\n`;
  out += `\n  metadata_options {\n    http_tokens = "required"\n  }\n`;
  out += `\n  user_data = "#cloud-config\\n\${yamlencode({\n    ssh_deletekeys = true\n    ssh_keys = {\n      ed25519_private = each.value.private_key_openssh\n      ed25519_public  = each.value.public_key_openssh\n    }\n    users = [{\n      name                = ${hcl(c.def.user)}\n      shell               = "/bin/bash"\n      sudo                = "ALL=(ALL) NOPASSWD:ALL"\n      ssh_authorized_keys = [local.admin_key]\n    }]\n  })}"\n`;
  out += `\n  # A newer image shouldn't replace a running server.\n  lifecycle {\n    ignore_changes = [ami]\n  }\n}\n`;
  return out;
}

// What every cloud has in common: its providers and a host key per server.
function cloudTf(c) {
  const providers = { ...c.def.providers, tls: `{ source = "hashicorp/tls", version = "~> 4.0" }` };
  let out = `\nterraform {\n  required_providers {\n`;
  out += attrs(Object.entries(providers).map(([k, v]) => [k, new Ref(v)]), "    ");
  out += `  }\n}\n`;
  out += cloudKeysComment(c);
  out += `resource "tls_private_key" "host" {\n  for_each  = toset(${hcl(c.names)})\n  algorithm = "ED25519"\n}\n`;
  return out + c.def.tf(c);
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
    ? `It's configuration only: nothing exists yet. \`conn3x apply\` creates the ${fw.cloud.servers} on ${fw.cloud.name}, once you say yes, and they cost money until you run \`conn3x destroy\`.\n\n`
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
    ? `2. ${fw.cloud.credentials}\n`
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
    out += `It holds each ${fw.cloud.server}'s private SSH host key, so turn on state encryption, or store it where you'd store a secret: https://opentofu.org/docs/language/state/encryption/\n`;
    out += fw.cloud.readme ?? "";
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
