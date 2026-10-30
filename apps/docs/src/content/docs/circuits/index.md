---
title: Circuits
sidebar:
  hidden: true
description: The official Conn3x circuits, ready to drop into a configuration with one module block, from nginx and PostgreSQL to WireGuard and k3s.
---

Somebody has already worked out how to install PostgreSQL from its own repositories, open a firewall without locking themselves out, and join a k3s cluster. An official circuit is that work, packaged as an ordinary OpenTofu module with a circuit inside it. The Conn3x project keeps them in the [conn3xorg](https://github.com/conn3xorg) organisation, versions each one with tags, and tests each on the distributions its page lists.

Each page here covers one circuit at its latest release: what it does, a usage example, every input and output, what it needs, what it was tested on, and what it leaves to you.

## Use one

Add a `module` block that points at the circuit's repository and a tag, and pass in your hosts:

```hcl
module "postgres" {
  source = "github.com/conn3xorg/circuit-postgres?ref=v0.2.0"
  hosts  = { db1 = "203.0.113.20" }
}
```

`conn3x init` fetches it, and `conn3x plan` shows every step it will take on every host, the same as for a circuit you wrote yourself. Pin `ref` to a tag, and move it on when you're ready for the next release. A circuit runs commands as root on your servers, so read it before you run it, as you would any other dependency.

## Share your own

Written a circuit you'd use again? [Share a circuit](/guides/share-a-circuit) covers making one others can use: hosts and SSH settings as variables, versions as tags, and a test on a container. List it on the [circuit directory](https://conn3x.org/circuits) alongside these.

## Official circuits

### Web and proxies

| Circuit | What it does | Version |
| --- | --- | --- |
| [nginx](/circuits/nginx) | Installs nginx, writes your site, keeps the service running and opens port 80 in firewalld or ufw. | v0.1.0 |
| [Apache httpd](/circuits/apache) | Apache httpd on Debian, Ubuntu, Rocky and Fedora: virtual hosts, reverse proxy and TLS, config-tested before every reload. | v0.1.0 |
| [Caddy](/circuits/caddy) | Runs Caddy as a web server or reverse proxy, with the Caddyfile built from a map of sites and checked before it goes live. | v0.2.1 |
| [HAProxy](/circuits/haproxy) | HAProxy load balancing from a map of frontends and backends, with the config checked by haproxy -c before it goes live. | v0.1.0 |
| [Traefik](/circuits/traefik) | Traefik 3 routing HTTPS to your backends from a map of sites, with Let's Encrypt certificates and no restart when a site changes. | v0.1.0 |
| [certbot](/circuits/certbot) | Let's Encrypt certificates with certbot for nginx, HAProxy and the rest, renewed by the distro's own timer. | v0.1.0 |

### Databases and caches

| Circuit | What it does | Version |
| --- | --- | --- |
| [PostgreSQL](/circuits/postgres) | Installs PostgreSQL with your settings, access rules, users and databases, and keeps passwords out of state. | v0.2.0 |
| [MariaDB](/circuits/mariadb) | MariaDB from your distribution with users, databases and grants, locked down the way mysql_secure_installation would. | v0.1.0 |
| [MySQL](/circuits/mysql) | MySQL 9.7 or 8.4 LTS from repo.mysql.com, with my.cnf settings, databases, users and grants. Passwords never reach state. | v0.1.0 |
| [CouchDB](/circuits/couchdb) | Apache CouchDB single node from Apache's repos: admin password kept out of state, CORS, and a preset for Obsidian's LiveSync plugin | v0.1.0 |
| [Valkey](/circuits/valkey) | Valkey, the open Redis fork, from your distribution with a write-only password, memory limits and RDB or AOF persistence. | v0.1.0 |
| [OpenSearch](/circuits/opensearch) | Self-hosted single-node OpenSearch 3.x from the official repositories, with the security plugin on and your own TLS certificates. | v0.1.0 |

### Monitoring

| Circuit | What it does | Version |
| --- | --- | --- |
| [node_exporter](/circuits/node-exporter) | Runs Prometheus node_exporter at a pinned, checksummed version as its own system user. | v0.1.0 |
| [Prometheus](/circuits/prometheus) | Prometheus from the official release, scraping the targets you list, with each config checked by promtool and reloaded in place. | v0.1.0 |
| [Grafana](/circuits/grafana) | Grafana OSS from Grafana Labs' repositories, with an admin password that stays applied and your datasources and dashboards provisioned. | v0.1.0 |
| [Monitoring stack](/circuits/monitoring) | Prometheus, Grafana and cAdvisor as one Compose stack, scraping the targets you give it. | v0.2.0 |
| [Netdata](/circuits/netdata) | Installs the Netdata Agent from Netdata's own repo: per-second metrics, telemetry off, localhost-only, optional parent/child streaming. | v0.1.0 |
| [OpenTelemetry Collector](/circuits/otelcol) | OpenTelemetry Collector from the official packages: host metrics, journald and OTLP out, with configs validated before they go live | v0.1.0 |

### Containers and Kubernetes

| Circuit | What it does | Version |
| --- | --- | --- |
| [Docker](/circuits/docker) | Installs Docker Engine from Docker's repository and runs your Compose stacks from files in your configuration. | v0.1.1 |
| [Podman](/circuits/podman) | Installs Podman and runs your containers as systemd services through Quadlet, with secrets kept in a root-only file. | v0.1.0 |
| [k3s](/circuits/k3s) | A k3s Kubernetes cluster from servers and agents, with embedded etcd for HA and Raspberry Pi OS support. | v0.1.3 |
| [kubeadm](/circuits/kubeadm) | An upstream Kubernetes cluster with kubeadm: containerd, pkgs.k8s.io, HA control planes and a pod network. | v0.1.0 |
| [MicroShift](/circuits/microshift) | Turns one Rocky Linux 10 box into a single-node MicroShift cluster, with every unsigned package pinned by checksum. | v0.1.0 |

### DNS

| Circuit | What it does | Version |
| --- | --- | --- |
| [Pi-hole](/circuits/pihole) | Pi-hole ad blocking for your whole network from the official image under Podman, with local DNS records and blocklists. | v0.1.0 |
| [AdGuard Home](/circuits/adguardhome) | AdGuard Home blocking ads and trackers for every device on your network, configured without the setup wizard. | v0.1.0 |
| [Unbound](/circuits/unbound) | A validating, caching DNS resolver with Unbound: DNSSEC on, optional DNS over TLS upstreams and local records for your network. | v0.1.0 |
| [BIND](/circuits/bind) | BIND 9 serving your zones, written as HCL, with serials that go up when records change and TSIG-signed secondaries. | v0.1.0 |

### Networking and VPN

| Circuit | What it does | Version |
| --- | --- | --- |
| [WireGuard](/circuits/wireguard) | Joins hosts into a WireGuard network, full mesh or hub and spoke, with each private key made on its host and never leaving it. | v0.1.0 |
| [Tailscale](/circuits/tailscale) | Installs Tailscale from Tailscale's repository and joins your hosts to your tailnet, with subnet routes, exit nodes and Tailscale SSH. | v0.1.0 |
| [keepalived](/circuits/keepalived) | A floating IP address shared between hosts with keepalived, moving to a backup within a second when a host or a check fails. | v0.1.0 |

### Security and compliance

| Circuit | What it does | Version |
| --- | --- | --- |
| [Baseline](/circuits/baseline) | A sensible start for any server: time zone, chrony, sysctl settings and SSH that only takes keys. | v0.1.0 |
| [Hardening](/circuits/hardening) | SSH and kernel hardening for a fresh server: modern SSH crypto, hardening sysctls, no core dumps, every control switchable. | v0.1.0 |
| [Firewall](/circuits/firewall) | A default-deny ufw or firewalld firewall, picked per host, that opens SSH before it turns on. | v0.2.0 |
| [fail2ban](/circuits/fail2ban) | Bans addresses that keep failing SSH logins, through nftables, with room for jails of your own. | v0.2.0 |
| [Automatic updates](/circuits/auto-updates) | Turns on automatic package updates with unattended-upgrades or dnf-automatic, with security-only updates and a reboot window. | v0.2.0 |
| [OpenSCAP](/circuits/openscap) | OpenSCAP scans against CIS, STIG and other SCAP Security Guide profiles on a timer, with HTML reports and opt-in remediation. | v0.1.0 |
| [auditd](/circuits/auditd) | Installs auditd and loads rules: presets like PCI DSS or the STIG, your own watches, and optional immutability | v0.1.0 |

### Storage and backup

| Circuit | What it does | Version |
| --- | --- | --- |
| [Samba](/circuits/samba) | Samba file shares with per-user passwords kept out of state, SMB2 minimum, NetBIOS off and SELinux labels. | v0.1.0 |
| [NFS](/circuits/nfs) | Share folders over NFSv4 from the kernel NFS server, with each export checked by exportfs and v3 off unless you want it. | v0.1.0 |
| [restic](/circuits/restic) | Scheduled, encrypted backups with restic to SFTP, S3, rest-server or a local path, with retention and repository checks. | v0.1.0 |

### Identity and secrets

| Circuit | What it does | Version |
| --- | --- | --- |
| [Users](/circuits/users) | Creates users, groups and their SSH keys from one map, with optional passwordless sudo. | v0.1.0 |
| [LLDAP](/circuits/lldap) | LLDAP, one small directory every service signs people in against, with the admin password kept out of plan and state. | v0.1.0 |
| [Keycloak](/circuits/keycloak) | Keycloak for single sign-on, OIDC and SAML on your own hosts, on OpenJDK with dev-file or PostgreSQL storage. | v0.1.0 |
| [OpenBao](/circuits/openbao) | OpenBao from the official release on raft storage, with auto-unseal and self-initialisation, on loopback until you give it TLS. | v0.2.0 |
| [Infisical](/circuits/infisical) | Runs Infisical, the open-source secrets manager, from its official image under Podman, with PostgreSQL and Valkey, keys made on the host. | v0.1.0 |

### AI

| Circuit | What it does | Version |
| --- | --- | --- |
| [Ollama](/circuits/ollama) | Runs local LLMs with Ollama from the official release, with the models you name pulled and kept. | v0.1.1 |
| [Qdrant](/circuits/qdrant) | Runs the Qdrant vector database from its official release under systemd, on loopback until you open it, with an optional API key. | v0.1.0 |
| [Agent box](/circuits/agentbox) | Remote dev box for coding agents: key-only user, git, tmux, ripgrep, Node.js LTS, agent CLIs via npm. Works with Orca or plain SSH. | v0.1.0 |

### Platforms

| Circuit | What it does | Version |
| --- | --- | --- |
| [Proxmox VE](/circuits/proxmox) | Turns a Debian 13 host into a Proxmox VE 9 node, following Proxmox's own install guide, reboot included. | v0.1.0 |
| [Forgejo](/circuits/forgejo) | Your own Git forge: Forgejo from its signed release, on SQLite or PostgreSQL, with an admin user and git over your host's SSH. | v0.1.0 |
| [GitLab CE](/circuits/gitlab) | Single-node GitLab CE from GitLab's official packages: pinned release, write-only root password, reconfigure only when gitlab.rb changes. | v0.1.0 |
| [Cockpit](/circuits/cockpit) | Cockpit, the web console for Linux servers, with your port, extra pages, TLS certificate and root login off. | v0.1.0 |

### Build and runtimes

| Circuit | What it does | Version |
| --- | --- | --- |
| [Java](/circuits/java) | OpenJDK or Eclipse Temurin 21 or 25 on Debian, Ubuntu, Fedora and Rocky, set as the default java with JAVA_HOME exported. | v0.1.0 |
| [PHP-FPM](/circuits/php) | PHP-FPM with your extensions, php.ini settings and pools. Distro PHP or a newer one from Sury or Remi, plus Composer. | v0.1.0 |
| [Jenkins](/circuits/jenkins) | Jenkins LTS from the official repo on distro OpenJDK, with pinned plugins and Configuration as Code instead of the setup wizard. | v0.1.0 |

### Communication and media

| Circuit | What it does | Version |
| --- | --- | --- |
| [Matrix Synapse](/circuits/matrix) | Synapse Matrix homeserver under Podman, behind your reverse proxy, with host-generated secrets and SQLite or Postgres. | v0.1.0 |
| [Jellyfin](/circuits/jellyfin) | Jellyfin media server: official apt repo or Podman image, read-only media, GPU groups, optional admin that skips the setup wizard. | v0.1.0 |

### Detection and response

| Circuit | What it does | Version |
| --- | --- | --- |
| [Suricata](/circuits/suricata) | Suricata IDS on AF_PACKET, ET Open rules updated daily, your own rules tested before reload, alerts in eve.json | v0.1.0 |
| [Zeek](/circuits/zeek) | Zeek from its official packages under systemd on one interface, with JSON logs, retention, and a check before each change. | v0.1.0 |
| [osquery](/circuits/osquery) | osqueryd from osquery's own repos: scheduled queries, packs, file integrity monitoring, rotated JSON logs, optional Fleet enrollment. | v0.1.0 |
| [Velociraptor](/circuits/velociraptor) | Velociraptor server with its GUI, plus Linux clients that enroll to it. Keys are made on the server; nonce and password stay out of state. | v0.1.0 |
