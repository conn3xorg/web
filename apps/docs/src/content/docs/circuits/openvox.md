---
title: OpenVox
description: "Run your Puppet manifests without a server, using the OpenVox agent in local mode on an optional systemd timer."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-openvox at v0.1.0. -->

A Conn3x circuit that runs your Puppet manifests on a host without a server. It installs the OpenVox agent, the community build of Puppet, checks the package against its SHA-256, and runs `puppet apply` from a path on the host, once on apply and on a systemd timer if you ask for one.

You'd want it when you already have manifests and don't want to run a server just to apply them, or when you're moving hosts off a Puppet server one at a time. Conn3x puts the agent and the schedule in place, and your manifests stay what they are.

## Why OpenVox and not Puppet

Perforce no longer publishes Puppet's binaries in open repositories. Its [free tier](https://help.puppet.com/core/current/Content/PuppetCore/access_core_for_test_dev.htm) asks you to sign a EULA on Puppet Forge, get an API key, and stay at or under 25 nodes, for testing, evaluation and development. A circuit can't sign that for you, and shouldn't try.

[OpenVox](https://voxpupuli.org/openvox/) is the community's build of the same code, from Vox Pupuli, in public repositories that ask for nothing. [Its source](https://github.com/OpenVoxProject/openvox) is Apache-2.0. The package metadata says "See components", since it bundles its own Ruby and libraries under their own licences. Nothing in it asks anyone to accept anything, so this circuit has no input for that.

The OpenVox project describes it as effectively the same as Puppet apart from packaging, so your manifests should run as they are. The command is still `puppet`, and the paths are still `/opt/puppetlabs` and `/etc/puppetlabs`. If you have a commercial agreement with Perforce and need their build, this circuit isn't the one to use.

OpenVox is not Puppet, and neither OpenVox nor this circuit is affiliated with Perforce. Puppet is a trademark of Perforce Software, Inc.

## Usage

```hcl
module "openvox" {
  source = "github.com/conn3xorg/circuit-openvox?ref=v0.1.0"

  hosts                = { web1 = "203.0.113.10", web2 = "203.0.113.11" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  manifest_path = "/etc/puppetlabs/code/site.pp"
  schedule      = "*:0/30"
}
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

The manifest has to be at `manifest_path` before the first run. The circuit doesn't put it there, so a git clone, a package or an rsync all work. With nothing there yet, the apply fails at the last step; leave `manifest_path` out to install the agent first.

To get it there with Conn3x, write it in a circuit of your own and read a value from it in `apply_trigger`. That makes the run wait for your file and happen again when it changes. [examples/local](https://github.com/conn3xorg/circuit-openvox/tree/v0.1.0/examples/local) does this, and it's also the quickest way to try the circuit on a throwaway container.

```hcl
apply_trigger = conn3x_file.manifest__site["box"].sha256
```

Without a trigger, Conn3x can't see inside your manifests. A changed one takes effect on the next timer run, or when you run `systemctl start openvox-apply` on the host.

## Security

Everything at `manifest_path` and `module_path` runs as root. Keep them writable by root alone, and only clone from a repository you'd trust with root on the host.

## What it does

On each host, in order:

1. Installs `curl`, `findutils` and `tar`, then downloads the OpenVox package for the host's distribution and architecture into `/var/cache/conn3x-openvox`, and checks its SHA-256 before using it.
2. Installs it with `dpkg` or `rpm`, unless that version is already there. No OpenVox repository stays on the host, so nothing moves the agent past `openvox_version`. Changing that moves it up or down.
3. Stops and disables the package's `puppet.service`, which is the daemon that talks to a server. There isn't one here, and `dpkg` would otherwise enable it for the next boot.
4. With a `manifest_path`, writes `/etc/systemd/system/openvox-apply.service`, a oneshot unit that runs `puppet apply --detailed-exitcodes`.
5. With a `schedule`, writes and starts `openvox-apply.timer`. A run missed while the host was off happens when it comes back.
6. With a `manifest_path`, runs once. It runs again on a later apply only when `openvox_version`, the unit or `apply_trigger` changes. A failed run fails the apply.

`--detailed-exitcodes` is what makes failure visible. Plain `puppet apply` exits 0 even when a resource failed. With the flag, 0 means nothing changed, 2 means something did, and 4 or 6 mean something failed, which is what the unit reports. Read what a run did with `journalctl -u openvox-apply`, and how it ended with `systemctl show openvox-apply -p ExecMainStatus`.

### Other platforms and versions

The default `checksums` cover Ubuntu 24.04, Debian 13 and Enterprise Linux 10 (Rocky Linux, AlmaLinux, RHEL), on x86_64 and aarch64. A host on anything else stops at the plan with a message saying so.

Fedora 45 isn't supported because OpenVox publishes packages for Fedora 43 and 44 and nothing newer yet.

OpenVox also publishes Ubuntu 22.04 and 26.04, Debian 12, and Enterprise Linux 8 and 9. To use one, or another version, add its checksum, keyed `PLATFORM/VERSION/ARCH`. The package lists are at [apt.voxpupuli.org](https://apt.voxpupuli.org/) and [yum.voxpupuli.org](https://yum.voxpupuli.org/). Those platforms haven't been tested with this circuit.

### What it doesn't do

- It doesn't talk to a Puppet server or OpenVox server. Local mode only.
- It doesn't put manifests on the host, or fetch modules. Vendor them under `module_path`, with `r10k` or `puppet module install` for instance.
- It doesn't write `puppet.conf` or Hiera data. Those stay yours, under `/etc/puppetlabs`.
- Taking `schedule` away removes the timer. Taking `manifest_path` away also removes the service. Neither undoes what your manifests did, and deleting the module leaves the agent installed.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `openvox_version` | string | `"9.2.1"` | [openvox-agent release](https://github.com/OpenVoxProject/openvox/releases) to install. |
| `checksums` | map(string) | the 9.2.1 packages | SHA-256 of the package, by `PLATFORM/VERSION/ARCH`, such as `debian/13/x86_64`. Change them with `openvox_version`. |
| `manifest_path` | string | `null` | Manifest file, or directory of manifests, on the host to apply. When null, the circuit only installs the agent. |
| `module_path` | string | `null` | Directories on the host to look for modules in, separated by colons. When null, OpenVox's default, under `/etc/puppetlabs/code`. |
| `schedule` | string | `null` | systemd `OnCalendar` expression that applies on a timer, such as `"hourly"` or `"*:0/30"`. Needs a `manifest_path`. When null, there's no timer. |
| `apply_trigger` | string | `""` | Any string, such as a manifest's hash or a Git commit. Changing it runs the manifest on the next `conn3x apply`. |

## Outputs

| Name | Description |
| --- | --- |
| `service` | systemd unit that runs one apply, `openvox-apply.service`. |
| `puppet` | Path of the agent's command on each host, `/opt/puppetlabs/bin/puppet`. |

## Requirements

Requires Conn3x v0.6.9 or later and systemd on each host, on x86_64 or aarch64. Each host needs to reach `apt.voxpupuli.org` or `yum.voxpupuli.org`. Applying needs no inbound port.

## Tested on

Ubuntu 24.04, Debian 13 and Rocky Linux 10. CI applies [examples/local](https://github.com/conn3xorg/circuit-openvox/tree/v0.1.0/examples/local) to each on amd64 and checks the second plan has no changes, then runs [check.sh](https://github.com/conn3xorg/circuit-openvox/blob/v0.1.0/examples/local/check.sh): the manifest made its file, the timer is on, `puppet.service` is off, and with the file deleted, one run puts it back and exits 2 and the next exits 0.

The same checks passed by hand in arm64 containers of all three. On a Fedora 45 container, the plan stopped with the unsupported-platform message.

On DigitalOcean, an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing passed the same checks on x86_64. Rocky's audit log had no denials from OpenVox. After a reboot the timer came back, `puppet.service` stayed off and the plan had no changes. On both, a manifest with a failing resource failed the unit. Taking `schedule` away removed the timer, taking `manifest_path` away removed the service, and moving `openvox_version` down to 9.2.0 installed that version, each with no changes on the next plan.

`module_path`, a directory of manifests and `ssh_become` haven't been tried.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-openvox/blob/v0.1.0/LICENSE). OpenVox is Apache-2.0, with its bundled components under their own licences.

## Source

- Repository: [conn3xorg/circuit-openvox](https://github.com/conn3xorg/circuit-openvox). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-openvox/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-openvox/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-openvox/tree/v0.1.0/examples/local).
- Related circuits: [Java](/circuits/java), [PHP-FPM](/circuits/php), [Jenkins](/circuits/jenkins), [GitHub Actions runner](/circuits/github-runner), [GitLab Runner](/circuits/gitlab-runner), [Cinc Client](/circuits/cinc), [Node.js](/circuits/nodejs), [Perl](/circuits/perl), [Bun](/circuits/bun), [Selenium Grid](/circuits/selenium).
