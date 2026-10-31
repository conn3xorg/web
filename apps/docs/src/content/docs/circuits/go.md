---
title: Go
description: "One exact Go release from go.dev on every distribution, checked against its checksum, with optional tools at pinned versions."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-go at v0.1.0. -->

A Conn3x circuit that puts one exact Go release on all your hosts. Distributions freeze Go at release time, so a mixed fleet ends up building with different compilers. This circuit takes the official tarball from go.dev instead, checks it against its SHA-256, and gives you the same Go on every distribution: 1.27.3 by default.

If your hosts need command-line tools written in Go, list those too, each at an exact version. `go install` builds them into `/usr/local/bin`.

## Usage

```hcl
module "go" {
  source = "github.com/conn3xorg/circuit-go?ref=v0.1.0"

  hosts                = { app1 = "203.0.113.10", app2 = "203.0.113.11" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  tools = { "github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen" = "v2.8.1" }
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

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-go/tree/v0.1.0/examples/local).

### Changing the release

`go_version` and `checksums` move together. https://go.dev/dl/ lists the SHA-256 of every file:

```hcl
go_version = "1.26.10"
checksums = {
  amd64 = "ccfe7ae822d2c2f41f4fe7c956199967a4dac22d0ee0d2b2bfdb440aab3b20c5"
  arm64 = "3f4227ce7b206a513e794f1393adb473a07b46e94d18bd15d1c684bbb7319797"
}
```

A tarball that doesn't match its checksum fails the apply. Each release gets its own directory, so the new one unpacks beside the old, `go` and `gofmt` move over to it, and `tools` build again with it.

## What it does

On each host, in order:

1. Installs `curl`, `tar` and `gzip`.
2. Downloads `goVERSION.linux-ARCH.tar.gz` from go.dev to `/opt/go`, keeping it only if its SHA-256 matches.
3. Unpacks it to `/opt/go/VERSION/go`.
4. Links `go` and `gofmt` into `/usr/local/bin`.
5. Runs `go install path@version` for each of `tools`, with `GOBIN=/usr/local/bin` and `GOTOOLCHAIN=local`, unless the command there was already built from that version by this Go. The check reads both from the binary itself.

Before the circuit runs, the `conn3x_host` data source reads each host's architecture over SSH, which picks the tarball.

### What it doesn't do

- It doesn't stop `go` fetching another toolchain for your own builds. Go's default lets a `go.mod` that asks for a newer release download it to the user's module cache. Set `GOTOOLCHAIN=local` where your builds run if that's not what you want. Only the `tools` this circuit installs are held to the pinned release.
- It doesn't install a C compiler, so cgo stays off unless the host has one already.
- It doesn't check tools against a checksum you hold. The version is pinned, and Go verifies the module against its checksum database. A tool's name must be its package path; the command is named after the last path element, skipping a suffix such as `/v2`.
- It doesn't remove a distribution's own `golang`. `/usr/local/bin` comes first on the usual `PATH`, but sudo's `secure_path` on the Red Hat family leaves it out.
- It doesn't uninstall anything. A tool you take out of `tools`, an old release's directory and tarball, and the whole install when you delete the module all stay on the host.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `go_version` | string | `"1.27.3"` | Go release to install. Change `checksums` with it. |
| `checksums` | map(string) | The tarballs of 1.27.3 | SHA-256 of the `amd64` and `arm64` `.tar.gz` tarballs. |
| `tools` | map(string) | `{}` | Commands to build with `go install`, by package path, each at an exact version. `latest` and ranges aren't accepted. |

## Outputs

| Name | Description |
| --- | --- |
| `go_home` | GOROOT of the installed release on each host, by host name, such as `{ app1 = "/opt/go/1.27.3/go" }`. |

## Requirements

Requires Conn3x v0.6.10 or later, a package mirror each host can reach, and outbound HTTPS to go.dev and dl.google.com, plus proxy.golang.org and sum.golang.org when you list tools. amd64 and arm64.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. [examples/local](https://github.com/conn3xorg/circuit-go/tree/v0.1.0/examples/local) was applied to each on arm64, and the second plan had no changes. `go` then built and ran a small module, and `oapi-codegen` 2.8.1 reported its version. CI runs the same checks on amd64.

On an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, both `s-1vcpu-1gb`, amd64, each shared with the other circuits of this batch: the same checks passed, and after a reboot the plan had no changes and they still passed. On the Ubuntu droplet a wrong checksum failed the apply, and moving to 1.26.10 repointed `go`, rebuilt the tool, and left a clean plan.

`ssh_become` wasn't exercised: every test logged in as root.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-go/blob/v0.1.0/LICENSE). Go is under a BSD-style license. Tools carry their own licenses.

## Source

- Repository: [conn3xorg/circuit-go](https://github.com/conn3xorg/circuit-go). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-go/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-go/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-go/tree/v0.1.0/examples/local).
- Related circuits: [Java](/circuits/java), [PHP-FPM](/circuits/php), [Jenkins](/circuits/jenkins), [GitHub Actions runner](/circuits/github-runner), [GitLab Runner](/circuits/gitlab-runner), [Cinc Client](/circuits/cinc), [Node.js](/circuits/nodejs), [Perl](/circuits/perl), [Bun](/circuits/bun), [Selenium Grid](/circuits/selenium), [OpenVox](/circuits/openvox), [Rust](/circuits/rust), [Python](/circuits/python), [Ruby](/circuits/ruby), [Kotlin](/circuits/kotlin), [.NET](/circuits/dotnet), [C toolchain](/circuits/c-toolchain).
