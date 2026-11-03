---
title: C toolchain
description: "gcc, g++, make, gdb and nasm from your distribution's packages, for C, C++ and assembly. Versions differ per distribution."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-c-toolchain at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/c-toolchain/grade.svg)](https://conn3x.org/circuits/c-toolchain/grade)

A Conn3x circuit that turns a host into somewhere you can build C, C++ and assembly: `gcc`, `g++`, `make`, `gdb` and `nasm`, from each distribution's own packages, plus the C library's headers.

Be clear on one thing before you use it. **The versions differ per distribution**, because the distributions ship them and this circuit takes what they ship:

| Distribution | GCC | Make | gdb | NASM |
| --- | --- | --- | --- | --- |
| Ubuntu 24.04 | 13.3.0 | 4.3 | 15.1 | 2.16.01 |
| Debian 13 | 14.2.0 | 4.4.1 | 16.3 | 2.16.03 |
| Rocky Linux 10 | 14.3.1 | 4.4.1 | 16.3 | 2.16.01 |
| Fedora 45 | 16.2.1 | 4.4.1 | 17.2 | 3.02 |

Checked in October 2026. If you need one compiler version everywhere, build in a container instead.

### Assembly on two architectures

NASM assembles x86 only. It installs on arm64 too and produces x86 objects there, which that host can't run. For arm64 code, `gcc -c file.s` uses GNU `as`, which comes with `gcc`. The tests assemble and run a small program each way: NASM on x86_64, GNU `as` on aarch64.

## Usage

```hcl
module "c_toolchain" {
  source = "github.com/conn3xorg/circuit-c-toolchain?ref=v0.1.0"

  hosts                = { app1 = "203.0.113.10", app2 = "203.0.113.11" }
  ssh_private_key_file = "~/.ssh/id_ed25519"
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

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-c-toolchain/tree/v0.1.0/examples/local).

## What it does

On each host, in order:

1. Installs `gcc`, `make` and `gdb`.
2. Installs `nasm`. Rocky Linux, AlmaLinux and CentOS Stream keep it in CRB, which is off by default, so there the circuit turns CRB on for that one `dnf install` and leaves it off.
3. Installs the C++ compiler, `g++` on Debian and Ubuntu or `gcc-c++` on the Red Hat family.
4. Installs the C library's headers, `libc6-dev` or `glibc-devel`.

Before the circuit runs, the `conn3x_host` data source reads each host's distribution over SSH.

### What it doesn't do

- It doesn't pin anything. Updates arrive with the host's other package updates. The exception is `nasm` on Rocky Linux and its relatives: with CRB off, a plain `dnf upgrade` won't update it.
- It doesn't turn on RHEL's own CodeReady Builder repository, which goes by another name. On RHEL, enable it first, or `nasm` isn't found. This wasn't tested.
- It doesn't install clang, cmake, or any libraries' headers.
- It doesn't uninstall anything. The packages stay when you delete the module.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |

## Outputs

| Name | Description |
| --- | --- |
| `cc` | Path of the C compiler on each host, by host name: `/usr/bin/gcc`. |

## Requirements

Requires Conn3x v0.6.10 or later, and a package mirror each host can reach. amd64 and arm64.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. [examples/local](https://github.com/conn3xorg/circuit-c-toolchain/tree/v0.1.0/examples/local) was applied to each on arm64, and the second plan had no changes. `make` then built a C and a C++ program that both ran, `gdb` stopped at a breakpoint in the C one, and GNU `as` built an aarch64 program that exited with the status it set. CI runs the same checks on amd64, where NASM builds the assembly instead.

On an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, both `s-1vcpu-1gb`, amd64, each shared with the other circuits of this batch: the same checks passed with NASM on x86_64, and after a reboot the plan had no changes and they still passed.

`ssh_become` wasn't exercised: every test logged in as root.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-c-toolchain/blob/v0.1.0/LICENSE). GCC, Make and gdb are under the GPL, and NASM under the BSD 2-clause license.

## Source

- Repository: [conn3xorg/circuit-c-toolchain](https://github.com/conn3xorg/circuit-c-toolchain). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-c-toolchain/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-c-toolchain/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-c-toolchain/tree/v0.1.0/examples/local).
- Related circuits: [Java](/circuits/java), [PHP-FPM](/circuits/php), [Jenkins](/circuits/jenkins), [GitHub Actions runner](/circuits/github-runner), [GitLab Runner](/circuits/gitlab-runner), [Cinc Client](/circuits/cinc), [Node.js](/circuits/nodejs), [Perl](/circuits/perl), [Bun](/circuits/bun), [Selenium Grid](/circuits/selenium), [OpenVox](/circuits/openvox), [Rust](/circuits/rust), [Go](/circuits/go), [Python](/circuits/python), [Ruby](/circuits/ruby), [Kotlin](/circuits/kotlin), [.NET](/circuits/dotnet).
