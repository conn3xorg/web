---
title: Java
description: "OpenJDK or Eclipse Temurin 21 or 25 on Debian, Ubuntu, Fedora and Rocky, set as the default java with JAVA_HOME exported."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-java at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/java/grade.svg)](https://conn3x.org/circuits/java/grade)

A Conn3x circuit that installs a Java runtime, or a full JDK, on your hosts and makes it the Java they use. You pick the release, 25 by default, and where it comes from: the distribution's own OpenJDK packages, or Eclipse Temurin from Adoptium's repository. The circuit sorts out the rest, which is mostly names. The same OpenJDK 25 runtime is `openjdk-25-jre-headless` on Debian and Ubuntu, `java-25-openjdk-headless` on Fedora and Rocky Linux, and lives in a directory whose name carries the architecture on one family and not the other.

It then points `java` at that release through the alternatives system and exports `JAVA_HOME` from `/etc/profile.d`, so a login shell, a build script or a service you start by hand all find the same Java. The `java_home` output hands the path to whatever you run on top, such as a systemd unit's `Environment=JAVA_HOME=`.

## Usage

```hcl
module "java" {
  source = "github.com/conn3xorg/circuit-java?ref=v0.1.0"

  hosts                = { app1 = "203.0.113.10", app2 = "203.0.113.11" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  java_version = 21
}
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

For a build host, set `jdk = true` to get `javac` and the rest of the JDK. For Temurin, set `java_source = "temurin"`:

```hcl
module "java" {
  source = "github.com/conn3xorg/circuit-java?ref=v0.1.0"

  hosts       = { ci1 = "203.0.113.20" }
  java_source = "temurin"
  jdk         = true
}
```

For hosts created in the same plan, pass host objects with the host key you generated, so Conn3x checks it without a known_hosts entry. Give each one's distribution in `os` too: the circuit picks Adoptium's repository by distribution, and Conn3x can't ask a host that doesn't exist yet. If `os` turns out not to match the host, Conn3x stops before configuring it. Set `os` as well when you put `depends_on` on this module: `depends_on` holds back reading the hosts until the apply, so without `os` the plan fails with `Invalid for_each argument`.

```hcl
hosts = {
  for name, d in digitalocean_droplet.app : name => {
    address  = d.ipv4_address
    host_key = tls_private_key.host[name].public_key_openssh
    os       = "ubuntu"
  }
}
```

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-java/tree/v0.1.0/examples/local).

### Which releases you can pick

From the distribution, a release is there only if the distribution packages it. Checked in October 2026:

| Distribution | OpenJDK releases |
| --- | --- |
| Ubuntu 24.04 | 8, 11, 17, 21, 25 |
| Debian 13 | 21, 25 |
| Rocky Linux 10 | 21, 25 |
| Fedora 45 | 25 |

Fedora 45 keeps one LTS release, so `java_version = 21` fails there with the package not found. Temurin publishes 8, 11, 17, 21 and 25 for all four, so `java_source = "temurin"` is the way to run 21 on Fedora.

### Several Javas on one host

Java releases install side by side, and installing one never removes another. With `set_default` on, the default, the circuit points `java` (and `javac`, with `jdk`) at the release it installed, in the alternatives system's manual mode, so a second Java installed later doesn't move it, even Temurin, whose packages ask for a higher priority than OpenJDK's.

To install a second release without taking over `java`, use another module with `set_default = false` and read its path from `java_home`:

```hcl
module "java17" {
  source = "github.com/conn3xorg/circuit-java?ref=v0.1.0"

  hosts        = { app1 = "203.0.113.10" }
  java_version = 17
  set_default  = false
}
```

Keep `set_default` on in one module per host. Two would both claim `java` and `/etc/profile.d/java_home.sh`, and each apply would undo the other.

### Other circuits on top

A circuit that runs a Java service can depend on this one and use `java_home` rather than install Java itself:

```hcl
module "java" {
  source = "github.com/conn3xorg/circuit-java?ref=v0.1.0"
  hosts  = { app1 = "203.0.113.10" }
}

# In your own circuit, after module.java:
#   Environment=JAVA_HOME=${module.java.java_home["app1"]}
```

## What it does

On each host, in order:

1. With `java_source = "temurin"`, adds Adoptium's repository with its signing key: `https://packages.adoptium.net/artifactory/deb` on Debian and Ubuntu, with the release's codename as the suite, and `https://packages.adoptium.net/artifactory/rpm/fedora/$releasever/$basearch` on Fedora or `.../rpm/rhel/$releasever/$basearch` on Rocky Linux, AlmaLinux, RHEL and CentOS Stream. The key, in `files/adoptium.asc`, is fingerprint `3B04 D753 C905 0D9A 5D34 3F39 843C 48A5 65F8 F04B` and has no expiry date.
2. Installs one package:

   | | Runtime | JDK (`jdk = true`) |
   | --- | --- | --- |
   | Distribution, Debian and Ubuntu | `openjdk-N-jre-headless` | `openjdk-N-jdk-headless` |
   | Distribution, Red Hat family | `java-N-openjdk-headless` | `java-N-openjdk-devel` |
   | Temurin, Debian and Ubuntu | `temurin-N-jre` | `temurin-N-jdk` |
   | Temurin, Red Hat family | `temurin-N-jre-headless` | `temurin-N-jdk` |

   Adoptium has no headless runtime for apt, so `temurin-N-jre` there brings a few X11 libraries with it. On the Red Hat family, `java-N-openjdk-devel` pulls in the full runtime, with its X11 and font libraries, rather than the headless one.
3. With `set_default`, runs `update-alternatives --set java` (and `javac`, with `jdk`) on the release's own binaries, unless `java` already resolves to them. It checks again after the package updates.
4. With `set_default`, writes `/etc/profile.d/java_home.sh`, which exports `JAVA_HOME`.

`JAVA_HOME`, and the `java_home` output, is:

| | Path |
| --- | --- |
| Distribution, Debian and Ubuntu | `/usr/lib/jvm/java-N-openjdk-ARCH`, such as `java-25-openjdk-amd64` |
| Distribution, Red Hat family | `/usr/lib/jvm/jre-N`, or `/usr/lib/jvm/java-N` with `jdk` |
| Temurin, Debian and Ubuntu | `/usr/lib/jvm/temurin-N-jre-ARCH` or `temurin-N-jdk-ARCH` |
| Temurin, Red Hat family | `/usr/lib/jvm/temurin-N-jre-headless` or `temurin-N-jdk` |

On the Red Hat family these are links: `jre-N` and `java-N` follow the newest installed build through the alternatives system, and Temurin's packages keep a link named after the package. Either way the path holds across updates.

Before the circuit runs, the `conn3x_host` data source reads each host's distribution, release and architecture over SSH. The distribution picks the packages and the repository, the release picks Adoptium's apt suite, and the architecture is part of Java's directory name on Debian and Ubuntu.

### What it doesn't do

- It doesn't pin a patch release. Updates arrive with the host's other package updates, from the distribution or from Adoptium.
- It doesn't download tarballs, or install builds other than OpenJDK and Temurin.
- `JAVA_HOME` reaches login shells. systemd services don't read `/etc/profile.d`, so give a unit its own `Environment=JAVA_HOME=` from the `java_home` output.
- Deleting the module, or changing `java_version` or `java_source`, leaves the old packages installed, the Adoptium repository in place, and `/etc/profile.d/java_home.sh` with its last content when `set_default` goes off.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file`, `jump_hosts` and `os`, the distribution's ID, such as `ubuntu` or `rocky`, which a host created in the same plan needs. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `java_version` | number | `25` | Java release to install, such as `21` or `25`. See [which releases you can pick](#which-releases-you-can-pick). |
| `jdk` | bool | `false` | Install the JDK, with `javac`, instead of the runtime alone. |
| `java_source` | string | `"distribution"` | `"distribution"` for the distribution's OpenJDK packages, or `"temurin"` for Eclipse Temurin from Adoptium's repository. |
| `set_default` | bool | `true` | Point `java` (and `javac`) at this release through the alternatives system, and export its `JAVA_HOME` from `/etc/profile.d/java_home.sh`. |

## Outputs

| Name | Description |
| --- | --- |
| `java_home` | `JAVA_HOME` of the installed release on each host, by host name, such as `{ app1 = "/usr/lib/jvm/java-25-openjdk-amd64" }`. |

## Requirements

Requires Conn3x v0.6.9 or later, and a package mirror each host can reach. With `java_source = "temurin"`, hosts also need outbound HTTPS to packages.adoptium.net. Temurin's apt suites cover Debian 12 and 13 and Ubuntu 22.04, 24.04 and 26.04 here; on another Debian or Ubuntu release the plan stops with a message. amd64 and arm64.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13, from both sources. [examples/local](https://github.com/conn3xorg/circuit-java/tree/v0.1.0/examples/local) was applied to each on arm64 with Java 25, once from the distribution and once from Temurin, and the second plan had no changes. In a login shell, `java -version` reported 25, `JAVA_HOME` pointed at the same Java as `java`, and `javac` was there. The runtime alone (`jdk = false`) was applied the same way on Rocky Linux 10 and Debian 13 from both sources. On Rocky Linux 10 and Ubuntu 24.04, switching a host from the distribution's OpenJDK to Temurin and back moved `java` and `JAVA_HOME` each time, with clean plans after. CI runs the same checks on amd64, and the switch on each distribution.

On an Ubuntu 24.04 droplet, OpenJDK 21 from the distribution went on with `set_default = false` next to the Temurin 25 JDK as the default. On a Rocky Linux 10 droplet with SELinux enforcing, the OpenJDK 25 runtime was the default next to a 21 JDK with `set_default = false`. Both `s-1vcpu-1gb`, amd64. On each, `java` and `JAVA_HOME` were the default release, the other release ran from its `java_home`, and after a reboot they still were and the plan was clean.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-java/blob/v0.1.0/LICENSE). OpenJDK and Temurin are GPL-2.0 with the Classpath Exception.

## Source

- Repository: [conn3xorg/circuit-java](https://github.com/conn3xorg/circuit-java). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-java/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-java/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-java/tree/v0.1.0/examples/local).
- Related circuits: [PHP-FPM](/circuits/php), [Jenkins](/circuits/jenkins), [GitHub Actions runner](/circuits/github-runner), [GitLab Runner](/circuits/gitlab-runner), [Cinc Client](/circuits/cinc), [Node.js](/circuits/nodejs), [Perl](/circuits/perl), [Bun](/circuits/bun), [Selenium Grid](/circuits/selenium), [OpenVox](/circuits/openvox), [Rust](/circuits/rust), [Go](/circuits/go), [Python](/circuits/python), [Ruby](/circuits/ruby), [Kotlin](/circuits/kotlin), [.NET](/circuits/dotnet), [C toolchain](/circuits/c-toolchain).
