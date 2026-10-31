---
title: Trivy
description: "Scan hosts for known vulnerabilities with a pinned Trivy on a systemd timer, read-only, with reports on the host."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-trivy at v0.1.0. -->

A Conn3x circuit that scans your hosts for known vulnerabilities with Trivy. Each host gets a pinned Trivy, checked against its checksum, and a daily timer that scans the root filesystem and leaves a report on the host: the operating system's packages, plus language packages such as npm modules and Python packages installed anywhere on disk.

It only looks. Nothing gets patched, and the scan runs in a systemd sandbox that makes the whole host read-only to it apart from its own two directories.

## Usage

```hcl
module "trivy" {
  source = "github.com/conn3xorg/circuit-trivy?ref=v0.1.0"

  hosts                = { web = "203.0.113.10", db = "203.0.113.11" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  severity = ["HIGH", "CRITICAL"]
  targets  = ["/"]
  schedule = "daily"
  run_now  = true
}
```

Then run `conn3x init` and `conn3x apply`. With `run_now`, the apply scans each host once. A second `conn3x plan` says `No changes.`

The results are on each host under `/var/lib/conn3x-trivy/latest`:

```sh
ssh root@203.0.113.10 cat /var/lib/conn3x-trivy/latest/summary.txt
ssh root@203.0.113.10 cat /var/lib/conn3x-trivy/latest/root.txt
```

`summary.txt` has a count for each severity, like this from a fresh Rocky Linux 10 droplet:

```
CRITICAL 14
HIGH 1572
```

Don't be alarmed by a big number on a fresh image. Those counts are what the distribution's advisories list against the installed packages, and they include findings with no fix published yet. `root.txt` shows which is which, with the fixed version where there is one.

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-trivy/tree/v0.1.0/examples/local).

## Which version, and why

