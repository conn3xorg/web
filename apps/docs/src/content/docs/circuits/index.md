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
| [nginx](/circuits/nginx) | Installs nginx, writes your site, keeps the service running and opens port 80 in firewalld or ufw. | v0.2.1 |
| [Apache httpd](/circuits/apache) | Apache httpd on Debian, Ubuntu, Rocky and Fedora: virtual hosts, reverse proxy and TLS, config-tested before every reload. | v0.2.1 |
| [Caddy](/circuits/caddy) | Runs Caddy as a web server or reverse proxy, with the Caddyfile built from a map of sites and checked before it goes live. | v0.3.0 |
| [HAProxy](/circuits/haproxy) | HAProxy load balancing from a map of frontends and backends, with the config checked by haproxy -c before it goes live. | v0.2.0 |
| [Traefik](/circuits/traefik) | Traefik 3 routing HTTPS to your backends from a map of sites, with Let's Encrypt certificates and no restart when a site changes. | v0.1.3 |
| [certbot](/circuits/certbot) | Let's Encrypt certificates with certbot for nginx, HAProxy and the rest, renewed by the distro's own timer. | v0.2.1 |
| [IIS](/circuits/iis) | Experimental. Turns Windows Server 2022 or 2025 into an IIS web server: a site, its own app pool and the firewall port open. | v0.1.0 |

### Databases and caches

| Circuit | What it does | Version |
| --- | --- | --- |
| [PostgreSQL](/circuits/postgres) | Installs PostgreSQL with your settings, access rules, users and databases, and keeps passwords out of state. | v0.3.0 |
| [MariaDB](/circuits/mariadb) | MariaDB from your distribution with users, databases and grants, locked down the way mysql_secure_installation would. | v0.3.0 |
| [MySQL](/circuits/mysql) | MySQL 9.7 or 8.4 LTS from repo.mysql.com, with my.cnf settings, databases, users and grants. Passwords never reach state. | v0.3.1 |
| [SQL Server](/circuits/mssql) | SQL Server 2025 from Microsoft's repos on Ubuntu 22.04/24.04 and EL 9/10, x86-64. Free editions by default, sa password never in state. | v0.2.1 |
| [CouchDB](/circuits/couchdb) | Apache CouchDB single node from Apache's repos: admin password kept out of state, CORS, and a preset for Obsidian's LiveSync plugin | v0.1.4 |
| [Valkey](/circuits/valkey) | Valkey, the open Redis fork, from your distribution with a write-only password, memory limits and RDB or AOF persistence. | v0.2.0 |
| [OpenSearch](/circuits/opensearch) | Self-hosted single-node OpenSearch 3.x from the official repositories, with the security plugin on and your own TLS certificates. | v0.2.2 |
| [SQLite](/circuits/sqlite) | The sqlite3 command line tool from your distribution's packages, with optional empty databases created with an owner and mode. | v0.1.4 |
| [Cassandra](/circuits/cassandra) | Apache Cassandra 5.0 from Apache's checked release tarball, on Temurin 17, with password login on from the first apply. | v0.2.1 |
| [Oracle AI Database Free](/circuits/oracle-free) | Oracle AI Database Free on Rocky Linux, from Oracle's RPM, under its own systemd unit, with the licence accepted up front. | v0.1.0 |
| [InfluxDB 3 Core](/circuits/influxdb) | InfluxDB 3 Core from InfluxData's signed repo, on loopback, with your own admin token from the first start. | v0.1.0 |

### Monitoring

