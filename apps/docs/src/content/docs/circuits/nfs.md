---
title: NFS
description: "Share folders over NFSv4 from the kernel NFS server, with each export checked by exportfs and v3 off unless you want it."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-nfs at v0.1.0. -->

A Conn3x circuit that shares folders from a Linux box over NFS, with the kernel's own NFS server and your distribution's packages. You list the paths and which clients may mount each one; the circuit installs the server, creates the folders, writes the exports, applies them with `exportfs`, and checks that every one made it into the kernel's table. It's the shared storage behind a homelab's media server and backups, or the home directories and build caches on a rack of Linux machines.

The server speaks NFSv4 only unless you ask for v3. That means one port, TCP 2049, and no rpcbind or mountd for clients to reach. On Rocky Linux and Fedora it works with SELinux enforcing as it comes: the distribution's policy already lets the NFS server export any folder.

## Usage

```hcl
module "nfs" {
  source = "github.com/conn3xorg/circuit-nfs?ref=v0.1.0"

  hosts                = { nas = "192.168.1.20" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  exports = {
    "/srv/nfs/media" = {
      clients = [
        { host = "192.168.1.30", options = ["rw", "sync", "no_subtree_check"] },
        { host = "192.168.1.0/24", options = ["ro"] },
      ]
      owner = "nobody"
    }
    "/srv/nfs/backups" = {
      clients = [{ host = "backup.lan", options = ["rw", "no_root_squash"] }]
      mode    = "0700"
    }
  }
}
```

```sh
conn3x init
conn3x apply
```

A second `conn3x plan` says `No changes.` The media server at 192.168.1.30 can now read and write `/srv/nfs/media`, everything else on the LAN can read it, and only `backup.lan` can mount `/srv/nfs/backups`.

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-nfs/tree/v0.1.0/examples/local).

### Mounting from a client

Conn3x's `mount` step does the client side: it writes the `/etc/fstab` entry and mounts it, so the share comes back after a reboot. The client needs the NFS tools, `nfs-common` on Debian and Ubuntu or `nfs-utils` on the Red Hat family. A circuit for an Ubuntu client looks like this:

```hcl
circuit "media_client" {
  hosts = { player = "192.168.1.30" }

  ssh {
    user = "root"
  }

  step "nfs_client" {
    package {
      name = "nfs-common"
    }
  }

  step "media" {
    mount {
      path   = "/mnt/media"
      src    = "192.168.1.20:/srv/nfs/media"
      fstype = "nfs4"
      opts   = "rw,_netdev"
    }
    depends_on = [module.nfs]
  }
}
```

`_netdev` tells systemd to wait for the network before mounting at boot. With `fstype = "nfs4"` the client never tries v3, so it works against the default v4-only server.

### Clients and options

