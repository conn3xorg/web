---
title: .NET
description: "One exact .NET SDK with ASP.NET Core from Microsoft's tarballs, checked against its checksum, with telemetry off by default."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-dotnet at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/dotnet/grade.svg)](https://conn3x.org/circuits/dotnet/grade)

A Conn3x circuit that puts one exact .NET SDK on all your hosts, ASP.NET Core included. The tarball comes from Microsoft's build server and is checked against its SHA-256, so Debian, which doesn't package .NET, gets the same 10.0.403 as everything else. That's the current long-term support channel, 10.0.

It also turns the CLI's telemetry off. Left alone, the `dotnet` command sends Microsoft usage data; here `/usr/local/bin/dotnet` is a small script that sets `DOTNET_CLI_TELEMETRY_OPTOUT=1` and runs the real one, so the setting holds in cron, systemd and SSH commands as well as login shells. To opt in, set `telemetry = true`. [Microsoft documents what it collects](https://learn.microsoft.com/dotnet/core/tools/telemetry).

## Usage

```hcl
module "dotnet" {
  source = "github.com/conn3xorg/circuit-dotnet?ref=v0.1.0"

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

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-dotnet/tree/v0.1.0/examples/local).

### Changing the release

`sdk_version` and `checksums` move together, with one extra step. Microsoft publishes SHA-512 in each channel's [releases.json](https://builds.dotnet.microsoft.com/dotnet/release-metadata/10.0/releases.json), and Conn3x's download step takes SHA-256. So check the tarball against Microsoft's SHA-512, then take its SHA-256 yourself, as the defaults here were:

```sh
curl -sSfLO https://builds.dotnet.microsoft.com/dotnet/Sdk/10.0.403/dotnet-sdk-10.0.403-linux-x64.tar.gz
sha512sum dotnet-sdk-10.0.403-linux-x64.tar.gz   # compare with releases.json
sha256sum dotnet-sdk-10.0.403-linux-x64.tar.gz   # goes in checksums
```

```hcl
sdk_version = "10.0.403"
checksums = {
  x64   = "<SHA-256 of the linux-x64 tarball>"
  arm64 = "<SHA-256 of the linux-arm64 tarball>"
}
```

Each release gets its own directory, so a new one unpacks beside the old, and `dotnet` moves over to it.

## What it does

On each host, in order:

1. Installs `curl`, `tar`, `gzip` and `ca-certificates`, and the libraries .NET needs: libssl, `libstdc++`, Kerberos and ICU. Fedora 45's OpenSSL is version 4, which .NET 10 can't load, so it gets `openssl3-libs` for `libssl.so.3`. Debian and Ubuntu name ICU after its version: `libicu74` on Ubuntu 24.04, `libicu76` on Debian 13, and `libicu-dev`, which pulls in the right one, elsewhere.
2. Downloads `dotnet-sdk-VERSION-linux-ARCH.tar.gz` to `/opt/dotnet`, keeping it only if its SHA-256 matches.
3. Unpacks it to `/opt/dotnet/VERSION`.
4. Writes the `/usr/local/bin/dotnet` script.
5. Writes `/etc/dotnet/install_location`, which tells a built application's own launcher where the runtime is.

Before the circuit runs, the `conn3x_host` data source reads each host's architecture and distribution over SSH.

### What it doesn't do

- It doesn't install a runtime-only build. The SDK carries the .NET and ASP.NET Core runtimes and takes about 620 MB unpacked, which is more than a host that only runs applications needs.
- The telemetry setting only covers `/usr/local/bin/dotnet`. Run `/opt/dotnet/VERSION/dotnet` directly and you'd need to set the variable yourself.
- It doesn't run your application or manage a service. A framework-dependent build finds the runtime through `install_location`, so a unit can start it directly.
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
| `sdk_version` | string | `"10.0.403"` | SDK release to install. Change `checksums` with it. |
| `checksums` | map(string) | The tarballs of 10.0.403 | SHA-256 of the `x64` and `arm64` tarballs. See [changing the release](#changing-the-release). |
| `telemetry` | bool | `false` | Let the CLI send Microsoft its usage telemetry. |

## Outputs

| Name | Description |
| --- | --- |
| `dotnet_root` | Directory of the installed SDK on each host, by host name, such as `{ app1 = "/opt/dotnet/10.0.403" }`. |

## Requirements

Requires Conn3x v0.6.10 or later, a package mirror each host can reach, and outbound HTTPS to builds.dotnet.microsoft.com, plus api.nuget.org for your own restores. amd64 and arm64.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. [examples/local](https://github.com/conn3xorg/circuit-dotnet/tree/v0.1.0/examples/local) was applied to each on arm64, and the second plan had no changes. `dotnet new web` then built a minimal ASP.NET Core app, whose own launcher started and answered `Hello World!` over HTTP. CI runs the same checks on amd64.

On an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, both `s-1vcpu-1gb`, amd64, each shared with the other circuits of this batch: the same checks passed, and after a reboot the plan had no changes and they still passed.

`ssh_become` wasn't exercised: every test logged in as root.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-dotnet/blob/v0.1.0/LICENSE). The .NET SDK tarball is under the MIT license, per its own `LICENSE.txt`, with bundled components listed in `ThirdPartyNotices.txt`.

## Source

- Repository: [conn3xorg/circuit-dotnet](https://github.com/conn3xorg/circuit-dotnet). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-dotnet/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-dotnet/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-dotnet/tree/v0.1.0/examples/local).
- Related circuits: [Java](/circuits/java), [PHP-FPM](/circuits/php), [Jenkins](/circuits/jenkins), [GitHub Actions runner](/circuits/github-runner), [GitLab Runner](/circuits/gitlab-runner), [Cinc Client](/circuits/cinc), [Node.js](/circuits/nodejs), [Perl](/circuits/perl), [Bun](/circuits/bun), [Selenium Grid](/circuits/selenium), [OpenVox](/circuits/openvox), [Rust](/circuits/rust), [Go](/circuits/go), [Python](/circuits/python), [Ruby](/circuits/ruby), [Kotlin](/circuits/kotlin), [C toolchain](/circuits/c-toolchain).
