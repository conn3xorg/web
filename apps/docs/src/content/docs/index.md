---
title: Conn3x docs
description: Create servers and configure them from one plan, with Conn3x.
---

Conn3x is one tool for the whole job of standing up a server: it creates the machine with any Terraform or OpenTofu provider, then configures what runs on it, in the same plan and the same state. You write that configuration as **circuits**, in HCL, next to the rest of your infrastructure.

We call that an IaCC tool, short for infrastructure as code and configuration. It's the infrastructure as code you know from Terraform and the configuration management you know from Ansible, in one plan.

Every plan shows the exact change headed for each host, line by line, before anything runs. Nothing is installed on your servers: Conn3x connects over SSH and runs plain shell commands.

## Where to start

Pick the path that sounds like you. Each step builds on the one before it.

**New to Conn3x.**
1. [Install Conn3x](/install).
2. [Try it in a container](/tutorials/try-locally) on your own machine, no server needed.
3. [Configure your first server](/tutorials/first-server) over SSH.
4. [Get started](/get-started) and [Concepts](/concepts) fill in the why.

**You use Terraform or OpenTofu.** Your configuration works as it is.
1. [Add circuits to it](/guides/migrate-from-terraform).
2. [Create a server and configure it in one plan](/guides/provision-and-configure).
3. Pick your cloud: [AWS](/tutorials/aws), [Azure](/tutorials/azure), [Google Cloud](/tutorials/google-cloud) or [DigitalOcean](/tutorials/digitalocean).

**You use Ansible.**
1. Read how the two [compare](/compare/ansible).
2. [Convert a playbook](/tutorials/migrate-ansible) in the tutorial, then the [migration guide](/guides/migrate-from-ansible) for the rest.
3. See [how much of a role converts](/guides/ansible-convert-coverage) before you start on yours.

**You're taking it to production.**
1. Reach private hosts [through a bastion](/guides/bastions), and keep [secrets](/tutorials/secrets) out of state.
2. [Test a circuit](/guides/test-a-circuit) before it runs anywhere real.
3. [Check for drift](/guides/drift), and [run that check in CI](/tutorials/drift-in-ci).
4. [Bring servers you already run](/guides/adopt-servers) under Conn3x without rebuilding them.

Want nginx, PostgreSQL or WireGuard without writing it yourself? Start from one of the [official circuits](/circuits). Looking something up? The [circuit language](/reference/circuits) and every [module](/modules/file) are in the reference, and [Troubleshooting](/troubleshooting) goes by the error you got.

## What it runs on

Conn3x itself runs on Linux and macOS, and on Windows as an experimental `conn3x.exe`. It configures hosts running Rocky Linux, RHEL, AlmaLinux, Fedora, Debian and Ubuntu, and every change is tested on Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13.

CentOS Linux reached end of life on 30 June 2024. Use Rocky Linux, the community rebuild most CentOS users moved to.

Conn3x is early, and a lot of it is still being decided. Spot something wrong on this page? The edit link at the bottom opens a pull request. [Get involved](/contribute) has the other ways in.
