// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Writes configs from the Circuit Builder, with the same code the page
// runs: every circuit it offers on its own, and a few realistic builds per
// distribution. CI runs `conn3x init -backend=false && conn3x validate` in
// each folder, which also checks the values against each circuit's own
// validation rules.
//
//   node scripts/builder-combos.mjs <outDir>

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generate, unavailable } from "../apps/site/src/lib/builder.js";

const dataDir = new URL("../apps/site/src/data/", import.meta.url);
const readDir = (sub) =>
  Object.fromEntries(
    readdirSync(new URL(sub, dataDir))
      .filter((f) => f.endsWith(".json"))
      .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(new URL(sub + f, dataDir), "utf8"))]),
  );

export function load() {
  return {
    circuits: readDir("circuits/"),
    inputs: readDir("circuit-inputs/"),
    builder: JSON.parse(readFileSync(new URL("builder.json", dataDir), "utf8")),
  };
}

// What a person would type for each required input.
export const samples = {
  "agentbox.ssh_keys": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGq0QnwYqaJ1f0rOq5U8qfQ8m0T3bqJ6r5zH6r4yYw1C alice",
  "apache.vhosts": { key: "site", fields: { server_name: "example.com", document_root: "/var/www/site" } },
  "certbot.certs": "example = example.com, www.example.com",
  "forgejo.admin_username": "forgejo-admin",
  "forgejo.admin_email": "admin@example.com",
  "github-runner.github_url": "https://github.com/acme/app",
  "gitlab.external_url": "https://gitlab.example.com",
  "gitlab-runner.gitlab_url": "https://gitlab.example.com",
  "infisical.site_url": "https://secrets.example.com",
  "keepalived.virtual_ips": "10.0.0.100/24",
  "langfuse.public_url": "https://langfuse.example.com",
  "langfuse.admin_email": "you@example.com",
  "lldap.base_dn": "dc=example,dc=com",
  "openldap.base_dn": "dc=example,dc=com",
  "matrix.server_name": "example.com",
  // In the page only a person's tick sets this; CI stands in for one.
  "mssql.accept_eula": true,
  "matrix.public_baseurl": "https://matrix.example.com/",
  "restic.repository": "/srv/restic",
  "users.users": { key: "alice", fields: { keys: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGq0QnwYqaJ1f0rOq5U8qfQ8m0T3bqJ6r5zH6r4yYw1C alice", sudo: true } },
};

const ssh = { user: "deploy", key: "~/.ssh/id_ed25519", become: true };
const hosts = "web1 203.0.113.10\nweb2 203.0.113.11";

export const combos = [
  { distro: "rocky10", picks: ["nginx", "docker", "fail2ban", "firewall"] },
  { distro: "rocky10", picks: ["caddy", "jenkins", "users", "firewall", "auto-updates"] },
  { distro: "fedora45", picks: ["traefik", "podman", "baseline", "hardening", "firewall"] },
  { distro: "fedora45", picks: ["grafana", "prometheus", "node-exporter", "firewall"], network: "10.0.0.0/8" },
  { distro: "ubuntu2404", picks: ["apache", "mysql", "certbot", "firewall"], values: { "certbot.method": "webroot" } },
  { distro: "ubuntu2404", picks: ["pihole", "wireguard", "tailscale", "firewall"], network: "192.168.1.0/24" },
  { distro: "debian13", picks: ["caddy", "forgejo", "postgres", "restic", "firewall"] },
  { distro: "debian13", picks: ["monitoring", "node-exporter", "samba", "nfs", "firewall"], network: "192.168.0.0/16" },
  { distro: "debian13", picks: ["haproxy", "keepalived", "valkey"] },
  { distro: "rocky10", picks: ["keycloak", "lldap", "openbao", "openscap", "fail2ban"] },
  { distro: "rocky10", picks: ["infisical", "caddy", "firewall"] },
  { distro: "fedora45", picks: ["php", "nginx", "valkey", "firewall"] },
  { distro: "rocky10", picks: ["cockpit", "netdata", "auditd", "osquery", "firewall"], network: "10.0.0.0/8" },
  { distro: "ubuntu2404", picks: ["gitlab", "firewall", "auto-updates"] },
  { distro: "debian13", picks: ["suricata", "zeek", "otelcol", "agentbox", "couchdb"] },
  { distro: "rocky10", picks: ["openwebui", "litellm", "presidio", "ollama", "caddy", "firewall"] },
  { distro: "ubuntu2404", picks: ["gitlab", "gitlab-runner", "firewall"] },
  { distro: "debian13", picks: ["openldap", "keycloak", "n8n", "github-runner", "firewall"] },
  { distro: "fedora45", picks: ["langfuse", "litellm", "infisical", "caddy"] },
  { distro: "ubuntu2404", picks: ["mssql", "caddy", "firewall"], values: { "mssql.edition": "Express" } },
];

/** Every build CI validates: [folder name, build]. */
export function builds(data) {
  const out = [];
  for (const name of Object.keys(data.inputs).sort()) {
    const distro = data.circuits[name].tested.find((d) => !unavailable(data, name, d));
    if (distro) out.push([`one-${name}`, { distro, picks: [name] }]);
  }
  combos.forEach((c, i) => out.push([`combo-${i + 1}-${c.distro}`, c]));
  return out.map(([dir, b]) => [dir, { hosts, ssh, ...b, values: { ...samples, ...b.values } }]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2];
  if (!out) throw new Error("usage: node scripts/builder-combos.mjs <outDir>");
  const data = load();
  let failed = false;
  for (const [dir, b] of builds(data)) {
    const r = generate(data, b);
    if (r.errors) {
      console.error(`${dir}: ${r.errors.map((e) => e.join(": ")).join("; ")}`);
      failed = true;
      continue;
    }
    mkdirSync(join(out, dir), { recursive: true });
    for (const [f, text] of Object.entries(r.files)) writeFileSync(join(out, dir, f), text);
    console.log(dir);
  }
  if (failed) process.exit(1);
}
