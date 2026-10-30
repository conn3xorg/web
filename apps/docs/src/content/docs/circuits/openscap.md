---
title: OpenSCAP
description: "OpenSCAP scans against CIS, STIG and other SCAP Security Guide profiles on a timer, with HTML reports and opt-in remediation."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-openscap at v0.1.0. -->

A Conn3x circuit that scans your hosts against a security benchmark, such as CIS Level 1 Server or the DISA STIG, with OpenSCAP and the SCAP Security Guide from the ComplianceAsCode project. Each host gets the scanner, the right content for its distribution and a weekly timer, and every scan leaves an HTML report you can open in a browser and results other SCAP tools can read.

Audit first, change later. By default the circuit only looks. When you're ready, `remediate = true` has OpenSCAP fix what failed, once per host and profile, and you can leave out the rules you can't live with, such as the one that turns off root logins over SSH.

A scan tells you how a host measures up against the rules in the content. It isn't a certification, and neither Conn3x nor this circuit certifies a host as compliant with CIS, the STIG or anything else.

## Usage

```hcl
module "openscap" {
  source = "github.com/conn3xorg/circuit-openscap?ref=v0.1.0"

  hosts                = { web = "203.0.113.10", db = "203.0.113.11" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  profile  = "cis_level1_server"
  schedule = "Sun 03:00"
  run_now  = true
}
```

Then run `conn3x init` and `conn3x apply`. With `run_now`, the apply scans each host once, which takes a minute or two. A second `conn3x plan` says `No changes.`

The results are on each host under `/var/lib/conn3x-scap/latest`:

```sh
ssh root@203.0.113.10 cat /var/lib/conn3x-scap/latest/summary.txt
scp root@203.0.113.10:/var/lib/conn3x-scap/latest/report.html .
```

`summary.txt` has the score and a count for each result, like this from a fresh Ubuntu 24.04 droplet against CIS Level 1 Server:

```
score 68.843102
fail 108
notapplicable 63
notselected 245
pass 232
```

For hosts created in the same plan, pass host objects with the host key you generated, so Conn3x checks it without a known_hosts entry. Give each one's distribution in `os` too: the circuit picks its content by distribution, and Conn3x can't ask a host that doesn't exist yet. If `os` turns out not to match the host, Conn3x stops before configuring it. Set `os` as well when you put `depends_on` on this module: `depends_on` holds back reading the hosts until the apply, so without `os` the plan fails with `Invalid for_each argument`.

```hcl
hosts = {
  for name, d in digitalocean_droplet.app : name => {
    address  = d.ipv4_address
    host_key = tls_private_key.host[name].public_key_openssh
    os       = "ubuntu"
  }
}
```

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-openscap/tree/v0.1.0/examples/local).

## Profiles

`profile` takes one of four names, and the circuit maps it to the profile ID in each distribution's content, since the same benchmark goes by different IDs:

| `profile` | Ubuntu 24.04 | Debian 13 | Rocky Linux 10 | Fedora |
| --- | --- | --- | --- | --- |
| `cis_level1_server` | `cis_level1_server` | `cis_level1_server` | `cis_server_l1` | `cis_server_l1` |
| `cis_level2_server` | `cis_level2_server` | `cis_level2_server` | `cis` | `cis` |
| `stig` | `stig` | none | `stig` | none |
| `standard` | none | `standard` | none | `standard` |

Every profile in the table was run against its distribution and evaluated rules. A name with "none" stops the plan for that host, with the names it does have.

Any other value is taken as a profile ID from the host's content, such as `anssi_bp28_high` on Debian or `cis_workstation_l1` on Rocky Linux. `oscap info` on the data stream lists them, and the apply fails before changing anything if the profile isn't there.

## Remediation

> **Remediation changes your host, and it can lock you out.** CIS and STIG profiles turn off root logins over SSH, tighten PAM, set password ageing, change the SSH ciphers and set up a firewall. Run it on a throwaway copy of the host first, read the report, and only then on anything you care about. It can't be undone by the circuit.

With `remediate = true`, the circuit runs `oscap xccdf eval --remediate` once on each host: it scans, runs the content's fix for each failing rule, and writes the results like any other scan. Then it writes a marker, `/var/lib/conn3x-scap/remediated-<profile ID>`, so the next apply doesn't do it again. Changing `profile` remediates once more for the new one. To run it again for the same profile, delete the marker and apply.

Conn3x logs in over SSH, usually as root, so leave out the rules that would stop that with `skip_rules`:

