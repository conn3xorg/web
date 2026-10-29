---
title: Podman
description: "Installs Podman and runs your containers as systemd services through Quadlet, with secrets kept in a root-only file."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-podman at v0.1.0. -->

A Conn3x circuit that installs Podman from your distribution's own repositories and runs your containers as systemd services through Quadlet. There's no daemon and no Compose file: each container is a unit, so `systemctl status`, `journalctl -u` and boot ordering work the way they do for anything else on the box.

You describe each container in your configuration, with an image pinned to a tag or digest. A change shows up in `conn3x plan` as a diff of its unit file, and the apply restarts only the container that changed. Secrets go in a separate ephemeral input, which Conn3x writes to the host without putting it in state or the plan.

## Usage

```hcl
variable "grafana_password" {
  type      = string
  ephemeral = true
}

module "podman" {
  source = "github.com/conn3xorg/circuit-podman?ref=v0.1.0"

  hosts                = { apps = "192.168.1.30" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  containers = {
    whoami = {
      image       = "docker.io/traefik/whoami:v1.11"
      ports       = ["8080:80"]
      auto_update = true
    }
    grafana = {
      image       = "docker.io/grafana/grafana:12.2.1"
      ports       = ["3000:3000"]
      volumes     = ["grafana:/var/lib/grafana"]
      environment = { GF_USERS_ALLOW_SIGN_UP = "false" }
    }
  }
  secrets = {
    grafana = { GF_SECURITY_ADMIN_PASSWORD = var.grafana_password }
  }
  auto_update_timer = true
}
```

Then run `conn3x init` and `conn3x apply -var grafana_password=...`. A second `conn3x plan` says `No changes.`

For hosts created in the same plan, pass host objects with the host key you generated, so Conn3x checks it without a known_hosts entry:

```hcl
hosts = {
  for name, d in digitalocean_droplet.app : name => {
    address  = d.ipv4_address
    host_key = tls_private_key.host[name].public_key_openssh
  }
}
```

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-podman/tree/v0.1.0/examples/local).

## What it does

On each host, in order:

1. Installs the `podman` package from the distribution's repositories.
2. When `registries` is set, writes `/etc/containers/registries.conf.d/50-conn3x.conf` with `unqualified-search-registries`, so short names like `nginx:1.29-alpine` resolve against it. Emptying `registries` deletes the file again.
3. For each container, writes its secrets to `/etc/containers/env/NAME.env` with mode `0600`. A container without secrets gets an empty file.
4. Writes `/etc/containers/systemd/NAME.container`, a Quadlet unit with the image, ports, volumes, environment and any `extra` lines, plus `Restart=always` and `WantedBy=default.target`.
5. When a container's unit or env file changed, runs `systemctl daemon-reload` and restarts `NAME.service`. The first apply starts it.
6. Starts any container service that isn't running.
7. When `auto_update_timer` is true, starts and enables `podman-auto-update.timer`.

Quadlet turns each `.container` file into `NAME.service` when systemd reloads. Generated units can't be enabled with `systemctl enable`; the `[Install]` section is what starts them at boot.

Every container gets `ContainerName=NAME`, so `podman ps`, `podman logs NAME` and `podman exec NAME` use the name you gave it. Ports are published on all addresses unless you say otherwise, as in `"127.0.0.1:8080:80"`. Volumes take Podman's `-v` syntax: a named volume such as `grafana:/var/lib/grafana` is created on first start, but a host path such as `/srv/media:/media` must already exist. On Rocky Linux and Fedora, where SELinux enforces, a host path needs `:Z` (private to the container) or `:z` (shared), as in `/srv/media:/media:z`, or the container can't read it; CI doesn't test host-path volumes.

### Images and auto-update

Use fully qualified images, such as `docker.io/library/nginx:1.29-alpine`, and you won't need `registries` at all. Every image needs a tag or a digest. The plan fails on a bare `nginx` or `docker.io/library/nginx`, so an image never drifts as `:latest` without you choosing it.

