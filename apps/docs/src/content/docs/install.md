---
title: Install
description: Install the conn3x binary on Linux, macOS or Windows.
---

Conn3x is a single binary. Download it from the [latest release](https://github.com/conn3xorg/conn3x/releases/latest), or build it from source.

## Homebrew

On macOS:

```sh
brew install conn3xorg/tap/conn3x
```

Homebrew clears the macOS quarantine flag for you, and `brew upgrade` picks up new releases.

## Download a release

Pick the archive for your system. Replace `0.24.0` with the version you want.

```sh
VERSION=0.24.0
OS=linux        # or darwin
ARCH=amd64      # or arm64
curl -fsSLO "https://github.com/conn3xorg/conn3x/releases/download/v${VERSION}/conn3x_${VERSION}_${OS}_${ARCH}.tar.gz"
tar -xzf "conn3x_${VERSION}_${OS}_${ARCH}.tar.gz" conn3x
sudo install conn3x /usr/local/bin/
conn3x version
```

On macOS, the binary isn't notarised by Apple yet. If macOS refuses to open it, clear the quarantine flag:

```sh
xattr -d com.apple.quarantine /usr/local/bin/conn3x
```

## Debian, Ubuntu, Rocky Linux and Fedora

Since v0.20.0, Conn3x has its own apt and dnf repositories, so `apt upgrade` and `dnf upgrade` keep it current with everything else. The packages and the repository metadata are both signed with the Conn3x packaging key.

On Debian and Ubuntu:

```sh
sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://conn3xorg.github.io/packages/conn3x.asc | sudo tee /etc/apt/keyrings/conn3x.asc >/dev/null
curl -fsSL https://conn3xorg.github.io/packages/apt/conn3x.sources | sudo tee /etc/apt/sources.list.d/conn3x.sources >/dev/null
sudo apt update
sudo apt install conn3x
```

On Rocky Linux, RHEL, AlmaLinux and Fedora:

```sh
sudo curl -fsSL -o /etc/yum.repos.d/conn3x.repo https://conn3xorg.github.io/packages/rpm/conn3x.repo
sudo dnf install conn3x
```

dnf asks you to accept the key the first time; `gpgcheck` and `repo_gpgcheck` are both on. The packages put `conn3x` in `/usr/bin` and need nothing else, so `apt remove conn3x` or `dnf remove conn3x` takes it away cleanly.

### Without the repository

Each release since v0.14.0 also has a `.deb` and an `.rpm` for amd64 and arm64 on its release page. To install one by hand, check it against `checksums.txt`:

```sh
VERSION=0.24.0
BASE="https://github.com/conn3xorg/conn3x/releases/download/v${VERSION}"

# Debian and Ubuntu (arm64: conn3x_${VERSION}_arm64.deb)
curl -fsSLO "$BASE/conn3x_${VERSION}_amd64.deb" -O "$BASE/checksums.txt"
sha256sum --ignore-missing -c checksums.txt
sudo apt install "./conn3x_${VERSION}_amd64.deb"

# Rocky Linux, RHEL, AlmaLinux and Fedora (arm64: conn3x-${VERSION}-1.aarch64.rpm)
curl -fsSLO "$BASE/conn3x-${VERSION}-1.x86_64.rpm" -O "$BASE/checksums.txt"
sha256sum --ignore-missing -c checksums.txt
sudo dnf install "./conn3x-${VERSION}-1.x86_64.rpm"
```

`checksums.txt` is signed by the release workflow, and each package has its own build provenance, which `gh attestation verify conn3x_${VERSION}_amd64.deb -R conn3xorg/conn3x` checks.

## Windows

Since v0.10.0, each release has a zip for Windows on amd64 and arm64, holding `conn3x.exe`. Running Conn3x on Windows is [experimental](/reference/maturity). It has run a plan and apply from Windows Server 2025, against Ubuntu and against itself.

In PowerShell:

```powershell
$Version = "0.24.0"
$Arch = "amd64"   # or arm64
$Base = "https://github.com/conn3xorg/conn3x/releases/download/v$Version"
Invoke-WebRequest "$Base/conn3x_${Version}_windows_$Arch.zip" -OutFile conn3x.zip
Invoke-WebRequest "$Base/checksums.txt" -OutFile checksums.txt
$Want = (Select-String checksums.txt -Pattern "conn3x_${Version}_windows_$Arch.zip").Line.Split(" ")[0]
if ((Get-FileHash conn3x.zip).Hash -ne $Want) { throw "conn3x.zip doesn't match checksums.txt" }
Expand-Archive conn3x.zip -DestinationPath "$env:LOCALAPPDATA\conn3x"
& "$env:LOCALAPPDATA\conn3x\conn3x.exe" version
```

Add that folder to your `PATH` to run `conn3x` from anywhere.

To log in with a key from the SSH agent, use the OpenSSH agent that ships with Windows. Conn3x finds it on its named pipe, `\\.\pipe\openssh-ssh-agent`, when `SSH_AUTH_SOCK` isn't set:

```powershell
Start-Service ssh-agent
ssh-add $env:USERPROFILE\.ssh\id_ed25519
```

If the agent isn't running and a step names no `private_key_file`, Conn3x stops at once and says so. An `SSH_AUTH_SOCK` that points at another agent, such as Git Bash's, is used instead.

Conn3x checks every host's key against `%USERPROFILE%\.ssh\known_hosts`. The `ssh-keyscan` that ships with Windows Server can't read the key of a host with a newer OpenSSH, such as Ubuntu 24.04: it prints `unsupported KEX method` and no key. Check the host's fingerprint another way, then connect once with `ssh -o StrictHostKeyChecking=accept-new user@host exit`, which adds the key for you. Or set `host_key` on the host in the circuit.

## GitHub Actions

In a workflow, [setup-conn3x](https://github.com/conn3xorg/setup-conn3x) does the download for you. It picks the archive for the runner, checks it against `checksums.txt` and puts `conn3x` on `PATH`, on Linux, macOS and Windows runners:

```yaml
- uses: conn3xorg/setup-conn3x@v1
  with:
    version: 0.24.0
- run: conn3x init && conn3x plan
```

Leave out `version` and you get the latest release, which means a new one can change your CI on a day you didn't pick.

## Container image

Every release is also published as a container image, tagged with its version and with `latest`:

```sh
docker run --rm ghcr.io/conn3xorg/conn3x:v0.24.0 version
```

The image is distroless, with `conn3x` as its entrypoint, and runs as a non-root user. Podman takes the same command.

Since v0.12.0 the release workflow signs the image with cosign, and the signature sits in the registry beside it. To check it:

```sh
cosign verify ghcr.io/conn3xorg/conn3x:v0.24.0 \
  --certificate-identity 'https://github.com/conn3xorg/conn3x/.github/workflows/release.yml@refs/heads/main' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

Images from before v0.12.0 aren't signed.

## Stable channel

If you'd rather not take a release the day it's cut, follow the stable channel. Each Monday it moves to the newest release that has been out for seven days. A release that fixes a security advisory is promoted by hand, without the wait, and stable never points at a release older than one.

```sh
brew install conn3xorg/tap/conn3x@stable
docker run --rm ghcr.io/conn3xorg/conn3x:stable version
```

Nothing is rebuilt for it. The cask downloads the same signed archive as the release, and the `stable` image tag is the release's image by digest, so the `cosign verify` command above passes with `:stable` in place of the version.

The `conn3x@stable` cask and the `conn3x` cask can't be installed together. To switch, `brew uninstall conn3x` first.

## Check the download

Each release ships a `checksums.txt`, signed with [cosign](https://docs.sigstore.dev/cosign/system_config/installation/) by the release workflow, and an SBOM for every archive.

```sh
curl -fsSLO "https://github.com/conn3xorg/conn3x/releases/download/v${VERSION}/checksums.txt"
curl -fsSLO "https://github.com/conn3xorg/conn3x/releases/download/v${VERSION}/checksums.txt.sigstore.json"
cosign verify-blob \
  --certificate-identity 'https://github.com/conn3xorg/conn3x/.github/workflows/release.yml@refs/heads/main' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --bundle checksums.txt.sigstore.json checksums.txt
sha256sum --check --ignore-missing checksums.txt
```

On Windows, compare `(Get-FileHash conn3x.zip).Hash` with the zip's line in `checksums.txt`; PowerShell prints it in capitals.

The archives also carry GitHub build provenance, which `gh attestation verify` checks:

```sh
gh attestation verify "conn3x_${VERSION}_${OS}_${ARCH}.tar.gz" --repo conn3xorg/conn3x
```

## Check a release tag

Since v0.22.0 the release workflow signs each tag through Sigstore with [gitsign](https://docs.sigstore.dev/cosign/signing/gitsign/), so you can check that a tag in your clone is the one the workflow made:

```sh
git fetch origin tag v0.24.0
gitsign verify-tag v0.24.0 \
  --certificate-identity 'https://github.com/conn3xorg/conn3x/.github/workflows/release.yml@refs/heads/main' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

It prints `Validated Git signature: true` and checks the signature's entry in Sigstore's transparency log. GitHub shows these tags as Unverified, because it doesn't trust Sigstore's certificate authority; that's GitHub's view, not a failed signature. Tags before v0.22.0 aren't signed.

## Build from source

You need Go and a clone of the repository. The build script brands the binary as Conn3x.

```sh
git clone https://github.com/conn3xorg/conn3x
cd conn3x
scripts/build-conn3x.sh ./conn3x
```

Next: [Get started](/get-started).
