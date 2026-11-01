---
title: Bun
description: "Install one pinned Bun release, checksum-verified, on every Linux host."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-bun at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/bun/grade.svg)](https://conn3x.org/circuits/bun/grade)

A Conn3x circuit that puts one exact Bun release on all your hosts. Distribution repositories mostly don't carry Bun, so the usual route is `curl | bash`, which gives you whatever was newest the day each machine was set up. This circuit takes the official zip from Bun's GitHub release instead, checks it against the release's SHA-256, and gives you the same Bun on every distribution: 1.4.4 by default.

## Usage

```hcl
module "bun" {
  source = "github.com/conn3xorg/circuit-bun?ref=v0.1.0"

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

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-bun/tree/v0.1.0/examples/local).

### Changing the release

`bun_version` and `checksums` move together. Take both zips' lines from the release's `SHASUMS256.txt`, such as https://github.com/oven-sh/bun/releases/download/bun-v1.4.3/SHASUMS256.txt:

```hcl
bun_version = "1.4.3"
checksums = {
  x64     = "<SHA-256 of bun-linux-x64.zip>"
  aarch64 = "<SHA-256 of bun-linux-aarch64.zip>"
}
```

A zip that doesn't match its checksum fails the apply, and `bun` stays on the release it had. To check the checksums themselves, the release signs them in `SHASUMS256.txt.asc`, with the key `F3DCC08A8572C0749B3E18888EAB4D40A7B22B59`. The defaults here were checked against that signature.

Each release gets its own directory, so the new one unpacks beside the old, and `bun` and `bunx` move over to it. Leave `bun upgrade` alone on these hosts: it would swap the binary inside that directory without Conn3x noticing.

## What it does

On each host, in order:

1. Installs `curl` and `unzip`.
2. Downloads `bun-linux-ARCH.zip` to `/opt/bun/VERSION`, keeping it only if its SHA-256 matches.
3. Unpacks it to `/opt/bun/VERSION/bun-linux-ARCH`.
4. Links `bun` and `bunx` into `/usr/local/bin`. `bunx` is Bun under a second name, which is how upstream's installer does it too.
5. Runs `bun --version` and fails the apply unless it prints the release you asked for.

Before the circuit runs, the `conn3x_host` data source reads each host's architecture over SSH, which picks the zip.

### Where it won't run

- **x64 CPUs without SSE4.2.** Bun's docs put the floor at Nehalem. Newer instructions are picked at run time, so there's only the one x64 build to install. On an older CPU, step 5 is what fails the apply. No such CPU was tried here.
- **Alpine, Void and other musl distributions.** This circuit installs the glibc builds. Bun publishes separate musl zips, which it doesn't use.
- **Architectures other than x86_64 and aarch64.** The plan stops and names the host.

### What it doesn't do

- It doesn't install your project's dependencies, run your application or manage a service. A systemd unit should name `/usr/local/bin/bun` in `ExecStart=`.
- It doesn't install global packages.
- It doesn't uninstall anything. An old release's directory, and the whole install when you delete the module, stay on the host.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `bun_version` | string | `"1.4.4"` | Bun release to install. Change `checksums` with it. |
| `checksums` | map(string) | The zips of 1.4.4 | SHA-256 of the `x64` and `aarch64` zips, from the release's `SHASUMS256.txt`. |

## Outputs

| Name | Description |
| --- | --- |
| `bun_home` | Directory of the installed release on each host, by host name, such as `{ app1 = "/opt/bun/1.4.4/bun-linux-x64" }`. |

## Requirements

Requires Conn3x v0.6.10 or later, and hosts with outbound HTTPS to github.com. amd64 and arm64.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. [examples/local](https://github.com/conn3xorg/circuit-bun/tree/v0.1.0/examples/local) was applied to each on arm64, and the second plan had no changes. In a login shell, `bun` and `bunx` both reported 1.4.4, `bun add --exact semver@7.8.5` pinned that version in `package.json`, and a TypeScript script importing it ran and gave the right answers. CI runs the same checks on amd64.

On an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, both `s-1vcpu-1gb`, amd64: the same checks passed. A wrong checksum failed the apply and left `bun` on 1.4.4, with an empty `/opt/bun/1.4.3` behind it. Moving to 1.4.3 repointed `bun` and `bunx`, and moving back was clean. After a reboot the plan had no changes and `bun` still ran.

`ssh_become` wasn't exercised: every test logged in as root.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-bun/blob/v0.1.0/LICENSE). Bun is under the MIT license, with the bundled components listed in its own license file.

## Source

- Repository: [conn3xorg/circuit-bun](https://github.com/conn3xorg/circuit-bun). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-bun/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-bun/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-bun/tree/v0.1.0/examples/local).
- Related circuits: [Java](/circuits/java), [PHP-FPM](/circuits/php), [Jenkins](/circuits/jenkins), [GitHub Actions runner](/circuits/github-runner), [GitLab Runner](/circuits/gitlab-runner), [Cinc Client](/circuits/cinc), [Node.js](/circuits/nodejs), [Perl](/circuits/perl), [Selenium Grid](/circuits/selenium), [OpenVox](/circuits/openvox), [Rust](/circuits/rust), [Go](/circuits/go), [Python](/circuits/python), [Ruby](/circuits/ruby), [Kotlin](/circuits/kotlin), [.NET](/circuits/dotnet), [C toolchain](/circuits/c-toolchain).