| Circuit | What it does | Version |
| --- | --- | --- |
| [node_exporter](/circuits/node-exporter) | Runs Prometheus node_exporter at a pinned, checksummed version as its own system user. | v0.1.5 |
| [Prometheus](/circuits/prometheus) | Prometheus from the official release, scraping the targets you list, with each config checked by promtool and reloaded in place. | v0.1.2 |
| [Grafana](/circuits/grafana) | Grafana OSS from Grafana Labs' repositories, with an admin password that stays applied and your datasources and dashboards provisioned. | v0.2.0 |
| [Monitoring stack](/circuits/monitoring) | Prometheus, Grafana and cAdvisor as one Compose stack, scraping the targets you give it. | v0.2.4 |
| [Netdata](/circuits/netdata) | Installs the Netdata Agent from Netdata's own repo: per-second metrics, telemetry off, localhost-only, optional parent/child streaming. | v0.1.2 |
| [OpenTelemetry Collector](/circuits/otelcol) | OpenTelemetry Collector from the official packages: host metrics, journald and OTLP out, with configs validated before they go live | v0.2.1 |
| [Zabbix](/circuits/zabbix) | Zabbix 7.0 LTS server, frontend and agent 2 from Zabbix's repos, with PostgreSQL, API-set Admin password and optional per-agent PSK. | v0.1.5 |
| [Nagios Core](/circuits/nagios) | Nagios Core with plugins, hosts and services from inputs, nagios -v before every reload, and a login-protected web interface on loopback. | v0.2.1 |
| [Uptime Kuma](/circuits/uptimekuma) | Uptime Kuma under Podman: it watches your sites, ports and services and tells you the moment one stops answering. | v0.1.0 |

### Containers and Kubernetes

| Circuit | What it does | Version |
| --- | --- | --- |
| [Docker](/circuits/docker) | Installs Docker Engine from Docker's repository and runs your Compose stacks from files in your configuration. | v0.2.1 |
| [Podman](/circuits/podman) | Installs Podman and runs your containers as systemd services through Quadlet, with secrets kept in a root-only file. | v0.1.2 |
| [k3s](/circuits/k3s) | A k3s Kubernetes cluster from servers and agents, with embedded etcd for HA and Raspberry Pi OS support. | v0.1.8 |
| [kubeadm](/circuits/kubeadm) | An upstream Kubernetes cluster with kubeadm: containerd, pkgs.k8s.io, HA control planes and a pod network. | v0.2.4 |
| [MicroShift](/circuits/microshift) | Turns one Rocky Linux 10 box into a single-node MicroShift cluster, with every unsigned package pinned by checksum. | v0.2.0 |
| [Rancher](/circuits/rancher) | Install Rancher Manager on a k3s cluster with Helm and cert-manager, at pinned versions, with the bootstrap password kept out of state. | v0.1.4 |
| [containerd](/circuits/containerd) | Install pinned containerd, runc and CNI plugins from upstream releases, with systemd unit and config.toml. | v0.1.2 |
| [Nomad](/circuits/nomad) | A HashiCorp Nomad cluster from a pinned release, with an odd server count, gossip encryption and ACLs on, and no secrets in state. | v0.1.2 |
| [Helm](/circuits/helm) | A pinned, checksum-verified Helm, with optional chart releases kept as you configured them. | v0.1.5 |
| [Istio](/circuits/istio) | A pinned, checksum-verified Istio on k3s, with sidecar injection and a check for Traefik's ports. | v0.1.3 |
| [Flux](/circuits/flux) | Flux CD on a k3s cluster at a pinned version, synced from a Git repository you name, with credentials kept out of state. | v0.1.2 |
| [Dockge](/circuits/dockge) | Dockge under Podman: write, deploy and update compose stacks from the browser, with no Docker engine. | v0.1.0 |
| [Portainer CE](/circuits/portainer) | Portainer CE and its agent under Podman, HTTPS on loopback, the admin set before anyone else can claim it. | v0.1.0 |

### DNS

| Circuit | What it does | Version |
| --- | --- | --- |
| [Pi-hole](/circuits/pihole) | Pi-hole ad blocking for your whole network from the official image under Podman, with local DNS records and blocklists. | v0.1.5 |
| [AdGuard Home](/circuits/adguardhome) | AdGuard Home blocking ads and trackers for every device on your network, configured without the setup wizard. | v0.2.3 |
| [Unbound](/circuits/unbound) | A validating, caching DNS resolver with Unbound: DNSSEC on, optional DNS over TLS upstreams and local records for your network. | v0.2.2 |
| [BIND](/circuits/bind) | BIND 9 serving your zones, written as HCL, with serials that go up when records change and TSIG-signed secondaries. | v0.2.2 |

