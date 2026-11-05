---
title: checkov
description: "A pinned checkov in its own venv, installed from a hash-checked lock, for scanning infrastructure code."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-checkov at v0.2.0. -->

[![Conn3x grade](https://conn3x.org/circuits/checkov/grade.svg)](https://conn3x.org/circuits/checkov/grade)

A Conn3x circuit that installs checkov, Prisma Cloud's scanner for misconfigured infrastructure code, on your hosts. Each host gets checkov 3.4.3 in a Python virtual environment of its own, and every package that goes into it is checked against a SHA-256 before pip installs it. `checkov` lands on the path, ready to scan Terraform, Kubernetes manifests, Dockerfiles and the rest from a CI runner or a build box.

It installs the tool and stops there. What you scan, and when, is up to you.

## Usage

```hcl
module "checkov" {
  source = "github.com/conn3xorg/circuit-checkov?ref=v0.2.0"

  hosts                = { ci = "203.0.113.10" }
  ssh_private_key_file = "~/.ssh/id_ed25519"
}
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

On the host, point it at a directory:

```sh
checkov -d ./infra --framework terraform
```

checkov exits 1 when a check fails, so a pipeline step stops on its own.

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-checkov/tree/v0.2.0/examples/local).

## How it's pinned

checkov is a Python program with a long list of dependencies, and `pip install checkov` gives you whatever versions of them PyPI has that day. So this circuit ships a lock: [requirements/checkov-3.4.3.txt](https://github.com/conn3xorg/circuit-checkov/blob/v0.2.0/requirements/checkov-3.4.3.txt) names an exact version of checkov and of each package it needs, with the SHA-256 of every file PyPI has for that version. On each host, pip runs with `--require-hashes`, so a file whose hash isn't in the lock is refused, and `--only-binary :all:`, so nothing is compiled on the host and no build tool is fetched outside the lock.

That's also why it isn't the release zip on GitHub. That's a single x86_64 binary with no published checksum, so there would be nothing to check it against and nothing for arm64.

To move to another release, make a lock for it with [uv](https://docs.astral.sh/uv/) and pass both:

```sh
echo 'checkov==3.4.3' > requirements.in
uv pip compile --universal --python-version 3.12 --generate-hashes requirements.in -o checkov-3.4.3.txt
```

```hcl
checkov_version   = "3.4.3"
requirements_file = "${path.root}/checkov-3.4.3.txt"
```

The lock is copied to each host by a file step, so its contents, about 177 KB of package names, versions and hashes, are stored in Conn3x state. It holds no secrets.

The plan stops when there's no lock for `checkov_version`, or the lock doesn't pin that version. A changed lock reinstalls the virtual environment from scratch.

## What it does

Before the circuit runs, the `conn3x_host` data source reads each host's distribution over SSH. Then, on each host:

1. Installs Python, and on Debian and Ubuntu `python3-venv`.
2. Copies the lock to `/opt/checkov/<version>/requirements.txt`.
3. Builds a virtual environment at `/opt/checkov/<version>/venv` and installs the lock into it, then checks `checkov --version` runs. It does this again whenever the lock changes or checkov stops running, such as after a Python upgrade breaks the environment.
4. Links `/usr/local/bin/checkov` to it.

The virtual environment keeps checkov's pins away from your system's Python packages, and theirs away from checkov.

### Which Python

checkov lists Python 3.9 to 3.12. Ubuntu 24.04 and Rocky Linux 10 ship 3.12 and Debian 13 ships 3.13, and checkov runs on each from the system's `python3`. Fedora 45's `python3` is 3.15, and checkov holds `aiodns` below 4, which holds `pycares` to 4.x, which has no wheels for 3.15. So on Fedora the circuit installs Fedora's `python3.12` package and builds the environment with that.

### Hosts created in the same plan

The circuit picks the Python from each host's facts, and a host that doesn't exist yet has none to read. For a host made in the same plan, or behind a module `depends_on`, give its distribution as `os`:

```hcl
hosts = {
  ci = { address = digitalocean_droplet.ci.ipv4_address, os = "fedora" }
}
```

`os` is one of `debian`, `ubuntu`, `rocky`, `almalinux`, `rhel` or `fedora`. When the host can be read, the plan stops if `os` is wrong.

### What it doesn't do

- It doesn't scan anything, schedule scans or send results anywhere. Run `checkov` from your own scripts or CI.
- It doesn't connect checkov to Prisma Cloud. That needs an API key, which you'd pass when you run it.
- It doesn't keep old versions tidy. A new `checkov_version` leaves the previous one under `/opt/checkov`.
- Deleting the module leaves checkov in place.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file`, `jump_hosts` and `os`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `checkov_version` | string | `"3.4.3"` | checkov release to install. |
| `requirements_file` | string | `null` | Path, on the machine running Conn3x, of a lock that pins `checkov_version` and every package it needs with `--hash`. When null, the one this circuit ships for `checkov_version`. See [How it's pinned](#how-its-pinned). |

## Outputs

| Name | Description |
| --- | --- |
| `checkov_version` | checkov release installed. |
| `checkov_path` | `/usr/local/bin/checkov`. |

## Requirements

Requires Conn3x v0.7.0 or later. Hosts need to reach PyPI, `pypi.org` and `files.pythonhosted.org`, and their package repositories for Python. The environment took 264 MB on Ubuntu 24.04 on arm64.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13, with checkov 3.4.3. [examples/local](https://github.com/conn3xorg/circuit-checkov/tree/v0.2.0/examples/local) was applied to each in a container on arm64, and CI does the same on amd64. It checks that the second plan has no changes, plants a Terraform file with a security group open to `0.0.0.0/0` on port 22, and checks checkov exits 1 and reports `CKV_AWS_24` against `aws_security_group.ssh`. Then it narrows the group to `192.0.2.0/24` and checks the same check passes. After a restart of the container, `checkov --version` runs and the plan has no changes. On Ubuntu 24.04 and Debian 13, pip refused the lock with checkov's hash changed.

On an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, both `s-1vcpu-1gb`, the circuit was applied to both hosts at once and the same check passed. After a reboot, checkov ran and the plan had no changes.

Not run: Debian 13 or Fedora 45 on a real host, arm64 on a real host, a move to a new lock.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-checkov/blob/v0.2.0/LICENSE). checkov is Apache-2.0.

## Source

- Repository: [conn3xorg/circuit-checkov](https://github.com/conn3xorg/circuit-checkov). This page covers [v0.2.0](https://github.com/conn3xorg/circuit-checkov/tree/v0.2.0); the repository's [tags](https://github.com/conn3xorg/circuit-checkov/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-checkov/tree/v0.2.0/examples/local).
- Related circuits: [Baseline](/circuits/baseline), [Hardening](/circuits/hardening), [Firewall](/circuits/firewall), [fail2ban](/circuits/fail2ban), [Automatic updates](/circuits/auto-updates), [OpenSCAP](/circuits/openscap), [auditd](/circuits/auditd), [Trivy](/circuits/trivy), [CISO Assistant](/circuits/ciso-assistant), [ZAP](/circuits/zap), [cosign](/circuits/cosign), [in-toto](/circuits/in-toto), [TruffleHog](/circuits/trufflehog).
