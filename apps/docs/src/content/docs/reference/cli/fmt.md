---
title: conn3x fmt
description: Rewrite configuration files in the standard style, and how to format .circuit.hcl files.
---

`conn3x fmt` rewrites configuration files in the standard layout: consistent indentation, aligned `=` signs, and spacing. It changes layout only, never meaning.

## Usage

```sh
conn3x fmt [options] [PATH...]
```

With no `PATH`, it formats the current directory. A directory formats the files in it, a file formats that file, and `-` reads from standard input and writes the result to standard output.

## What Conn3x changes

In v0.5.0, `fmt` formats `.tf`, `.tofu`, `.tfvars`, `.tftest.hcl` and `.tofutest.hcl` files. It skips `.circuit.hcl` files when it scans a directory, and refuses one named directly:

```text
$ conn3x fmt web.circuit.hcl
Error: Invalid file extension

Only .tf, .tofu, .tfvars, .tftest.hcl, and .tofutest.hcl files can be
processed with conn3x fmt
```

To format a `.circuit.hcl` file, pass it through standard input:

```sh
conn3x fmt - < web.circuit.hcl > web.tmp && mv web.tmp web.circuit.hcl
```

Circuits written in `.tf` files are formatted as usual.

## Options

| Option | Description |
| --- | --- |
| `-check` | Change nothing, and exit 3 if any file needs formatting. Lists the files that do. |
| `-diff` | Print the changes as a diff. |
| `-write=false` | Don't write to the files. Use it with `-diff` to preview. |
| `-list=false` | Don't print the names of the files that changed. |
| `-recursive` | Format subdirectories too. |
| `-no-color` | Don't use terminal colors. |

See [OpenTofu's `fmt` page](https://opentofu.org/docs/cli/commands/fmt/) for more.

## Examples

Format everything under the current directory:

```sh
conn3x fmt -recursive
```

Fail CI when a file isn't formatted:

```sh
conn3x fmt -check -recursive
```

Preview the changes:

```sh
$ conn3x fmt -diff -write=false
main.tf
--- old/main.tf
+++ new/main.tf
@@ -1,3 +1,3 @@
 variable "region" {
-type=string
+  type = string
 }
```

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success. With `-check`, every file is formatted. |
| 2 | An error, such as a syntax error or a file type `fmt` doesn't handle. |
| 3 | Only with `-check`: some files need formatting. |
