---
title: Perl
description: "Perl from each distribution's packages, with distribution modules and CPAN modules pinned through cpanm."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-perl at v0.1.0. -->

A Conn3x circuit that installs Perl from each distribution's own packages, and the modules your scripts need on top: some from the distribution, some from CPAN at versions you pin.

Be clear on one thing before you use it. **The Perl version differs per distribution**, because the distributions ship it and this circuit takes what they ship:

| Distribution | Perl, checked October 2026 |
| --- | --- |
| Ubuntu 24.04 | 5.38.2 |
| Debian 13 | 5.40.1 |
| Rocky Linux 10 | 5.40.2 |
| Fedora 45 | 5.44.0 |

If you need one Perl version everywhere, this isn't the circuit for it. Distro modules differ the same way: Try::Tiny came out as 0.31 on Ubuntu 24.04 and Rocky Linux 10, and 0.32 on Debian 13 and Fedora 45. Only the CPAN modules are the same version on every host.

## Usage

```hcl
module "perl" {
  source = "github.com/conn3xorg/circuit-perl?ref=v0.1.0"

  hosts                = { app1 = "203.0.113.10", app2 = "203.0.113.11" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  distro_modules = {
    debian = ["libtry-tiny-perl"]
    redhat = ["perl-Try-Tiny"]
  }
  cpan_modules = { "Text::Trim" = "1.04" }
}
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

`distro_modules` takes package names, one list for each family, because the two families name the same module differently. `debian` covers Debian and Ubuntu; `redhat` covers Fedora, Rocky Linux, AlmaLinux, RHEL and CentOS Stream. On Rocky Linux and the like, some modules are only in EPEL, which this circuit doesn't add.

For hosts created in the same plan, pass host objects with the host key you generated, so Conn3x checks it without a known_hosts entry. Give each one's distribution in `os` too: the circuit picks packages by distribution, and Conn3x can't ask a host that doesn't exist yet. If `os` turns out not to match the host, Conn3x stops before configuring it. Set `os` as well when you put `depends_on` on this module: `depends_on` holds back reading the hosts until the apply, so without `os` the plan fails with `Invalid for_each argument`.

```hcl
hosts = {
  for name, d in digitalocean_droplet.app : name => {
    address  = d.ipv4_address
    host_key = tls_private_key.host[name].public_key_openssh
    os       = "ubuntu"
  }
}
```

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-perl/tree/v0.1.0/examples/local).

## What it does

On each host, in order:

1. Installs the `perl` package.
2. Installs the packages in `distro_modules` for the host's family.
3. With `cpan_modules` set, installs what building them takes: `curl`, `make` and `gcc`, with `libc6-dev` on Debian and Ubuntu, or `glibc-devel` and `perl-devel` on the Red Hat family.
4. With `cpan_modules` set, downloads cpanm 1.7049 to `/usr/local/bin/cpanm`, keeping it only if its SHA-256 matches. Every distribution gets this same cpanm, whether or not it packages one.
5. Runs `cpanm --notest Module@version` for each of `cpan_modules`, unless Perl already loads that exact version. Modules land in `/usr/local`, in Perl's site directories, apart from the distribution's own.

Before the circuit runs, the `conn3x_host` data source reads each host's distribution over SSH.

### What it doesn't do

- It doesn't pin Perl or the distro modules. Updates arrive with the host's other package updates.
- It doesn't run a module's own test suite, since `--notest` skips it. Run your own checks if you rely on one.
- It doesn't verify CPAN downloads against a checksum you hold. The version is pinned, and the tarball comes from CPAN over HTTPS, so you're trusting CPAN for its contents.
- It doesn't pin a module's dependencies. cpanm takes what the module asks for, so those can differ between two hosts installed at different times.
- It doesn't uninstall anything. A module you take out of either list, and everything else when you delete the module, stays on the host.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file`, `jump_hosts` and `os`, the distribution's ID, such as `ubuntu` or `rocky`, which a host created in the same plan needs. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `distro_modules` | object | `{}` | Package names to install from the distribution, as `{ debian = [...], redhat = [...] }`. |
| `cpan_modules` | map(string) | `{}` | Modules to install from CPAN, by name, each at an exact version, such as `{ "Text::Trim" = "1.04" }`. Setting any installs a compiler and `make` too. |

## Outputs

| Name | Description |
| --- | --- |
| `perl` | Path of the Perl interpreter on each host, by host name: `/usr/bin/perl`. |

## Requirements

Requires Conn3x v0.6.9 or later, and a package mirror each host can reach. With `cpan_modules`, hosts also need outbound HTTPS to raw.githubusercontent.com for cpanm, and to MetaCPAN and CPAN for the modules. amd64 and arm64.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. [examples/local](https://github.com/conn3xorg/circuit-perl/tree/v0.1.0/examples/local) was applied to each on arm64, and the second plan had no changes. A script then used Try::Tiny from the distribution and Text::Trim 1.04 from CPAN together, and each loaded from where it should. CI runs the same check on amd64.

On an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, both `s-1vcpu-1gb`, amd64: the same script passed, along with JSON::XS 4.04 from CPAN, which compiles C. After a reboot the plan had no changes and the script still passed.

`ssh_become` wasn't exercised: every test logged in as root.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-perl/blob/v0.1.0/LICENSE). Perl is under the Artistic License or the GPL, at your choice. Modules carry their own licenses.

## Source

- Repository: [conn3xorg/circuit-perl](https://github.com/conn3xorg/circuit-perl). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-perl/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-perl/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-perl/tree/v0.1.0/examples/local).
- Related circuits: [Java](/circuits/java), [PHP-FPM](/circuits/php), [Jenkins](/circuits/jenkins), [GitHub Actions runner](/circuits/github-runner), [GitLab Runner](/circuits/gitlab-runner), [Cinc Client](/circuits/cinc), [Node.js](/circuits/nodejs), [Bun](/circuits/bun), [Selenium Grid](/circuits/selenium), [OpenVox](/circuits/openvox), [Rust](/circuits/rust), [Go](/circuits/go), [Python](/circuits/python), [Ruby](/circuits/ruby), [Kotlin](/circuits/kotlin), [.NET](/circuits/dotnet), [C toolchain](/circuits/c-toolchain).
