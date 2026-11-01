---
title: Cinc Client
description: "Run Chef cookbooks in local mode with Cinc Client, the free community build, with no Chef Server and a systemd timer if you want one."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-cinc at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/cinc/grade.svg)](https://conn3x.org/circuits/cinc/grade)

A Conn3x circuit that runs your Chef cookbooks on a host without a Chef Server. It installs Cinc Client, the free community build of Chef Infra Client, checks the package against its SHA-256, and converges in local mode from a directory on the host, once on apply and on a systemd timer if you ask for one.

You'd want it when you already have cookbooks and don't want to run a server just to apply them, or when you're moving hosts off a Chef Server one at a time. Conn3x puts the client and the schedule in place, and your recipes stay what they are.

## Why Cinc and not Chef

Progress Chef's own binaries come under the Chef EULA, which someone has to accept before Chef Infra Client will run, and its free tier is for non-production and personal use only. A circuit shouldn't accept that on your behalf.

[Cinc](https://cinc.sh/goals/) is built from the same source with the trademarks swapped out. The project says all its binaries are Apache-2.0 and "free of any further EULAs or licensing", and the package's own metadata says `Apache-2.0`. So there's nothing to accept, and this circuit has no input for it: the client ran here with no `CHEF_LICENSE` set, and `/etc/cinc/accepted_licenses` stayed empty.

Your cookbooks run as they are, since Cinc keeps the same resources and `Chef::` classes. The commands and paths are the ones that change: `cinc-client`, `/opt/cinc` and `/etc/cinc`. If you have a commercial agreement with Progress and need their build, this circuit isn't the one to use.

Cinc is not Chef, and neither Cinc nor this circuit is affiliated with Progress. Chef is a trademark of Progress Software Corporation.

## Usage

```hcl
module "cinc" {
  source = "github.com/conn3xorg/circuit-cinc?ref=v0.1.0"

  hosts                = { web1 = "203.0.113.10", web2 = "203.0.113.11" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  repo_path = "/var/lib/cinc/repo"
  run_list  = ["recipe[nginx]", "role[web]"]
  schedule  = "*:0/30"
}
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

The cookbooks have to be at `repo_path/cookbooks` before the converge, with roles at `repo_path/roles`. The circuit doesn't put them there, so a git clone, a package or an rsync all work. With nothing there yet, the apply fails at the converge step; leave `run_list` empty to install the client first.

To get them there with Conn3x, write them in a circuit of your own and read a value from it in `converge_trigger`. That makes the converge wait for your files and run again when they change. [examples/local](https://github.com/conn3xorg/circuit-cinc/tree/v0.1.0/examples/local) does this, and it's also the quickest way to try the circuit on a throwaway container.

```hcl
converge_trigger = sha256(join("", [for f in conn3x_file.cookbook__files : f.content]))
```

Without a trigger, Conn3x can't see inside your cookbooks. A changed recipe takes effect on the next timer run, or when you run `systemctl start cinc-client` on the host.

## Security

Everything in `repo_path` runs as root. Keep it writable by root alone, and only clone from a repository you'd trust with root on the host.

## What it does

On each host, in order:

1. Installs `curl`, then downloads the Cinc package for the host's distribution and architecture from `packages.cinc.sh` into `/var/cache/conn3x-cinc`, and checks its SHA-256 before using it.
2. Installs it with `dpkg` or `rpm`, unless that version is already there. Changing `cinc_version` moves the client up or down.
3. Writes `/etc/cinc/client.rb`, which sets local mode, `repo_path`, the node's name from its key in `hosts`, and `/var/lib/cinc/nodes` for the node's record, which keeps `repo_path` clean if it's a Git checkout.
4. With a `run_list`, writes `/etc/systemd/system/cinc-client.service`, a oneshot unit that runs `cinc-client --local-mode` with your run list.
5. With a `schedule`, writes and starts `cinc-client.timer`. A run missed while the host was off happens when it comes back.
6. With a `run_list`, converges once. It converges again on a later apply only when `cinc_version`, the config, the unit or `converge_trigger` changes. A failed converge fails the apply.

Read what a converge did with `journalctl -u cinc-client`. The last line of each run says how many resources changed, such as `Infra Phase complete, 0/1 resources updated`.

The run list goes on the command line, so taking a recipe out of `run_list` takes it out of the next converge. Cinc logs `Skipping final node save because override_runlist was given` each time, which is expected.

### Other platforms and versions

The default `checksums` cover Ubuntu 24.04, Debian 13 and Enterprise Linux 10 (Rocky Linux, AlmaLinux, RHEL), on x86_64 and aarch64. A host on anything else stops at the plan with a message saying so.

Fedora isn't supported because Cinc publishes no Fedora packages. Its download service answers a request for Fedora 45 with an old Enterprise Linux 7 build, 18.4.12, which isn't one to run on purpose.

Cinc also publishes Ubuntu 22.04 and 26.04, Debian 12, and Enterprise Linux 8 and 9. To use one, or another version, add its checksum, keyed `PLATFORM/VERSION/ARCH`. Cinc's service gives the value:

```sh
curl -s "https://omnitruck.cinc.sh/stable/cinc/metadata?p=debian&pv=12&m=x86_64&v=19.4.46"
```

Those platforms haven't been tested with this circuit.

### What it doesn't do

- It doesn't talk to a Chef Server or Cinc Server. Local mode only.
- It doesn't put cookbooks on the host, or fetch their dependencies. Vendor them into `repo_path/cookbooks`, with `berks vendor` for instance.
- It doesn't set node attributes. Set them in a role, or in a cookbook's attributes.
- Taking `schedule` away removes the timer. Emptying `run_list` also removes the service. Neither undoes what your cookbooks did, and deleting the module leaves the client installed.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `cinc_version` | string | `"19.4.46"` | [Cinc Client release](https://omnitruck.cinc.sh/stable/cinc/versions/all) to install. |
| `checksums` | map(string) | the 19.4.46 packages | SHA-256 of the package, by `PLATFORM/VERSION/ARCH`, such as `debian/13/x86_64`. Change them with `cinc_version`. |
| `repo_path` | string | `"/var/lib/cinc/repo"` | Directory on the host that holds `cookbooks/`, and `roles/` if you use them. |
| `run_list` | list(string) | `[]` | What to converge, such as `["recipe[nginx]", "role[web]"]`. When empty, the circuit only installs the client. |
| `schedule` | string | `null` | systemd `OnCalendar` expression that converges on a timer, such as `"hourly"` or `"*:0/30"`. Needs a `run_list`. When null, there's no timer. |
| `converge_trigger` | string | `""` | Any string, such as a cookbook's hash or a Git commit. Changing it converges on the next apply. |

## Outputs

| Name | Description |
| --- | --- |
| `service` | systemd unit that runs one converge, `cinc-client.service`. |
| `client` | Path of the client on each host, `/opt/cinc/bin/cinc-client`. |

## Requirements

Requires Conn3x v0.6.9 or later and systemd on each host, on x86_64 or aarch64. Each host needs to reach `packages.cinc.sh` and its package mirror. Converging needs no inbound port.

## Tested on

Ubuntu 24.04, Debian 13 and Rocky Linux 10. CI applies [examples/local](https://github.com/conn3xorg/circuit-cinc/tree/v0.1.0/examples/local) to each on amd64 and checks the second plan has no changes. Then it checks the small cookbook wrote its file and the timer is on, overwrites the file, and converges twice: the first run reports `1/1 resources updated` and puts the file back, and the second reports `0/1`.

The same checks passed by hand in arm64 containers of all three. On a Fedora 45 container, the plan stopped with the unsupported-platform message.

On DigitalOcean, an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing passed the same checks on x86_64, with no Cinc denials in the audit log. After a reboot the timer came back and the plan had no changes. On both, taking `schedule` away removed the timer, emptying `run_list` removed the service, and moving `cinc_version` down to 19.3.14 installed that version, each with no changes on the next plan.

`ssh_become` hasn't been tried.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-cinc/blob/v0.1.0/LICENSE). Cinc Client is Apache-2.0.

## Source

- Repository: [conn3xorg/circuit-cinc](https://github.com/conn3xorg/circuit-cinc). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-cinc/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-cinc/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-cinc/tree/v0.1.0/examples/local).
- Related circuits: [Java](/circuits/java), [PHP-FPM](/circuits/php), [Jenkins](/circuits/jenkins), [GitHub Actions runner](/circuits/github-runner), [GitLab Runner](/circuits/gitlab-runner), [Node.js](/circuits/nodejs), [Perl](/circuits/perl), [Bun](/circuits/bun), [Selenium Grid](/circuits/selenium), [OpenVox](/circuits/openvox), [Rust](/circuits/rust), [Go](/circuits/go), [Python](/circuits/python), [Ruby](/circuits/ruby), [Kotlin](/circuits/kotlin), [.NET](/circuits/dotnet), [C toolchain](/circuits/c-toolchain).
