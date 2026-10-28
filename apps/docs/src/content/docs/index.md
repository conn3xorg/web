---
title: Conn3x docs
description: Create servers and configure them from one plan, with Conn3x.
---

Conn3x is one tool for the whole job of standing up a server: it creates the machine with any Terraform or OpenTofu provider, then configures what runs on it, in the same plan and the same state. You write that configuration as **circuits**, in HCL, next to the rest of your infrastructure.

Every plan shows the exact change headed for each host, line by line, before anything runs. Nothing is installed on your servers: Conn3x connects over SSH and runs plain shell commands.

## Where to start

- **New here?** [Install Conn3x](/install), then work through [Get started](/get-started). It takes about fifteen minutes and needs one Linux server you can reach over SSH.
- **Want to learn by doing?** The [tutorials](/tutorials) start with a container on your own machine and build up to cloud servers, bastions and CI.
- **Coming from Ansible?** [Convert a playbook](/guides/migrate-from-ansible) and see how much carries over.
- **Already using Terraform or OpenTofu?** Your configuration works as it is. [Add circuits to it](/guides/migrate-from-terraform).
- **Looking something up?** The [circuit language](/reference/circuits) and every [module](/modules/file) are in the reference.

## What it runs on

Conn3x itself runs on Linux and macOS. It configures hosts running Rocky Linux, RHEL, AlmaLinux, Fedora, Debian and Ubuntu, and every change is tested on Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13.

Conn3x is early, and a lot of it is still being decided. Spot something wrong on this page? The edit link at the bottom opens a pull request. [Get involved](/contribute) has the other ways in.
