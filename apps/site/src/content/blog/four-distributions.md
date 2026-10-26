---
title: "Four distributions, every change"
description: "Every pull request to Conn3x is applied to Rocky Linux, Fedora, Ubuntu and Debian hosts before it can merge. Every night, a plan builds real droplets and sets them up. Every release is signed. Here's what each check catches."
date: 2026-12-06
author: James Conway
image: /media/blog/four-distributions/card.png
imageAlt: "Test output: the package lifecycle test passing on Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13."
---

A tool that changes your servers is only as good as the last distribution it was tried on. Most of us have met the one that was clearly written on Ubuntu: it calls `apt` on a Rocky box, restarts `ssh` where the unit is `sshd`, and opens a port with `ufw` on a host that runs firewalld.

You shouldn't have to find that out on your servers. So before any change to Conn3x reaches you, it passes three gates, and each one catches what the gate before it can't.

<figure>
  <a href="/media/blog/four-distributions/gates.png">
    <img src="/media/blog/four-distributions/gates.png" width="1600" height="1702" loading="lazy" decoding="async" alt="Three gates. Every pull request: circuits applied to Rocky 10, Fedora 45, Ubuntu 24.04 and Debian 13 hosts, with the agent off and required, plus example, upstream-edit and size checks. Every night: two DigitalOcean droplets created and set up in one plan, then checked. Every release: signed checksums, build provenance and SBOMs." />
  </a>
  <figcaption>The three gates, as of v0.6.3.</figcaption>
</figure>

<details>
<summary>Read the diagram as text</summary>

- **Every pull request**, as required checks: circuits applied over SSH to Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13 hosts running in Podman, then checked on the host, once with the host agent off and once with it required. Every docs example and every `examples/` directory must validate. Every OpenTofu file Conn3x changes is marked, and more than five fails. The build fails if `conn3x` grows past the `tofu` it's built from.
- **Every night:** one plan creates a Rocky Linux 10 and an Ubuntu 24.04 droplet on DigitalOcean and sets them up, with firewalld and ufw, SELinux, a mount, sysctl, sudo and a reboot. Then it fetches the page through the firewall, reads the host as root, plans again for `No changes.` and runs drift for `No drift`.
- **Every release:** built in GitHub Actions. `checksums.txt` is signed with cosign, every archive has build provenance you can check with `gh attestation verify`, and every archive has an SBOM.

</details>

## Every pull request: four distributions

The end-to-end tests don't mock a server. Each one starts a container with systemd running as PID 1 and sshd listening, then drives the real `conn3x` binary against it over SSH, exactly as you would. The images are built from Containerfiles in the repository:

- **Rocky Linux 10**, for the RHEL family.
- **Fedora 45**, which gets new packages and new systemd first.
- **Ubuntu 24.04**, the most common thing in a cloud console.
- **Debian 13**, where Ubuntu's defaults came from, and where they sometimes differ.

That's two package managers, two families of defaults and four sets of opinions about what a service is called. Sixteen of the test files repeat their cases on all four. Take the package test. It installs a package, then looks for it on the host itself rather than trusting Conn3x's report. It plans again and wants `No changes.` It removes the package by hand with `dnf` or `apt-get`, and expects the next plan to notice and the next apply to put it back. Then it deletes the step and checks the package is gone.

Then the whole run happens twice. The host agent, which is experimental and off by default, gets a leg of its own with the agent required: any apply that couldn't use it fails. When the agent is ready to be the default, it won't be meeting these distributions for the first time.

A few other checks ride along on every pull request, and each exists because of a promise somewhere else:

- **Every example works.** Each HCL example on the module reference pages is validated against the build, and so is every directory in `examples/`. The docs can't show you a step that doesn't exist.
- **Four upstream edits.** Conn3x is built on OpenTofu, and it changes four of OpenTofu's files. Each change is marked with a `// CONN3X:` comment, and CI fails if one goes unmarked or the count passes five. Small edits are what keep OpenTofu's fixes, security ones included, flowing into Conn3x without a fight.
- **Smaller than tofu.** The build fails if the `conn3x` binary grows past the `tofu` binary built from the same tree. On the last build it was 113 MB against 114. Everything Conn3x adds has to pay for itself.

Nothing merges until all of it is green.

## Every night: real machines

Containers are fast, and they're honest about packages, files and services. They can't show you a kernel. SELinux, firewall rules, sysctl values, mounts and reboots all need a real machine, so every night a scheduled job builds two.

It's one plan, the way you'd write it. A DigitalOcean provider creates a Rocky Linux 10 droplet and an Ubuntu 24.04 one, and circuits in the same configuration set them up: nginx behind firewalld on one and ufw on the other, an SELinux boolean and a file label, a tmpfs mount, sysctl values, a hostname, a file written through sudo with a password, and a reboot halfway through the edge host's steps.

Then the test checks the work without taking Conn3x's word for it. It fetches each page over HTTP, through the firewall. It opens its own SSH connection as root and reads the sysctl values, the SELinux label and the mount straight off the host. It plans again and expects `No changes.`, and it runs `conn3x drift` and expects `No drift`. Every droplet is tagged `conn3x-ci` and destroyed when the test ends, and a sweep deletes anything tagged that's more than an hour old, in case a run dies halfway.

It earns its keep. In October, two runs of the nightly job failed on real droplets: a dnf install that collided with another one on the same host, and a service read back while systemd was reloading. Both were real races, the containers had never tripped over them, and both are fixed in [v0.6.3](https://github.com/conn3xorg/conn3x/releases/tag/v0.6.3).

## Every release: proof you can check

Releases are built by a workflow in GitHub Actions, never on a laptop, and each one carries three kinds of evidence:

- **A signature.** `checksums.txt` is signed with [cosign](https://docs.sigstore.dev/), keyless, so the signature names the exact workflow that made it and lands in Sigstore's public log.
- **Build provenance.** Every archive has a GitHub attestation saying which repository and workflow built it.
- **An SBOM** beside every archive, listing what went into the binary.

None of that helps unless you check it, and it takes about ten seconds:

<figure class="clip" data-clip>
  <video src="/media/blog/four-distributions/verify.mp4" poster="/media/blog/four-distributions/verify.webp" width="1280" height="720" controls muted loop playsinline preload="metadata" aria-label="A terminal: downloading conn3x v0.6.3 with its checksums and signature, cosign verify-blob printing Verified OK, sha256sum reporting the archive OK, gh attestation verify confirming the release workflow on main built it, then conn3x version printing v0.6.3."></video>
  <figcaption>Verifying the v0.6.3 download for real: the signature, the checksum, the provenance, then the binary.</figcaption>
  <button type="button" data-clip-toggle hidden>Pause</button>
</figure>

```sh
cosign verify-blob \
  --certificate-identity 'https://github.com/conn3xorg/conn3x/.github/workflows/release.yml@refs/heads/main' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --bundle checksums.txt.sigstore.json checksums.txt
sha256sum --check --ignore-missing checksums.txt
gh attestation verify conn3x_0.6.3_linux_amd64.tar.gz -R conn3xorg/conn3x
```

If the signature didn't come from that workflow on `main`, the first command fails. If the archive was changed after it was built, the second does.

## What isn't covered

Four distributions is a choice, not a claim about the world. If your servers run Alpine, Arch or openSUSE, Conn3x isn't tested there, and we'd rather tell you that than let you assume it. If it's what you run, [open an issue](https://github.com/conn3xorg/conn3x/issues) and say so. The fifth image is a Containerfile away, and knowing someone needs it is what puts it on the list.
