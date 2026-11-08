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

Pick the archive for your system. Replace `0.10.0` with the version you want.

```sh
VERSION=0.10.0
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

## Windows

Since v0.10.0, each release has a zip for Windows on amd64 and arm64, holding `conn3x.exe`. Running Conn3x on Windows is [experimental](/reference/maturity). It has run a plan and apply from Windows Server 2025, against Ubuntu and against itself.

In PowerShell:

```powershell
$Version = "0.10.0"
$Arch = "amd64"   # or arm64
Invoke-WebRequest "https://github.com/conn3xorg/conn3x/releases/download/v$Version/conn3x_${Version}_windows_$Arch.zip" -OutFile conn3x.zip
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

## Container image

Every release is also published as a container image, tagged with its version and with `latest`:

```sh
docker run --rm ghcr.io/conn3xorg/conn3x:v0.10.0 version
```

The image is distroless, with `conn3x` as its entrypoint, and runs as a non-root user. Podman takes the same command.

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

## Build from source

You need Go and a clone of the repository. The build script brands the binary as Conn3x.

```sh
git clone https://github.com/conn3xorg/conn3x
cd conn3x
scripts/build-conn3x.sh ./conn3x
```

Next: [Get started](/get-started).
