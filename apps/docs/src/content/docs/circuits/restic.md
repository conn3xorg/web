---
title: restic
description: "Scheduled, encrypted backups with restic to SFTP, S3, rest-server or a local path, with retention and repository checks."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-restic at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/restic/grade.svg)](https://conn3x.org/circuits/restic/grade)

A Conn3x circuit that backs up your hosts with [restic](https://restic.net) on a schedule. Point it at a repository, an SFTP server, a rest-server, an S3 bucket or a local disk, give it a password, and every host backs up the paths you name each night, keeps the snapshots your retention policy says, and prunes the rest.

restic comes from its GitHub release, checked against a pinned SHA-256, so Ubuntu, Debian, Rocky Linux and Fedora all run the same version, whatever their package repositories carry. A systemd timer runs the backup, with a random delay so a fleet on the same schedule doesn't hit the repository at the same minute, and the output goes to the journal.

The password and any backend credentials reach the host but never the plan or state.

## Usage

```hcl
variable "restic_password" {
  type      = string
  sensitive = true
  ephemeral = true
}

module "backups" {
  source = "github.com/conn3xorg/circuit-restic?ref=v0.1.0"

  hosts                = { web1 = "203.0.113.10", web2 = "203.0.113.11" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  repository = "sftp:backup@203.0.113.20:/srv/restic"
  password   = var.restic_password

  paths    = ["/etc", "/home", "/var/lib/app"]
  excludes = ["/home/*/.cache"]

  retention      = { keep_daily = 7, keep_weekly = 4, keep_monthly = 12 }
  check_schedule = "Sun *-*-* 04:00:00"
}
```

Then run `conn3x init` and `conn3x apply`, with the password in `TF_VAR_restic_password`. A second `conn3x plan` says `No changes.`

Every host in a module shares the repository. restic keeps each host's snapshots apart by host name, and shares the data they have in common, so one repository for a fleet is normal.

To see what you've got, or to get a file back, use `conn3x-restic` on the host. It's restic with the repository and password already set:

```sh
conn3x-restic snapshots
conn3x-restic restore latest --target /tmp/restore --include /etc/nginx
```

To back up now rather than wait for the timer:

```sh
systemctl start conn3x-restic-backup.service
journalctl -u conn3x-restic-backup.service
```

### Repositories

`repository` is passed to restic as it is, so anything restic takes works. Some backends need more than a location:

- **SFTP** (`sftp:user@host:/path`). restic runs `ssh` as root, so root on each host needs a key the server accepts, and the server's host key in `/root/.ssh/known_hosts`. The circuit installs the SSH client but doesn't set up the key; do that once with an `authorized_key` and a `file` step of your own, or by hand.
- **S3 and compatibles** (`s3:https://s3.example.com/bucket`). Pass the keys in `environment`:

  ```hcl
  environment = {
    AWS_ACCESS_KEY_ID     = var.s3_key_id
    AWS_SECRET_ACCESS_KEY = var.s3_secret
  }
  ```

- **rest-server** (`rest:https://backup.example.com:8000/`). Put the credentials in `environment` as `RESTIC_REST_USERNAME` and `RESTIC_REST_PASSWORD` rather than in the URL, which shows in the plan.
- **A local path**. It works, but a backup on the same disk goes when the disk does. It's fine for a mounted drive, and for trying the circuit.

## What it does

On each host, in order:

1. Checks `schedule` and `check_schedule` with `systemd-analyze calendar`, and stops the apply if systemd can't read them.
2. Installs `curl` and `bzip2`, and the SSH client for an `sftp:` repository.
3. Downloads `restic_VERSION_linux_ARCH.bz2` from the GitHub release into `/opt/restic/VERSION/`, and unpacks it there if its SHA-256 matches `checksums`. `/usr/local/bin/restic` links to it.
4. Writes `/etc/conn3x-restic/`, mode `0700`, with the `password`, an `environment` file of the backend credentials and an `excludes` file. The password and environment files are root-only and write-only: the plan and state hold only an HMAC of each.
5. Writes `/usr/local/sbin/conn3x-restic`, which reads the environment file and runs restic against the repository, and `/usr/local/sbin/conn3x-restic-backup`, which runs `restic backup` and then `restic forget --prune` with your retention policy.
6. Runs `restic init` unless `restic cat config` shows the repository is already there. It checks again whenever the password, the credentials or the repository change.
7. Creates the `conn3x-restic-backup` timer and service, with `RandomizedDelaySec` from `randomized_delay` and `Persistent=true`, so a run missed while the host was off happens at the next boot. With `check_schedule`, a `conn3x-restic-check` timer runs `restic check` too.

The environment file uses double quotes with `\`, `"`, `$` and `` ` `` escaped, so it reads the same to `sh` and to systemd's `EnvironmentFile=`.

Snapshots the timer takes are tagged `conn3x`, and `forget` only looks at those, grouped by host. A snapshot you take by hand without the tag stays until you forget it. restic keeps the oldest snapshot while a `keep_*` rule still has room, so on a new repository you'll see it hang around until the policy fills up.

Before the circuit runs, the `conn3x_host` data source reads each host's architecture over SSH. `x86_64` and `aarch64` each get their own build; other architectures fail the plan.

### What it doesn't do

- It doesn't change a repository's password. If you change `password`, `restic cat config` fails with the new one and the apply stops at the init step, rather than leaving backups that fail every night. Add the new key first with `conn3x-restic key add`, then change `password`.
- It doesn't set up the remote end: the SFTP user, the bucket or the rest-server.
- It doesn't dump databases. restic backs up files; for PostgreSQL or MySQL, dump to a path in `paths` first, from a timer of your own that runs before this one.
- It doesn't alert you when a backup fails. The service fails, and the journal says why; hook `OnFailure=` or your monitoring to `conn3x-restic-backup.service`.
- Deleting the module stops and removes the timers. restic, the configuration and the repository stay.

### Upgrading

Set `restic_version` and `checksums` together. The release's `SHA256SUMS` lists both files:

```hcl
module "backups" {
  source = "github.com/conn3xorg/circuit-restic?ref=v0.1.0"

  hosts          = { web1 = "203.0.113.10" }
  repository     = "sftp:backup@203.0.113.20:/srv/restic"
  password       = var.restic_password
  restic_version = "0.19.1"
  checksums = {
    x86_64  = "f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c"
    aarch64 = "a5f64aaab53d51e311fa3829124c5b703f2d14cf187d8640b6be3b2b49376465"
  }
}
```

The new release unpacks beside the old one and `conn3x-restic` points at it. The old directory stays until you remove it.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `restic_version` | string | `"0.19.1"` | restic release to install, without the leading `v`. |
| `checksums` | map(string) | The 0.19.1 checksums | SHA-256 of the `linux_amd64` and `linux_arm64` `.bz2` files, keyed `x86_64` and `aarch64`. |
| `repository` | string | Required | Repository to back up to, as restic takes it, such as `"sftp:backup@203.0.113.20:/srv/restic"` or `"/mnt/backup/restic"`. |
| `password` | string, sensitive, ephemeral | Required | Password the repository is encrypted with. Sensitive and ephemeral, kept out of the plan and state. Lose it and the backups can't be read. |
| `environment` | map(string), sensitive, ephemeral | `{}` | Environment variables the backend needs, such as `AWS_ACCESS_KEY_ID`. Sensitive and ephemeral, kept out of the plan and state. |
| `paths` | list(string) | `["/etc", "/home", "/root"]` | Absolute paths to back up. |
| `excludes` | list(string) | `[]` | Patterns restic skips, such as `["/home/*/.cache", "*.tmp"]`. |
| `schedule` | string | `"daily"` | When the backup runs, as a systemd calendar expression, such as `"*-*-* 02:30:00"`. |
| `randomized_delay` | string | `"1h"` | Longest random delay systemd adds to each run, such as `"30min"`, or `"0"` for none. |
| `retention` | object | `{ keep_daily = 7, keep_weekly = 4, keep_monthly = 12 }` | What `restic forget --prune` keeps after each backup: any of `keep_last`, `keep_hourly`, `keep_daily`, `keep_weekly`, `keep_monthly` and `keep_yearly`. A keep of `0` is left out. `null` keeps every snapshot and never prunes. |
| `check_schedule` | string | `null` | When `restic check` verifies the repository, such as `"Sun *-*-* 04:00:00"`. When null, it doesn't. |

## Outputs

| Name | Description |
| --- | --- |
| `restic_command` | Command on each host that runs restic against the repository, `/usr/local/sbin/conn3x-restic`. |
| `backup_unit` | The service the timer starts, `conn3x-restic-backup.service`. |

## Requirements

Requires Conn3x v0.6.7 or later, systemd on each host, and outbound HTTPS to github.com.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. [examples/local](https://github.com/conn3xorg/circuit-restic/tree/v0.1.0/examples/local) was applied to each in a container on aarch64, with a password and a credential full of quotes, `$`, backticks and backslashes, and the second plan had no changes. Then the backup service ran, a file restored from the snapshot matched the original, two more runs left the retention policy forgetting one snapshot, `restic check` passed, and the credential read the same to `sh` and to systemd. CI runs the same checks on amd64.

The same checks passed on an amd64 Ubuntu 24.04 droplet and Rocky Linux 10 droplet with SELinux enforcing, each backing up to the other over `sftp:`, with 1 vCPU and 1 GB of memory. After a reboot both timers were back and the plan had no changes. Changing the password stopped the apply at the init step, and changing `randomized_delay` reached the timer without starting a backup.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-restic/blob/v0.1.0/LICENSE). restic itself is BSD-2-Clause.

## Source

- Repository: [conn3xorg/circuit-restic](https://github.com/conn3xorg/circuit-restic). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-restic/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-restic/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-restic/tree/v0.1.0/examples/local).
- Related circuits: [Samba](/circuits/samba), [NFS](/circuits/nfs).