Each export takes a list of clients, and each client a `host` and its `options`, which go into the exports file as they are, as `host(option,option)`. `host` can be an address, a network such as `192.168.1.0/24`, a host name, a wildcard such as `*.lan`, `*` for anyone, or `@netgroup`. The options are the ones in [exports(5)](https://man7.org/linux/man-pages/man5/exports.5.html). When you leave them out, a client gets `["ro"]`, as NFS itself would.

A few worth knowing:

- `rw` lets the client write. Without it the export is read-only.
- `root_squash`, which is on unless you say `no_root_squash`, maps the client's root user to `nobody`. That's why the examples give the folder `owner = "nobody"`: it lets root on the client write without trusting it with root on the server. Other users map by UID, so a user on the client writes as the account with the same UID on the server.
- `all_squash` with `anonuid` and `anongid` maps everyone to one account, which suits a shared drop folder.
- `no_subtree_check` is the default in current nfs-utils, but spelling it out does no harm.

NFS with `sec=sys`, the default, trusts the client to say who its users are. Only list clients you'd trust with the files, and keep 2049 closed to everyone else.

### NFSv3

Set `nfs_v3 = true` when a client can't speak v4, such as an older appliance. Clients then need rpcbind on 111 and mountd as well as 2049, and mountd picks a port at random each time it starts unless you fix one in the `[mountd]` section of `/etc/nfs.conf`. Changing `nfs_v3` restarts the NFS server, and clients can stall for its grace period, 90 seconds by default, before they open files again.

### Hosts created in the same plan

Pass host objects with the host key you generated, and give each one's distribution in `os`, since Conn3x can't ask a host that doesn't exist yet which package to install. If `os` turns out not to match the host, Conn3x stops before configuring it. Set `os` as well when you put `depends_on` on this module.

```hcl
hosts = {
  for name, d in digitalocean_droplet.nas : name => {
    address  = d.ipv4_address
    host_key = tls_private_key.host[name].public_key_openssh
    os       = "rocky"
  }
}
```

## What it does

On each host, in order:

1. Installs `nfs-kernel-server` on Debian and Ubuntu, or `nfs-utils` on Rocky Linux, AlmaLinux, RHEL and Fedora.
2. Writes `/etc/nfs.conf.d/conn3x.conf` with `vers3 = n` in its `[nfsd]` section, or `y` when `nfs_v3` is on. `/etc/nfs.conf` stays as the package shipped it.
3. Creates each export's folder with its `owner`, `group` and `mode`.
4. Writes `/etc/exports.d/conn3x.exports`, one line per export. Anything you already have in `/etc/exports` keeps working alongside it.
5. Restarts `nfs-server` on a host's first apply and when `nfs_v3` changes, since that's the only time the kernel server reads which versions to serve. Starts it now and at boot.
6. Runs `exportfs -ra` when the exports change, which adds, updates and drops exports without disturbing clients of the others. Any warning from `exportfs`, such as an option it doesn't know or a host name that doesn't resolve, fails the apply, and so does an export missing from `exportfs -s` afterwards.

### What it doesn't do

- It doesn't open the firewall. Allow TCP 2049, only from the clients in your exports, with [circuit-firewall](/circuits/firewall) or your own rules. With `nfs_v3` on, clients also need TCP and UDP 111 and mountd's port.
- It doesn't stop rpcbind. The packages start it, and it listens on 111 even when the server is v4-only. Nothing here needs it then, so keep 111 closed, or mask it yourself with `systemctl mask --now rpcbind.service rpcbind.socket` if nothing else on the host uses RPC.
- It doesn't set up Kerberos (`sec=krb5`, `krb5i`, `krb5p`). You can put those in `options`, but the keytabs and `gssproxy` are up to you.
- It doesn't configure clients. Use a `mount` step, as above.
- Deleting an export takes it out of the exports file and the kernel's table but leaves the folder and its files.
- If `exportfs` rejects one line, the lines it accepted are still exported. Fix the mistake and apply again.

### SELinux

On Rocky Linux and Fedora with SELinux enforcing, the targeted policy turns on `nfs_export_all_rw` and `nfs_export_all_ro`, so the server can export a folder whatever its label. The circuit doesn't change either one. If you've turned them off, label each export path `nfs_t` or `public_content_rw_t` yourself.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"192.168.1.20"`, or a host object such as `{ address = "192.168.1.20", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file`, `jump_hosts` and `os`, the distribution's ID, such as `ubuntu` or `rocky`, which a host created in the same plan needs. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `exports` | map(object) | `{}` | Exports, by path. The path must be absolute, without spaces, and not a system folder such as `/etc` or `/home`. Each takes `clients`, a list of at least one `{ host, options }`, where `options` defaults to `["ro"]`, and the folder's `owner`, `group` and `mode` (default `"0755"`). |
| `nfs_v3` | bool | `false` | Serve NFSv3 as well as NFSv4. Changing it restarts the NFS server. |

## Outputs

| Name | Description |
| --- | --- |
| `exports_file` | Path of the file the circuit writes, `/etc/exports.d/conn3x.exports`. |
| `exports` | Exported paths, each mapped to its client hosts, such as `{ "/srv/nfs/media" = ["192.168.1.30", "192.168.1.0/24"] }`. |

## Requirements

Requires Conn3x v0.6.5 or later, systemd and a kernel with the NFS server (`nfsd`) on each host, with a package mirror the host can reach. The server comes from each distribution's own repositories; it needs an nfs-utils that reads `/etc/nfs.conf.d`, which all four distributions below ship.

An NFS server can't run in an unprivileged container, and it can't export a folder on overlayfs, which is what most container root file systems are. The local example works around both; a real host or VM needs neither.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13.

**CI** applies [examples/local](https://github.com/conn3xorg/circuit-nfs/tree/v0.1.0/examples/local) to each in a privileged container on amd64 and checks that the second plan has no changes. Two client containers on the same network then mount from it: the allowed client mounts `/srv/nfs/projects` over NFSv4.2 and writes a file, which shows on the server owned by `nobody`, and its NFSv3 mount is refused. The client that isn't on the list can't mount `/srv/nfs/projects`, and can mount the read-only `/srv/nfs/public` but not write to it. By hand, the same container runs also turned `nfs_v3` on (a v3 mount worked) and off again, and checked that an unknown option and a host name that doesn't resolve both fail the apply.

**Droplets** cover what containers can't: a real kernel, SELinux and reboots. An Ubuntu 24.04 server and a Rocky Linux 10 server with SELinux enforcing each exported `/srv/nfs/projects` to a third Ubuntu 24.04 droplet over the private network. That client mounted both with the `mount` step shown above and wrote to each; each server refused the other when it tried to mount, and both refused NFSv3. After rebooting all three, the plan had no changes, the client had both mounts back, NFSv3 was still off, and Rocky's audit log had no denials.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-nfs/blob/v0.1.0/LICENSE). nfs-utils itself is GPL-2.0.

## Source

- Repository: [conn3xorg/circuit-nfs](https://github.com/conn3xorg/circuit-nfs). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-nfs/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-nfs/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-nfs/tree/v0.1.0/examples/local).
- Related circuits: [Firewall](/circuits/firewall), [Samba](/circuits/samba), [restic](/circuits/restic).
