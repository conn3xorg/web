// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// The Circuit Builder writes code that runs as root on people's servers,
// so check that typed values can only ever become values, and that the
// rules in builder.json point at real circuits and inputs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { hcl, parseType, fieldKind, convert, unavailable, conflict, withRequired, generate, unticked, zip, linkFor, readLink, rolesOf } from "../apps/site/src/lib/builder.js";
import { load, builds } from "./builder-combos.mjs";

const data = load();
const base = { distro: "rocky10", hosts: "web1 203.0.113.10", ssh: {}, values: {} };

test("hcl escapes strings so they stay strings", () => {
  assert.equal(hcl('say "hi"'), '"say \\"hi\\""');
  assert.equal(hcl("a\\b"), '"a\\\\b"');
  assert.equal(hcl("one\ntwo\tthree\r"), '"one\\ntwo\\tthree\\r"');
  assert.equal(hcl("${file(\"/etc/shadow\")}"), '"$${file(\\"/etc/shadow\\")}"');
  assert.equal(hcl("%{ if true }x%{ endif }"), '"%%{ if true }x%%{ endif }"');
  assert.equal(hcl("\u0000\u001b"), '"\\u0000\\u001b"');
  assert.equal(hcl("héllo ✓"), '"héllo ✓"');
  const evil = '"\n}\nmodule "x" {\n  source = "evil"\n}\n#';
  const out = hcl(evil);
  assert.ok(!out.includes("\n"), "stays on one line");
  assert.match(out, /^"([^"\\]|\\.)*"$/, "is one string literal");
});

test("hcl writes numbers, bools, null, lists and objects", () => {
  assert.equal(hcl(8080), "8080");
  assert.equal(hcl(1.5), "1.5");
  assert.throws(() => hcl(NaN));
  assert.equal(hcl(true), "true");
  assert.equal(hcl(null), "null");
  assert.equal(hcl(["a", 1]), '["a", 1]');
  assert.equal(hcl([{ port: "80/tcp" }]), '[\n  { port = "80/tcp" },\n]');
  assert.equal(hcl({ a: 1, "example.com": "x", 'b"c': true }), '{\n  a             = 1\n  "example.com" = "x"\n  "b\\"c"        = true\n}');
  assert.throws(() => hcl(() => 1));
});

test("every circuit input type parses", () => {
  for (const [name, c] of Object.entries(data.inputs)) {
    for (const v of c.inputs) assert.doesNotThrow(() => parseType(v.type), `${name}.${v.name}`);
  }
  const t = parseType('map(object({\n  a = string\n  b = optional(list(string), ["x)"])\n  c = optional(bool, true)\n}))');
  assert.equal(fieldKind(t), "entry");
  assert.deepEqual(t.of.fields.map((f) => [f.name, f.optional]), [["a", false], ["b", true], ["c", true]]);
  assert.equal(fieldKind(parseType("list(object({ port = string }))")), null);
  assert.equal(fieldKind(parseType("map(list(string))")), "pairs");
  assert.equal(fieldKind(parseType("any")), null);
});

