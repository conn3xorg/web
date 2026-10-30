---
title: Proxmox VE
description: "Turns a Debian 13 host into a Proxmox VE 9 node, following Proxmox's own install guide, reboot included."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-proxmox at v0.1.0. -->

A Conn3x circuit that turns a plain Debian 13 (trixie) box into a Proxmox VE 9 node. It follows Proxmox's own [Install Proxmox VE on Debian 13 Trixie](https://pve.proxmox.com/wiki/Install_Proxmox_VE_on_Debian_13_Trixie) guide step by step, reboot included, so you end up where the ISO installer would have left you, on a machine the ISO can't reach: a rented server, a cloud VM, or a box you'd rather partition yourself.

Doing it by hand is an afternoon of copying commands out of the wiki and answering the postfix and GRUB prompts halfway through. The circuit answers them for you, and it picks up where it left off if a run is interrupted.

## Usage

```hcl
module "proxmox" {
  source = "github.com/conn3xorg/circuit-proxmox?ref=v0.1.0"

  hosts                = { pve1 = "203.0.113.10" }
  ssh_private_key_file = "~/.ssh/id_ed25519"
  domain               = "lab.example.com"
}
```

Run `conn3x init` and `conn3x apply`. On a 2-CPU, 4 GB cloud host the first apply took about nine minutes, one reboot included. A second `conn3x plan` says `No changes.` Then open `https://203.0.113.10:8006` and log in as `root` in the `Linux PAM` realm, with root's password.

The key in `hosts`, `pve1` here, becomes the node's name. Pick it with care: Proxmox doesn't take kindly to renaming a node once it holds guests or sits in a cluster. Set `hostname` in a host object to use a different name from the key.

The web interface listens on port 8006 of every address the host has. On a host with a public address, put a firewall in front of it, or reach it over a VPN such as [circuit-tailscale](/circuits/tailscale).

### Which address the name resolves to

Proxmox needs the node's name to resolve to an address other hosts can reach it on, not a loopback one. The circuit writes that into `/etc/hosts`, and by default takes the address from the host's default route, which on most servers is the one you'd expect. When it isn't, such as on a host with several networks where Proxmox should use the private one, set `node_ip` in the host object:

```hcl
hosts = {
  pve1 = { address = "203.0.113.10", node_ip = "10.0.0.11" }
}
```

### Hosts created in the same plan

Pass host objects with the host key you generated, so Conn3x checks it without a known_hosts entry:

```hcl
hosts = {
  pve1 = {
    address  = digitalocean_droplet.pve.ipv4_address
    host_key = tls_private_key.host.public_key_openssh
  }
}
```

### Then manage guests with OpenTofu

Once the node is up, OpenTofu's [bpg/proxmox](https://registry.opentofu.org/providers/bpg/proxmox) provider can create containers and VMs on it through the API. [examples/lxc](https://github.com/conn3xorg/circuit-proxmox/tree/v0.1.0/examples/lxc) does that: it adds a storage directory, fetches the Debian 13 container template and starts one container. It needs an API token, which you can make on the node:

```sh
ssh root@203.0.113.10 pveum user token add root@pam tofu --privsep 0
```

## What it does

On each host, in order:

1. Checks the host is x86_64 Debian 13, and stops before changing anything if it isn't.
2. Sets the hostname to the node's short name. In `/etc/hosts`, removes the `127.0.1.1` line Debian adds and maps the name, and with `domain` the full name too, to the node's address. On cloud images, it also writes `/etc/cloud/cloud.cfg.d/99-conn3x-proxmox.cfg` so cloud-init stops putting the old name and `/etc/hosts` back at boot.
3. Downloads Proxmox's archive keyring to `/usr/share/keyrings/proxmox-archive-keyring.gpg` and checks it against the SHA-256 the wiki publishes. Writes `/etc/apt/sources.list.d/pve-install-repo.sources` for the no-subscription repository, and `pve-enterprise.sources` with the enterprise repository on or off to match `repository`.
4. Runs `apt-get update` and `apt-get full-upgrade`, since Proxmox replaces some Debian packages, such as GRUB and AppArmor, with its own builds.
5. Installs `proxmox-default-kernel`, then reboots into it and waits for the host to come back. On a BIOS host it first tells the `grub-pc` package which disk to install to, the one holding `/boot`; cloud images boot GRUB without that package, and its install stops to ask otherwise.
6. Installs `proxmox-ve`, `postfix`, `open-iscsi` and `chrony`. postfix is set up as `Local only`, so it listens on loopback and nothing else. chrony replaces `systemd-timesyncd`, as Proxmox recommends.
7. Removes Debian's kernel, every installed `linux-image-*` package, and runs `update-grub`. It checks first that the host is running a Proxmox kernel, and fails rather than remove the one it's running.
8. Removes `os-prober`, which would otherwise add your guests' disks to the boot menu.
9. Makes sure `pveproxy` runs and is enabled, and waits for port 8006.

The reboot happens once, the first time the circuit is applied to a host. It doesn't happen again on later applies. A host that already runs Proxmox VE still reboots that first time.

### Repositories

`repository` defaults to `pve-no-subscription`, Proxmox's free repository, which gets updates a little before the enterprise one. On it the circuit leaves the enterprise repository off with `Enabled: no`; without a subscription it answers `401 Unauthorized`, and `apt update` fails on every run.

