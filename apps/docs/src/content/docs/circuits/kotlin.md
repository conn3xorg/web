---
title: Kotlin
description: "One exact Kotlin compiler from JetBrains' releases, checked against its checksum, on a Java you provide."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-kotlin at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/kotlin/grade.svg)](https://conn3x.org/circuits/kotlin/grade)

A Conn3x circuit that puts one exact Kotlin compiler on your hosts, from the zip JetBrains attaches to each GitHub release, checked against its SHA-256. You get `kotlinc` and `kotlin`, 2.4.21 by default, the same on every distribution.

**You bring the Java.** The compiler is a JVM program, and which JDK a host runs is a decision that belongs elsewhere, so this circuit needs a `java` on the `PATH` and stops with a clear message if there isn't one. [circuit-java](/circuits/java) is the easy way, and what the usage below shows. The runtime it installs by default is enough to compile and run.

## Usage

```hcl
module "java" {
  source = "github.com/conn3xorg/circuit-java?ref=v0.1.0"

  hosts                = { build1 = "203.0.113.10" }
  ssh_private_key_file = "~/.ssh/id_ed25519"
}

module "kotlin" {
  source = "github.com/conn3xorg/circuit-kotlin?ref=v0.1.0"

  hosts                = { build1 = "203.0.113.10" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  depends_on = [module.java]
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

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-kotlin/tree/v0.1.0/examples/local).

### Changing the release

`kotlin_version` and `checksum` move together. Each release has `kotlin-compiler-VERSION.zip.sha256` beside the zip on [GitHub](https://github.com/JetBrains/kotlin/releases). A zip that doesn't match its checksum fails the apply. Each release gets its own directory, so the new one unpacks beside the old, and `kotlin` and `kotlinc` move over to it.

## What it does

On each host, in order:

1. Stops if `java` isn't on the `PATH`.
2. Installs `curl` and `unzip`.
3. Downloads `kotlin-compiler-VERSION.zip` to `/opt/kotlin`, keeping it only if its SHA-256 matches.
4. Unpacks it to `/opt/kotlin/VERSION/kotlinc`.
5. Links `kotlin` and `kotlinc` into `/usr/local/bin`.

### What it doesn't do

- It doesn't install Java, Gradle or Maven. Most Kotlin projects build with one of those, and those fetch their own compiler. This circuit is for hosts that call `kotlinc` directly.
- It doesn't install Kotlin/Native or the other tools in the zip's `bin` beyond those two commands. They stay in `/opt/kotlin/VERSION/kotlinc/bin`.
- It doesn't uninstall anything. An old release's directory and zip, and the whole install when you delete the module, stay on the host.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `kotlin_version` | string | `"2.4.21"` | Kotlin release to install. Change `checksum` with it. |
| `checksum` | string | The zip of 2.4.21 | SHA-256 of `kotlin-compiler-VERSION.zip`. |

## Outputs

| Name | Description |
| --- | --- |
| `kotlin_home` | Directory of the installed compiler on each host, by host name, such as `{ build1 = "/opt/kotlin/2.4.21/kotlinc" }`. |

## Requirements

Requires Conn3x v0.6.10 or later, a `java` on the `PATH` (Java 25 is what was tested), a package mirror each host can reach, and outbound HTTPS to github.com. The zip runs on any architecture Java does; amd64 and arm64 were tested.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. [examples/local](https://github.com/conn3xorg/circuit-kotlin/tree/v0.1.0/examples/local) was applied to each on arm64, and the second plan had no changes. Each had the Java 25 runtime from circuit-java v0.1.0, and `kotlinc` compiled a small program that ran under both `java -jar` and `kotlin`. CI runs the same checks on amd64.

On an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, both `s-1vcpu-1gb`, amd64, each shared with the other circuits of this batch: the same checks passed, and after a reboot the plan had no changes and they still passed.

`ssh_become` wasn't exercised: every test logged in as root.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-kotlin/blob/v0.1.0/LICENSE). Kotlin is under the Apache-2.0 license.

## Source

- Repository: [conn3xorg/circuit-kotlin](https://github.com/conn3xorg/circuit-kotlin). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-kotlin/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-kotlin/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-kotlin/tree/v0.1.0/examples/local).
- Related circuits: [Java](/circuits/java), [PHP-FPM](/circuits/php), [Jenkins](/circuits/jenkins), [GitHub Actions runner](/circuits/github-runner), [GitLab Runner](/circuits/gitlab-runner), [Cinc Client](/circuits/cinc), [Node.js](/circuits/nodejs), [Perl](/circuits/perl), [Bun](/circuits/bun), [Selenium Grid](/circuits/selenium), [OpenVox](/circuits/openvox), [Rust](/circuits/rust), [Go](/circuits/go), [Python](/circuits/python), [Ruby](/circuits/ruby), [.NET](/circuits/dotnet), [C toolchain](/circuits/c-toolchain).
