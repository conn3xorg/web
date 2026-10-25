---
title: CLI
description: The commands Conn3x adds to the OpenTofu CLI.
---

Conn3x has every OpenTofu command, `init`, `plan`, `apply`, `destroy`, `output`, `state` and the rest, and they work as they do in OpenTofu. `conn3x -help` lists them. This page covers what Conn3x adds.

## conn3x drift

```sh
conn3x drift [plan options]
```

Reads every resource and host step again and reports what no longer matches the last apply, grouped into **Cloud** and **Hosts**. Nothing changes. It takes the same options as `plan`, such as `-var-file`.

| Exit code | Meaning |
| --- | --- |
| 0 | No drift. |
| 2 | Something drifted, or only outputs changed. |
| 1 | An error. |

## conn3x convert ansible

```sh
conn3x convert ansible [-out FILE] PLAYBOOK
```

Converts an Ansible playbook into circuits and writes them to standard output, or to `FILE`. Tasks it can't show mean the same thing stay in the output, commented out under a `TODO(convert)` line that gives the reason. A summary goes to standard error. See [Migrate from Ansible](/guides/migrate-from-ansible).

| Exit code | Meaning |
| --- | --- |
| 0 | Every task converted. |
| 3 | Some tasks need you; each is marked `TODO(convert)`. |
| 1 | An error, such as a playbook that isn't valid YAML. |

## conn3x version

Prints the Conn3x version and the OpenTofu release it's built on.
