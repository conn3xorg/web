---
title: conn3x output
description: Print the output values from state.
---

`conn3x output` prints the root module's output values, as recorded in state by the last apply. It doesn't connect to the cloud or the hosts. Conn3x doesn't change this command.

## Usage

```sh
conn3x output [options] [NAME]
```

With no `NAME`, it prints every output.

## Options

| Option | Description |
| --- | --- |
| `-json` | Print JSON. With no `NAME`, each output's value, type and whether it's sensitive. |
| `-raw` | Print a single string, number or boolean output without quotes or formatting. Needs `NAME`. |
| `-show-sensitive` | Show sensitive values instead of `<sensitive>`. |
| `-no-color` | Don't use terminal colors. |

For the remaining options, see [OpenTofu's `output` page](https://opentofu.org/docs/cli/commands/output/).

## Examples

```sh
$ conn3x output
web_ip = "203.0.113.10"
```

Use a value in a script:

```sh
ssh "root@$(conn3x output -raw web_ip)"
```

```sh
$ conn3x output -json
{
  "web_ip": {
    "sensitive": false,
    "type": "string",
    "value": "203.0.113.10"
  }
}
```

A step's read-only attributes, such as a `command` step's `stdout`, can be outputs too:

```hcl
output "migrate_log" {
  value = conn3x_command.app__migrate["web1"].stdout
}
```

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success. |
| 1 | An error, such as an output that isn't in state. |