```hcl
module "openscap" {
  source = "github.com/conn3xorg/circuit-openscap?ref=v0.1.0"

  hosts                = { web = "203.0.113.10" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  profile   = "cis_level1_server"
  remediate = true

  skip_rules = [
    "sshd_disable_root_login",
    # On Ubuntu and Debian, these set a default-deny firewall policy
    # with nothing to let SSH in.
    "set_ufw_default_rule",
    "set_nftables_base_chain",
    "nftables_ensure_default_deny_policy",
    "set_iptables_default_rule",
  ]
}
```

A rule that isn't in a host's content is ignored with a warning in the scan's log, so one list can serve several distributions. The rule IDs are in the HTML report, under each rule's title.

What that looked like on two fresh droplets, scanned before and after remediating CIS Level 1 Server with the list above:

| | Passed before | Failed before | Passed after | Failed after |
| --- | --- | --- | --- | --- |
| Ubuntu 24.04 | 232 | 108 | 329 | 21 |
| Rocky Linux 10 | 168 | 121 | 282 | 10 |

Both still took SSH logins as root afterwards, and again after a reboot. Note what else changed. On Ubuntu, remediation removed ufw and turned on the nftables service with a ruleset of its own. On Rocky Linux, it installed firewalld, which came up at the next boot and still let SSH in. The rules that still fail are listed in the report; most need a decision from you rather than a fix.

Remediation took about five minutes on a 1 vCPU droplet. While it runs, `conn3x apply` waits.

## What it does

Before the circuit runs, the `conn3x_host` data source reads each host's distribution and release over SSH. Then, on each host:

1. Gets the content. On Ubuntu, Debian and Fedora, it downloads the SCAP Security Guide release `content_version` from ComplianceAsCode's GitHub releases, checks it against `content_sha256`, and keeps only this host's data stream, such as `/usr/local/share/conn3x-scap/0.1.82/ssg-ubuntu2404-ds.xml`. The zip is about 180 MB and is deleted afterwards. On Rocky Linux, it installs the distribution's `scap-security-guide` package and uses `ssg-rl10-ds.xml`.
2. Installs `openscap-scanner`, which provides `oscap`.
3. Checks the profile is in the content.
4. Writes `/etc/conn3x-scap/tailoring.xml` when you set `skip_rules` or `tailoring`.
5. Writes `/usr/local/sbin/conn3x-scap`, the script that runs a scan, and a systemd timer, `conn3x-scap.timer`, that runs it on `schedule`. The timer is `Persistent`, so a scan missed while the host was off runs soon after it's back.
6. With `remediate`, remediates once. With `run_now`, scans.

Each scan writes a directory named for its start time in UTC under `/var/lib/conn3x-scap`, and points `latest` at it:

| File | What it is |
| --- | --- |
| `report.html` | The HTML report: every rule, its result, why it matters and how to fix it. |
| `arf.xml` | Results in the Asset Reporting Format, for tools that read SCAP results. |
| `results.xml` | XCCDF results. |
| `summary.txt` | The score and a count for each result. |
| `oscap.log` | What `oscap` printed. |

The newest `keep` scans are kept, and older ones are deleted. `/var/lib/conn3x-scap` is readable by root only, since a report lists every weakness the host has. A scan is about 30 MB.

`oscap` exits with 2 when the scan ran and some rules failed, which the script treats as success, so a scan with findings doesn't mark `conn3x-scap.service` as failed. Anything else is an error, and the end of `oscap.log` goes to the journal.

To scan now, outside the schedule:

```sh
systemctl start conn3x-scap.service
```

### Why Rocky Linux uses its own package

ComplianceAsCode doesn't build content for Rocky Linux. Its RHEL 10 data stream recognises a host by the `redhat-release` package, which Rocky Linux doesn't have, so a scan of a Rocky Linux 10 host with it comes back with every rule `notapplicable`. Rocky Linux's own `scap-security-guide` package, 0.1.82 at the time of writing, adds an `ssg-rl10-ds.xml` that knows Rocky Linux and evaluates its rules. `content_version` doesn't apply there; the package updates with the rest of the host.

Ubuntu 24.04 has no content package, and Debian 13's `ssg-debian` is 0.1.76, so those get the pinned release, and Fedora does too, so its content moves only when you change `content_version`.

### Your own tailoring file

For more than leaving rules out, such as changing a rule's value, write a tailoring file with SCAP Workbench or `autotailor` from `openscap-utils`, and pass its contents:

