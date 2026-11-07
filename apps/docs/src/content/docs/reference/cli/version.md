---
title: conn3x version
description: Print the Conn3x version and the OpenTofu release it's built on.
---

`conn3x version` prints the Conn3x version, the OpenTofu release it's built on, the platform the binary was built for, and the host agent builds it carries.

## Usage

```sh
conn3x version [-json]
conn3x -version
```

`conn3x version` and `conn3x -version` print the same thing.

## Output

```text
$ conn3x version
Conn3x v0.7.2 (built on OpenTofu v1.13.2)
on darwin_arm64
agent: linux/amd64 6117b07a45e6, linux/arm64 4352d611dfe9
```

The platform is `OS_ARCH`, such as `linux_amd64` or `darwin_arm64`.

The `agent` line lists the builds of the Conn3x host agent inside the binary, by architecture, with the first 12 characters of each build's SHA-256. The agent is experimental and off by default, so Conn3x runs every command over plain SSH. A build without the agent prints `agent: none (shell commands only)`.

Scripts should ask for `-json`, which prints one object:

```text
$ conn3x version -json
{
  "conn3x_version": "0.7.2",
  "terraform_version": "1.13.2",
  "platform": "darwin_arm64",
  "provider_selections": {},
  "agent": {
    "linux/amd64": "6117b07a45e630181f91e3206f16e29c02128100669075a1a146a4d3b4b4990b",
    "linux/arm64": "4352d611dfe90fbb913c836811db5b10d841fa61918a833a1aaf3a2d7a415f89"
  }
}
```

## What Conn3x changes

The JSON has OpenTofu's fields plus `conn3x_version` and `agent`, which holds each agent build's full SHA-256, or `null` for a build without one. `terraform_version` is the OpenTofu release, under the name OpenTofu gives it, so a tool that already reads OpenTofu's `version -json` keeps working.

OpenTofu's text output also lists the providers the working directory uses. Conn3x's prints only the lines above. To see providers, use [`conn3x providers`](/reference/cli/providers).

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Always. |