### Networking and VPN

| Circuit | What it does | Version |
| --- | --- | --- |
| [WireGuard](/circuits/wireguard) | Joins hosts into a WireGuard network, full mesh or hub and spoke, with each private key made on its host and never leaving it. | v0.2.2 |
| [Tailscale](/circuits/tailscale) | Installs Tailscale from Tailscale's repository and joins your hosts to your tailnet, with subnet routes, exit nodes and Tailscale SSH. | v0.2.1 |
| [keepalived](/circuits/keepalived) | A floating IP address shared between hosts with keepalived, moving to a backup within a second when a host or a check fails. | v0.1.3 |
| [Cloudflare Tunnel](/circuits/cloudflared) | Run a Cloudflare Tunnel from a pinned, checksummed cloudflared under systemd, with the token kept out of plan and state. | v0.1.3 |
| [NetBird](/circuits/netbird) | The NetBird client from NetBird's signed repo, joining your hosts to NetBird cloud or your own server. | v0.1.0 |

### Network

These configure a network device through its OpenTofu provider instead of a host over SSH: you point the provider at the device's API, and there are no `hosts` to pass. They're [experimental](/reference/maturity): each was tested on a virtual image of its device, named on its page, not on hardware.

| Circuit | What it does | Version |
| --- | --- | --- |
| [RouterOS baseline](/circuits/routeros-baseline) | Gives a MikroTik RouterOS 7 router its name, NTP, DNS, services, users, VLANs and SNMPv3 over the REST API. | v0.1.0 |
| [OPNsense VLANs](/circuits/opnsense-vlans) | Builds trusted, IoT and guest VLANs on OPNsense, with Kea DHCP, firewall rules and local names in Unbound. | v0.1.0 |
| [Proxmox VE network](/circuits/proxmox-network) | Manages a Proxmox VE node's bridges, VLAN interfaces, SDN zones and VNets through the Proxmox API. | v0.1.0 |

### Security and compliance

| Circuit | What it does | Version |
| --- | --- | --- |
| [Baseline](/circuits/baseline) | A sensible start for any server: time zone, chrony, sysctl settings and SSH that only takes keys. | v0.2.0 |
| [Hardening](/circuits/hardening) | SSH and kernel hardening for a fresh server: modern SSH crypto, hardening sysctls, no core dumps, every control switchable. | v0.3.0 |
| [Firewall](/circuits/firewall) | A default-deny ufw or firewalld firewall, picked per host, that opens SSH before it turns on. | v0.3.0 |
| [fail2ban](/circuits/fail2ban) | Bans addresses that keep failing SSH logins, through nftables, with room for jails of your own. | v0.3.1 |
| [Automatic updates](/circuits/auto-updates) | Turns on automatic package updates with unattended-upgrades or dnf-automatic, with security-only updates and a reboot window. | v0.3.0 |
| [OpenSCAP](/circuits/openscap) | OpenSCAP scans against CIS, STIG and other SCAP Security Guide profiles on a timer, with HTML reports and opt-in remediation. | v0.1.3 |
| [auditd](/circuits/auditd) | Installs auditd and loads rules: presets like PCI DSS or the STIG, your own watches, and optional immutability | v0.2.1 |
| [Trivy](/circuits/trivy) | Scan hosts for known vulnerabilities with a pinned Trivy on a systemd timer, read-only, with reports on the host. | v0.1.2 |
| [CISO Assistant](/circuits/ciso-assistant) | Track compliance work with the CISO Assistant community app, in Podman on PostgreSQL. | v0.1.1 |
| [ZAP](/circuits/zap) | OWASP ZAP baseline scans of URLs you list, on a systemd timer, reports on the host. | v0.1.3 |
| [checkov](/circuits/checkov) | A pinned checkov in its own venv, installed from a hash-checked lock, for scanning infrastructure code. | v0.2.1 |
| [cosign](/circuits/cosign) | A pinned, checksum-verified cosign on your hosts, for checking signatures on images and files. | v0.1.0 |
| [in-toto](/circuits/in-toto) | in-toto in its own venv, from hash-locked requirements, for verifying how software was built. | v0.1.1 |
| [TruffleHog](/circuits/trufflehog) | A pinned, checksum-verified TruffleHog, with optional scans of chosen paths for leaked secrets on a systemd timer. | v0.1.0 |