test("convert turns typed text into typed values", () => {
  assert.equal(convert(parseType("number"), " 8080 "), 8080);
  assert.throws(() => convert(parseType("number"), "80; rm -rf /"), /isn't a number/);
  assert.equal(convert(parseType("string"), ""), undefined);
  assert.deepEqual(convert(parseType("list(string)"), "a\n\n b \n"), ["a", "b"]);
  assert.deepEqual(convert(parseType("map(list(string))"), "x = a.com, b.com"), { x: ["a.com", "b.com"] });
  assert.throws(() => convert(parseType("map(string)"), "no equals"), /name = value/);
  const vh = parseType(data.inputs.apache.inputs.find((v) => v.name === "vhosts").type);
  assert.deepEqual(convert(vh, { key: "site", fields: { server_name: "example.com", port: "8080" } }), { site: { server_name: "example.com", port: 8080 } });
  assert.throws(() => convert(vh, { key: "site", fields: {} }), /server_name is needed/);
  assert.equal(convert(vh, { key: "", fields: {} }), undefined);
});

test("excluded circuits and lastrack can't be reached", () => {
  assert.ok(!existsSync(new URL("../apps/site/src/data/circuit-inputs/lastrack.json", import.meta.url)));
  for (const name of [...Object.keys(data.builder.excluded), "lastrack"]) {
    assert.ok(!data.inputs[name] || data.builder.excluded[name], `${name} has no inputs file or is excluded`);
    for (const d of data.builder.distros) assert.ok(unavailable(data, name, d.id), `${name} on ${d.id}`);
    const r = generate(data, { ...base, picks: [name] });
    assert.ok(r.errors, `${name} doesn't generate`);
  }
});

test("builder.json names real circuits and inputs", () => {
  const known = (n) => assert.ok(data.circuits[n], `${n} is in the directory`);
  for (const n of Object.keys(data.builder.excluded)) known(n);
  for (const g of data.builder.conflicts) {
    g.circuits.forEach(known);
    assert.ok(g.reason && !g.reason.endsWith("."), "reason reads after 'Can't go with X:'");
  }
  for (const [n, rs] of Object.entries(data.builder.requires)) [n, ...rs].forEach(known);
  for (const n of Object.keys(data.builder.hints)) known(n);
  for (const [n, ins] of Object.entries(data.builder.mustTick)) for (const i of ins) assert.equal(data.inputs[n].inputs.find((v) => v.name === i)?.type, "bool", `${n}.${i}`);
  for (const [n, ins] of Object.entries(data.builder.choices)) for (const i of Object.keys(ins)) assert.ok(data.inputs[n].inputs.some((v) => v.name === i), `${n}.${i}`);
  for (const [n, w] of Object.entries(data.builder.wiring)) {
    known(n);
    for (const [c, ins] of Object.entries(w.values)) {
      const co = data.builder.companions?.[n]?.find((x) => x.as === c);
      assert.ok(c === n || co || data.builder.requires[n].includes(c), `${n} requires ${c}, which it wires`);
      for (const i of Object.keys(ins)) assert.ok(data.inputs[co?.circuit ?? c].inputs.some((v) => v.name === i), `${c}.${i}`);
    }
  }
  for (const [n, ps] of Object.entries(data.builder.ports)) {
    known(n);
    for (const p of ps) {
      assert.match(p.port, /^\d+\/(tcp|udp)$/);
      if (p.input) assert.ok(data.inputs[n].inputs.some((v) => v.name === p.input), `${n}.${p.input}`);
    }
  }
  // Every official circuit has inputs, except lastrack.
  for (const c of Object.values(data.circuits)) if (c.official && c.name !== "lastrack") assert.ok(data.inputs[c.name], c.name);
});

test("conflicts and requirements", () => {
  assert.match(conflict(data, "apache", ["nginx"]), /nginx: both want ports 80 and 443/);
  assert.match(conflict(data, "grafana", ["monitoring"]), /port 3000/);
  assert.equal(conflict(data, "docker", ["nginx", "firewall"]), null);
  assert.deepEqual(withRequired(data, ["monitoring", "firewall"]), ["docker", "monitoring", "firewall"]);
  assert.match(unavailable(data, "mysql", "fedora45"), /Not tested on Fedora 45/);
  const r = generate(data, { ...base, picks: ["nginx", "apache"] });
  assert.match(r.errors[0][1], /Can't go with/);
});

test("secrets become variables, never values", () => {
  const r = generate(data, { ...base, picks: ["pihole", "forgejo"], values: { "forgejo.admin_username": "me", "forgejo.admin_email": "me@example.com" } });
  const main = r.files["main.tf"];
  const vars = r.files["variables.tf"];
  assert.match(main, /web_password\s+= var\.pihole_web_password/);
  assert.match(main, /admin_password\s+= var\.forgejo_admin_password/);
  // pihole's input is ephemeral, forgejo's is only sensitive, and an
  // ephemeral value can't go into an input that doesn't allow one.
  assert.match(vars, /variable "pihole_web_password" {[^}]*sensitive\s+= true\n\s+ephemeral\s+= true/);
  assert.match(vars, /variable "forgejo_admin_password" {[^}]*sensitive\s+= true\n}/);
  assert.match(r.files["README.md"], /export TF_VAR_pihole_web_password=/);
});

test("wiring points infisical at the database and Valkey it brings", () => {
  const r = generate(data, { ...base, picks: ["infisical"], values: { "infisical.site_url": "https://s.example.com" } });
  const main = r.files["main.tf"];
  assert.match(main, /module "postgres"[\s\S]*module "valkey"[\s\S]*module "infisical"/);
  assert.match(main, /db_connection_uri\s+= "postgres:\/\/infisical:\$\{var\.infisical_db_password\}@127\.0\.0\.1:5432\/infisical"/);
  assert.match(main, /redis_url\s+= "redis:\/\/:\$\{var\.valkey_password\}@127\.0\.0\.1:6379"/);
  assert.match(main, /infisical = var\.infisical_db_password/);
  assert.match(main, /depends_on = \[module\.postgres, module\.valkey\]/);
  assert.doesNotMatch(r.files["variables.tf"], /infisical_db_connection_uri|infisical_redis_url/);
  assert.match(r.files["README.md"], /TF_VAR_infisical_db_password[\s\S]*TF_VAR_valkey_password/);
});

test("two picks that wire postgres both get their role and database", () => {
  const r = generate(data, { ...base, picks: ["infisical", "litellm"], values: { "infisical.site_url": "https://s.example.com" } });
  const pg = /module "postgres" \{[\s\S]*?\n\}/.exec(r.files["main.tf"])[0];
  assert.match(pg, /users\s+= \["infisical", "litellm"\]/);
  assert.match(pg, /infisical = var\.infisical_db_password\n\s+litellm\s+= var\.litellm_db_password/);
  assert.match(pg, /infisical = "infisical"\n\s+litellm\s+= "litellm"/);
});

test("the SQL Server licence is accepted only by a tick", () => {
  const ubuntu = { ...base, distro: "ubuntu2404", picks: ["mssql"] };
  assert.deepEqual(unticked(data, ["mssql"], {}), ["mssql.accept_eula"]);
  assert.deepEqual(unticked(data, ["mssql"], { "mssql.accept_eula": true }), []);
  for (const values of [{}, { "mssql.accept_eula": false }, { "mssql.accept_eula": "true" }]) {
    const r = generate(data, { ...ubuntu, values });
    assert.match(r.errors[0][1], /has to be ticked/, JSON.stringify(values));
  }
  const r = generate(data, { ...ubuntu, values: { "mssql.accept_eula": true } });
  assert.match(r.files["main.tf"], /accept_eula\s+= true/);
  assert.match(r.files["main.tf"], /sa_password\s+= var\.mssql_sa_password/);
  assert.match(r.files["variables.tf"], /variable "mssql_sa_password"/);
  assert.match(generate(data, { ...ubuntu, values: { "mssql.accept_eula": true, "mssql.edition": "Enterprise" } }).errors[0][1], /edition can be/);
  assert.ok(unavailable(data, "mssql", "fedora45") && unavailable(data, "mssql", "debian13"));
});

test("the firewall opens what the other picks listen on", () => {
  const r = generate(data, { ...base, picks: ["nginx", "samba", "firewall"], values: { "nginx.port": "8080" }, network: "10.0.0.0/8" });
  assert.match(r.files["main.tf"], /allow = \[\n    \{ port = "8080\/tcp" \},\n    \{ port = "445\/tcp", from = "10.0.0.0\/8" \},\n  \]/);
  const closed = generate(data, { ...base, picks: ["samba", "firewall"] });
  assert.doesNotMatch(closed.files["main.tf"], /allow/);
  assert.match(closed.files["README.md"], /These stay closed/);
});

test("hosts get the distribution's os and are checked", () => {
  const r = generate(data, { ...base, distro: "ubuntu2404", hosts: "web1 203.0.113.10\n203.0.113.11", picks: ["nginx"] });
  assert.match(r.files["main.tf"], /web1 {2}= \{ address = "203.0.113.10", os = "ubuntu" \}\n {4}host2 = \{ address = "203.0.113.11", os = "ubuntu" \}/);
  for (const hosts of ["", "bad name! 1.2.3.4", "a 1.2.3.4\na 1.2.3.5", "a b c"]) {
    assert.ok(generate(data, { ...base, hosts, picks: ["nginx"] }).errors, JSON.stringify(hosts));
  }
  assert.ok(generate(data, { ...base, ssh: { user: "root; rm" }, picks: ["nginx"] }).errors);
});

test("every build CI validates generates cleanly", () => {
  for (const [dir, b] of builds(data)) assert.ok(generate(data, b).files, dir);
});

test("zip is a well-formed archive", () => {
  const z = zip({ "main.tf": "x", "README.md": "héllo" });
  const v = new DataView(z.buffer);
  assert.equal(v.getUint32(0, true), 0x04034b50);
  const end = z.length - 22;
  assert.equal(v.getUint32(end, true), 0x06054b50);
  assert.equal(v.getUint16(end + 10, true), 2);
  assert.equal(v.getUint32(14, true), 0x8cdc1683, "crc32 of x");
});

test("a link carries picks only, and can't smuggle in a bad build", () => {
  assert.equal(linkFor("rocky10", ["nginx", "grafana"]), "#distro=rocky10&picks=nginx,grafana");
  assert.deepEqual(readLink(data, linkFor("rocky10", ["nginx", "grafana"])), { distro: "rocky10", picks: ["nginx", "grafana"] });
  assert.deepEqual(readLink(data, "#distro=rocky10&picks="), { distro: "rocky10", picks: [] });
  assert.deepEqual(readLink(data, "#distro=rocky10&picks=nginx,apache,nginx"), { distro: "rocky10", picks: ["nginx"] }, "the clash and the repeat go");
  assert.deepEqual(readLink(data, "#distro=rocky10&picks=kubeadm,lastrack,nope,nginx"), { distro: "rocky10", picks: ["nginx"] }, "excluded and unknown names go");
  assert.equal(readLink(data, "#distro=nope&picks=nginx"), null);
  assert.equal(readLink(data, "#hosts"), null, "a link inside the page isn't a build");
});

test("roles point at real inputs of offered circuits", () => {
  for (const [n, rs] of Object.entries(data.builder.roles)) {
    assert.ok(!data.builder.excluded[n], `${n} has roles and is excluded`);
    for (const r of rs) assert.ok(data.inputs[n].inputs.some((v) => v.name === r.input), `${n}.${r.input}`);
  }
});

test("circuits with roles get their own hosts", () => {
  const values = { "k3s.servers": "cp1 203.0.113.20", "k3s.agents": "203.0.113.21" };
  const r = generate(data, { ...base, hosts: "", picks: ["k3s"], values });
  assert.ok(!r.errors, JSON.stringify(r.errors));
  const main = r.files["main.tf"];
  assert.match(main, /servers = \{\n\s+cp1 = "203\.0\.113\.20"/);
  assert.match(main, /agents = \{\n\s+agent1 = "203\.0\.113\.21"/);
  assert.match(main, /token\s+= var\.k3s_token/);
  assert.ok(!main.includes("local.hosts") && !main.includes("locals {"), "no shared hosts");
  assert.match(r.files["README.md"], /on 2 hosts/);

  const mixed = generate(data, { ...base, picks: ["k3s", "nginx"], values });
  assert.match(mixed.files["main.tf"], /module "nginx"[^}]*hosts\s+= local\.hosts/s);
  assert.ok(!/module "k3s"[\s\S]*?hosts\s+= local\.hosts[\s\S]*?module "nginx"/.test(mixed.files["main.tf"]));
});

test("roles refuse a layout that can't work", () => {
  const err = (picks, values, hosts = "") => (generate(data, { ...base, hosts, picks, values }).errors ?? []).map((e) => e[1]).join(" ");
  assert.match(err(["k3s"], {}), /needs at least one host/);
  assert.match(err(["k3s"], { "k3s.servers": "203.0.113.1\n203.0.113.2" }), /odd number/);
  assert.match(err(["freeipa"], { "freeipa.server": "203.0.113.1\n203.0.113.2", "freeipa.domain": "a.example.com" }), /takes one host/);
  assert.match(err(["k3s"], { "k3s.servers": "203.0.113.1", "k3s.agents": "203.0.113.1" }), /Each host has one role/);
  assert.match(err(["k3s", "nginx"], { "k3s.servers": "203.0.113.1" }, "web 203.0.113.1"), /in both/);
  assert.match(err(["k3s", "freeipa"], { "k3s.servers": "203.0.113.1", "freeipa.server": "203.0.113.1", "freeipa.domain": "a.example.com" }), /in both/);
  // Clients can sit beside other circuits.
  assert.equal(err(["velociraptor", "nginx"], { "velociraptor.server": "203.0.113.9", "velociraptor.clients": "203.0.113.1" }, "web 203.0.113.1"), "");
  assert.ok(rolesOf(data, "k3s").length && !rolesOf(data, "nginx").length);
});

test("role addresses are typed text, so stay strings", () => {
  const r = generate(data, { ...base, hosts: "", picks: ["k3s"], values: { "k3s.servers": 'cp1 "}${file("/etc/shadow")}' } });
  assert.ok(r.files["main.tf"].includes('cp1 = "\\"}$${file(\\"/etc/shadow\\")}"'));
});

test("zabbix brings its database to the server's host, and sets a password", () => {
  const values = { "zabbix.servers": "mon 203.0.113.50", "zabbix.agents": "mon 203.0.113.50\nweb1 203.0.113.10" };
  const r = generate(data, { ...base, hosts: "", picks: ["zabbix"], values });
  assert.ok(!r.errors, JSON.stringify(r.errors));
  const main = r.files["main.tf"];
  assert.match(main, /module "zabbix_postgres" \{[\s\S]*?hosts\s*= \{\n\s+mon = \{ address = "203\.0\.113\.50", os = "rocky" \}/);
  assert.match(main, /depends_on = \[module\.zabbix_postgres\]/);
  assert.match(main, /admin_password\s+= var\.zabbix_admin_password/);
  assert.match(main, /database_password\s+= var\.zabbix_db_password/);
  assert.match(r.files["README.md"], /docs\.conn3x\.org\/circuits\/postgres/);
  assert.equal(unavailable(data, "zabbix", "fedora45"), "Not tested on Fedora 45 yet.");
});

test("creating servers writes droplets and keeps typed text in strings", () => {
  const cloud = { adminCidrs: "203.0.113.7/32", tags: 'a"}' };
  const r = generate(data, { ...base, distro: "debian13", hosts: "web1", picks: ["nginx"], cloud });
  assert.ok(!r.errors, JSON.stringify(r.errors));
  const main = r.files["main.tf"];
  assert.match(main, /image\s+= "debian-13-x64"/);
  assert.match(main, /address = digitalocean_droplet\.host\["web1"\]\.ipv4_address/);
  assert.match(main, /host_key = tls_private_key\.host\["web1"\]\.public_key_openssh/);
  assert.match(main, /port_range\s+= "80"/);
  assert.ok(main.includes('tags     = ["a\\"}"]'));
  assert.ok(!main.includes("DIGITALOCEAN_TOKEN") && !main.includes("ssh_user"), "no token, and DigitalOcean logs in as root");
  assert.match(r.files["README.md"], /cost money until you run `conn3x destroy`/);
});

test("creating servers refuses what can't work", () => {
  const err = (b) => (generate(data, { ...base, picks: ["nginx"], hosts: "web1", cloud: { adminCidrs: "203.0.113.7/32" }, ...b }).errors ?? []).map((e) => e[1]).join(" ");
  assert.equal(err({}), "");
  assert.match(err({ distro: "fedora45" }), /no Fedora 45 image/);
  assert.match(err({ cloud: {} }), /which addresses can reach SSH/);
  assert.match(err({ cloud: { adminCidrs: "everyone" } }), /isn't an address/);
  assert.match(err({ hosts: "web1 203.0.113.1" }), /just a name/);
  assert.match(err({ hosts: "web_1" }), /just a name/);
  assert.match(err({ cloud: { adminCidrs: "203.0.113.7/32", region: 'x" evil' } }), /isn't a region/);
  // One name in two heavy roles is one droplet, so the same rule as addresses applies.
  assert.match(err({ picks: ["k3s", "nginx"], values: { "k3s.servers": "web1" } }), /in both/);
});
