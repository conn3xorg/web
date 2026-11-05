---
title: in-toto
description: "in-toto in its own venv, from hash-locked requirements, for verifying how software was built."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-in-toto at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/in-toto/grade.svg)](https://conn3x.org/circuits/in-toto/grade)

A Conn3x circuit that installs the in-toto command-line tools on your hosts. With them, each machine in a build records what it did and signs it, and whoever receives the result can check that every step happened, was done by the right person, and that nothing was swapped in between.

Each host gets in-toto 3.1.0 in a virtual environment of its own under `/opt/in-toto`, installed by pip from a requirements file that pins every package and the SHA-256 of every file it may download. The commands are linked into `/usr/local/bin`.

## Usage

```hcl
module "in_toto" {
  source = "github.com/conn3xorg/circuit-in-toto?ref=v0.1.0"

  hosts                = { build = "203.0.113.10", release = "203.0.113.11" }
  ssh_private_key_file = "~/.ssh/id_ed25519"
}
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

On a build host, each step runs through `in-toto-run`, which records its materials and products in a signed link file:

```sh
in-toto-run -n package --signing-key bob -m app.sh -p app.tar.gz -- tar -czf app.tar.gz app.sh
```

Where the result lands, `in-toto-verify` checks the links against a layout the project owner signed:

```sh
in-toto-verify --layout root.layout --verification-keys owner.pub
```

The keys are PEM files: PKCS8 for the private ones, SubjectPublicKeyInfo for the public. in-toto takes ed25519, RSA and ECDSA P-256 keys; the example uses ed25519. in-toto 3 has no command to make keys or layouts any more, so [examples/local/check.sh](https://github.com/conn3xorg/circuit-in-toto/blob/v0.1.0/examples/local/check.sh) does both with a few lines of Python from the same venv. It's a whole working example: three keys, a two-step layout with an inspection, and the two kinds of tampering it catches.

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-in-toto/tree/v0.1.0/examples/local).

## Which version, and why

The default is 3.1.0, the latest release on PyPI when this was written. A Python package isn't one file, so pinning in-toto alone would leave its dependencies to pip's choice on the day. [requirements.txt](https://github.com/conn3xorg/circuit-in-toto/blob/v0.1.0/requirements.txt) pins all ten packages, each with the hashes of every file PyPI has for that version, and the install uses:

- `--require-hashes`, so a file whose SHA-256 isn't listed is refused before it's installed
- `--only-binary :all:`, so only wheels are used and no package's build code runs
- `--no-deps`, so nothing outside the file comes in

Your pip settings still apply, so a host that installs through a mirror keeps doing so. The hashes are what's checked.

For another version, lock it yourself and pass both. Check its changelog first:

```sh
echo 'in-toto==3.1.0' | uv pip compile --generate-hashes --universal --python-version 3.12 --no-header - > in-toto.txt
```

```hcl
in_toto_version = "3.1.0"
requirements    = file("${path.module}/in-toto.txt")
```

`pip-compile --generate-hashes` from pip-tools writes the same format. The plan stops if `requirements` doesn't pin `in-toto==<in_toto_version>` with hashes, or if you change `in_toto_version` without it.

## What it does

Before the circuit runs, the `conn3x_host` data source reads each host's distribution over SSH. Then, on each host:

1. Installs `python3`, and `python3-venv` on Debian and Ubuntu.
2. Makes a virtual environment at `/opt/in-toto/<version>` with the distribution's Python. If the venv's pip stops running, as after an upgrade to a new Python minor release, it's made again from scratch.
3. Writes the requirements to `/opt/in-toto/<version>.requirements.txt` and installs from them with pip. A copy inside the venv records what was installed, so the next plan knows whether anything changed. Changed requirements install again, and so does a venv where `pip check` finds a problem.
4. Links `in-toto-run`, `in-toto-record`, `in-toto-verify`, `in-toto-sign`, `in-toto-match-products` and `in-toto-mock` into `/usr/local/bin`.

### What it doesn't do

- It doesn't make or hand out keys, write layouts or run anything through in-toto. That's your build's job.
- It doesn't set up GPG. in-toto can sign with GPG keys, but that needs `gpg` on the host, which this circuit doesn't install.
- It doesn't install the attestation tooling for in-toto's newer statement format, or any of the in-toto ports in other languages.
- It doesn't keep old versions tidy. A new `in_toto_version` gets its own venv and leaves the previous one under `/opt/in-toto`.
- It doesn't support RHEL, AlmaLinux, Ubuntu 22.04 or Debian 12, and the plan stops on them. They just haven't been tested here.
- Deleting the module leaves the venv and the links in place.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `in_toto_version` | string | `"3.1.0"` | in-toto release to install. Any other needs `requirements`. See [Which version, and why](#which-version-and-why). |
| `requirements` | string | `null` | Hash-locked pip requirements for `in_toto_version`. When null, the module's `requirements.txt` for 3.1.0. |

## Outputs

| Name | Description |
| --- | --- |
| `venv` | `/opt/in-toto/<version>`, the virtual environment in-toto is in. |
| `commands` | The in-toto commands linked into `/usr/local/bin`. |
| `version` | The in-toto release installed. |

## Requirements

Requires Conn3x v0.7.0 or later. Hosts need to reach PyPI, or a mirror pip is set up to use. The Python each distribution ships works: 3.12 on Ubuntu 24.04 and Rocky Linux 10, 3.13 on Debian 13, and Fedora 45's own.

## Tested on

Ubuntu 24.04, Debian 13, Rocky Linux 10 and Fedora 45, with in-toto 3.1.0. [examples/local](https://github.com/conn3xorg/circuit-in-toto/tree/v0.1.0/examples/local) was applied to each in a container on arm64, and CI does the same on amd64: it checks that the second plan has no changes, then runs `check.sh`, which makes three ed25519 keys and a two-step layout with an inspection, runs the build through `in-toto-run`, and checks that `in-toto-verify` accepts it and refuses both a source file changed between the steps and a tarball swapped afterwards. Then it restarts the container, plans again with no changes, and runs the check again. On Debian 13, requirements with one hash changed failed the apply with pip's hash mismatch, and an `in_toto_version` without `requirements` stopped the plan.

On an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, both `s-1vcpu-1gb`, the circuit was applied and the same check passed. Changed requirements installed again, and the plan after had no changes. After a reboot the plan had no changes and the check passed again. Debian 13 and Fedora 45 ran in containers only.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-in-toto/blob/v0.1.0/LICENSE). in-toto is Apache-2.0.

## Source

- Repository: [conn3xorg/circuit-in-toto](https://github.com/conn3xorg/circuit-in-toto). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-in-toto/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-in-toto/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-in-toto/tree/v0.1.0/examples/local).
- Related circuits: [Baseline](/circuits/baseline), [Hardening](/circuits/hardening), [Firewall](/circuits/firewall), [fail2ban](/circuits/fail2ban), [Automatic updates](/circuits/auto-updates), [OpenSCAP](/circuits/openscap), [auditd](/circuits/auditd), [Trivy](/circuits/trivy), [CISO Assistant](/circuits/ciso-assistant), [ZAP](/circuits/zap), [checkov](/circuits/checkov), [cosign](/circuits/cosign), [TruffleHog](/circuits/trufflehog).