### Storage and backup

| Circuit | What it does | Version |
| --- | --- | --- |
| [Samba](/circuits/samba) | Samba file shares with per-user passwords kept out of state, SMB2 minimum, NetBIOS off and SELinux labels. | v0.3.1 |
| [NFS](/circuits/nfs) | Share folders over NFSv4 from the kernel NFS server, with each export checked by exportfs and v3 off unless you want it. | v0.2.1 |
| [restic](/circuits/restic) | Scheduled, encrypted backups with restic to SFTP, S3, rest-server or a local path, with retention and repository checks. | v0.1.2 |

### Identity and secrets

| Circuit | What it does | Version |
| --- | --- | --- |
| [Users](/circuits/users) | Creates users, groups and their SSH keys from one map, with optional passwordless sudo. | v0.1.4 |
| [Active Directory](/circuits/active-directory) | Experimental. An Active Directory domain from roles: a new forest, more DCs, joined members, and OUs, users and groups. | v0.1.1 |
| [LLDAP](/circuits/lldap) | LLDAP, one small directory every service signs people in against, with the admin password kept out of plan and state. | v0.1.2 |
| [OpenLDAP](/circuits/openldap) | OpenLDAP slapd with cn=config set up for you: base DN, schemas, OUs, LDIF entries, TLS, no anonymous binds. | v0.2.1 |
| [FreeIPA](/circuits/freeipa) | FreeIPA server on Rocky or Fedora, with clients on Debian, Ubuntu, Fedora and Rocky. Sets FQDNs, installs unattended, enrols over SSSD. | v0.2.1 |
| [Keycloak](/circuits/keycloak) | Keycloak for single sign-on, OIDC and SAML on your own hosts, on OpenJDK with dev-file or PostgreSQL storage. | v0.2.1 |
| [OpenBao](/circuits/openbao) | OpenBao from the official release on raft storage, with auto-unseal and self-initialisation, on loopback until you give it TLS. | v0.2.3 |
| [Infisical](/circuits/infisical) | Runs Infisical, the open-source secrets manager, from its official image under Podman, with PostgreSQL and Valkey, keys made on the host. | v0.1.1 |
| [authentik](/circuits/authentik) | Self-host authentik: single sign-on over OIDC and SAML, with users, sessions and audit trail on your own hosts. | v0.1.2 |
| [Passbolt CE](/circuits/passbolt) | Passbolt CE, the team password manager, under Podman with its own MariaDB and every secret made on the host. | v0.1.0 |
| [Teleport](/circuits/teleport) | A Teleport Community Edition cluster: auth and proxy on one host, SSH nodes joining over a reverse tunnel. | v0.1.0 |

### AI

| Circuit | What it does | Version |
| --- | --- | --- |
| [Ollama](/circuits/ollama) | Runs local LLMs with Ollama from the official release, with the models you name pulled and kept. | v0.1.4 |
| [Qdrant](/circuits/qdrant) | Runs the Qdrant vector database from its official release under systemd, on loopback until you open it, with an optional API key. | v0.1.2 |
| [Open WebUI](/circuits/openwebui) | Open WebUI in Podman: private chat for Ollama or a gateway, first admin from code, sign-up closed, per-user model access, no telemetry | v0.1.1 |
| [LiteLLM](/circuits/litellm) | Self-host LiteLLM Proxy: one OpenAI-compatible gateway with per-team keys, budgets, Presidio guardrails and Langfuse tracing. | v0.2.1 |
| [Presidio](/circuits/presidio) | Presidio's PII analyzer and anonymizer on loopback in Podman, to scrub prompts and documents before a model sees them. | v0.1.1 |
| [Langfuse](/circuits/langfuse) | Langfuse LLM observability on one host: prompts, costs and evals traced into ClickHouse, keys generated on the host, sign-up off. | v0.1.1 |
| [Agent box](/circuits/agentbox) | Remote dev box for coding agents: key-only user, git, tmux, ripgrep, Node.js LTS, agent CLIs via npm. Works with Orca or plain SSH. | v0.2.0 |

