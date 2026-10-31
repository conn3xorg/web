---
title: Style guide
description: How we write the Conn3x docs, so each page doesn't decide it all again.
---

This guide records the writing decisions used in Conn3x documentation. Follow these conventions when adding or updating a page.

## Terminology

- Write `circuit` in lowercase, except at the beginning of a sentence or in a proper name. Do not capitalize it just because it refers to the Conn3x concept.
- Use **host** for a machine that Conn3x connects to or manages. For example, a host can be reached through a bastion.
- Use **server** when describing the machine in its role as a server, such as when explaining how to create and configure one.
- Use contractions such as "don't" and "it's". They match the conversational tone already used across the documentation.

## Headings and page structure

- Use sentence case for headings: `Host keys`, not `Host Keys`.
- Start with a short introduction explaining what the page covers.
- Use numbered lists for steps that must be followed in order. Use bullets for unordered information.
- Use tables for reference information that readers need to compare or look up.

## Code and formatting

- Use backticks for commands, identifiers, configuration keys, environment variables, and file paths.
- Put multi-line commands and code examples in fenced code blocks. Specify the language when appropriate.
- Introduce an example with a short explanation. Explain any non-obvious behavior after it.

**Before:** Set the `CONN3X_HOST` environment variable.

**After:** Set `CONN3X_HOST` to the name of the host you want to connect to.

## Warnings

Use Starlight's `:::caution` aside for important risks, destructive actions, or security-sensitive instructions. Place it immediately before the relevant step or information.

```md
:::caution
Keep private keys secure. Restrict access to the key file.
:::
```

Use ordinary paragraphs for explanations and notes that do not require a warning.

## Examples

Prefer specific wording that tells readers what a command or setting does.

**Before:** The host is configured.

**After:** Conn3x connects to the host using the configured connection settings.

**Before:** There are some options for configuring the connection.

**After:** Configure the connection with the host address and authentication settings.

## Page types

- **Guides** explain how to complete a task, using ordered steps and practical examples.
- **Reference pages** describe syntax, options, and behavior.
- **Internals pages** explain implementation details and how the system works.
