---
title: conn3x lint
description: Check a circuit's own code for what the circuit grader marks down, one line per finding, before you push.
---

`conn3x lint` reads a circuit's files and reports what the [circuit grader](https://conn3x.org/circuits) would mark down: a download without a checksum, a container image without a digest, a service listening on every address, a risky shell pattern. It also warns about a `command` step that has no way to tell whether its work is done. It reads files only. It doesn't connect to any host or need `conn3x init`.

This command is Conn3x only, and new in v0.10.0. It's [experimental](/reference/maturity): rules and output may change between releases.

## Usage

```sh
conn3x lint [-json] [DIR ...]
```

With no directory, `lint` checks the current one. It reads the `.hcl`, `.tf` and `.sh` files in each directory, and leaves out `examples/` and `test/`.

## Rules

| Rule | Name | Severity | Finds |
| --- | --- | --- | --- |
| `C3X001` | `download-checksum` | error | A `download` step, or a `windows_package` with a `url`, without `sha256`. |
| `C3X002` | `image-digest` | error | A container image with a tag and no digest. |
| `C3X003` | `listen-all` | error | A default or literal that listens on every address, such as `0.0.0.0`. |
| `C3X004` | `privileged-shell` | error | Shell that's wrong wherever it runs as root, such as `curl \| sh`. |
| `C3X101` | `command-guard` | warning | A `command` step with no `creates`, `removes`, `unless` or `triggers`. |
| `C3X900` | `ignore` | error | An ignore with no reason, or one that matches nothing. |

`C3X001` to `C3X004` are the grader's checks of a circuit's own code, with the same patterns, so a circuit that lints clean passes them. `lint` agrees with the grader on every official circuit.

## Output

One line per finding: file, line, column, rule and message.

```text
$ conn3x lint
main.circuit.hcl:10:5: C3X001 download-checksum: download step has no sha256, so a changed or tampered file installs anyway
main.circuit.hcl:17:5: C3X101 command-guard: command in step "migrate" has no creates, removes, unless or triggers, so it ran once and no plan can tell if its work is undone; add a guard that checks it
variables.tf:11:14: C3X003 listen-all: listens on every address by default; make the caller choose the address, or default to 127.0.0.1
```

With `-json`, the same findings as a JSON array, for editors and CI:

```json
[
  {
    "rule": {
      "id": "C3X001",
      "name": "download-checksum",
      "severity": "error"
    },
    "file": "main.circuit.hcl",
    "line": 10,
    "column": 5,
    "message": "download step has no sha256, so a changed or tampered file installs anyway"
  }
]
```

## Ignoring a finding

Some findings are right for your circuit. A default of `0.0.0.0` may be the point when a load balancer sits in front. To keep one you've looked at, say why on its line or the line above:

```hcl
variable "listen_address" {
  type = string
  # conn3x-lint:ignore C3X003 a load balancer sits in front; callers set it
  default = "0.0.0.0"
}
```

The reason is required. An ignore without one is itself a finding:

```text
variables.tf:11:1: C3X900 ignore: ignore of C3X003 gives no reason; say why after the rule ID
```

So is an ignore that no longer matches anything, so stale ones don't pile up.

## Options

| Option | Description |
| --- | --- |
| `-json` | Print the findings as a JSON array. |

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | No errors. Warnings don't change the exit code. |
| `1` | At least one finding is an error. |

## In CI

```yaml
- name: Lint the circuit
  run: conn3x lint
```

An assistant can run the same checks through [`conn3x mcp`](/reference/cli/mcp).