Trivy's release pipeline was compromised in 2026. On 19 March an attacker with stolen credentials published a malicious 0.69.4, and on 22 March malicious 0.69.5 and 0.69.6 images on Docker Hub. Tags of `trivy-action` and `setup-trivy` were overwritten too. Upstream's advisory, [GHSA-69fq-xp46-6x23](https://github.com/aquasecurity/trivy/security/advisories/GHSA-69fq-xp46-6x23), has the details and the indicators of compromise.

So this circuit:

- Defaults to 0.76.1, which is later than every release named in Trivy's published advisories, including the fixes for [GHSA-mcj4-mphf-j9ff](https://github.com/aquasecurity/trivy/security/advisories/GHSA-mcj4-mphf-j9ff), [GHSA-8rc5-4fr6-64pw](https://github.com/aquasecurity/trivy/security/advisories/GHSA-8rc5-4fr6-64pw) and [GHSA-q3fv-x8vg-qqm4](https://github.com/aquasecurity/trivy/security/advisories/GHSA-q3fv-x8vg-qqm4). GitHub marks the release immutable, and its `checksums.txt` passed `cosign verify-blob` against Trivy's release workflow when it was pinned.
- Downloads the tarball from the GitHub release and checks it against `checksums`, rather than using Aqua's apt or rpm repository or install script, which give you whatever is current when they run.
- Refuses `trivy_version` 0.69.4, 0.69.5 and 0.69.6 at plan time.
- Leaves the database repositories at Trivy's defaults, so the path traversal in GHSA-mcj4-mphf-j9ff, which needs a hostile repository, doesn't come into it.

To move to a newer release, read its advisories, verify its checksums and pass both:

```sh
v=0.76.1
curl -sSfLO "https://github.com/aquasecurity/trivy/releases/download/v$v/trivy_${v}_checksums.txt"
curl -sSfLO "https://github.com/aquasecurity/trivy/releases/download/v$v/trivy_${v}_checksums.txt.sigstore.json"
cosign verify-blob "trivy_${v}_checksums.txt" --bundle "trivy_${v}_checksums.txt.sigstore.json" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp '^https://github.com/aquasecurity/trivy/'
grep -E 'Linux-(64bit|ARM64)\.tar\.gz$' "trivy_${v}_checksums.txt"
```

```hcl
trivy_version = "0.76.1"
checksums = {
  amd64 = "c7cbe3137fb8a48a17574bede3dd6beb16742d1e9772929940fc90082c39d9c0" # Linux-64bit
  arm64 = "e174dff2a6dba5e3ae41f8d0537a6324405bd08132497340304c6b20e0f16a1f" # Linux-ARM64
}
```

## Choosing what to scan

`targets` is a list of absolute paths, each with its own report named for the path: `/` writes `root.json`, `/opt/app` writes `opt_app.json`. Only a scan of `/` looks at the operating system's packages. A narrower target finds the language packages under it.

```hcl
severity  = ["MEDIUM", "HIGH", "CRITICAL"]
targets   = ["/opt/app", "/srv"]
skip_dirs = ["/srv/backups", "/srv/*/cache"]
```

Set `skip_dirs` for anything you don't want read: network mounts especially, since Trivy will walk them, and `/var/lib/containers` or `/var/lib/docker` if you scan your images some other way.

## What it does

Before the circuit runs, the `conn3x_host` data source reads each host's architecture and distribution over SSH. Then, on each host:

1. Installs `curl`, `tar` and `gzip`.
2. Downloads the release tarball to `/opt/trivy`, checks it against `checksums`, unpacks it to `/opt/trivy/<version>` and links `/usr/local/bin/trivy` to it.
3. Writes `/usr/local/sbin/conn3x-trivy`, the script that runs a scan.
4. Writes the sandbox as a drop-in, `/etc/systemd/system/conn3x-trivy.service.d/sandbox.conf`, and a systemd timer, `conn3x-trivy.timer`, that runs the script on `schedule`. The timer is `Persistent`, so a scan missed while the host was off runs soon after it's back.
5. With `run_now`, scans.

Each scan writes a directory named for its start time in UTC under `/var/lib/conn3x-trivy`, and points `latest` at it:

| File | What it is |
| --- | --- |
| `<target>.json` | Trivy's JSON report, for your own tooling. |
| `<target>.txt` | The same findings as tables. |
| `summary.txt` | A count of findings for each severity, across all targets. |
| `trivy.log` | What `trivy` printed. |

The newest `keep` scans are kept, and older ones are deleted. `/var/lib/conn3x-trivy` is readable by root only, since a report is a list of ways into the host. A report on a fresh droplet came to 5 to 10 MB.

Trivy exits 0 whatever it finds, so `conn3x-trivy.service` only fails when a scan itself failed, such as a target that doesn't exist or a database it can't download. Then `latest` stays on the last good scan, and the end of `trivy.log` goes to the journal.

To scan now, outside the schedule:

```sh
systemctl start conn3x-trivy.service
```

### The sandbox

The scan runs as root because it has to read everything, so the service is held to reading:

- `ProtectSystem=strict` mounts the whole filesystem read-only for the service, except `/var/lib/conn3x-trivy` and `/var/cache/conn3x-trivy`.
- `CapabilityBoundingSet=CAP_DAC_READ_SEARCH` leaves it the one capability for reading past file permissions.
- `NoNewPrivileges` and `PrivateTmp` are on, and it runs at `Nice=19` with idle IO priority. `PrivateTmp` means `/tmp` isn't scanned.

This applies when the scan runs through `conn3x-trivy.service`, as the timer and `run_now` do. Running `/usr/local/sbin/conn3x-trivy` by hand doesn't get it. In a container, systemd may be unable to set up the read-only mounts and carries on without them, so test the sandbox on a real host.

### The database

Trivy downloads its vulnerability database from `mirror.gcr.io`, falling back to `ghcr.io`, and refreshes it when a scan finds it out of date. It lives in `/var/cache/conn3x-trivy`, and needs room: 1.6 GB on most hosts we tried and 3.1 GB on the Ubuntu droplet. A failed download fails that scan and the next run tries again.

### Why not Fedora

Trivy has no vulnerability data for Fedora's packages. On Fedora 45 it logs `Unsupported os` and reports only language packages, so a host full of unpatched RPMs comes back looking clean. A scanner that says nothing about most of the host is worse than none, so the plan stops on Fedora. Rocky Linux 10 and Debian 13 aren't in Trivy's [table of supported OSes](https://trivy.dev/docs/v0.76/guide/coverage/os/) at the time of writing, but 0.76.1 did report OS package findings for both. On Rocky Linux 10 it logs `This OS version is not on the EOL list`, which only means it can't tell you when support ends.

### What it doesn't do

- It doesn't patch anything, and it doesn't send the results anywhere. Copy them off, or point your own tooling at the JSON.
- It doesn't look for secrets, misconfigurations or licences. Only Trivy's `vuln` scanner runs, partly so reports don't end up holding copies of your secrets.
- It doesn't find everything. A vulnerable program Trivy has no way to identify, such as one built from source and copied in, won't show up.
- It doesn't keep old versions tidy. A new `trivy_version` leaves the previous one under `/opt/trivy`.
- It doesn't support RHEL, AlmaLinux, Fedora, Ubuntu 22.04 or Debian 12, and the plan stops on them. All but Fedora just haven't been tested here.
- Deleting the module stops and removes the timer, and leaves Trivy, the database and the reports in place.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `trivy_version` | string | `"0.76.1"` | Trivy release to install. See [Which version, and why](#which-version-and-why). |
| `checksums` | map(string) | SHA-256s of 0.76.1 | SHA-256 of the release tarball, by `amd64` and `arm64`. Change it with `trivy_version`. |
| `severity` | list(string) | `["HIGH", "CRITICAL"]` | Severities to report, from `UNKNOWN`, `LOW`, `MEDIUM`, `HIGH` and `CRITICAL`. |
| `targets` | list(string) | `["/"]` | Absolute paths to scan, each with a report of its own. |
| `skip_dirs` | list(string) | `[]` | Directories to leave out, as absolute paths or globs. |
| `schedule` | string | `"daily"` | When the scan timer runs, as a systemd `OnCalendar` expression such as `"daily"` or `"Sun 03:00"`. |
| `keep` | number | `7` | Number of scans to keep on each host. |
| `run_now` | bool | `false` | Scan during the apply: the first time, and again when the scan's settings change. |

## Outputs

| Name | Description |
| --- | --- |
| `results_dir` | `/var/lib/conn3x-trivy`, which holds one directory per scan. |
| `summary` | Counts by severity from the latest scan, `/var/lib/conn3x-trivy/latest/summary.txt`. |
| `reports` | JSON report of the latest scan for each target. A table with the same name ending in `.txt` sits beside each. |

## Requirements

Requires Conn3x v0.6.9 or later and systemd on each host. Hosts need to reach GitHub for the release, and `mirror.gcr.io` or `ghcr.io` for the database. Leave 2 GB to 4 GB free for the database. The droplets it was tested on had 2 GB of memory; a 1 GB host wasn't tried.

## Tested on

Ubuntu 24.04, Debian 13 and Rocky Linux 10, with Trivy 0.76.1. [examples/local](https://github.com/conn3xorg/circuit-trivy/tree/v0.1.0/examples/local) was applied to each in a container on arm64, and CI does the same on amd64: it checks that the second plan has no changes, plants lodash 4.17.4 under `/opt`, scans through `conn3x-trivy.service`, and checks that the report names CVE-2019-10744 and the path, that it holds only the severities asked for, and that the scan changed no files outside its own directories, the logs and systemd's state. On Rocky Linux 10, a run with two targets and `skip_dirs` reported the packages in each target, left out the directories matching an exact path and a glob, and ignored a copy outside the targets. A missing target failed the service and left `latest` alone.

On an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, both `s-1vcpu-2gb`, the circuit was applied with `run_now` and the same check passed. While a scan ran, its root filesystem was mounted read-only, writing to `/etc` from inside its mount namespace failed while writing to its results directory worked, and its only effective capability was `CAP_DAC_READ_SEARCH`. After a reboot the timer was active, the plan had no changes and another scan ran. Debian 13 ran in a container only, where the sandbox isn't enforced.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-trivy/blob/v0.1.0/LICENSE). Trivy is Apache-2.0.

## Source

- Repository: [conn3xorg/circuit-trivy](https://github.com/conn3xorg/circuit-trivy). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-trivy/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-trivy/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-trivy/tree/v0.1.0/examples/local).
- Related circuits: [Baseline](/circuits/baseline), [Hardening](/circuits/hardening), [Firewall](/circuits/firewall), [fail2ban](/circuits/fail2ban), [Automatic updates](/circuits/auto-updates), [OpenSCAP](/circuits/openscap), [auditd](/circuits/auditd), [CISO Assistant](/circuits/ciso-assistant), [ZAP](/circuits/zap).
