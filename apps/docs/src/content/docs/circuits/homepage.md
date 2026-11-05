---
title: Homepage
description: "The Homepage dashboard under Podman: one page for everything you run, its config checked before it lands."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-homepage at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/homepage/grade.svg)](https://conn3x.org/circuits/homepage/grade)

A Conn3x circuit that runs [Homepage](https://gethomepage.dev), the start page for a homelab or a small team's servers, on your own hosts. One page lists every service you run, with a dot that turns red when one stops answering, live numbers from the apps that have widgets (Proxmox, Pi-hole, Jellyfin and well over a hundred more), and your bookmarks.

You write Homepage's config in your Conn3x code, as HCL or as the YAML you already have, and the circuit checks each file with Homepage's own YAML parser before it replaces the one Homepage reads. A typo stops the apply instead of blanking the dashboard. API keys for the widgets go in as ephemeral values, to a root-only env file, so they're never in your plan or state.

Homepage runs from its official image under Podman as a systemd service, pinned by tag and digest, and listens on `127.0.0.1:3000` for a reverse proxy in front. It runs on Debian, Ubuntu, Fedora and Rocky Linux.

## Usage

```hcl
variable "proxmox_password" {
  type      = string
  ephemeral = true
  sensitive = true
}

module "homepage" {
  source = "github.com/conn3xorg/circuit-homepage?ref=v0.1.0"

  hosts                = { home = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  allowed_hosts = ["home.example.com"]

  settings = { title = "Home", theme = "dark", color = "slate" }

  services = [
    {
      Infrastructure = [
        {
          Proxmox = {
            href        = "https://192.168.1.10:8006"
            icon        = "proxmox.png"
            siteMonitor = "https://192.168.1.10:8006"
            widget = {
              type     = "proxmox"
              url      = "https://192.168.1.10:8006"
              username = "homepage@pve!dashboard"
              password = "{{HOMEPAGE_VAR_PROXMOX_PASSWORD}}"
            }
          }
        },
      ]
    },
  ]

  environment = { HOMEPAGE_VAR_PROXMOX_PASSWORD = var.proxmox_password }
}
```

Then run `conn3x init` and `conn3x apply` with the password in the environment:

```sh
export TF_VAR_proxmox_password='...'
conn3x apply
```

A second `conn3x plan` says `No changes.` Every plan needs the same `environment` values, since Conn3x checks the env file on the host against them.

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-homepage/tree/v0.1.0/examples/local).

### The config files

`settings`, `services`, `bookmarks` and `widgets` each become one of Homepage's files in `/var/lib/homepage/config`. Give each one either as HCL, which the circuit writes out as YAML, or as a string holding the file's YAML, which it writes as it is. A string suits a file you already have:

```hcl
services = file("${path.module}/homepage/services.yaml")
```

The HCL follows Homepage's own layout, a list of one-key maps where the YAML has `- Name:`, so its [documentation](https://gethomepage.dev/configs/services/) reads across directly. `settings` is a map; the other three are lists.

Before a file replaces the old one, the circuit runs it through the copy of js-yaml inside Homepage's image, with the schema Homepage loads it with, and checks it holds a list or a map as Homepage expects. If it doesn't, the apply stops with the parser's message, and the file on the host stays as it was. Any change to a file restarts Homepage.

The files the circuit doesn't write, such as `docker.yaml`, `kubernetes.yaml` and `custom.css`, are Homepage's own samples, which it copies in on its first start. Edit them on the host if you need them.

### Secrets in the config

Homepage swaps `{{HOMEPAGE_VAR_NAME}}` anywhere in its config for the environment variable `HOMEPAGE_VAR_NAME`. Pass those in `environment`: they reach `/etc/containers/env/homepage.env`, mode `0600`, written from an ephemeral value, so they never reach the plan or state. The config files themselves hold only the placeholder.

Put placeholders in widget settings, which Homepage uses on the server when it calls the app. One in a `description` or an `href` is filled in on the page, where anyone who can open Homepage can read it. The example in [examples/local](https://github.com/conn3xorg/circuit-homepage/tree/v0.1.0/examples/local) does exactly that, to show the substitution works, with a value that isn't secret.

### Behind a reverse proxy

Homepage answers only to the host names it's told about, and refuses any other `Host` header with a 400. The address it listens on is always allowed. Add the name people type to `allowed_hosts`, with the port if they type one. Then put a proxy in front, such as [circuit-caddy](/circuits/caddy):

```hcl
module "caddy" {
  source = "github.com/conn3xorg/circuit-caddy?ref=v0.3.0"

  hosts                = { home = "192.168.1.50" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  sites = {
    "home.example.com" = { reverse_proxy = ["127.0.0.1:3000"] }
  }
}
```

Anyone who reaches Homepage sees the dashboard, and the host check isn't a login. Upstream's [advice](https://gethomepage.dev/installation/#homepage_allowed_hosts) is to keep it behind a proxy or VPN that does the authentication.

## Why a container

Homepage ships as an image and as a Next.js app you build with pnpm. This circuit uses the image:

- **No build on your hosts.** The image carries the Node.js version and the built app, so no host needs Node.js or pnpm.
- **One pin, checked.** `homepage_version` and `image_digest` go into the unit together, and Podman pulls by the digest, so a tag that's re-pushed upstream can't change what your hosts run.
- **Upgrades are a diff.** Change both inputs and `conn3x plan` shows the new image in the unit file. The apply restarts Homepage on it and waits for it to listen again.

The container uses the host's network, so a `siteMonitor` or widget for `http://127.0.0.1:8080` reaches a service on the host itself, and `listen_address` is a real address on the host.

## What it does

On each host, in order:

1. Creates `/var/lib/homepage` and `/var/lib/homepage/config`, mode `0700`, owned by root. The image runs as root, so nobody else on the host needs to get in.
2. Through [circuit-podman](/circuits/podman) v0.1.0, installs Podman and runs `ghcr.io/gethomepage/homepage:VERSION@DIGEST` as `homepage.service`: a Quadlet unit on the host network that mounts the config directory as `/app/config` and sets `HOSTNAME`, `PORT` and `HOMEPAGE_ALLOWED_HOSTS` from the inputs. `environment` goes to `/etc/containers/env/homepage.env`, mode `0600`.
3. Checks and writes `settings.yaml`, `services.yaml`, `bookmarks.yaml` and `widgets.yaml`, each mode `0600`.
4. When a file, the image, the address, the port or `allowed_hosts` changed, restarts Homepage and waits up to 15 minutes for it to listen. A first start pulls the image, 80 MB compressed on amd64.

### What it doesn't do

- It doesn't give Homepage the Docker or Podman socket, which its container discovery needs. The socket is root on the host.
- It doesn't set up TLS, a reverse proxy, a login or a firewall rule.
- It doesn't manage `docker.yaml`, `kubernetes.yaml`, `proxmox.yaml`, `custom.css` or `custom.js`, or the `icons` and `images` folders.
- A change to `environment` alone doesn't wait for Homepage to come back up. circuit-podman restarts it, and the apply can finish a second or two before it's listening again.
- Deleting the module leaves Podman, the container and `/var/lib/homepage` in place.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"192.168.1.50"`, or a host object such as `{ address = "192.168.1.50", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `settings` | any | `{ title = "Homepage" }` | [`settings.yaml`](https://gethomepage.dev/configs/settings/), as a map or a YAML string. |
| `services` | any | `[]` | [`services.yaml`](https://gethomepage.dev/configs/services/), as a list of groups or a YAML string. |
| `bookmarks` | any | `[]` | [`bookmarks.yaml`](https://gethomepage.dev/configs/bookmarks/), as a list of groups or a YAML string. |
| `widgets` | any | resources and search | [`widgets.yaml`](https://gethomepage.dev/widgets/), as a list or a YAML string. The default is Homepage's own sample: CPU, memory and disk, and a DuckDuckGo search box. |
| `environment` | map(string), sensitive, ephemeral | `{}` | More environment variables for Homepage, such as `HOMEPAGE_VAR_PROXMOX_PASSWORD`. Ephemeral and sensitive: they go to a root-only env file and never the plan or state. `HOSTNAME`, `PORT`, `HOMEPAGE_ALLOWED_HOSTS` and `HOMEPAGE_CONFIG_DIR` aren't allowed. |
| `allowed_hosts` | list(string) | `[]` | Host names Homepage answers to, with a port where people type one, such as `["home.example.com"]`. The listen address and port are always allowed. `"*"` isn't accepted. |
| `homepage_version` | string | `"v2.7.0"` | Tag of Homepage's image. Change `image_digest` with it. |
| `image_digest` | string | `"sha256:19c5c091..."` | Digest of the image for `homepage_version`, the multi-architecture index. Podman pulls by the digest. Find it with `skopeo inspect docker://ghcr.io/gethomepage/homepage:TAG`. |
| `image_repository` | string | `"ghcr.io/gethomepage/homepage"` | Where to pull the image from. |
| `listen_address` | string | `"127.0.0.1"` | Address Homepage listens on. `"0.0.0.0"` listens on every address. |
| `port` | number | `3000` | Port Homepage listens on. |

## Outputs

| Name | Description |
| --- | --- |
| `service` | The systemd service that runs Homepage, `homepage.service`. |
| `image` | The image the hosts run, with its tag and digest. |
| `url` | Where Homepage answers on the host itself, such as `http://127.0.0.1:3000`. Point a reverse proxy here. |
| `config_dir` | `/var/lib/homepage/config`, where the config files are. |

## Requirements

Requires Conn3x v0.7.0 or later, for the check before each file is replaced, and systemd on each host. The image is built for amd64 and arm64. Each host needs to reach its package mirror and `ghcr.io`. `conn3x init` fetches circuit-podman from GitHub.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13, in local containers from Conn3x's test images on arm64. CI does the same on amd64. Each applies [examples/local](https://github.com/conn3xorg/circuit-homepage/tree/v0.1.0/examples/local) with Homepage v2.6.0 and plans again with no changes. [`check.mjs`](https://github.com/conn3xorg/circuit-homepage/blob/v0.1.0/examples/local/check.mjs) then loads the dashboard, checks a request with another `Host` header gets a 400, reads the services back from `/api/services` with the placeholder filled in from the env file, reads the bookmark given as YAML from `/api/bookmarks`, and has Homepage check two sites: itself, which has to answer 200, and a closed port, which mustn't. Then the upgrade to v2.7.0, a clean plan and the same check. The env file's value isn't in `terraform.tfstate` or under `.terraform`. A `services` that isn't a list stops the apply with the circuit's message, and the file on the host keeps its old content. Then the host container restarts, which boots systemd again, and the same check passes and the plan is clean.

By hand, on two DigitalOcean droplets with 1 GB of memory, on amd64: Ubuntu 24.04, and Rocky Linux 10 with SELinux enforcing. Each ran this circuit alongside circuit-homepage and circuit-dockge. On each, the second plan was clean and the same check passed; port 3000 didn't answer from outside; after a reboot Homepage came back on its own, the check passed again and the plan was clean. Neither droplet had an out-of-memory kill, with about 250 MiB still available with all three running, and Rocky's audit log had no SELinux denials.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-homepage/blob/v0.1.0/LICENSE). Homepage itself is under the GNU General Public License v3.0.

## Source

- Repository: [conn3xorg/circuit-homepage](https://github.com/conn3xorg/circuit-homepage). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-homepage/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-homepage/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-homepage/tree/v0.1.0/examples/local).
- Related circuits: [Caddy](/circuits/caddy), [Podman](/circuits/podman), [Proxmox VE](/circuits/proxmox), [Forgejo](/circuits/forgejo), [GitLab CE](/circuits/gitlab), [Cockpit](/circuits/cockpit), [n8n](/circuits/n8n), [Fleet](/circuits/fleet), [Home Assistant](/circuits/homeassistant), [Kestra](/circuits/kestra), [Lempa homelab](/circuits/lempa-homelab).