With `auto_update = true`, the unit gets `AutoUpdate=registry`. Podman then checks the registry for a newer image under the same tag when `podman auto-update` runs, and restarts the container if it pulled one. That only makes sense with a moving tag such as `1.29-alpine`. Auto-update needs a fully qualified image, such as `docker.io/library/nginx:1.29-alpine`, so the plan fails on a short name with `auto_update`. Set `auto_update_timer = true` to have the timer run it daily, or run `podman auto-update` yourself.

### Secrets

`secrets` is ephemeral and sensitive: the values reach the host's env file but not the plan, state or the unit file. State only records an HMAC of the file, so a changed secret shows up as a changed `content_hmac` and restarts that container. Podman reads the file as `KEY=VALUE` lines, taking each value literally, so a value can't hold a newline. The plan fails on a secret for a name that isn't in `containers`, or on a variable name that isn't letters, digits and `_`.

### Removing a container

Deleting a container from `containers` leaves its unit file and service in place. Stop it and delete the file on the host first, then remove it from your configuration:

```sh
systemctl stop NAME
rm /etc/containers/systemd/NAME.container /etc/containers/env/NAME.env
systemctl daemon-reload
```

### What it doesn't do

- Rootless containers. Units go in `/etc/containers/systemd` and run as root.
- Pods, networks, volumes or builds as Quadlet units of their own. Add `Network=` or `Pod=` lines through `extra` and create those units yourself.
- Firewall ports. Podman adds its own forwarding rules for published ports. Use the [firewall circuit](/circuits/firewall) for the host's own rules.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `containers` | map(object) | `{}` | Containers to run, by name. Names use lowercase letters, digits, `.`, `-` and `_`. Each takes `image` (required, with a tag or digest), `ports` and `volumes` (lists of strings in Podman's `-p` and `-v` syntax), `environment` (map of strings), `extra` (list of extra lines for the `[Container]` section, such as `"Network=host"`) and `auto_update` (bool, default `false`). |
| `secrets` | map(map(string)), sensitive, ephemeral | `{}` | Ephemeral. Secret environment variables by container name, such as `{ grafana = { GF_SECURITY_ADMIN_PASSWORD = var.grafana_password } }`. |
| `registries` | list(string) | `[]` | Registries to search for short image names, in order, such as `["docker.io"]`. Give one: with two or more, Podman refuses short names under systemd, since it has no terminal to ask which one you meant. When empty, the distribution's setting stays. |
| `auto_update_timer` | bool | `false` | Start and enable `podman-auto-update.timer`. Setting it back to `false` leaves the timer as it is. |

## Outputs

| Name | Description |
| --- | --- |
| `services` | Each container's systemd service, such as `{ whoami = "whoami.service" }`. |

## Requirements

Requires Conn3x v0.6.5 or later and systemd on each host, with outbound HTTPS to your distribution's mirrors and to the registries your images come from. Quadlet ships with Podman 4.4 and later; the oldest Podman this was tested with is 4.9.3 on Ubuntu 24.04.

## Tested on

Rocky Linux 10 (Podman 5.8), Fedora 45 (Podman 6.1), Ubuntu 24.04 (Podman 4.9) and Debian 13 (Podman 5.4). CI applies [examples/local](https://github.com/conn3xorg/circuit-podman/tree/v0.1.0/examples/local) to each on amd64, checks that the second plan has no changes, and checks that the example container answers on its published port with the name from its env file.

The CI containers run with SELinux off. On a Rocky Linux 10 droplet with SELinux enforcing, the example was applied by hand alongside an nginx container serving a host directory mounted with `:Z`. Both answered, the second plan had no changes, and the audit log had no denials. Without `:Z`, the same directory was unreadable from inside the container.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-podman/blob/v0.1.0/LICENSE). Podman itself is Apache-2.0.

## Source

- Repository: [conn3xorg/circuit-podman](https://github.com/conn3xorg/circuit-podman). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-podman/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-podman/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-podman/tree/v0.1.0/examples/local).
- Related circuits: [Firewall](/circuits/firewall), [Docker](/circuits/docker), [k3s](/circuits/k3s), [kubeadm](/circuits/kubeadm), [MicroShift](/circuits/microshift).
