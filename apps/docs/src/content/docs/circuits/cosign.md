---
title: cosign
description: "A pinned, checksum-verified cosign on your hosts, for checking signatures on images and files."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-cosign at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/cosign/grade.svg)](https://conn3x.org/circuits/cosign/grade)

A Conn3x circuit that installs Sigstore's `cosign` on your hosts, so they can check signatures on the files and images they're handed before using them. Each host gets the release you pin, checked against its SHA-256 before it's kept, at `/usr/local/bin/cosign`.

That's all it does. Which keys and identities you trust, and what gets verified when, stays with you and your scripts.

## Usage

```hcl
module "cosign" {
  source = "github.com/conn3xorg/circuit-cosign?ref=v0.1.0"

  hosts                = { web = "203.0.113.10", build = "203.0.113.11" }
  ssh_private_key_file = "~/.ssh/id_ed25519"
}
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

On a host, checking a file you signed with your own key looks like this:

```sh
cosign verify-blob --key release.pub --bundle app.tar.gz.sigstore.json app.tar.gz
```

And checking a release signed in a GitHub Actions workflow, with no key to hand around, looks like this:

```sh
cosign verify-blob app.tar.gz --bundle app.tar.gz.sigstore.json \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp '^https://github.com/example/app/'
```

The second form fetches Sigstore's trust root and checks the transparency log, so the host needs to reach Sigstore's public services. The first doesn't, as long as the signature was made without them.

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-cosign/tree/v0.1.0/examples/local).

## Which version, and why

The default is 3.1.4, the latest release when this was written. GitHub marks the release immutable, and its `cosign_checksums.txt` passed `cosign verify-blob` against the identity Sigstore signs its releases with when it was pinned.

The circuit downloads the binary from the GitHub release and checks it against `checksums`, rather than using the `.deb` or `.rpm` beside it. One binary per architecture runs on every distribution here, and a version and checksum fixed in your configuration can't change under you.

To move to a newer release, verify its checksums and pass both:

```sh
v=3.1.4
curl -sSfLO "https://github.com/sigstore/cosign/releases/download/v$v/cosign_checksums.txt"
curl -sSfLO "https://github.com/sigstore/cosign/releases/download/v$v/cosign_checksums.txt.sigstore.json"
cosign verify-blob cosign_checksums.txt --bundle cosign_checksums.txt.sigstore.json \
  --certificate-identity keyless@projectsigstore.iam.gserviceaccount.com \
  --certificate-oidc-issuer https://accounts.google.com
grep -E ' cosign-linux-(amd64|arm64)$' cosign_checksums.txt
```

```hcl
cosign_version = "3.1.4"
checksums = {
  amd64 = "424e2c97d0b45fd7a6b608a87f090f35633f4c23ece5f092d48bba11aaf4bbfa"
  arm64 = "ade83b7aac62e131cacfe96d958948b2150cc9efec46a570a2649b8e27dedad2"
}
```

## Signing without Sigstore's services

cosign 3 asks Sigstore's TUF repository for a signing config by default, and signs with a transparency log entry. If you sign with your own key and keep everything in-house, give it an empty signing config instead. This is what the check in CI does:

```sh
cosign signing-config create --out offline.json
cosign sign-blob --yes --key cosign.key --signing-config offline.json --bundle app.sigstore.json app.tar.gz
cosign verify-blob --key cosign.pub --bundle app.sigstore.json --insecure-ignore-tlog app.tar.gz
```

`--insecure-ignore-tlog` is needed because there's no log entry to check. You lose the public record of when the signature was made, so keep the private key somewhere it can't be quietly used.

## What it does

Before the circuit runs, the `conn3x_host` data source reads each host's architecture and distribution over SSH. Then, on each host:

1. Installs `curl`.
2. Downloads `cosign-linux-amd64` or `cosign-linux-arm64` to `/opt/cosign/<version>/cosign`, keeping it only if its SHA-256 matches `checksums`.
3. Links `/usr/local/bin/cosign` to it.

### What it doesn't do

- It doesn't manage keys, policies or anything to verify. Bring your own.
- It doesn't install the policy controller or anything for Kubernetes.
- It doesn't keep old versions tidy. A new `cosign_version` leaves the previous one under `/opt/cosign`.
- It doesn't support RHEL, AlmaLinux, Ubuntu 22.04 or Debian 12, and the plan stops on them. They just haven't been tested here.
- Deleting the module leaves cosign in place.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `cosign_version` | string | `"3.1.4"` | cosign release to install. See [Which version, and why](#which-version-and-why). |
| `checksums` | map(string) | SHA-256s of 3.1.4 | SHA-256 of the release binary, by `amd64` and `arm64`. Change it with `cosign_version`. |

## Outputs

| Name | Description |
| --- | --- |
| `path` | `/usr/local/bin/cosign`. |
| `version` | The cosign release installed. |

## Requirements

Requires Conn3x v0.7.0 or later. Hosts need to reach GitHub for the release.

## Tested on

Ubuntu 24.04, Debian 13, Rocky Linux 10 and Fedora 45, with cosign 3.1.4. [examples/local](https://github.com/conn3xorg/circuit-cosign/tree/v0.1.0/examples/local) was applied to each in a container on arm64, and CI does the same on amd64: it checks that the second plan has no changes, then runs `check.sh`, which makes a key pair on the host, signs a file with an empty signing config, verifies it, checks that a changed copy of the file is refused, and checks cosign didn't fetch Sigstore's trust root. Then it restarts the container, plans again with no changes, and runs the check again.

On an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, both `s-1vcpu-1gb`, the circuit was applied and the same check passed. After a reboot the plan had no changes and the check passed again. Debian 13 and Fedora 45 ran in containers only.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-cosign/blob/v0.1.0/LICENSE). cosign is Apache-2.0.

## Source

- Repository: [conn3xorg/circuit-cosign](https://github.com/conn3xorg/circuit-cosign). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-cosign/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-cosign/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-cosign/tree/v0.1.0/examples/local).
- Related circuits: [Baseline](/circuits/baseline), [Hardening](/circuits/hardening), [Firewall](/circuits/firewall), [fail2ban](/circuits/fail2ban), [Automatic updates](/circuits/auto-updates), [OpenSCAP](/circuits/openscap), [auditd](/circuits/auditd), [Trivy](/circuits/trivy), [CISO Assistant](/circuits/ciso-assistant), [ZAP](/circuits/zap), [checkov](/circuits/checkov), [in-toto](/circuits/in-toto), [TruffleHog](/circuits/trufflehog).
