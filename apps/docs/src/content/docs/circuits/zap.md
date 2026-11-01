---
title: ZAP
description: "OWASP ZAP baseline scans of URLs you list, on a systemd timer, reports on the host."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-zap at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/zap/grade.svg)](https://conn3x.org/circuits/zap/grade)

A Conn3x circuit that scans websites you name with [ZAP](https://www.zaproxy.org/), on a schedule, and leaves the reports on the host. Each host gets the official ZAP image, pinned by digest, and a weekly systemd timer that runs a baseline scan of each URL in `targets`.

**Scan only what you're allowed to scan.** That means sites you own, or sites whose owner has given you permission. Scanning someone else's site without permission can break the law where you or they are, and it can trip their security monitoring even if it's only a baseline. `targets` has no default for this reason: nothing gets scanned until you list it, and the only URLs ever passed to ZAP are the ones you listed.

## Usage

```hcl
module "zap" {
  source = "github.com/conn3xorg/circuit-zap?ref=v0.1.0"

  hosts                = { scanner = "203.0.113.10" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  targets  = ["https://staging.example.com/"]
  schedule = "Sun 03:00"
  run_now  = true
}
```

Then run `conn3x init` and `conn3x apply`. With `run_now`, the apply scans once. A second `conn3x plan` says `No changes.`

The results are on the host:

```sh
ssh root@203.0.113.10 cat /var/lib/conn3x-zap/latest/summary.txt
ssh root@203.0.113.10 cat /var/lib/conn3x-zap/latest/https_staging_example_com.md
```

`summary.txt` counts the kinds of alert at each risk level, across all targets, like this from a test page with no security headers:

```
Low 2
Medium 2
```

To try it on a throwaway container and a weak page of its own, see [examples/local](https://github.com/conn3xorg/circuit-zap/tree/v0.1.0/examples/local).

## Passive and active

By default each scan runs `zap-baseline.py`. It spiders the target for up to `spider_minutes`, as a visitor following links would, and judges only the responses it gets: missing headers, unsafe cookies, information leaks. It does send requests, so the target's logs will show it, but it sends no attacks.

`active_scan = true` switches every target to `zap-full-scan.py`, and that's a different thing. ZAP sends real attacks, trying SQL injection, cross-site scripting and path traversal against every form and parameter it finds. It can write junk into a database, send email through a contact form or take a small site down. Use it on a test copy of something you own, or with the owner's written permission, and expect it to take far longer. There's no way to make one target active and another passive in the same module: use two modules on different hosts if you need that, as both use the same paths on a host.

## What it does

1. Installs Podman and pulls the image, so a bad digest fails the apply rather than a scan next week.
2. Writes `/usr/local/sbin/conn3x-zap`, the script that runs a scan, with your targets in it.
3. Sets up a systemd timer, `conn3x-zap.timer`, that runs the script on `schedule`. The timer is `Persistent`, so a scan missed while the host was off runs soon after it's back.
4. With `run_now`, scans. It scans again whenever the script changes.

Each scan writes a directory named for its start time in UTC under `/var/lib/conn3x-zap`, and points `latest` at it. Reports are named for their URL, with everything but letters and digits as `_`:

| File | What it is |
| --- | --- |
| `<target>.json` | ZAP's traditional JSON report, for your own tooling. |
| `<target>.html` | The report to read in a browser. |
| `<target>.md` | The same findings in Markdown. |
| `<target>.log` | What ZAP's script printed. |
| `summary.txt` | A count of alert kinds at each risk level, across all targets. |

The newest `keep` scans are kept, and older ones are deleted after a good scan. `/var/lib/conn3x-zap` is readable by root only, since a report is a list of weaknesses in your site.

Findings don't fail the service: it fails only when a scan does, such as a target it can't reach or a scan past `max_scan_minutes`. Every target still gets its turn, then `latest` stays on the last good scan and the end of the failed scan's log goes to the journal.

To scan now, outside the schedule:

```sh
systemctl start conn3x-zap.service
```

### How the container runs

- **On Podman's bridge network, with no ports published.** ZAP's scan scripts start its API on all addresses with the key turned off. On the host's network, anyone who could reach the host could drive it during a scan. Other containers on Podman's default network can still reach it while a scan runs. The bridge also means `127.0.0.1` in a target is the ZAP container itself, not the host.
- **With every capability dropped** and `no-new-privileges`.
- **Without AppArmor confinement.** On Ubuntu 24.04, Podman's AppArmor profile stops ZAP's wrapper script from signalling Xvfb as a scan ends, and the container then never exits. We saw this on a droplet: the reports were written, and the service sat there until we stopped it. It's why `--security-opt apparmor=unconfined` is set, and why `max_scan_minutes` ends any scan that hangs.

### Which version, and add-ons

The image is pulled by digest. ZAP rebuilds its `2.17.0` tag often to refresh add-ons, so the tag alone wouldn't fix what runs. To move forward:

```sh
skopeo inspect --format '{{.Digest}}' docker://ghcr.io/zaproxy/zaproxy:2.17.0
```

Left alone, ZAP's scripts fetch newer add-ons and beta rules from the internet each time they start, which is code the digest doesn't cover. So this circuit passes `-silent` to turn that off, along with ZAP's other calls home. The cost is coverage. Against the same test page, the default found 2 Low and 2 Medium, where `update_addons = true` found 6 Low, 2 Medium and 1 Informational. Set it if you'd rather have the extra rules.

### What it doesn't do

- It doesn't check that you're allowed to scan what you list. That's on you.
- It doesn't log in. Pages behind authentication aren't scanned.
- It doesn't send the results anywhere or fix what it finds. Copy them off, or point your own tooling at the JSON.
- It doesn't accept URLs with credentials in them, or IPv6 addresses.
- Deleting the module stops and removes the timer, and leaves Podman, the image and the reports in place.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `targets` | list(string) | Required | URLs to scan, each with a report of its own. List only sites you're allowed to scan. |
| `active_scan` | bool | `false` | Attack every target with `zap-full-scan.py`. See [Passive and active](#passive-and-active). |
| `zap_version` | string | `"2.17.0"` | Tag of `ghcr.io/zaproxy/zaproxy`. Change `image_digest` with it. |
| `image_digest` | string | `"sha256:030d3df5..."` | Digest of the image for `zap_version`. |
| `update_addons` | bool | `false` | Let ZAP fetch its newest add-ons and beta rules as each scan starts. |
| `spider_minutes` | number | `1` | Longest the spider walks each target, in minutes. |
| `max_scan_minutes` | number | `120` | Longest one target's scan may take, in minutes. A scan that runs out of time counts as failed. |
| `schedule` | string | `"weekly"` | When the timer runs, as a systemd `OnCalendar` expression such as `"weekly"` or `"Sun 03:00"`. |
| `keep` | number | `8` | Number of scans to keep on each host. |
| `run_now` | bool | `false` | Scan during the apply: the first time, and again when the scan's settings change. |

## Outputs

| Name | Description |
| --- | --- |
| `results_dir` | `/var/lib/conn3x-zap`, which holds one directory per scan. |
| `summary` | Counts by risk from the latest scan, `/var/lib/conn3x-zap/latest/summary.txt`. |
| `reports` | JSON report of the latest scan for each target. An `.html` and an `.md` of the same name sit beside each. |

## Requirements

Requires Conn3x v0.6.10 or later and systemd on each host. Hosts need to reach their package mirror, `ghcr.io` and your targets. The image takes 2.5 GB on disk. Hosts with 2 GB of memory ran it without trouble against a one-page site; a large site will want more.

## Tested on

Ubuntu 24.04, Debian 13, Rocky Linux 10 and Fedora 45, with ZAP 2.17.0. [examples/local](https://github.com/conn3xorg/circuit-zap/tree/v0.1.0/examples/local) was applied to each in a container on arm64, and CI does the same on amd64. It checks that the second plan has no changes, then starts a deliberately weak page inside the host and scans it through `conn3x-zap.service`. The report has to name `Content Security Policy (CSP) Header Not Set`, rule 10038, and the page's access log has to show no attack payloads. Then, with `active_scan = true`, the same scan has to put attack payloads in that log. All of it ran only against that local page.

On an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, both `s-1vcpu-2gb`, the passive check passed, and again after a reboot, when the timer was active and the plan had no changes. `update_addons` also passed on the Ubuntu droplet. On another Ubuntu droplet, an active scan of the same local page sent 638 requests, 136 of them with attack payloads, in about two minutes. An unreachable target failed the service and left `latest` alone, on Rocky Linux 10 in a container. With the AppArmor option removed by hand on the Ubuntu droplet, a 60 second limit ended the hung scan, failed the service and left `latest` alone. More than one target in a run wasn't tried.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-zap/blob/v0.1.0/LICENSE). ZAP and its Docker image are Apache-2.0.

## Source

- Repository: [conn3xorg/circuit-zap](https://github.com/conn3xorg/circuit-zap). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-zap/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-zap/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-zap/tree/v0.1.0/examples/local).
- Related circuits: [Baseline](/circuits/baseline), [Hardening](/circuits/hardening), [Firewall](/circuits/firewall), [fail2ban](/circuits/fail2ban), [Automatic updates](/circuits/auto-updates), [OpenSCAP](/circuits/openscap), [auditd](/circuits/auditd), [Trivy](/circuits/trivy), [CISO Assistant](/circuits/ciso-assistant).
