---
title: Get involved
description: Ways to help Conn3x, most of them without writing Go. Report a bug, answer a question, share a circuit, fix the docs, test a release or pick up an issue.
---

Most of what Conn3x needs right now isn't code. A bug report with the plan output in it, an answered question or a fixed sentence in these docs all make the next person's day easier, and every merged change from outside the project is thanked by name in the [release notes](https://github.com/conn3xorg/conn3x/releases).

The ways in below start with the ones that need the least setup.

## Tell us what surprised you

Use Conn3x on a server of your own and notice where it didn't do what you expected. A plan that changed something you didn't ask for, an error that didn't say what was wrong, a step that worked on Ubuntu and not on Rocky: those are bugs, and they're the reports we most want.

[Open an issue](https://github.com/conn3xorg/conn3x/issues/new/choose) and pick the template that fits. Include the `conn3x version`, the distribution of the host, and the plan or apply output. If you're not sure it's a bug, ask in [Q&A](https://github.com/conn3xorg/conn3x/discussions/categories/q-a) first.

## Answer a question

[Discussions](https://github.com/conn3xorg/conn3x/discussions) is where people ask how to do things and share what they've built. If you've solved something someone else is stuck on, answer it. You don't need to be sure: "this worked for me on Debian 13" is useful.

## Share a circuit

If you've written a circuit for something you run, other people probably run it too. [Share a circuit](/guides/share-a-circuit) covers packaging it as a module, testing it on a container and listing it on [conn3x.org/circuits](https://conn3x.org/circuits).

Not ready to publish? Post what you have in the [Circuits](https://github.com/conn3xorg/conn3x/discussions/categories/circuits) category. Rough is fine, and that's where people ask for the ones they'd like to see.

## Improve the docs

Every page here has an **Edit page** link at the bottom. It opens the page's Markdown on GitHub, where you can change it and open a pull request from the browser. Typos, a step that didn't work as written, an example that's missing: all welcome.

The docs and the website live in [conn3xorg/web](https://github.com/conn3xorg/web).

## Test a release

Releases come out often, and each one is tested on Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. Your servers are none of those exactly. When a new [release](https://github.com/conn3xorg/conn3x/releases) lands, run your configuration against a host you don't mind touching, or a container from the [local tutorial](/tutorials/try-locally), and tell us what changed. A report that says "v0.6.6 works on my setup" helps too, in Discussions.

## Pick up an issue

Issues labelled [good first issue](https://github.com/conn3xorg/conn3x/labels/good%20first%20issue) are small, and they name the file to change and the test to add. [help wanted](https://github.com/conn3xorg/conn3x/labels/help%20wanted) issues are bigger, and are ready for anyone to take on. Comment on one to say you're taking it, and a maintainer will assign it to you.

Read [CONTRIBUTING.md](https://github.com/conn3xorg/conn3x/blob/main/CONTRIBUTING.md) before you start. It covers building and testing, and how to keep changes to OpenTofu's own files small. Every commit needs a DCO sign-off:

```sh
git commit -s
```

There's no contributor licence agreement, and your commits land under your name.

## Report a security problem

Don't open a public issue for a vulnerability. Email [security@conn3x.org](mailto:security@conn3x.org), or use GitHub's [private vulnerability reporting](https://github.com/conn3xorg/conn3x/security/advisories/new). [SECURITY.md](https://github.com/conn3xorg/conn3x/blob/main/SECURITY.md) has the details.
