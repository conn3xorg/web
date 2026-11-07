---
title: Lempa homelab
description: "Christian Lempa's 2025 homelab list from official circuits: Traefik, BIND, Homepage and monitoring on, every other category a switch away."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-lempa-homelab at v0.1.2. -->

[![Conn3x grade](https://conn3x.org/circuits/lempa-homelab/grade.svg)](https://conn3x.org/circuits/lempa-homelab/grade)

A Conn3x circuit named after [Christian Lempa](https://christianlempa.de/), who shows how he runs his homelab on [YouTube](https://www.youtube.com/@christianlempa) and on [GitHub](https://github.com/ChristianLempa). In [What software runs in my HomeLab in 2025?](https://www.youtube.com/watch?v=KJVe_E6tdzw) he walks through it chapter by chapter: what he uses for containers, networking, monitoring, AI, automation, code, databases and security. This circuit takes that list and builds it from official Conn3x circuits, one switch per chapter.

It's an independent Conn3x circuit, built from the list in that video. Christian didn't make it and doesn't endorse it, and nothing in it is copied from his own files. If you want to know why he picked a tool, watch the video; this is the part where you get to try the same set on your own server.

Out of the box you get a server with Traefik at the front door, BIND giving every app a name under `home.arpa`, Homepage at `home.home.arpa` with a tile for each app, and Uptime Kuma, Prometheus and Grafana, with Prometheus already wired into Grafana. That's one apply. Smart home, AI, automation, code, databases, security and a containers UI are a `true` away each.

Each app listens on `127.0.0.1` on a port of its own, and only Traefik (ports 80 and 443) and BIND (port 53) face your network. The stack follows Christian's homelab as it changes: when a later video swaps a tool, the matching category gets the new circuit.

## Usage

```hcl
variable "admin_password" {
  type      = string
  ephemeral = true
  sensitive = true
}

module "homelab" {
  source = "github.com/conn3xorg/circuit-lempa-homelab?ref=v0.1.2"

  hosts                = { lab = "192.168.1.20" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  admin_password = var.admin_password
}
```

Pass the password at run time, so it never sits in a file:

```sh
export TF_VAR_admin_password='Pick-a-long-one-42'
conn3x init
conn3x apply
```

A second `conn3x plan` says `No changes.` Then point a browser at the server. Until your network's DNS knows the names (see [Names and DNS](#names-and-dns)), a line in your own hosts file does it:

```text
192.168.1.20  home.home.arpa uptimekuma.home.arpa grafana.home.arpa
```

Open `https://home.home.arpa`. Your browser will warn about the certificate the first time: Traefik serves its own self-signed one, since a name under `home.arpa` can't get a public certificate. Grafana's user is `admin`, with the password you set.

Uptime Kuma asks for an admin account the first time anyone opens it, and whoever gets there first makes it. Open `https://uptimekuma.home.arpa` right after the first apply.

Want more? Turn a category on and apply again:

```hcl
module "homelab" {
  source = "github.com/conn3xorg/circuit-lempa-homelab?ref=v0.1.2"

  hosts                = { lab = "192.168.1.20" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  admin_password = var.admin_password
  admin_email    = "you@example.com"

  ai            = true
  ollama_models = ["llama3.2:3b"]
  smart_home    = true
}
```

To try the default stack on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-lempa-homelab/tree/v0.1.2/examples/local).

## The categories

One row per chapter of the video, in its order. On means on by default.

| Video chapter | What he runs | Here | Switch | Default |
| --- | --- | --- | --- | --- |
| Container orchestration | Docker and Compose, Swarm, Kubernetes (k3s), Portainer | [circuit-podman](/circuits/podman) | always | on |
| | | [circuit-portainer](/circuits/portainer), [circuit-dockge](/circuits/dockge) | `containers_ui` | off |
| IoT and smart home | Home Assistant | [circuit-homeassistant](/circuits/homeassistant) | `smart_home` | off |
| Network management | BIND, Pi-hole, Traefik, Caddy, Cloudflare, UniFi | [circuit-traefik](/circuits/traefik), [circuit-bind](/circuits/bind) | `network` | on |
| Monitoring and reporting | Prometheus, Grafana, Loki, Uptime Kuma, InfluxDB, Checkmk | [circuit-uptimekuma](/circuits/uptimekuma), [circuit-prometheus](/circuits/prometheus), [circuit-grafana](/circuits/grafana) | `monitoring` | on |
| AI | Ollama, Open WebUI | [circuit-ollama](/circuits/ollama), [circuit-openwebui](/circuits/openwebui) | `ai` | off |
| Automation | Ansible, Terraform and OpenTofu, Kestra, Renovate | [circuit-kestra](/circuits/kestra), [circuit-semaphore](/circuits/semaphore), [circuit-renovate](/circuits/renovate) | `automation` | off |
| Code management | GitLab, GitLab CI runners, GitHub | [circuit-gitlab](/circuits/gitlab), [circuit-gitlab-runner](/circuits/gitlab-runner) | `code` | off |
| App and server management | Homepage, Portainer | [circuit-homepage](/circuits/homepage) | `dashboard` | on |
| Databases | MariaDB, PostgreSQL, InfluxDB | [circuit-mariadb](/circuits/mariadb), [circuit-postgres](/circuits/postgres), [circuit-influxdb](/circuits/influxdb) | `databases` | off |
| Security and identity | Wazuh, ClamAV, authentik, Twingate, Suricata (planned) | [circuit-authentik](/circuits/authentik), [circuit-suricata](/circuits/suricata), [circuit-wazuh](/circuits/wazuh) | `security` | off |

A few of those swaps are worth a sentence. Containers run under Podman rather than Docker, since that's how the official circuits run upstream images as systemd services; Portainer and Dockge both manage Podman through its Docker-compatible socket. Semaphore UI stands in for Ansible from a terminal, because a stack can install a UI but not your playbooks. InfluxDB sits with the databases, where it does the same job it does for his Proxmox metrics.

### Left out, and why

- **Proxmox.** It's the hypervisor the rest runs on, not something to install on top. It comes with the network devices round.
- **The Kubernetes stack** (k3s with Argo CD, cert-manager, Longhorn, MetalLB). That's a second homelab, not a category. It's planned as a k3s round of its own; [circuit-k3s](/circuits/k3s) is there today.
- **Twingate, Cloudflare, GitHub.** Hosted services. There's nothing to install.
- **UniFi.** An appliance and its controller.
- **Loki and Checkmk.** No official circuit yet. When there is one, it joins `monitoring`.
- **ClamAV.** No official circuit yet. It would join `security`.
- **Pi-hole and Caddy.** Pi-hole wants port 53, which BIND has here, and Caddy does Traefik's job. [circuit-pihole](/circuits/pihole) and [circuit-caddy](/circuits/caddy) are there if you'd rather have them, on another host.
- **Docker Swarm.** One server doesn't make a swarm.

## Names and DNS

Every app that's on gets a name under `domain`, which defaults to `home.arpa`, the zone set aside for home networks ([RFC 8375](https://www.rfc-editor.org/rfc/rfc8375)), so it can't clash with anything on the internet:

| App | Name |
| --- | --- |
| Homepage | `home.home.arpa` |
| Uptime Kuma | `uptimekuma.home.arpa` |
| Grafana | `grafana.home.arpa` |
| Home Assistant | `homeassistant.home.arpa` |
| Open WebUI | `openwebui.home.arpa` |
| Kestra, Semaphore UI | `kestra.home.arpa`, `semaphore.home.arpa` |
| GitLab | `gitlab.home.arpa` |
| authentik | `authentik.home.arpa` |
| Portainer, Dockge | `portainer.home.arpa`, `dockge.home.arpa` |

BIND serves the zone, with each name pointing at `address`, the server's address on your network. Leave `address` out and it's the address in `hosts`, which then has to be an IPv4 address. BIND answers on that address and on `127.0.0.1`, for its own zone only: recursion is off, so it can't stand in for your resolver.

To make the names work on every device, tell your network's resolver to send `home.arpa` to the server. On a router or Pi-hole that's a conditional forwarder, or a "custom DNS server for a domain"; in Unbound it's a `forward-zone`. Prometheus has no name of its own: Grafana is how you read it.

Using a domain you own, such as `lab.example.com`, works the same way. The certificates are still Traefik's self-signed one: for real certificates, call [circuit-traefik](/circuits/traefik) directly with `acme_email`.

## Passwords

`admin_password` is the one secret the default stack needs. It's ephemeral: it reaches the server in root-only files and never appears in the plan or the state. Every app the stack creates an admin for gets it: Grafana, and when they're on, Open WebUI, Kestra, Semaphore UI, Portainer, GitLab's root, authentik's akadmin and Wazuh's admin and API users.

Because one password has to suit all of them, it follows the strictest app's rules: 12 to 64 characters of letters, digits and `. * + ? -`, with an uppercase letter, a lowercase letter, a digit and one of those symbols, and without `root` or `gitlab` in it.

One password everywhere is a homelab convenience. To give an app its own, put it in `passwords`:

```hcl
passwords = { grafana = var.grafana_password, gitlab = var.gitlab_password }
```

The keys are `grafana`, `openwebui`, `kestra`, `semaphore`, `portainer`, `gitlab`, `authentik`, `wazuh_admin` and `wazuh_api`, and each value has to pass that app's own rules. Whether a changed password reaches an app after its first start depends on the app. Several only read it when they make the account, so change it in the app too; each member circuit's README says which.

Two secrets only machines use are made from `admin_password`, so there's nothing more to keep: authentik's PostgreSQL password and Wazuh's agent enrollment password. Change `admin_password` and they change too, and the next apply sets the new ones.

## The optional categories

**`smart_home`** runs Home Assistant on the host's network, so it can find devices on your LAN, with its web server on loopback behind Traefik and `127.0.0.1` trusted as the proxy. Home Assistant asks for its owner the first time it's opened, so open it straight after the apply.

**`ai`** installs Ollama and runs Open WebUI, with its admin made from `admin_email` and `admin_password`. `ollama_models` lists models to pull, such as `["llama3.2:3b"]`. Ollama runs on the CPU here; for a GPU box, see [circuit-ollama](/circuits/ollama).

**`automation`** runs Kestra and Semaphore UI, each with an admin from `admin_email` and `admin_password`. Renovate joins them when you set `renovate` and `renovate_token`:

```hcl
renovate       = { platform = "gitlab", endpoint = "https://gitlab.example.com/api/v4", repositories = ["lab/infra"] }
renovate_token = var.renovate_token
```

**`code`** runs GitLab CE, with its bundled NGINX on loopback for Traefik and its bundled Prometheus off, since the stack has its own. GitLab wants 8 GB of memory, and its circuit won't start on less. A runner is a second step: create one in GitLab, then set `gitlab_runner = true` and `gitlab_runner_token` and apply again. The runner reaches GitLab by its name, so it has to trust GitLab's certificate, and Traefik's self-signed one won't do. Give Traefik a real certificate first.

**`databases`** runs MariaDB, PostgreSQL and InfluxDB 3 Core, all on loopback. List apps in `db_users`, with a password each in `db_passwords`, and each gets a user and a database of its own in MariaDB and in PostgreSQL. InfluxDB needs `influxdb_token`, its first admin token:

```sh
export TF_VAR_influxdb_token="apiv3_$(openssl rand -hex 24)"
```

**`security`** runs authentik behind Traefik, with a database in the same PostgreSQL, and Suricata watching the interface the default route leaves by. authentik makes `akadmin` with `admin_email` and its password on the first start. Wazuh joins them when you give it a host of its own in `wazuh_server`, and the homelab server then reports to it as an agent:

```hcl
security     = true
wazuh_server = { siem = "192.168.1.40" }
```

Wazuh asks for 4 vCPUs and 8 GiB for its manager, indexer and dashboard. Its indexer also takes `127.0.0.1:9300`, where authentik keeps its metrics, so the two can't share a host. Its dashboard stays on that host's loopback, port 443, for an SSH tunnel; see [circuit-wazuh](/circuits/wazuh).

**`containers_ui`** runs Portainer CE and Dockge, both managing the host's Podman. Portainer's admin gets `admin_password` before anyone else can claim the instance. Portainer only speaks HTTPS, with its own certificate, so its Traefik route skips the certificate check on that one loopback hop.

## When to use the member circuits instead

This stack passes through what a homelab needs and keeps the rest at each circuit's defaults. Call the circuits yourself, by the same `?ref=` this stack pins, when you want:

- the apps spread over several servers. The stack runs on one host, Wazuh's server apart.
- settings this stack doesn't pass on, such as Grafana dashboards, Prometheus scrape jobs, Homepage widgets, PostgreSQL tuning or Traefik's Let's Encrypt certificates.
- a different version of an app than the one its circuit pins.

Don't call a member for the same host while this stack also runs it there: both would manage the same files.

## What it does

On the host, with each part running alongside the others:

1. Installs Podman.
2. With `network`, installs Traefik with a route per app, `https://NAME.DOMAIN` to `http://127.0.0.1:PORT`, and BIND with the zone. Plain HTTP on port 80 redirects to HTTPS.
3. With `dashboard`, runs Homepage on `127.0.0.1:3000`, titled Homelab, with a tile per app grouped by category and a status dot from Homepage checking each app's loopback port.
4. With `monitoring`, runs Uptime Kuma on `127.0.0.1:3001`, Prometheus on `127.0.0.1:9091` and Grafana on `127.0.0.1:3002`, with Prometheus as Grafana's default datasource. Prometheus moves off 9090 because Rocky Linux cloud images give that port to `cockpit.socket`.
5. Each optional category that's on, as above.

The ports, all on `127.0.0.1`:

| App | Port |
| --- | --- |
| Homepage, Uptime Kuma, Grafana, Semaphore UI | 3000, 3001, 3002, 3003 |
| Dockge | 5001 |
| Open WebUI, Kestra | 8081, 8085 |
| Home Assistant | 8123 |
| GitLab's NGINX | 8929 |
| authentik | 9000, and 9444 for HTTPS |
| Portainer | 9443 |
| Prometheus | 9091 |
| Ollama | 11434 |

Several of the members default to the same port (3000 for three of them, 8080 for three more), which is why the stack picks its own.

Each member circuit's README says what it does in detail, and what it leaves alone.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | The homelab server: a map of one name to an address or a host object. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Private key. When null, the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file. When null, `~/.ssh/known_hosts`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. |
| `network` | bool | `true` | Traefik and BIND. |
| `dashboard` | bool | `true` | Homepage. |
| `monitoring` | bool | `true` | Uptime Kuma, Prometheus and Grafana. |
| `smart_home` | bool | `false` | Home Assistant. |
| `ai` | bool | `false` | Ollama and Open WebUI. |
| `automation` | bool | `false` | Kestra and Semaphore UI, and Renovate with `renovate`. |
| `code` | bool | `false` | GitLab CE, and a runner with `gitlab_runner`. |
| `databases` | bool | `false` | MariaDB, PostgreSQL and InfluxDB 3 Core. |
| `security` | bool | `false` | authentik and Suricata, and Wazuh with `wazuh_server`. |
| `containers_ui` | bool | `false` | Portainer CE and Dockge. |
| `domain` | string | `"home.arpa"` | Zone the app names live in. |
| `address` | string | `null` | IPv4 address the names point at, and BIND answers on. When null, the address in `hosts`. |
| `admin_email` | string | `null` | Email for the admin accounts. Needed by `ai`, `automation` and `security`. |
| `admin_password` | string, sensitive, ephemeral | `null` | Password for every admin account. Ephemeral. Needed by every category but `network`, `dashboard` and `smart_home`. |
| `passwords` | map(string), sensitive, ephemeral | `{}` | Passwords that replace `admin_password` for one app. Ephemeral. |
| `ollama_models` | list(string) | `[]` | Models Ollama pulls. |
| `renovate` | object | `null` | `platform`, `repositories` and optional `endpoint` for Renovate. |
| `renovate_token` | string, sensitive, ephemeral | `null` | Renovate's token. Ephemeral. |
| `gitlab_runner` | bool | `false` | Run a GitLab Runner. |
| `gitlab_runner_token` | string, sensitive, ephemeral | `null` | The runner's `glrt-` token. Ephemeral. |
| `db_users` | list(string) | `[]` | Apps that get a user and a database in MariaDB and PostgreSQL. |
| `db_passwords` | map(string), sensitive, ephemeral | `{}` | Password for each of `db_users`. Ephemeral. |
| `influxdb_token` | string, sensitive, ephemeral | `null` | InfluxDB's first admin token. Ephemeral. Needed by `databases`. |
| `wazuh_server` | any | `null` | A host of its own for the Wazuh server. |

## Outputs

| Name | Description |
| --- | --- |
| `urls` | Where to open each web app, by name, such as `{ grafana = "https://grafana.home.arpa" }`. |
| `dns_records` | The names BIND serves, each with the address it points at. |

## Requirements

Requires Conn3x v0.7.0 or later and systemd on the host, with outbound HTTPS to GitHub, the container registries and the distribution's own mirrors. The default stack runs on Debian 13, Ubuntu 24.04, Fedora 45 and Rocky Linux 10. GitLab has no Fedora packages, so `code` leaves Fedora out. The default stack ran with about 750 MB to spare on a 2 GB host; each category adds what its app needs, which its circuit's README gives.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13, in local containers from Conn3x's test images on arm64, with Conn3x v0.7.0. CI does the same on amd64. Each one first applies [examples/local](https://github.com/conn3xorg/circuit-lempa-homelab/tree/v0.1.2/examples/local) as the stack stood a release back, from [`previous-release.hcl`](https://github.com/conn3xorg/circuit-lempa-homelab/blob/v0.1.2/examples/local/previous-release.hcl): circuit-podman v0.1.0, circuit-traefik v0.1.0 with Traefik 3.7.15, circuit-bind v0.1.2, circuit-prometheus v0.1.0 and circuit-grafana v0.1.2, with Homepage v2.6.0 and Uptime Kuma 2.5.8. The second plan is clean and [`check.sh`](https://github.com/conn3xorg/circuit-lempa-homelab/blob/v0.1.2/examples/local/check.sh) passes: BIND answers for each name with authority, refuses other zones and says NXDOMAIN for unknown names; Traefik redirects port 80 and gives an unknown name a 404; Homepage loads by its name, lists each app's tile and reports Grafana up; Uptime Kuma's dashboard and socket.io answer; Grafana answers, has Prometheus as its datasource, and queries it for `up`. Then the upgrade to the current pins, a clean plan and the same check. The admin password isn't in `terraform.tfstate` or under `.terraform`. The host container restarts, which boots systemd again, and the check passes and the plan is clean. Last, every other category is planned against the same host, with no secret in the plan output; Wazuh needs a second host, and GitLab isn't planned on Fedora.

By hand, on two DigitalOcean droplets on amd64. Ubuntu 24.04 with 2 vCPUs and 4 GB ran the default stack with `ai` and `databases`: on top of the same check, Open WebUI signed its admin in through Traefik and listed Ollama's `smollm2:135m`, Ollama answered a prompt, the `db_users` account wrote to its own database in MariaDB and in PostgreSQL, and InfluxDB read back a point written with the token and refused a query without one. About 1.7 GB was still available. Rocky Linux 10 with 1 vCPU and 2 GB, SELinux enforcing, ran the default stack, with about 750 MB still available. On both, the second plan was clean, none of the apps' ports answered from outside, BIND did, and no secret was in the state. After a reboot every service came back, the checks passed again and the plan was clean; Rocky's audit log had no SELinux denials. Right after that reboot, Open WebUI answered its health check but returned a 502 to the first sign-in; a few minutes later it signed in.

`smart_home`, `automation`, `code`, `security` and `containers_ui` have been planned, not applied, through this stack. Each member circuit's own CI applies and checks it.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-lempa-homelab/blob/v0.1.2/LICENSE). Each app keeps its own licence; the member circuits' READMEs say which.

## Source

- Repository: [conn3xorg/circuit-lempa-homelab](https://github.com/conn3xorg/circuit-lempa-homelab). This page covers [v0.1.2](https://github.com/conn3xorg/circuit-lempa-homelab/tree/v0.1.2); the repository's [tags](https://github.com/conn3xorg/circuit-lempa-homelab/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-lempa-homelab/tree/v0.1.2/examples/local).
- Related circuits: [Podman](/circuits/podman), [Portainer CE](/circuits/portainer), [Dockge](/circuits/dockge), [Home Assistant](/circuits/homeassistant), [Traefik](/circuits/traefik), [BIND](/circuits/bind), [Uptime Kuma](/circuits/uptimekuma), [Prometheus](/circuits/prometheus), [Grafana](/circuits/grafana), [Ollama](/circuits/ollama), [Open WebUI](/circuits/openwebui), [Kestra](/circuits/kestra), [Semaphore UI](/circuits/semaphore), [Renovate](/circuits/renovate), [GitLab CE](/circuits/gitlab), [GitLab Runner](/circuits/gitlab-runner), [Homepage](/circuits/homepage), [MariaDB](/circuits/mariadb), [PostgreSQL](/circuits/postgres), [InfluxDB 3 Core](/circuits/influxdb), [authentik](/circuits/authentik), [Suricata](/circuits/suricata), [Wazuh](/circuits/wazuh), [k3s](/circuits/k3s), [Pi-hole](/circuits/pihole), [Caddy](/circuits/caddy), [Proxmox VE](/circuits/proxmox), [Forgejo](/circuits/forgejo), [Cockpit](/circuits/cockpit), [n8n](/circuits/n8n), [Fleet](/circuits/fleet), [Mini homelab](/circuits/mini-homelab).