Set `repository = "pve-enterprise"` if you have a subscription. The enterprise repository only lets a node in once that node's subscription key is uploaded, so on a fresh host the first apply fails at `apt-get update`. Install with `pve-no-subscription`, upload the key in the web interface or with `pvesubscription set`, then switch to `pve-enterprise` and apply again. The circuit then turns the enterprise repository on and deletes `pve-install-repo.sources`.

Changing `repository` runs `apt-get full-upgrade` again.

### What it doesn't do

- It doesn't touch the network configuration. Proxmox's guide has you create a Linux bridge, `vmbr0`, to put guests on your network, and that means moving the host's own address from its network interface to the bridge. Doing that over the SSH connection that's configuring it can cut the host off, so it's left to you. Use **System > Network** in the web interface, which checks and applies the change in one go, or follow [Default configuration using a bridge](https://pve.proxmox.com/wiki/Network_Configuration#_default_configuration_using_a_bridge). A container without a network, like the one in [examples/lxc](https://github.com/conn3xorg/circuit-proxmox/tree/v0.1.0/examples/lxc), works without it.
- It doesn't hide the "No valid subscription" message the web interface shows on login. That takes patching Proxmox's JavaScript, which an update puts back.
- It doesn't set a root password. You log in to the web interface with root's existing password, so set one with `passwd` if your host only takes SSH keys.
- It doesn't create clusters, storage, users or guests. Use the web interface, `pvecm`, or the bpg/proxmox provider, as in [examples/lxc](https://github.com/conn3xorg/circuit-proxmox/tree/v0.1.0/examples/lxc).
- It doesn't keep the node up to date after the first install. Run `apt full-upgrade` yourself, or use [circuit-auto-updates](/circuits/auto-updates).
- Deleting the module leaves Proxmox VE installed as it is.

Only Debian 13 is supported. Proxmox VE 9 is built on trixie, and Proxmox publishes packages for nothing else. Ubuntu, Rocky Linux and Fedora can't run it, and on those the circuit stops before changing anything.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to turn into Proxmox VE nodes, by node name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file`, `jump_hosts`, `hostname`, the node's name when it differs from the key, and `node_ip`, the IPv4 address its name resolves to. A node's name is a single DNS label, such as `pve1`. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `domain` | string | `null` | DNS domain for the nodes, such as `"lab.example.com"`. When set, `/etc/hosts` maps `pve1.lab.example.com` as well as `pve1`, and `hostname --fqdn` returns the full name. |
| `repository` | string | `"pve-no-subscription"` | Package repository: `pve-no-subscription`, or `pve-enterprise`, which needs a subscription key on each node. |

## Outputs

| Name | Description |
| --- | --- |
| `web_urls` | Address of each node's web interface, by host name, such as `{ pve1 = "https://203.0.113.10:8006" }`. |

## Requirements

Requires Conn3x v0.6.5 or later, and on each host x86_64 Debian 13 with root access and a way to reach `download.proxmox.com` and `enterprise.proxmox.com`. Proxmox asks for at least 2 GB of memory, more for guests. Secure Boot must be off, and Proxmox doesn't support installing on top of Debian with the experimental systemd-boot setup.

## Tested on

Debian 13 only, by hand, on two DigitalOcean droplets with 2 CPUs and 4 GB of memory. CI only validates the configuration: this circuit installs a kernel and reboots into it, and the containers the other circuits test in share the runner's kernel and can't reboot.

On each fresh droplet a single apply installed Proxmox VE 9.2 (`pveversion` printed `pve-manager/9.2.24`), `uname -r` ended in `-pve`, `pveproxy` was active, `https://127.0.0.1:8006` answered 200 on the host (and, on the first droplet, from outside), and the node showed as online in `pvesh get /nodes`. The second plan had no changes. After a reboot the same checks passed and the plan still had no changes. One droplet used the defaults, the other `domain` and a `hostname` different from the key, where `hostname --fqdn` and `hostname --ip-address` gave the full name and the public address. On both, `apt-get update` ran without errors, Debian's kernel and `os-prober` were gone, and postfix listened on loopback only.

[examples/lxc](https://github.com/conn3xorg/circuit-proxmox/tree/v0.1.0/examples/lxc) was applied to the first node afterwards: it created the storage, downloaded the template and started a Debian 13 container, and its second plan had no changes.

`pve-enterprise`, and switching to it, weren't tried, since they need a subscription key.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-proxmox/blob/v0.1.0/LICENSE). Proxmox VE itself is AGPL-3.0.

## Source

- Repository: [conn3xorg/circuit-proxmox](https://github.com/conn3xorg/circuit-proxmox). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-proxmox/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-proxmox/tags) list every release.
- Examples: [examples/lxc](https://github.com/conn3xorg/circuit-proxmox/tree/v0.1.0/examples/lxc), [examples/single-node](https://github.com/conn3xorg/circuit-proxmox/tree/v0.1.0/examples/single-node).
- Related circuits: [Tailscale](/circuits/tailscale), [Automatic updates](/circuits/auto-updates), [Forgejo](/circuits/forgejo), [GitLab CE](/circuits/gitlab), [Cockpit](/circuits/cockpit), [n8n](/circuits/n8n), [Fleet](/circuits/fleet).
