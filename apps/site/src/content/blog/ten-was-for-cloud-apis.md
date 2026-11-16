---
title: "Ten was for cloud APIs"
description: "A 500-host plan over a WAN took 44 seconds at OpenTofu's default parallelism of 10, and 11 at 50. Why the old default fit cloud APIs and not SSH fleets, how we measured it, and what we did about jump hosts."
date: 2026-12-17
author: James Conway
---

Conn3x is built on OpenTofu, and until v0.20.0 it kept OpenTofu's default: ten operations at a time. That number made sense where it came from. A cloud API has rate limits, and if you fire fifty `CreateInstance` calls at once, the API tells you to slow down.

A fleet of servers isn't one API. It's five hundred separate sshd processes, each perfectly happy to answer you at the same time as the other 499. So in v0.20.0 the default went to 50. Here's how we got to that number, because the arithmetic is more interesting than the change.

## Measuring it properly

The first benchmark lied to us. We ran 500 sshd containers on the same CI runner as Conn3x, and a refreshing plan took 18.4 seconds whatever the parallelism was. Raising it did nothing, which looked like a ceiling in Conn3x. It wasn't. The runner was 91% busy, and most of that was the 500 sshds competing with Conn3x for four CPUs.

So we moved the hosts off the client. 500 containers on one 16-vCPU machine in us-west-2, and two places to run Conn3x from: a 4-vCPU VM in the same subnet, and a Mac about 0.37 seconds from those hosts for each SSH login. Same circuit both times, five steps per host, so 2,500 steps to read on every plan.

| parallelism | in the same region | over the WAN |
| --- | --- | --- |
| 10, the old default | 7.2 s | 44.1 s |
| 50, the new default | 5.8 s | 11.0 s |
| 100 | 5.8 s | 7.1 s |
| 200 | 5.7 s | 5.9 s |

Read the right-hand column first. At 10, the WAN plan spends nearly all of its 44 seconds waiting on the network: about 176 ms per step read, ten at a time, 250 rounds of them. Let fifty go at once and the waiting overlaps, and the plan drops to 11. In the same region the hosts answer so fast that the network was never the bottleneck, and past 50 nothing moves, because what's left is Conn3x's own work on four CPUs.

Why 50 and not 200, when 200 is faster over the WAN? Because of the box most fleets sit behind.

## The jump host problem

Put your servers behind a bastion and every one of them opens its own SSH connection through it. sshd has a setting called `MaxStartups`, and its default, `10:30:100`, starts refusing new logins once ten are in progress and not yet authenticated: 30% of them at first, more as the count climbs. At a parallelism of 50, the first plan through a stock bastion would have had logins bounced at random.

So Conn3x now keeps at most eight logins in progress through any one jump host. Each one holds its slot from the dial to the end of that hop's handshake and then hands it on. The connections themselves are pooled, so once a host is logged in, every step on it shares that connection and the limit doesn't come into it again. You get 50 operations in flight against hosts the bastion has already let through, and never more than eight new logins knocking on its door.

## If you want the old behaviour

Pass `-parallelism=10`, as you always could. The new default is only a default: `TF_CLI_ARGS` and your own flags still win. If your hosts are the kind that fall over when fifty people say hello at once, you know your fleet better than we do.

## What's next

Parallelism hides latency. It doesn't remove it. Every command Conn3x runs on a host opens a new session on the pooled connection, and that costs a couple of round trips before any output comes back. We're [looking at one long-lived session per connection](https://github.com/conn3xorg/conn3x/issues/524) that carries every command, which would cut that cost for every step type at once. There are good questions in there about `become`, stdin and a command that hangs, and we'd like to count the round trips on a real fleet before we build anything.

If you run Conn3x against more than a hundred hosts, I'd love to see your numbers, whatever they are. `TF_LOG=DEBUG conn3x plan` logs how long each step took on each host. Post them on [the issue](https://github.com/conn3xorg/conn3x/issues/524).
