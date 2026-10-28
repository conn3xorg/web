---
title: "The first five contributors"
description: "Within hours of the first release, people started opening pull requests against Conn3x. Here's who they were, what they fixed, and what you can expect if you're next."
date: 2026-10-28
author: James Conway
---

I published the first release of Conn3x on 25 October. Within hours, people started opening pull requests, picking up issues and writing out plans for them. Five, by the time I sat down to write this. This post is for them, and for whoever comes next.

It first ran in [Discussions](https://github.com/orgs/conn3xorg/discussions/114) on 26 October. The figures below are from that day; what's happened since is at the end.

## What Conn3x is

Conn3x creates your cloud infrastructure and configures the servers on it, from one binary, one plan and one state. It's a fork of OpenTofu, so the cloud half is the Terraform language you already know. The server half is circuits: steps that install packages, write files and manage services over plain SSH, planned and diffed alongside the cloud changes that need them. [Why Conn3x is one tool](/blog/why-conn3x) has the long version.

It's young. By 26 October six releases had shipped, up to v0.5.0, and each one was small and specific: jump hosts and Homebrew in v0.2.2, secrets that stay out of state in v0.3.0, loops in v0.4.0, the locale module and safer file writes in v0.5.0. The [docs](https://docs.conn3x.org) grew from a handful of pages to a reference for every module and command, a language section split by topic, and a set of tutorials.

## The first contributors

Every one of these arrived without being asked, against issues labelled `good first issue`, and every one was careful work.

- **@Dodothereal** was first through the door, with three pull requests in under half an hour. [#98](https://github.com/conn3xorg/conn3x/pull/98) is on main under their name: the module reference marks both sides of an argument pair, like `content` and `content_wo`, as "One of" instead of "No". [#95](https://github.com/conn3xorg/conn3x/pull/95) warns you when your HMAC key file can be read by other users. And when their Ansible repository converter turned out to have two bugs, they caught both themselves, withdrew it, and came back with [#105](https://github.com/conn3xorg/conn3x/pull/105).
- **@agammann** made the big diagram in the launch post open at full size when you click it, with no JavaScript, and added a test that clicks through with JavaScript switched off ([web #27](https://github.com/conn3xorg/web/pull/27)). It's merged under their name.
- **@am-official** sent the same fix about twenty minutes later, with a zoom cursor and a focus ring that follows the image's rounded corners ([web #30](https://github.com/conn3xorg/web/pull/30)). Only one could merge, and theirs came second, but their styling set the bar for what came next.
- **@jay23606** took that idea to every post's diagram ([web #38](https://github.com/conn3xorg/web/pull/38)), test first.
- **@coderbhawesh** picked up [#108](https://github.com/conn3xorg/conn3x/issues/108), a confusing error when a step holds something other than a module, and wrote out the whole plan before touching code. It was the right plan.

## What it means

I started Conn3x because provisioning a server and configuring it should be one job, and I wasn't sure how many people felt the same. I know a little more now. I'm not alone in this, and I'm grateful to everyone above for showing it so quickly.

Open source runs on this kind of help, so here's what you can expect in return. Every pull request gets a real review, and quickly. Your commits land on main under your name. There's no contributor licence agreement, just a DCO sign-off with `git commit -s`. And if a review asks for changes, it'll say why.

## Since then

That plan for #108 became [#116](https://github.com/conn3xorg/conn3x/pull/116), and it's merged. @Dodothereal's key warning shipped in v0.6.3. @dannyward630 cleared the last `tofu` mentions out of the command help in v0.6.4 ([#137](https://github.com/conn3xorg/conn3x/pull/137)). And in v0.6.5, @bfs2021 sent their first Conn3x pull request ([#160](https://github.com/conn3xorg/conn3x/pull/160)), while @coderbhawesh kept going with two `sysctl` fixes. The [release notes](https://github.com/conn3xorg/conn3x/releases) for v0.6.3, v0.6.4 and v0.6.5 thank each of them by name.

## Join in

- Issues labelled [good first issue](https://github.com/conn3xorg/conn3x/labels/good%20first%20issue) are small, with the file to change and the test to add written into the issue. Say you're taking one and I'll assign it to you.
- [CONTRIBUTING.md](https://github.com/conn3xorg/conn3x/blob/main/CONTRIBUTING.md) covers building, testing, and keeping changes to OpenTofu's own files to a minimum.
- Not a Go programmer? The [website and docs](https://github.com/conn3xorg/web) take contributions too, and so does a bug report from trying Conn3x on a server of your own. [Get involved](https://docs.conn3x.org/contribute) lists the other ways in, and questions and ideas are welcome in [Discussions](https://github.com/conn3xorg/conn3x/discussions).

To the five of you: thank you. Here's to the next five.

James
