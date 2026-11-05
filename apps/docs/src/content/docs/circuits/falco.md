---
title: Falco
description: "Falco from its official repository on the modern eBPF probe, with your own rules validated before they load."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-falco at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/falco/grade.svg)](https://conn3x.org/circuits/falco/grade)

A Conn3x circuit that installs Falco from Falco's own package repository and keeps it running on your hosts. Falco watches every system call through an eBPF probe in the kernel and logs an alert when one matches a rule: a shell spawned by a web server, a program reading `/etc/shadow`, a binary written under `/usr/bin`. Falco's default rules come with it, and you can add your own.

Every alert goes to the journal, so you can read it on the host with `journalctl` or ship it with whatever already collects your logs.

## Usage

```hcl
module "falco" {
  source = "github.com/conn3xorg/circuit-falco?ref=v0.1.0"

  hosts                = { web = "203.0.113.10", db = "203.0.113.11" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  priority = "notice"
}
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

To see it work, read a file Falco's rules care about and look at its log:

```sh
ssh root@203.0.113.10 'cat /etc/shadow >/dev/null; sleep 2; journalctl -u falco-modern-bpf --since "-1min" | grep Sensitive'
```

```
Warning Sensitive file opened for reading by non-trusted program | file=/etc/shadow ... process=cat command=cat /etc/shadow ...
```

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-falco/tree/v0.1.0/examples/local).

## What it needs from the kernel

Falco has to load its probe into the running kernel, so this circuit works on some hosts and can't work on others, whatever the distribution says.

It uses Falco's modern eBPF probe, which is built into Falco and needs:

- **BTF**, the kernel's description of its own types, at `/sys/kernel/btf/vmlinux`. The circuit checks for it first and stops with an error naming the kernel if it isn't there.
- **The BPF ring buffer**, in Linux 5.8 and later, or an older kernel that has it backported.
- **Root on the host itself**, with the right to load BPF programs.

DigitalOcean's Ubuntu 24.04 (6.8), Debian 13 (6.12) and Rocky Linux 10 (6.12) droplets have all three, and so did the Fedora 45 test container's host kernel.

That rules out the hosts below. They weren't tried here; each lacks something in the list above.


- **LXC and Proxmox containers, OpenVZ, and any other "VPS" that is really a container** sharing its host's kernel. They aren't allowed to load BPF programs into it. Run Falco on the host instead.
- **Unprivileged containers**, for the same reason. In a privileged one Falco does load, as the tests here show, but it watches the host's kernel, so it sees every process on the machine, not just the container's.
- **Kernels built without BTF**, which is common on custom kernels and some single-board computers. `ls /sys/kernel/btf/vmlinux` tells you.
- **Kernels older than 5.8** with no ring buffer backport.

Falco's other driver, a kernel module, is left out on purpose. It's built with DKMS against the kernel's headers, and has to be built again for every new kernel, so a kernel update can leave Falco unable to start until it is. The modern eBPF probe needs no headers and no build.

## Your own rules

`rules` takes Falco rules as YAML. They go in `/etc/falco/rules.d/conn3x.yaml`, which Falco reads after its default rules, so they can use the default macros and lists, such as `open_read` and `shell_procs`:

```hcl
rules = <<-EOT
  - rule: Read of the app's database password
    desc: Something other than the app opened its password file.
    condition: open_read and fd.name = /etc/myapp/db-password and not proc.name = myapp
    output: App password read | process=%proc.name command=%proc.cmdline user=%user.name
    priority: WARNING
EOT
```

Before the new file replaces the old one, the apply runs `falco -V` over it with Falco's default rules. A rule that doesn't compile fails the apply, and Falco keeps running with the rules it had. A good change is picked up with a reload, without restarting Falco.

To change one of Falco's default rules, override it from here as Falco's docs describe, rather than editing `falco_rules.yaml`. The package owns that file, and an upgrade replaces it.

### Rule updates

Falco's package includes `falcoctl`, which can fetch new versions of the default rules once a week. By default this circuit masks `falcoctl-artifact-follow.service`, so the rules on a host are the ones that came with `falco_version` and only change when you change it. Set `rules_updates = true` to let falcoctl fetch them.

## What it does

Before the circuit runs, the `conn3x_host` data source reads each host's distribution and architecture over SSH. Then, on each host:

1. Checks the kernel exposes BTF.
2. Masks `falcoctl-artifact-follow.service`, or with `rules_updates`, unmasks it.
3. Adds Falco's repository, `download.falco.org/packages`, with its signing key, holds `falco` at `falco_version` unless `hold_package` is false, and installs the `falco` package at `falco_version`. The package picks the modern eBPF probe, and enables and starts `falco-modern-bpf.service`, which `falco.service` is an alias of.
4. Writes `/etc/falco/config.d/zz-conn3x.yaml` with `priority`, `json_output` and the health webserver's address, after checking it with `falco --dry-run` alongside the other files in `config.d`. A change restarts Falco.
5. Writes `rules` to `/etc/falco/rules.d/conn3x.yaml`, or removes the file when `rules` is empty. A change reloads Falco.
6. Keeps `falco-modern-bpf.service` enabled and running.

Falco's package starts its health webserver on every address, port 8765. This circuit moves it to `127.0.0.1`, since the only thing that asks it anything is falcoctl on the same host.

### Reading the alerts

The package sends Falco's alerts to syslog, which on these distributions is the journal:

```sh
journalctl -u falco-modern-bpf -f
```

`priority` sets the lowest priority logged. Falco's own default, `debug`, logs every rule that fires. `notice` or `warning` is quieter. With `json_output`, each alert is one JSON object, for a log shipper to parse.

### Holding the version

A Falco upgrade can change the default rules and the settings in `falco.yaml` under you, so by default the circuit holds `falco` at `falco_version`, and a routine `apt upgrade` or `dnf upgrade` leaves it alone. On Debian and Ubuntu that's a pin in `/etc/apt/preferences.d/falco`. On Rocky Linux and Fedora it's a dnf versionlock, with the versionlock plugin installed on Rocky. Changing `falco_version` moves the hold and installs the new version in one apply. Set `hold_package = false` to release it.

### The signing key

The key in `files/falcosecurity-packages.asc` is the one Falco has signed its packages with since it rotated keys in January 2026, fingerprint `478B 2FBB C75F 4237 B731 DA43 6510 6822 B35B 1B1F`, as [Falco's announcement](https://falco.org/blog/gpg-key-rotation-2026/) lists it. It expires on 10 December 2028. When Falco rotates again, a new release of this circuit will carry the new key.

### What it doesn't do

- It doesn't send alerts anywhere but the journal. Falcosidekick, HTTP output and the rest are Falco settings this circuit leaves alone.
- It doesn't use the kernel module driver, for the reasons in [What it needs from the kernel](#what-it-needs-from-the-kernel).
- It doesn't support other distributions or releases, and the plan stops on them. Falco's packages may well work there, but they haven't been tested here.
- Deleting the module leaves Falco installed and running.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `falco_version` | string | `"0.45.2"` | Falco release to install from Falco's repository. |
| `hold_package` | bool | `true` | Hold `falco` at `falco_version` through `apt upgrade` and `dnf upgrade`. False releases the hold. |
| `priority` | string | `"debug"` | Lowest priority of alert to log, from `emergency`, `alert`, `critical`, `error`, `warning`, `notice`, `informational` and `debug`. |
| `json_output` | bool | `false` | Log each alert as a JSON object. |
| `rules` | string | `""` | Falco rules of your own, as YAML. Empty removes the file. |
| `rules_updates` | bool | `false` | Let falcoctl fetch new versions of Falco's default rules every week. |

## Outputs

| Name | Description |
| --- | --- |
| `service` | `falco-modern-bpf.service`, the unit Falco runs as. `falco.service` is an alias of it. |
| `rules_file` | `/etc/falco/rules.d/conn3x.yaml`, or null when `rules` is empty. |

## Requirements

Requires Conn3x v0.7.0 or later and systemd on each host, on x86_64 or aarch64, with a kernel that has what's in [What it needs from the kernel](#what-it-needs-from-the-kernel). Hosts need to reach `download.falco.org`. Falco used 50 MB to 70 MB of memory on the droplets it was tested on.

## Tested on

Ubuntu 24.04, Debian 13, Rocky Linux 10 and Fedora 45, with Falco 0.45.2. [examples/local](https://github.com/conn3xorg/circuit-falco/tree/v0.1.0/examples/local) was applied to each in a privileged container on arm64, on a 7.1 kernel, and CI does the same on amd64: it checks that the second plan has no changes, that the health webserver listens on loopback only and falcoctl's rule updates are masked, then reads `/etc/shadow` and a canary file, and checks Falco logged the default rule's alert for one and the example's own rule for the other. It then restarts the container, checks Falco came back, and reads both again, and last applies `hold_package = false` and checks the hold is gone. Locally, on all four, a held Falco 0.45.1 stayed put through `apt upgrade` or `dnf upgrade`, moved to 0.45.2 when `falco_version` changed, and was released and held again with no changes left on the next plan. In a container, a rule that didn't compile failed the apply and left the old rules and the running Falco alone, and emptying `rules` removed the file with no changes on the next plan.

On Ubuntu 24.04, Debian 13 and Rocky Linux 10 droplets with SELinux enforcing, all `s-1vcpu-1gb`, the example was applied and the same check passed. After a reboot Falco was running, the plan had no changes and the check passed again. With `/sys/kernel/btf` hidden on the Debian droplet, the kernel check stopped the apply with its error.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-falco/blob/v0.1.0/LICENSE). Falco is Apache-2.0.

## Source

- Repository: [conn3xorg/circuit-falco](https://github.com/conn3xorg/circuit-falco). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-falco/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-falco/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-falco/tree/v0.1.0/examples/local).
- Related circuits: [Suricata](/circuits/suricata), [Zeek](/circuits/zeek), [osquery](/circuits/osquery), [Velociraptor](/circuits/velociraptor), [Wazuh](/circuits/wazuh).
