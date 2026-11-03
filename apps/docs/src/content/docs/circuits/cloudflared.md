---
title: Cloudflare Tunnel
description: "Run a Cloudflare Tunnel from a pinned, checksummed cloudflared under systemd, with the token kept out of plan and state."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-cloudflared at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/cloudflared/grade.svg)](https://conn3x.org/circuits/cloudflared/grade)

A Conn3x circuit that installs [cloudflared](https://github.com/cloudflare/cloudflared) at a pinned version, checks its SHA-256, and runs your Cloudflare Tunnel as a systemd service. It's the way to put a box behind Cloudflare with no inbound port open: a NAS behind carrier-grade NAT, a homelab, or a fleet of VPS hosts running replicas of one tunnel.

Your tunnel token is passed in through an ephemeral variable. It lands in one file on the host, readable only by the service and root, and never in the plan, state or the systemd unit.

## Usage

```hcl
module "cloudflared" {
  source = "github.com/conn3xorg/circuit-cloudflared?ref=v0.1.0"

  hosts                = { nas = "192.168.1.20" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  tunnel_token = var.tunnel_token
}

variable "tunnel_token" {
  type      = string
  ephemeral = true
}
```

Create the tunnel in the Cloudflare dashboard under **Networking > Tunnels**, or through the API, and copy its token. Pass it at run time with `TF_VAR_tunnel_token` or `-var tunnel_token=...`. The tunnel's public hostnames and routes live on Cloudflare's side, so this circuit doesn't take any.

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

Every plan and apply needs the token, because Conn3x compares it with what's on the host. Keep it wherever you keep your other secrets, and pass it each time. To rotate it, pass the new one: the plan shows the file changing, by hash, and the apply writes it and restarts the service.

Point several hosts at the same token and they run as replicas of one tunnel.

### Trying it without an account

Set `quick_tunnel_url` instead of `tunnel_token`, and the service runs a [Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/):

```hcl
module "cloudflared" {
  source = "github.com/conn3xorg/circuit-cloudflared?ref=v0.1.0"

  hosts            = { box = "203.0.113.10" }
  quick_tunnel_url = "http://localhost:8080"
}
```

Find the address it was given with `journalctl -u cloudflared | grep trycloudflare.com`. It changes every time the service restarts, and anyone who has it can reach your service. Cloudflare offers Quick Tunnels for testing and development, with no uptime guarantee, so don't serve anything real this way. They're rate limited too: while testing this circuit, a few dozen in an hour from one address got `429` responses, and the apply failed until the limit passed.

For hosts created in the same plan, pass host objects with the host key you generated, so Conn3x checks it without a known_hosts entry:

```hcl
hosts = {
  for name, d in digitalocean_droplet.app : name => {
    address  = d.ipv4_address
    host_key = tls_private_key.host[name].public_key_openssh
  }
}
```

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-cloudflared/tree/v0.1.0/examples/local).

### Upgrading

Cloudflare supports releases for a year, so upgrade at least that often. Set `cloudflared_version` and `checksums` together; the checksums are in the [release's notes](https://github.com/cloudflare/cloudflared/releases). The service restarts on the new binary. With replicas, that happens on all the hosts in the same apply, so run a host at a time if you can't take the gap.

## What it does

On each host, in order:

1. Installs `curl` and `ca-certificates`, and creates a `cloudflared` system user with no login shell.
2. Downloads `cloudflared-linux-amd64` or `cloudflared-linux-arm64` from the GitHub release to `/opt/cloudflared/<version>/cloudflared`. The file is kept only if its SHA-256 matches `checksums`, and a mismatch fails the apply. `/usr/local/bin/cloudflared` links to it.
3. Unless `quick_tunnel_url` is set, writes `tunnel_token` to `/etc/cloudflared/token`, owned by `cloudflared`, mode `0600`, in a directory of the same owner, mode `0700`.
4. Writes `/etc/systemd/system/cloudflared.service`, which runs `cloudflared --no-autoupdate tunnel run --token-file /etc/cloudflared/token` as the `cloudflared` user, or `tunnel --url ...` for a Quick Tunnel.
5. Starts the service now and at boot, and restarts it when the unit or the token changes.

The unit is close to the one `cloudflared service install` writes. The difference is that it runs as its own user with a read-only view of the system, instead of as root. The service only counts as started once the tunnel has a connection to Cloudflare, so a bad token or a blocked network fails the apply within a minute rather than leaving a service that looks fine.

Before the circuit runs, the `conn3x_host` data source reads each host's architecture over SSH, which picks the binary. The binary is static, so the distribution makes no difference to it.

### What it doesn't do

- **It doesn't create tunnels, public hostnames or DNS records.** Those are in your Cloudflare account. This circuit has no Cloudflare API token and doesn't want one.
- **It doesn't update cloudflared by itself.** `--no-autoupdate` holds it at the version you pinned, and there is no update timer.
- **It doesn't run locally managed tunnels**, the kind with a `config.yml` and a credentials file. Use a token from a remotely managed tunnel.
- **It doesn't open the ping path.** Running without root, cloudflared logs a warning that it can't proxy ICMP unless the `cloudflared` group is in `net.ipv4.ping_group_range`. That only matters for ping through WARP routing. The same goes for origins on root-only unix sockets.
- **Deleting the module leaves everything on the host**, the token included: run `systemctl disable --now cloudflared` and remove `/etc/cloudflared` yourself. Moving to `quick_tunnel_url` does delete the token. Old releases stay in `/opt/cloudflared` after an upgrade.
- **It doesn't touch the host firewall.** The tunnel only makes outbound connections, on port 7844.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `cloudflared_version` | string | `"2026.10.6"` | Release to install. Change `checksums` with it. |
| `checksums` | map(string) | The default version's | SHA-256 of the release binary, by architecture: `amd64` and `arm64`. |
| `tunnel_token` | string, sensitive, ephemeral | `null` | Token of the tunnel to run. Ephemeral and sensitive. Required on every plan and apply, unless `quick_tunnel_url` is set. |
| `quick_tunnel_url` | string | `null` | Local URL to serve through a temporary Quick Tunnel, such as `"http://localhost:8080"`. For testing only. Takes the place of `tunnel_token`. |
| `extra_args` | list(string) | `[]` | More flags for `cloudflared tunnel`, such as `["--protocol=http2"]`. One flag per item, no spaces or quotes. Can't set a token, `--url` or `--hello-world`. |

`quick_tunnel_url` is what picks the mode, not `tunnel_token`, because OpenTofu won't let a step's count depend on an ephemeral value.

## Outputs

| Name | Description |
| --- | --- |
| `binary` | Path of the cloudflared command on each host, `/usr/local/bin/cloudflared`. |

## Requirements

Requires Conn3x v0.6.9 or later and systemd on each host, on amd64 or arm64, with outbound HTTPS to github.com, and outbound port 7844 to Cloudflare's network. A Quick Tunnel also needs to reach api.trycloudflare.com.

## Tested on

With a real tunnel and token, on an Ubuntu 24.04 droplet: the apply finished, the second plan had no changes, the service ran and registered its connections with Cloudflare, and after a reboot it came back active with a plan that had no changes. The token wasn't in state, the plan or the apply output. That run had no public hostname, so serving traffic through a named tunnel, and running replicas, haven't been tried. The Quick Tunnel checks below do fetch a page through Cloudflare.

Also run, on Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13: CI applies [examples/local](https://github.com/conn3xorg/circuit-cloudflared/tree/v0.1.0/examples/local) to each on amd64 with a Quick Tunnel, checks that the second plan has no changes and the service runs as the `cloudflared` user, and fetches a page from an origin on the host through the trycloudflare.com address. When Cloudflare refuses a Quick Tunnel, those checks are skipped with a warning. The CI containers run with SELinux off.

CI then applies a made-up token, which Cloudflare's edge turns down with `Failed to get tunnel`. That shows the token reaches `cloudflared` from the file, and that a tunnel that can't connect fails the apply. The check confirms the token is in the file, owned by `cloudflared` with mode `0600`, and isn't in state, the plan, the apply output, the unit or the process list.

By hand, the Quick Tunnel run passed on an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, where cloudflared ran as `unconfined_service_t` and the audit log had no denials. The made-up token failed the same way there, and stayed out of state and the apply output. On both, the service came back after a reboot, carried traffic again on its new address, and the plan had no changes. Going back to the Quick Tunnel deleted the token file and left the next plan empty, on those droplets and in the four containers. A wrong checksum failed the apply and left no binary behind, and moving from 2026.10.5 to 2026.10.6 restarted the service on the new binary. arm64 hasn't been run.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-cloudflared/blob/v0.1.0/LICENSE). cloudflared itself is Apache-2.0.

## Source

- Repository: [conn3xorg/circuit-cloudflared](https://github.com/conn3xorg/circuit-cloudflared). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-cloudflared/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-cloudflared/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-cloudflared/tree/v0.1.0/examples/local).
- Related circuits: [WireGuard](/circuits/wireguard), [Tailscale](/circuits/tailscale), [keepalived](/circuits/keepalived).
