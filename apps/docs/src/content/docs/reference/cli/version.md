---
title: conn3x version
description: Print the Conn3x version and the OpenTofu release it's built on.
---

`conn3x version` prints the Conn3x version, the OpenTofu release it's built on, and the platform the binary was built for.

## Usage

```sh
conn3x version
conn3x -version
```

The two forms are the same.

## Output

```text
$ conn3x version
Conn3x v0.5.0 (built on OpenTofu v1.13.2)
on darwin_arm64
```

The platform is `OS_ARCH`, such as `linux_amd64` or `darwin_arm64`.

## What Conn3x changes

OpenTofu's `version` also lists the providers the working directory uses, and can print JSON. Conn3x's prints only the lines above. `-json` is accepted, but the output is the same text. To see providers, use [`conn3x providers`](/reference/cli/providers).

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Always. |
