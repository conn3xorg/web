---
title: Conn3x web UI
description: "Runs the Conn3x web UI from pinned, checksummed releases under a locked-down systemd unit, with its credentials key made on the host."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-conn3x-ui at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/conn3x-ui/grade.svg)](https://conn3x.org/circuits/conn3x-ui/grade)

A Conn3x circuit that installs [conn3x-ui](https://github.com/conn3xorg/conn3x-ui), the web UI for Conn3x, and keeps it running. It downloads pinned releases of `conn3x-ui` and of the `conn3x` it plans and applies with, checks each one's SHA-256 before using it, and runs the UI as its own `conn3x-ui` user under a locked-down systemd unit. The credentials key is made on the host and never appears in your plan or state.

## Usage

```hcl
module "conn3x_ui" {
  source = "github.com/conn3xorg/circuit-conn3x-ui?ref=v0.1.0"

  hosts                = { ops1 = "203.0.113.20" }
  ssh_private_key_file = "~/.ssh/id_ed25519"
}
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

The UI listens on `127.0.0.1:8080`. Reach it through an SSH tunnel to start with:

```sh
ssh -L 8080:127.0.0.1:8080 root@203.0.113.20
```

Open <http://127.0.0.1:8080> and sign in as `admin`. The UI prints that account's password to its log once, on its first start:

```sh
journalctl -u conn3x-ui | grep -i password
```

To serve it to your team, put a TLS proxy in front, such as [circuit-caddy](/circuits/caddy), and keep the UI on loopback. Off localhost, the session cookie needs https, so plain http to another machine won't sign anyone in.

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-conn3x-ui/tree/v0.1.0/examples/local).

## Before you run it for others

Read the UI's [trust model](https://github.com/conn3xorg/conn3x-ui#trust-model). In short: every run executes a project's circuit on this host, as the `conn3x-ui` user, which can read every project's credentials. Anyone who can push to a project's repository can run commands here. Give this host to the UI alone, and push access only to people you'd trust with it.

## What it does

On each host, in order:

1. Installs `curl`, `tar`, `gzip`, `git` and the ssh client if they're missing. The UI clones each project's repository for every run.
2. Creates the `conn3x-ui` system user, with home `/var/lib/conn3x-ui` and no login shell.
3. Makes `/var/lib/conn3x-ui` (`0700`, the UI's user only) for the database, saved plans and run credentials, and `/etc/conn3x-ui` (`0750`, root and the UI's group).
4. Downloads the `conn3x-ui` and `conn3x` release archives for the host's architecture into `/opt/conn3x-ui`. If a checksum doesn't match, the apply fails and nothing is unpacked.
5. Unpacks each into a directory of its own, such as `/opt/conn3x-ui/conn3x-ui-0.1.1/`.
6. Makes the credentials key, `/etc/conn3x-ui/key` (`0640`, root and the UI's group), from `/dev/urandom`, if there isn't one. It's made once and never replaced by the circuit.
7. Writes `/etc/systemd/system/conn3x-ui.service`, and restarts the UI when the file changes. A project's `conn3x` binary, the default, is the pinned release, through the unit's `PATH`.
8. Starts the UI now and at boot.

Before the circuit runs, the `conn3x_host` data source reads each host's architecture and family over SSH. `x86_64` maps to `amd64` and `aarch64` to `arm64`; other architectures fail the plan.

The unit sets `ProtectSystem=strict`, `ProtectHome=true`, `PrivateTmp=true` and `NoNewPrivileges=true`, and only `/var/lib/conn3x-ui` is writable.

### Back up two things, apart

`/var/lib/conn3x-ui` holds the database. `/etc/conn3x-ui/key` opens the credentials in it. Keep their backups apart: one without the other opens nothing. Lose the key and the saved credentials are gone; set them again in the UI.

To change the key, follow the UI's [key rotation](https://github.com/conn3xorg/conn3x-ui#run-it) steps on the host. The circuit leaves an existing key alone.

### Upgrading

Set a version and its checksums together, from the release's `checksums.txt`:

```hcl
module "conn3x_ui" {
  source = "github.com/conn3xorg/circuit-conn3x-ui?ref=v0.1.0"

  hosts             = { ops1 = "203.0.113.20" }
  conn3x_ui_version = "0.1.1"
  conn3x_ui_checksums = {
    amd64 = "7ee009393cfcf5563a05d25b895abfae42c2ee1694e0192a1664658f6f75a2e1"
    arm64 = "80fe1d46dbdc4240ccdc5d4f5ac82ae9cc5670b95058f2824525d34fd393f7d4"
  }
}
```

`conn3x_version` and `conn3x_checksums` work the same way. The new release unpacks beside the old one, the unit file points at it, and the handler restarts the UI. The old directory stays until you remove it.

### Single sign-on

Pass the UI's `-oidc-*` flags in `extra_args`, with the client secret in a file on the host rather than in the circuit:

```hcl
  extra_args = [
    "-oidc-issuer", "https://login.example.com/realms/ops",
    "-oidc-client-id", "conn3x-ui",
    "-oidc-client-secret-file", "/etc/conn3x-ui/oidc-secret",
    "-oidc-redirect-url", "https://conn3x.example.com/login/oidc/callback",
  ]
```

Put the secret in `/etc/conn3x-ui/oidc-secret`, readable by the `conn3x-ui` group, with a `file` step whose content comes from a write-only source, or by hand. See the UI's [single sign-on](https://github.com/conn3xorg/conn3x-ui#single-sign-on-with-oidc) section for the provider side.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.20"`, or a host object such as `{ address = "203.0.113.20", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `conn3x_ui_version` | string | `"0.1.1"` | conn3x-ui release to install, without the leading `v`. |
| `conn3x_ui_checksums` | map(string) | The 0.1.1 checksums | SHA-256 of the conn3x-ui archive for `amd64` and `arm64`. |
| `conn3x_version` | string | `"0.21.0"` | Conn3x release the UI runs, without the leading `v`. A project can name another binary. |
| `conn3x_checksums` | map(string) | The 0.21.0 checksums | SHA-256 of the conn3x archive for `amd64` and `arm64`. |
| `listen` | string | `"127.0.0.1:8080"` | Address the UI listens on. Keep it on loopback behind a TLS proxy. |
| `extra_args` | list(string) | `[]` | More flags for `conn3x-ui serve`, such as the `-oidc-*` ones. Each one is passed as a single argument, as written. |

## Outputs

| Name | Description |
| --- | --- |
| `urls` | Each host's UI address as it listens, by host name. |
| `admin_password_hint` | The command that finds the first admin password in the UI's log. |

## Requirements

Requires Conn3x v0.21.0 or later, systemd on each host, and outbound HTTPS to github.com.

## Tested on

CI applies [examples/local](https://github.com/conn3xorg/circuit-conn3x-ui/tree/v0.1.0/examples/local) to Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13 on amd64. It checks that the second plan has no changes, that the sign-in page answers from outside the host, that the first admin password is in the log, that the key is `0640`, and that the UI's user runs the pinned `conn3x`. Then it restarts the UI and checks the sign-in page again.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-conn3x-ui/blob/v0.1.0/LICENSE). conn3x-ui and Conn3x are MPL-2.0 too.

## Source

- Repository: [conn3xorg/circuit-conn3x-ui](https://github.com/conn3xorg/circuit-conn3x-ui). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-conn3x-ui/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-conn3x-ui/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-conn3x-ui/tree/v0.1.0/examples/local).
- Related circuits: [Caddy](/circuits/caddy), [Proxmox VE](/circuits/proxmox), [Forgejo](/circuits/forgejo), [GitLab CE](/circuits/gitlab), [Cockpit](/circuits/cockpit), [n8n](/circuits/n8n), [Fleet](/circuits/fleet), [Homepage](/circuits/homepage), [Home Assistant](/circuits/homeassistant), [Kestra](/circuits/kestra), [Lempa homelab](/circuits/lempa-homelab), [Mini homelab](/circuits/mini-homelab).
