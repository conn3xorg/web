---
title: conn3x mcp
description: A read-only Model Context Protocol server, so an assistant can look up Conn3x modules and circuits, validate and lint a directory, and summarise a saved plan.
---

`conn3x mcp` starts a [Model Context Protocol](https://modelcontextprotocol.io) server on standard input and output. An assistant that speaks MCP can use it to look up Conn3x's modules and official circuits, check a circuit with `validate` and `lint`, and say what a saved plan would change on each host.

Nothing it does applies anything, writes state, or connects to a host. It never runs a plan.

This command is Conn3x only, and new in v0.10.0. It's [experimental](/reference/maturity): its tools and their output may change between releases.

## Usage

```sh
conn3x mcp
```

You don't run it by hand. Add it to your assistant's MCP servers as the command `conn3x` with the argument `mcp`. Most clients take a JSON entry like this one:

```json
{
  "mcpServers": {
    "conn3x": {
      "command": "conn3x",
      "args": ["mcp"]
    }
  }
}
```

The server runs in the directory the client starts it in. `validate`, `lint` and `summarise_plan` read paths relative to that directory, and since v0.12.0 they refuse a path that leads out of it, links included. To check a circuit somewhere else, start the server there. It speaks MCP revisions `2025-06-18`, `2025-03-26` and `2024-11-05`.

## Tools

| Tool | Arguments | What it returns |
| --- | --- | --- |
| `search_modules` | `query` | Modules a step can use, by name or words in their description. An empty query lists them all. |
| `module_docs` | `module` (required) | One module's arguments: name, type, whether it's required, and what it does. The same text as its page in these docs, for this version of Conn3x. |
| `search_circuits` | `query` | Official circuits, by name or words in their description, category or tags, with each one's repository, latest version, grade and whether it passes. Reads `https://conn3x.org/circuits.json`. |
| `validate` | `dir` | `conn3x validate` on a directory: whether the configuration is valid, with each error and warning. |
| `lint` | `dir` | [`conn3x lint`](/reference/cli/lint) on a directory. |
| `summarise_plan` | `plan_file` (required), `dir` | For a plan saved with `conn3x plan -out=FILE`: which steps it would create, change, replace or remove on each host, and the cloud resources apart. |

`dir` defaults to the current directory. For `summarise_plan`, it defaults to the plan file's directory.

## Options

| Option | Description |
| --- | --- |
| `-allow-plugins` | Let `validate` and `summarise_plan` run in a directory that has provider plugins installed. New in v0.12.0. |

`validate` and `summarise_plan` run `conn3x` in the directory, and that starts every provider plugin installed there. A plugin is a program, so a directory you didn't write could run code on your machine. Without `-allow-plugins`, both tools refuse such a directory:

```text
<dir> has provider plugins installed (<where>), and this would start them. Start conn3x mcp with -allow-plugins if you trust the plugins in the directories it serves
```

Pass the option only when you trust what's installed under the directory you start the server in:

```json
"args": ["mcp", "-allow-plugins"]
```

## What stays out

`summarise_plan` leaves out every attribute value, so a secret in the plan doesn't reach the assistant. It reads the plan file and nothing else.

`validate` doesn't connect to a host, but it does evaluate the configuration. Functions such as `file()` run, and an error message can quote what they read. Keep that in mind before you start the server in a directory with circuits you haven't read.

`search_circuits` is the only tool that uses the network, and only to fetch the public circuit catalogue.
