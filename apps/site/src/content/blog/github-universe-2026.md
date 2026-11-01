---
title: "GitHub Universe, and the place Conn3x lives"
description: "GitHub Universe runs today and tomorrow in San Francisco. A note on why Conn3x is built entirely in the open on GitHub, and an open door for whoever wants to build it with us."
date: 2026-10-28
---

GitHub Universe starts today at Fort Mason Center in San Francisco and runs through tomorrow, 28 to 29 October. If you can't be there, much of it streams online at [githubuniverse.com](https://githubuniverse.com).

It felt like the right day to say something we don't say often enough: Conn3x wouldn't exist without GitHub and the people on it.

## Where Conn3x lives

Every part of Conn3x happens in public, on GitHub. The code is at [conn3xorg/conn3x](https://github.com/conn3xorg/conn3x), a fork of OpenTofu, which itself is built in the open there. Every pull request runs its tests in GitHub Actions, on four Linux distributions. Every release is signed, and carries a build attestation you can check with `gh attestation verify`. The container image is on GitHub Packages, Homebrew installs from a tap that's just another repository, and security reports come in privately through GitHub's own reporting form.

Circuits work the same way. Each official one is a repository, and you use it by pointing a `module` block at it:

```hcl
module "k3s" {
  source = "github.com/conn3xorg/circuit-k3s?ref=v0.1.5"
  # ...
}
```

No registry to sign up for, no account to make. If it's public on GitHub, Conn3x can use it, and so can you.

## The part that matters most

The tools are the easy bit. The people are what makes this work.

Within hours of the first release, strangers were opening pull requests. Somebody found that `sysctl` failed on images without `/etc/sysctl.d`, fixed it, and tested the fix on all four distributions. Somebody else picked up a good first issue and had a fix up an hour after it was filed. We wrote about [the first five contributors](/blog/first-five-contributors), and v0.6.5 [shipped today](/blog/conn3x-v0-6-5) with two contributors' names in the thanks.

None of them had to ask permission, sign a CLA or join anything. They forked a repository, changed it, and opened a pull request. That's the whole contract, and it's the one open source has run on for as long as most of us have been writing code. It's the reason a tool started by one person can become a tool built by many.

## Where we'd like to go

Open source infrastructure tools have had a rough few years. Licences changed under people's feet, and communities had to fork to keep what they'd built. OpenTofu exists because of that, and Conn3x is built on OpenTofu because of it too. So we'll say plainly what we've said before: Conn3x is MPL-2.0, there's no CLA, and no feature is held back for sponsors.

Keynotes are a great place to hear where open source is heading. Where it actually goes gets decided in pull requests, in issue threads, and in the circuits someone writes for their own homelab and then shares. Every one of those is a vote for the kind of open source we want.

## Come build it with us

If Universe has you in the mood to contribute to something, there's room here:

- **Write a fix.** Issues labelled [good first issue](https://github.com/conn3xorg/conn3x/labels/good%20first%20issue) and [help wanted](https://github.com/conn3xorg/conn3x/labels/help%20wanted) are open.
- **Share a circuit.** Got a setup you repeat on every server? [Share it](https://docs.conn3x.org/guides/share-a-circuit) and we'll list it on [conn3x.org/circuits](/circuits).
- **Say hello.** Questions, ideas and half-formed thoughts are all welcome in [Discussions](https://github.com/conn3xorg/conn3x/discussions).

[Get involved](https://docs.conn3x.org/contribute) has the rest, and [the community page](/community) has everyone who's helped so far. We'd like your name on it.

Enjoy Universe.
