---
title: Install
description: Install the conn3x binary on Linux or macOS.
---

Conn3x is a single binary. Download it from the [latest release](https://github.com/conn3xorg/conn3x/releases/latest), or build it from source.

## Homebrew

On macOS:

```sh
brew install conn3xorg/tap/conn3x
```

Homebrew clears the macOS quarantine flag for you, and `brew upgrade` picks up new releases.

## Download a release

Pick the archive for your system. Replace `0.5.0` with the version you want.

```sh
VERSION=0.5.0
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
