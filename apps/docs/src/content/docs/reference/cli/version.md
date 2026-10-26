---
title: conn3x version
description: Print the Conn3x version and the OpenTofu release it's built on.
---

`conn3x version` prints the Conn3x version, the OpenTofu release it's built on, and the platform the binary was built for.

## Usage

```sh
conn3x version [-json]
conn3x -version
```

`conn3x version` and `conn3x -version` print the same thing.

## Output

```text
$ conn3x version
Conn3x v0.6.0 (built on OpenTofu v1.13.2)
on darwin_arm64
```

The platform is `OS_ARCH`, such as `linux_amd64` or `darwin_arm64`.

Scripts should ask for `-json`, which prints one object:

```text
$ conn3x version -json
{
  "conn3x_version": "0.6.0",
  "terraform_version": "1.13.2",
  "platform": "darwin_arm64",
  "provider_selections": {}
}
```

## What Conn3x changes

The JSON has OpenTofu's fields plus `conn3x_version`. `terraform_version` is the OpenTofu release, under the name OpenTofu gives it, so a tool that already reads OpenTofu's `version -json` keeps working.

OpenTofu's text output also lists the providers the working directory uses. Conn3x's prints only the two lines above. To see providers, use [`conn3x providers`](/reference/cli/providers).

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Always. |
