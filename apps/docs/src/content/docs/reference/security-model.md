---
title: Security model
description: "What Conn3x trusts, what it checks, and what it can't protect you from: the machine you run it on, SSH and host keys, root on the host, secrets and state, and how releases are signed."
---

Conn3x changes servers as root, so it's worth knowing exactly what it trusts and what it checks. This page is the short version. Found a gap? Please report it privately, as [SECURITY.md](https://github.com/conn3xorg/conn3x/blob/main/SECURITY.md) describes.

## What you're trusting

- **The machine you run `conn3x` on.** It holds your SSH keys, your cloud credentials and the state, and it decides what every host does. Anyone who controls it controls your hosts. Treat it like a bastion: patched, few users, and its disk encrypted.
- **The configuration you apply.** A circuit runs what it says, as the user it says. Review changes to circuits the way you review code, and pin shared circuits to a release with `?ref=`.
- **The providers and circuits you use.** Conn3x runs OpenTofu providers and shared circuits like any OpenTofu configuration does. Use ones you trust, and keep `.terraform.lock.hcl` in version control so a provider can't change under you.

## Connecting to hosts

- **SSH only, and host keys are always checked.** Every host's key is verified against your known_hosts file or a pinned `host_key`, and there's no setting to turn that off. A key that changed stops the plan. See [Troubleshooting](/troubleshooting#host-keys).
- **Every hop is checked too.** A [jump host](/reference/circuits/ssh) has its key verified, and so does the host behind it. With `proxy_command`, the SSH session still runs end to end, so the host's own key is checked as usual.
- **Old algorithms are opt-in, per host.** The SHA-1 SSH algorithms classic Cisco IOS needs are used only by a host that sets `legacy_algorithms = true`, never by default and never by a jump host. A pinned RSA `host_key` must sign with SHA-2.
- **Nothing is installed on the host.** Conn3x runs plain shell commands over SSH. The [Conn3x agent](/reference/cli#environment-variables), which runs commands through one long-lived process instead, is experimental and off unless you turn it on.

## On the host

- **Root through sudo, only when you ask.** With `become = true`, commands run through sudo; without it, as the user you log in as. A sudo password comes from `become_password_file` at run time and never goes into configuration or state.
- **Root doesn't write through someone else's path.** Before a file step writes as root, it checks who can change each directory on the way, and acts as that user, or stops, rather than follow a link another user planted. See [Paths as root](/guides/paths-as-root).
- **Values are quoted.** Steps quote each value from your configuration that they put into a shell command.
- **Network devices get a revert timer.** A change to a switch or router is committed with a timer and confirmed over a new login, so a change that cuts Conn3x off undoes itself. See [Network devices](/network-devices).

## Secrets and state

- **State holds what Conn3x read.** Like any OpenTofu state, it records your resources and what each step read from its host, which can include file contents and command output. Turn on [state encryption](https://opentofu.org/docs/language/state/encryption/), and store state where only the people who apply can read it; Conn3x warns at every plan while it's off.
- **Write-only arguments keep secrets out of state.** A password written with `content_wo`, or another `*_wo` argument, reaches the host but not the plan or the state, which keeps an HMAC to notice changes. See [Secrets](/reference/circuits/secrets).
- **Secrets can come from outside.** SOPS files through `ephemeral "conn3x_secrets"`, and private keys from ephemeral values, never touch state either.

## Releases

Every release is built by a GitHub Actions workflow from `main`, and:

- its `checksums.txt` is signed with Sigstore (keyless), so you can check it came from that workflow;
- each archive and package has an SBOM;
- builds carry provenance attestations;
- the container image is signed the same way;
- the apt and dnf repositories sign both packages and metadata.

[Install](/install) shows how to verify each.

## Reporting a problem

Report a vulnerability privately through [GitHub's private vulnerability reporting](https://github.com/conn3xorg/conn3x/security/advisories/new) or security@conn3x.org. Fixed issues are published as [security advisories](https://github.com/conn3xorg/conn3x/security/advisories).
