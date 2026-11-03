---
title: CISO Assistant
description: "Track compliance work with the CISO Assistant community app, in Podman on PostgreSQL."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-ciso-assistant at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/ciso-assistant/grade.svg)](https://conn3x.org/circuits/ciso-assistant/grade)

A Conn3x circuit that runs the community edition of [CISO Assistant](https://intuitem.com), the open-source governance, risk and compliance app, on your own hosts. If your audit prep lives in four spreadsheets and a shared folder, this gives it one home: frameworks with their requirements already written out, your assessments against them, risks, controls and evidence, all on a machine you run.

**This helps you track compliance work. It doesn't make anyone compliant.** Installing it, or loading a framework into it, certifies nothing and satisfies no requirement. That still takes your controls, your evidence and, where the framework calls for one, your auditor.

CISO Assistant is three moving parts beside PostgreSQL: a Django backend, a worker for background tasks and a web interface. The circuit runs all three from upstream's images under Podman, as systemd services pinned by tag and digest, on the host's network and on loopback by default. You bring PostgreSQL; pair it with [circuit-postgres](/circuits/postgres) and the whole thing fits on one host, on Debian, Ubuntu, Fedora or Rocky Linux.

Django's secret key is made on the host by the first apply. It never passes through Conn3x, so it's not in your plan, your state or your CI logs, and the passwords you pass in are ephemeral.

## Usage

```hcl
variable "db_password" {
  type      = string
  ephemeral = true
  sensitive = true
}

variable "admin_password" {
  type      = string
  ephemeral = true
  sensitive = true
}

module "postgres" {
  source = "github.com/conn3xorg/circuit-postgres?ref=v0.2.0"

  hosts                = { grc = "192.168.1.60" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  users          = ["ciso_assistant"]
  user_passwords = { ciso_assistant = var.db_password }
  databases      = { ciso_assistant = "ciso_assistant" }
}

module "ciso_assistant" {
  source = "github.com/conn3xorg/circuit-ciso-assistant?ref=v0.1.0"

  depends_on = [module.postgres]

  hosts                = { grc = "192.168.1.60" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  public_url     = "https://grc.example.com"
  db_password    = var.db_password
  admin_email    = "you@example.com"
  admin_password = var.admin_password
}
```

Then run `conn3x init` and `conn3x apply` with the secrets in the environment:

```sh
export TF_VAR_db_password='...'
export TF_VAR_admin_password='...'
conn3x apply
```

Be patient with the first one. Before it opens its port, the backend migrates the database and stores its whole catalogue of libraries, and on a 2-vCPU droplet that took about 18 minutes. With 8 vCPUs it took about 4. The circuit waits up to 45 minutes.

A second `conn3x plan` says `No changes.` Every plan needs the same values, since Conn3x checks the env files on the host against them.

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-ciso-assistant/tree/v0.1.0/examples/local).

### Put HTTPS in front

You'll want a reverse proxy here, and not only for the usual reasons: the web interface marks its login cookies `Secure`, so a browser won't keep them over plain HTTP anywhere but `localhost`. The proxy also has to send `/api/` to the backend, as upstream's own Caddy setup does. With [circuit-caddy](/circuits/caddy) on the same host, the site block looks like this:

```
grc.example.com {
	reverse_proxy /api/* 127.0.0.1:8000
	reverse_proxy 127.0.0.1:3000
}
```

Set `public_url` to the address people type. The web interface refuses form posts from any other origin, and the backend answers only to that host name and to localhost.

### Loading frameworks

Nothing is loaded at first. Sign in as `admin_email` and open the libraries page, or use the API:

```sh
token=$(curl -s https://grc.example.com/api/_allauth/app/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"..."}' | jq -r .meta.access_token)

curl -s -X POST -H "Authorization: Token $token" \
  https://grc.example.com/api/stored-libraries/urn:intuitem:risk:library:iso27001-2022/import/
```

These are the three we loaded and checked:

| You're after | Library URN | Framework it creates |
| --- | --- | --- |
| SOC 2 | `urn:intuitem:risk:library:soc2-2017-rev-2022` | SOC2-2017 Trust Services Criteria (revision 2022) |
| ISO 27001 | `urn:intuitem:risk:library:iso27001-2022` | International standard ISO/IEC 27001:2022 |
| HIPAA | `urn:intuitem:risk:library:nist-sp-800-66-rev2` | NIST SP-800-66 rev2 (HIPAA) |

HIPAA is worth a second look: what ships is NIST's guide to implementing the Security Rule, not the rule's own text. The catalogue holds plenty more, which we didn't try. A big library can take a while to load on a small host, which is why the circuit raises the backend's request timeout to 10 minutes.

### Memory

Plan on 4 GB. With PostgreSQL beside it, the stack left about 1.3 to 1.7 GB available on a 4 GB droplet once it had settled. On 2 GB it did start, but it was down to under 50 MiB available after a reboot, so the circuit stops with an error below `min_memory_mb`, 3500 MiB by default. Lower that if you know what you're doing.

### The first account

`admin_email` and `admin_password` become the first administrator when the backend first starts. After that the backend leaves that account alone, so changing `admin_password` later doesn't change the password. Change it in the web interface instead.

## Why containers, and why these

Upstream ships container images, so the question is how to run them. This circuit uses Quadlet units through [circuit-podman](/circuits/podman) rather than Compose:

- **Each part is a systemd service.** `ciso-assistant-backend`, `ciso-assistant-huey` and `ciso-assistant-frontend` start at boot, restart when they fail, and log to the journal.
- **One pin per image, checked.** Each tag goes into its unit with a digest, and Podman pulls by the digest, so an image that's re-pushed upstream can't change what your hosts run.
- **Upgrades are a diff.** Change `ciso_assistant_version` and the two digests, and `conn3x plan` shows the new images. The apply restarts the services, and the backend runs its migrations as it starts.

The images come from `ghcr.io/intuitem/ciso-assistant-community/`, which upstream publishes under the AGPL v3. Images directly under `ghcr.io/intuitem/` are the commercial edition, which needs a contract with intuitem. This circuit doesn't use them.

## What it does

On each host, in order:

1. Reads the host's facts, and stops if it has less memory than `min_memory_mb`.
2. Creates `/etc/ciso-assistant`, mode `0700`, owned by root.
3. If `/etc/ciso-assistant/keys.env` doesn't exist, generates `DJANGO_SECRET_KEY` from `/dev/urandom`, in a file with mode `0600`. Once it exists, the circuit never touches it again.
4. Through [circuit-podman](/circuits/podman) v0.1.0, installs Podman and runs three Quadlet units on the host network, each with a read-only root filesystem, every capability dropped and no new privileges, as upstream's compose file does:
   - `ciso-assistant-backend` on `127.0.0.1:8000`, as user 1001.
   - `ciso-assistant-huey`, the background worker, as user 1001, with no port of its own.
   - `ciso-assistant-frontend` on `listen_address:port`.

   The backend and the worker share the `ciso-assistant` volume, which holds attachments, the task queue and the OIDC signing key. `db_password`, `admin_password` and `environment` go to `/etc/containers/env/ciso-assistant-backend.env` and `ciso-assistant-huey.env`, mode `0600`, written from ephemeral values so they never reach the plan or state.
5. Waits up to 45 minutes for the backend to open its port, then up to 5 for the web interface.

A change to any input restarts the containers it touches.

### One workaround to know about

Upstream's startup script binds gunicorn to every address, with no setting to change that, and on the host's network that would put the API in front of your proxy. So the backend's unit runs a copy of the script with the bind changed to `127.0.0.1`. If a later version rewrites that line, the service refuses to start instead of quietly listening everywhere, and the apply fails at the wait.

### A rough edge on Ubuntu 24.04

Ubuntu's AppArmor profile for Podman containers stops gunicorn signalling its own workers. If a request ever runs past the 10-minute timeout, gunicorn can't kill just that worker, so the whole backend exits and systemd restarts it. We saw this at upstream's 100-second timeout, with `apparmor="DENIED" operation="signal"` in the kernel log, and systemd restarted the backend straight away. The circuit leaves AppArmor on rather than weaken it for this.

### What it doesn't do

- It doesn't set up TLS or a reverse proxy. See [Put HTTPS in front](#put-https-in-front).
- It doesn't open a port in a firewall. With the default `listen_address`, nothing outside the host can reach CISO Assistant anyway.
- It doesn't run upstream's AI assistant or its Qdrant vector store, which are off unless you set `ENABLE_CHAT`, or its optional MCP server.
- It doesn't send mail until you give it a server, through `environment`.
- It doesn't back anything up. PostgreSQL, the `ciso-assistant` volume and `keys.env` all matter; see [circuit-restic](/circuits/restic).
- Deleting the module leaves Podman, the containers, their volume and `/etc/ciso-assistant` in place.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"192.168.1.60"`, or a host object such as `{ address = "192.168.1.60", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `public_url` | string | Required | The address people reach CISO Assistant at, with no path or trailing slash, such as `"https://grc.example.com"`. |
| `db_password` | string, sensitive, ephemeral | Required | Password of `db_user`. Ephemeral and sensitive: it reaches the host's env files but never the plan or state. |
| `db_host` | string | `"127.0.0.1"` | Address of the PostgreSQL server, as seen from the host. |
| `db_port` | number | `5432` | Port of the PostgreSQL server. |
| `db_name` | string | `"ciso_assistant"` | Name of the database, which has to exist already. |
| `db_user` | string | `"ciso_assistant"` | PostgreSQL role that owns the database. |
| `admin_email` | string | Required | Email address of the first administrator. |
| `admin_password` | string, sensitive, ephemeral | Required | That user's password, at least 12 characters. Ephemeral and sensitive. Set only when the user is created. |
| `listen_address` | string | `"127.0.0.1"` | Address the web interface listens on. `"0.0.0.0"` listens on every address. |
| `port` | number | `3000` | Port the web interface listens on. |
| `backend_port` | number | `8000` | Port the API listens on, always on `127.0.0.1`. |
| `min_memory_mb` | number | `3500` | Memory, in MiB, a host needs before the circuit configures it. |
| `ciso_assistant_version` | string | `"v4.1.5"` | Tag of the backend and frontend images. Change both digests with it. |
| `backend_image_digest` | string | `"sha256:bf335098..."` | Digest of the backend image for `ciso_assistant_version`. |
| `frontend_image_digest` | string | `"sha256:9a4016e2..."` | Digest of the frontend image for `ciso_assistant_version`. |
| `environment` | map(string), sensitive, ephemeral | `{}` | More of CISO Assistant's environment variables for the backend and the worker, such as `EMAIL_HOST` and `POSTGRES_SSL_MODE`. Ephemeral and sensitive: they go into the same env files and never the plan or state. The variables the circuit sets itself aren't allowed. |

## Outputs

| Name | Description |
| --- | --- |
| `services` | The three systemd services that run CISO Assistant. |
| `images` | The image each service runs, with its tag and digest. |
| `keys_file` | `/etc/ciso-assistant/keys.env`, the file to back up. |

## Requirements

Requires Conn3x v0.6.9 or later and systemd on each host, with about 4 GB of memory (see [Memory](#memory)) and room for about 4 GB of images plus your data. Both images are built for amd64 and arm64. Each host needs to reach its package mirror and `ghcr.io`, and a PostgreSQL server. `conn3x init` fetches circuit-podman from GitHub.

## Tested on

Ubuntu 24.04 and Rocky Linux 10 with SELinux enforcing, each a 4 GB, 2-vCPU DigitalOcean droplet on amd64 running [examples/local](https://github.com/conn3xorg/circuit-ciso-assistant/tree/v0.1.0/examples/local) with circuit-postgres on the same host. On each, the second plan was clean; the API login worked and a wrong password was refused; a login through the web interface's form worked; a library request with no token got a 401; and the SOC 2, ISO 27001 and HIPAA libraries in the table above each loaded and showed up as frameworks. From outside each droplet, ports 3000 and 8000 didn't answer. Both were rebooted: everything came back on its own, the frameworks and the login were still there, the plan was clean, and Rocky had no SELinux denials. The state held neither password nor the secret key.

Rocky Linux 10, Debian 13, Fedora 45 and Ubuntu 24.04 ran in local containers from Conn3x's test images, on arm64, through the same checks with a restart of the three services in place of the reboot. Debian and Fedora have only run in containers, not on real hosts. The Ubuntu container run came just before the wait and request timeouts were raised, which the Ubuntu droplet then covered. Separately, a local container with `public_url` set to an HTTPS name, behind Caddy with the routes above, passed the health check and both logins, and its web interface refused a form post from another origin.

A 2 GB, 2-vCPU Ubuntu droplet is what turned up the 45-minute wait, the longer request timeout and the 3500 MiB floor. The CI workflow applies the example to Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13 in containers on amd64 and runs the same checks with a restart.

Upgrading from one `ciso_assistant_version` to the next hasn't been tried yet.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-ciso-assistant/blob/v0.1.0/LICENSE). CISO Assistant's community edition is under the AGPL v3, apart from its `enterprise` directory, and upstream publishes the community images under the AGPL v3 too. This circuit only installs them and includes none of upstream's code.

## Source

- Repository: [conn3xorg/circuit-ciso-assistant](https://github.com/conn3xorg/circuit-ciso-assistant). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-ciso-assistant/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-ciso-assistant/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-ciso-assistant/tree/v0.1.0/examples/local).
- Related circuits: [PostgreSQL](/circuits/postgres), [Caddy](/circuits/caddy), [Podman](/circuits/podman), [restic](/circuits/restic), [Baseline](/circuits/baseline), [Hardening](/circuits/hardening), [Firewall](/circuits/firewall), [fail2ban](/circuits/fail2ban), [Automatic updates](/circuits/auto-updates), [OpenSCAP](/circuits/openscap), [auditd](/circuits/auditd), [Trivy](/circuits/trivy), [ZAP](/circuits/zap).