### Platforms

| Circuit | What it does | Version |
| --- | --- | --- |
| [Proxmox VE](/circuits/proxmox) | Turns a Debian 13 host into a Proxmox VE 9 node, following Proxmox's own install guide, reboot included. | v0.1.2 |
| [Forgejo](/circuits/forgejo) | Your own Git forge: Forgejo from its signed release, on SQLite or PostgreSQL, with an admin user and git over your host's SSH. | v0.1.2 |
| [GitLab CE](/circuits/gitlab) | Single-node GitLab CE from GitLab's official packages: pinned release, write-only root password, reconfigure only when gitlab.rb changes. | v0.1.3 |
| [Cockpit](/circuits/cockpit) | Cockpit, the web console for Linux servers, with your port, extra pages, TLS certificate and root login off. | v0.2.1 |
| [n8n](/circuits/n8n) | Self-hosted n8n workflow automation in Podman: SQLite or PostgreSQL, host-generated encryption key, owner account set up on first apply. | v0.1.3 |
| [Fleet](/circuits/fleet) | Fleet device management on osquery: enrol hosts and ask them live questions, from a pinned, checksum-verified release. | v0.2.2 |
| [Homepage](/circuits/homepage) | The Homepage dashboard under Podman: one page for everything you run, its config checked before it lands. | v0.1.0 |
| [Home Assistant](/circuits/homeassistant) | Home Assistant Container under Podman, on the host's network for discovery, its web server on loopback. | v0.1.0 |
| [Kestra](/circuits/kestra) | The Kestra workflow orchestrator under Podman, its admin password and flow secrets kept out of state. | v0.1.0 |
| [Lempa homelab](/circuits/lempa-homelab) | Christian Lempa's 2025 homelab list from official circuits: Traefik, BIND, Homepage and monitoring on, every other category a switch away. | v0.1.2 |
| [Mini homelab](/circuits/mini-homelab) | Homepage and Uptime Kuma on one server, on loopback behind an SSH tunnel: the small circuit the private AI box tutorial builds. | v0.1.1 |

### Build and runtimes

