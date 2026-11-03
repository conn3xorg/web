---
title: Rust
description: "One exact Rust toolchain from static.rust-lang.org on every distribution, checksum-verified and system-wide, without rustup."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-rust at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/rust/grade.svg)](https://conn3x.org/circuits/rust/grade)

A Conn3x circuit that puts one exact Rust toolchain on all your hosts, without a curl-to-sh in sight. rustup is built for one person's home directory; a server wants `rustc` and `cargo` for everybody, at the version you chose, staying there until you change it. So this circuit takes the official tarball from static.rust-lang.org, checks it against its SHA-256, and installs it under `/opt/rust`: 1.99.1 by default, the same on every distribution.

## Usage

```hcl
module "rust" {
  source = "github.com/conn3xorg/circuit-rust?ref=v0.1.0"

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

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-rust/tree/v0.1.0/examples/local).

### Changing the release

`rust_version` and `checksums` move together. Each tarball has its checksum beside it, such as https://static.rust-lang.org/dist/rust-1.99.0-x86_64-unknown-linux-gnu.tar.xz.sha256:

```hcl
rust_version = "1.99.0"
checksums = {
  x86_64  = "<SHA-256 of rust-1.99.0-x86_64-unknown-linux-gnu.tar.xz>"
  aarch64 = "<SHA-256 of rust-1.99.0-aarch64-unknown-linux-gnu.tar.xz>"
}
```

To check the tarballs themselves, each has a `.asc` signature made with [Rust's signing key](https://static.rust-lang.org/rust-key.gpg.ascii). The defaults here were checked against those signatures.

Each release gets its own directory, so a new one installs beside the old, and the commands in `/usr/local/bin` move over to it.

## What it does

On each host, in order:

1. Installs `curl`, `tar` and `xz`, plus `gcc` and the C library's headers, because `rustc` calls `cc` to link.
2. Downloads `rust-VERSION-TARGET.tar.xz` from static.rust-lang.org to `/opt/rust`, keeping it only if its SHA-256 matches.
3. Runs the tarball's `install.sh` to put `rustc`, `cargo`, the standard library, `rustfmt` and `clippy` in `/opt/rust/VERSION`, then removes the unpacked copy.
4. Links `rustc`, `rustdoc`, `cargo`, `rustfmt`, `cargo-fmt`, `cargo-clippy` and `clippy-driver` into `/usr/local/bin`.

Before the circuit runs, the `conn3x_host` data source reads each host's architecture and distribution over SSH. The architecture picks the tarball and the distribution picks package names.

### What it doesn't do

- It doesn't install rustup, so `rustup target add` and `rust-toolchain.toml` files don't apply. A project that names another toolchain gets this one.
- It leaves out the offline docs, rust-analyzer and the LLVM tools. It has the host's own target only, so no cross-compiling.
- Crates and `cargo install` stay per user, in each user's `~/.cargo`.
- It doesn't remove a distribution's own `rustc`. `/usr/local/bin` comes first on the usual `PATH`, but sudo's `secure_path` on the Red Hat family leaves it out.
- It doesn't uninstall anything. An old release's directory and tarball, and the whole install when you delete the module, stay on the host.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `rust_version` | string | `"1.99.1"` | Rust release to install. Change `checksums` with it. |
| `checksums` | map(string) | The tarballs of 1.99.1 | SHA-256 of the `x86_64` and `aarch64` `.tar.xz` tarballs. |

## Outputs

| Name | Description |
| --- | --- |
| `rust_home` | Directory of the installed release on each host, by host name, such as `{ app1 = "/opt/rust/1.99.1" }`. |

## Requirements

Requires Conn3x v0.6.10 or later, a package mirror each host can reach, and outbound HTTPS to static.rust-lang.org. amd64 and arm64. Crates are fetched by your own builds, from crates.io unless you say otherwise.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. [examples/local](https://github.com/conn3xorg/circuit-rust/tree/v0.1.0/examples/local) was applied to each on arm64, and the second plan had no changes. `cargo` then built and ran a small crate, and `cargo fmt --check` and `cargo clippy` passed on it. CI runs the same checks on amd64.

On an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, both `s-1vcpu-1gb`, amd64, each shared with the other circuits of this batch: the same checks passed, and after a reboot the plan had no changes and they still passed.

`ssh_become` wasn't exercised: every test logged in as root.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-rust/blob/v0.1.0/LICENSE). Rust is under the MIT and Apache-2.0 licenses.

## Source

- Repository: [conn3xorg/circuit-rust](https://github.com/conn3xorg/circuit-rust). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-rust/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-rust/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-rust/tree/v0.1.0/examples/local).
- Related circuits: [Java](/circuits/java), [PHP-FPM](/circuits/php), [Jenkins](/circuits/jenkins), [GitHub Actions runner](/circuits/github-runner), [GitLab Runner](/circuits/gitlab-runner), [Cinc Client](/circuits/cinc), [Node.js](/circuits/nodejs), [Perl](/circuits/perl), [Bun](/circuits/bun), [Selenium Grid](/circuits/selenium), [OpenVox](/circuits/openvox), [Go](/circuits/go), [Python](/circuits/python), [Ruby](/circuits/ruby), [Kotlin](/circuits/kotlin), [.NET](/circuits/dotnet), [C toolchain](/circuits/c-toolchain).