```hcl
tailoring = file("tailoring.xml")
profile   = "xccdf_org.ssgproject.content_profile_cis_level1_server_customized"
```

`profile` is then the ID of the tailored profile in your file. The circuit can't check that one before scanning, so look at the first scan's `oscap.log`.

### What it doesn't do

- It doesn't certify anything. The results are as good as the content's checks, and an auditor will want more than a report.
- It doesn't send the results anywhere. Copy them off, or point your own tooling at `arf.xml`.
- It doesn't undo remediation. Deleting the module or setting `remediate = false` leaves the host as remediation left it.
- It doesn't support RHEL, AlmaLinux, Ubuntu 22.04 or Debian 12, which weren't tested, and the plan stops on them.
- Deleting the module stops and removes the timer, and leaves the scanner, the content and the reports in place.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file`, `jump_hosts` and `os`, the distribution's ID, such as `ubuntu` or `rocky`, which a host created in the same plan needs. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `profile` | string | `"cis_level1_server"` | `cis_level1_server`, `cis_level2_server`, `stig` or `standard`, mapped per distribution as in [Profiles](#profiles), or a profile ID from the host's content. |
| `content_version` | string | `"0.1.82"` | SCAP Security Guide release to scan with on Ubuntu, Debian and Fedora. |
| `content_sha256` | string | SHA-256 of 0.1.82 | SHA-256 of `scap-security-guide-<content_version>.zip`, from the release's assets. Change it with `content_version`. |
| `schedule` | string | `"Sun 03:00"` | When the scan timer runs, as a systemd `OnCalendar` expression such as `"daily"` or `"Mon *-*-* 02:00"`. `null` leaves out the timer. |
| `keep` | number | `8` | Number of scans to keep on each host. |
| `run_now` | bool | `false` | Scan during the apply: the first time, and again when the scan's settings change. |
| `skip_rules` | list(string) | `[]` | Rules to leave out, by ID, such as `["sshd_disable_root_login"]`. |
| `tailoring` | string | `null` | Contents of your own XCCDF tailoring file. Set `profile` to the tailored profile's ID. Can't be used with `skip_rules`. |
| `remediate` | bool | `false` | Fix what fails, once per host and profile. Read [Remediation](#remediation) first. |

## Outputs

| Name | Description |
| --- | --- |
| `results_dir` | `/var/lib/conn3x-scap`, which holds one directory per scan. |
| `report` | HTML report of the latest scan, `/var/lib/conn3x-scap/latest/report.html`. |
| `results` | ARF results of the latest scan, `/var/lib/conn3x-scap/latest/arf.xml`. |
| `profiles` | Profile ID each host is scanned against, by host name. |

## Requirements

Requires Conn3x v0.6.5 or later and systemd on each host. Ubuntu, Debian and Fedora hosts need to reach GitHub to download the content. Ubuntu needs the universe repository, which has `openscap-scanner`. The droplets it was tested on had 2 GB of memory.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. [examples/local](https://github.com/conn3xorg/circuit-openscap/tree/v0.1.0/examples/local) was applied to each in a container, and CI does the same on amd64: it checks that the second plan has no changes, runs a scan through `conn3x-scap.service`, and checks it wrote the ARF results and the HTML report, that some rules passed, and that the rule in `skip_rules` came back `notselected`.

On an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet, with SELinux enforcing on Rocky Linux, the circuit was applied with `run_now`, then with `remediate` and the `skip_rules` in [Remediation](#remediation), as shown there. Both hosts were rebooted, still took SSH logins, and the next plan had no changes. Ubuntu 24.04 ships `oscap` 1.3.9, which read the 0.1.82 content without trouble.

The other profiles in the table were each run once by hand: `cis_level2_server` and `stig` on the droplets, and `cis_level2_server` and `standard` in Debian 13 and Fedora 45 containers.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-openscap/blob/v0.1.0/LICENSE). OpenSCAP is LGPL-2.1, and the SCAP Security Guide is BSD-3-Clause.

## Source

- Repository: [conn3xorg/circuit-openscap](https://github.com/conn3xorg/circuit-openscap). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-openscap/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-openscap/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-openscap/tree/v0.1.0/examples/local).
- Related circuits: [Baseline](/circuits/baseline), [Hardening](/circuits/hardening), [Firewall](/circuits/firewall), [fail2ban](/circuits/fail2ban), [Automatic updates](/circuits/auto-updates), [auditd](/circuits/auditd), [Trivy](/circuits/trivy), [CISO Assistant](/circuits/ciso-assistant).
