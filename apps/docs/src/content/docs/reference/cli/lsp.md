---
title: conn3x lsp
description: A language server for circuit files, for Neovim, Helix and other editors that speak LSP. Module and argument completion, hover docs, and conn3x validate on save.
---

`conn3x lsp` starts a [Language Server Protocol](https://microsoft.github.io/language-server-protocol/) server on standard input and output. An editor that speaks LSP gets three things in circuit files from it:

- **Completion.** Inside a `step` or `prereq` block, the step modules. Inside a module, or a block nested in one, its arguments that aren't written yet, required ones first, with their types, and its nested blocks.
- **Hover.** On a module name or an argument, its description, its type, whether it's required, and a link to its page in these docs.
- **Validation on save.** When you save a file, `conn3x validate` runs in its directory, and its errors and warnings show in the files they're about. Problems you've fixed since the last save are cleared.

Completion and hover come from the `conn3x` binary itself, so they always match what that version accepts.

VS Code users don't need it: the [Conn3x extension](https://marketplace.visualstudio.com/items?itemName=conn3x.conn3x) does the same.

This command is Conn3x only, and new in v0.25.0. It's [experimental](/reference/maturity): what it offers may change between releases.

## Usage

```sh
conn3x lsp
```

You don't run it by hand. Your editor starts it for files it treats as HCL. The examples below give `.circuit.hcl` files to it.

### Neovim

Neovim 0.11 and later, in `init.lua`:

```lua
vim.filetype.add({ pattern = { [".*%.circuit%.hcl"] = "hcl" } })

vim.lsp.config("conn3x", {
  cmd = { "conn3x", "lsp" },
  filetypes = { "hcl" },
  root_markers = { ".git" },
})
vim.lsp.enable("conn3x")
```

Completion appears with `<C-x><C-o>`, or as you type with a completion plugin, and hover with `K`.

### Helix

In `~/.config/helix/languages.toml`:

```toml
[language-server.conn3x]
command = "conn3x"
args = ["lsp"]

[[language]]
name = "hcl"
language-servers = ["conn3x"]
```

`hx --health hcl` should list `conn3x` with a check mark.

### Other editors

Any editor or plugin that runs a language server over standard input and output works: point it at the command `conn3x` with the argument `lsp`, for HCL files.

## Options

| Option | Description |
| --- | --- |
| `-allow-plugins` | Validate directories that have provider plugins installed, which starts them. |

Validating a directory evaluates its configuration and starts every provider plugin installed there. A plugin is a program, so a repository you've only cloned could run code on your machine the first time you save a file in it. Without `-allow-plugins`, `conn3x lsp` doesn't validate such a directory, and tells your editor once:

```text
conn3x lsp didn't validate <dir>: it has provider plugins installed (<where>), and validating would start them. Start conn3x lsp with -allow-plugins if you trust them.
```

Completion and hover still work there. A directory that hasn't had `conn3x init` yet isn't validated either, since every error would be about that, and its files keep whatever problems they showed before.

Add the option where your editor starts the server, only for directories whose plugins you trust:

```lua
cmd = { "conn3x", "lsp", "-allow-plugins" },
```
