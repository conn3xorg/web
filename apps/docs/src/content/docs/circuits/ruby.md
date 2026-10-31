---
title: Ruby
description: "Your distribution's Ruby, with optional gems at pinned versions."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-ruby at v0.1.0. -->

A Conn3x circuit that installs Ruby from each distribution's own packages, and the gems your scripts need on top at versions you pin.

Be clear on one thing before you use it. **The Ruby version differs per distribution**, because the distributions ship it and this circuit takes what they ship:

| Distribution | Ruby, checked October 2026 |
| --- | --- |
| Ubuntu 24.04 | 3.2.3 |
| Debian 13 | 3.3.8 |
| Rocky Linux 10 | 3.3.12 |
| Fedora 45 | 4.0.7 |

If you need one Ruby everywhere, this isn't the circuit for it. Only the gems are the same version on every host, and a gem has to support the oldest Ruby in your fleet.

## Usage

```hcl
module "ruby" {
  source = "github.com/conn3xorg/circuit-ruby?ref=v0.1.0"

  hosts                = { app1 = "203.0.113.10", app2 = "203.0.113.11" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  gems = { rainbow = "3.1.1" }
}
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

For hosts created in the same plan, pass host objects with the host key you generated, so Conn3x checks it without a known_hosts entry:

```hcl
hosts = {
  for name, d in digitalocean_droplet.app : name => {
    address  = d.ipv4_address
    host_key = tls_private_key.host[name].public_key_openssh
  }
}
```

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-ruby/tree/v0.1.0/examples/local).

## What it does

On each host, in order:

1. Installs `ruby`, and RubyGems under its package name: `ruby-rubygems` on Debian and Ubuntu, `rubygems` on the Red Hat family.
2. With `gems` set, installs what building them takes: `gcc`, `make` and Ruby's headers, `ruby-dev` or `ruby-devel`.
3. Runs `gem install --no-document name -v version` for each of `gems`, unless that exact version is installed.

Before the circuit runs, the `conn3x_host` data source reads each host's distribution over SSH.

### What it doesn't do

- It doesn't pin Ruby. Updates arrive with the host's other package updates, and a gem with C in it may need installing again after a new Ruby minor release.
- It doesn't install rbenv, or any other way of running several Rubies.
- It doesn't check gems against a checksum you hold, or pin a gem's dependencies. RubyGems takes what the gem asks for, so those can differ between hosts installed at different times. Use Bundler for an application.
- It doesn't uninstall anything. A gem you take out of `gems`, and everything else when you delete the module, stays on the host.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `gems` | map(string) | `{}` | Gems to install, by name, each at an exact version, such as `{ rainbow = "3.1.1" }`. Setting any installs a compiler, `make` and Ruby's headers too. |

## Outputs

| Name | Description |
| --- | --- |
| `ruby` | Path of the Ruby interpreter on each host, by host name: `/usr/bin/ruby`. |

## Requirements

Requires Conn3x v0.6.10 or later, and a package mirror each host can reach, plus outbound HTTPS to rubygems.org when you list gems. amd64 and arm64.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. [examples/local](https://github.com/conn3xorg/circuit-ruby/tree/v0.1.0/examples/local) was applied to each on arm64, and the second plan had no changes. A script then required `rainbow`, confirmed it had loaded 3.1.1, and printed through it. CI runs the same check on amd64.

On an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, both `s-1vcpu-1gb`, amd64, each shared with the other circuits of this batch: the same check passed, and after a reboot the plan had no changes and it still passed.

`ssh_become` wasn't exercised: every test logged in as root.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-ruby/blob/v0.1.0/LICENSE). Ruby is under its own Ruby License or the BSD 2-clause license. Gems carry their own licenses.

## Source

- Repository: [conn3xorg/circuit-ruby](https://github.com/conn3xorg/circuit-ruby). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-ruby/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-ruby/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-ruby/tree/v0.1.0/examples/local).
- Related circuits: [Java](/circuits/java), [PHP-FPM](/circuits/php), [Jenkins](/circuits/jenkins), [GitHub Actions runner](/circuits/github-runner), [GitLab Runner](/circuits/gitlab-runner), [Cinc Client](/circuits/cinc), [Node.js](/circuits/nodejs), [Perl](/circuits/perl), [Bun](/circuits/bun), [Selenium Grid](/circuits/selenium), [OpenVox](/circuits/openvox), [Rust](/circuits/rust), [Go](/circuits/go), [Python](/circuits/python), [Kotlin](/circuits/kotlin), [.NET](/circuits/dotnet), [C toolchain](/circuits/c-toolchain).