| Circuit | What it does | Version |
| --- | --- | --- |
| [Java](/circuits/java) | OpenJDK or Eclipse Temurin 21 or 25 on Debian, Ubuntu, Fedora and Rocky, set as the default java with JAVA_HOME exported. | v0.2.0 |
| [PHP-FPM](/circuits/php) | PHP-FPM with your extensions, php.ini settings and pools. Distro PHP or a newer one from Sury or Remi, plus Composer. | v0.3.0 |
| [Jenkins](/circuits/jenkins) | Jenkins LTS from the official repo on distro OpenJDK, with pinned plugins and Configuration as Code instead of the setup wizard. | v0.2.0 |
| [GitHub Actions runner](/circuits/github-runner) | GitHub Actions self-hosted runners on Linux hosts: pinned release, dedicated user, one-time registration, a systemd service per runner. | v0.1.3 |
| [GitLab Runner](/circuits/gitlab-runner) | GitLab Runner from GitLab's packages, shell or Docker executor, its glrt- token kept out of plan and state. | v0.1.3 |
| [Cinc Client](/circuits/cinc) | Run Chef cookbooks in local mode with Cinc Client, the free community build, with no Chef Server and a systemd timer if you want one. | v0.1.2 |
| [Node.js](/circuits/nodejs) | One exact Node.js LTS from nodejs.org on every distribution, checked against its checksum, with global npm packages at pinned versions. | v0.1.2 |
| [Perl](/circuits/perl) | Perl from each distribution's packages, with distribution modules and CPAN modules pinned through cpanm. | v0.2.0 |
| [Bun](/circuits/bun) | Install one pinned Bun release, checksum-verified, on every Linux host. | v0.1.1 |
| [Selenium Grid](/circuits/selenium) | Selenium Grid under Podman, official images pinned by digest, on loopback by default. | v0.1.1 |
| [k6](/circuits/k6) | A pinned, checksum-verified k6 on your hosts, for load testing your services and APIs. | v0.1.0 |
| [OpenVox](/circuits/openvox) | Run your Puppet manifests without a server, using the OpenVox agent in local mode on an optional systemd timer. | v0.1.2 |
| [Rust](/circuits/rust) | One exact Rust toolchain from static.rust-lang.org on every distribution, checksum-verified and system-wide, without rustup. | v0.1.1 |
| [Go](/circuits/go) | One exact Go release from go.dev on every distribution, checked against its checksum, with optional tools at pinned versions. | v0.1.1 |
| [Python](/circuits/python) | Your distribution's Python with working venvs, and optional environments holding pinned packages. | v0.1.4 |
| [Ruby](/circuits/ruby) | Your distribution's Ruby, with optional gems at pinned versions. | v0.1.2 |
| [Kotlin](/circuits/kotlin) | One exact Kotlin compiler from JetBrains' releases, checked against its checksum, on a Java you provide. | v0.1.1 |
| [.NET](/circuits/dotnet) | One exact .NET SDK with ASP.NET Core from Microsoft's tarballs, checked against its checksum, with telemetry off by default. | v0.1.1 |
| [C toolchain](/circuits/c-toolchain) | gcc, g++, make, gdb and nasm from your distribution's packages, for C, C++ and assembly. Versions differ per distribution. | v0.2.1 |
| [Semaphore UI](/circuits/semaphore) | Semaphore UI under Podman: run Ansible, OpenTofu and Terraform from a web page, on SQLite or PostgreSQL. | v0.1.0 |
| [Renovate](/circuits/renovate) | Self-hosted Renovate on a systemd timer against the repositories you list, its token kept out of state. | v0.1.0 |

### Communication and media

| Circuit | What it does | Version |
| --- | --- | --- |
| [Matrix Synapse](/circuits/matrix) | Synapse Matrix homeserver under Podman, behind your reverse proxy, with host-generated secrets and SQLite or Postgres. | v0.1.2 |
| [Jellyfin](/circuits/jellyfin) | Jellyfin media server: official apt repo or Podman image, read-only media, GPU groups, optional admin that skips the setup wizard. | v0.2.0 |

### Detection and response

| Circuit | What it does | Version |
| --- | --- | --- |
| [Suricata](/circuits/suricata) | Suricata IDS on AF_PACKET, ET Open rules updated daily, your own rules tested before reload, alerts in eve.json | v0.2.1 |
| [Zeek](/circuits/zeek) | Zeek from its official packages under systemd on one interface, with JSON logs, retention, and a check before each change. | v0.1.4 |
| [osquery](/circuits/osquery) | osqueryd from osquery's own repos: scheduled queries, packs, file integrity monitoring, rotated JSON logs, optional Fleet enrollment. | v0.2.1 |
| [Velociraptor](/circuits/velociraptor) | Velociraptor server with its GUI, plus Linux clients that enroll to it. Keys are made on the server; nonce and password stay out of state. | v0.1.3 |
| [Wazuh](/circuits/wazuh) | Wazuh manager, indexer and dashboard on one host, agents on the rest: vulnerability detection, file integrity and alerts. | v0.2.0 |
| [Falco](/circuits/falco) | Falco from its official repository on the modern eBPF probe, with your own rules validated before they load. | v0.1.0 |
