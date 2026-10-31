---
title: Node.js
description: "One exact Node.js LTS from nodejs.org on every distribution, checked against its checksum, with global npm packages at pinned versions."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-nodejs at v0.1.0. -->

A Conn3x circuit that puts one exact Node.js release on all your hosts. Distributions ship whatever Node.js they froze at release time, so a fleet of Ubuntu and Rocky Linux ends up running different majors, and the fix is usually a curl-to-bash script nobody pinned. This circuit takes the official tarball from nodejs.org instead, checks it against the release's SHA-256, and gives you the same Node.js on every distribution: 26.13.0 by default, the current LTS.

If your hosts need command-line tools from npm, you can list those too, each at an exact version.

## Usage

```hcl
module "nodejs" {
  source = "github.com/conn3xorg/circuit-nodejs?ref=v0.1.0"

  hosts                = { app1 = "203.0.113.10", app2 = "203.0.113.11" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  global_packages = { semver = "7.8.5" }
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

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-nodejs/tree/v0.1.0/examples/local).

### Changing the release

`node_version` and `checksums` move together. Take both tarballs' lines from the release's `SHASUMS256.txt`, such as https://nodejs.org/dist/v24.22.2/SHASUMS256.txt:

```hcl
node_version = "24.22.2"
checksums = {
  x64   = "<SHA-256 of node-v24.22.2-linux-x64.tar.gz>"
  arm64 = "<SHA-256 of node-v24.22.2-linux-arm64.tar.gz>"
}
```

A tarball that doesn't match its checksum fails the apply, and the host keeps the Node.js it had. To check the checksums themselves, nodejs.org signs them in `SHASUMS256.txt.asc`, and the keys are in [nodejs/release-keys](https://github.com/nodejs/release-keys). The defaults here were checked against that signature.

Each release gets its own directory, so the new one unpacks beside the old, and `node`, `npm` and `npx` move over to it. Global packages install again on the new release, because a package's native addons are built for one Node.js.

## What it does

On each host, in order:

1. Installs `curl`, `tar`, `gzip`, and the two libraries the official builds link: `libatomic` and `libstdc++`.
2. Downloads `node-vVERSION-linux-ARCH.tar.gz` from nodejs.org to `/opt/nodejs`, keeping it only if its SHA-256 matches.
3. Unpacks it to `/opt/nodejs/node-vVERSION-linux-ARCH`.
4. Links `node`, `npm` and `npx` into `/usr/local/bin`.
5. Writes the release's `etc/npmrc`, which sets npm's global prefix to `/usr/local`, so global packages' commands land on the `PATH` and stay put across releases.
6. Runs `npm install --global` for each of `global_packages`, unless that exact version is already there.

Before the circuit runs, the `conn3x_host` data source reads each host's architecture and distribution over SSH. The architecture picks the tarball and the distribution picks the library package names.

### What it doesn't do

- It doesn't remove the distribution's own `nodejs` package. Its `/usr/bin/node` stays where it is, and `/usr/local/bin` comes first on the usual `PATH`. A systemd unit should name `/usr/local/bin/node` in `ExecStart=`.
- It doesn't install what a package needs to compile native addons, such as a compiler, `make` or Python. Add those first if yours has any.
- It doesn't uninstall anything. A package you take out of `global_packages`, an old release's directory and tarball, and the whole install when you delete the module all stay on the host.
- It doesn't run your application or manage a service.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `node_version` | string | `"26.13.0"` | Node.js release to install. Change `checksums` with it. |
| `checksums` | map(string) | The tarballs of 26.13.0 | SHA-256 of the `x64` and `arm64` `.tar.gz` tarballs, from the release's `SHASUMS256.txt`. |
| `global_packages` | map(string) | `{}` | npm packages to install globally, by name, each at an exact version, such as `{ semver = "7.8.5" }`. Ranges and tags aren't accepted. |

## Outputs

| Name | Description |
| --- | --- |
| `node_home` | Directory of the installed release on each host, by host name, such as `{ app1 = "/opt/nodejs/node-v26.13.0-linux-x64" }`. |

## Requirements

Requires Conn3x v0.6.9 or later, and hosts with outbound HTTPS to nodejs.org, plus registry.npmjs.org when you list global packages. amd64 and arm64.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. [examples/local](https://github.com/conn3xorg/circuit-nodejs/tree/v0.1.0/examples/local) was applied to each on arm64, and the second plan had no changes. In a login shell, `node` was v26.13.0 and ran a small script, and the global `semver` command accepted a version inside a range and rejected one outside it. CI runs the same checks on amd64.

On an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, both `s-1vcpu-1gb`, amd64: the same checks passed. A wrong checksum failed the apply and left nothing behind. Moving to 24.22.2 repointed `node` with the global package still working, and moving back was clean. After a reboot the plan had no changes and the checks still passed.

`ssh_become` wasn't exercised: every test logged in as root.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-nodejs/blob/v0.1.0/LICENSE). Node.js is under the MIT license, with the bundled components listed in its own LICENSE file.

## Source

- Repository: [conn3xorg/circuit-nodejs](https://github.com/conn3xorg/circuit-nodejs). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-nodejs/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-nodejs/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-nodejs/tree/v0.1.0/examples/local).
- Related circuits: [Java](/circuits/java), [PHP-FPM](/circuits/php), [Jenkins](/circuits/jenkins), [GitHub Actions runner](/circuits/github-runner), [GitLab Runner](/circuits/gitlab-runner), [Cinc Client](/circuits/cinc), [Perl](/circuits/perl), [Bun](/circuits/bun), [Selenium Grid](/circuits/selenium), [OpenVox](/circuits/openvox), [Rust](/circuits/rust), [Go](/circuits/go), [Python](/circuits/python), [Ruby](/circuits/ruby), [Kotlin](/circuits/kotlin), [.NET](/circuits/dotnet), [C toolchain](/circuits/c-toolchain).
