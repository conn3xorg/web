---
title: Roadmap
description: "What Conn3x does today, what we're building now and what comes after: Windows at scale, network devices over their own CLI, Ansible roles and Galaxy, ad-hoc commands, a web UI, then the rest of what Terraform, OpenTofu, Ansible, Chef and Puppet do. No dates."
---

Conn3x closes the gap between creating infrastructure and configuring it: one plan, one state and one apply for the cloud and the servers in it. Today it does that for Linux, and for Windows Server in preview.

Where it's going is further than that. Anything you'd do with Terraform, OpenTofu, Ansible, Chef or Puppet, you should be able to do with Conn3x, and this page is the route there.

This page says what's planned and in what order. None of it has a date, and nothing here works until a release says it does. The words stable, preview, experimental and planned mean the same here as everywhere else in the docs; [Maturity labels](/reference/maturity) says what each one promises. The [release notes](https://github.com/conn3xorg/conn3x/releases) are the record of what has shipped.

## Today

- **Adopt servers you already run.** Since v0.8.0, `import = true` on a step takes over what a host already has instead of creating it, for `file`, `template`, `directory`, `link`, `package`, `service`, `user` and `group` on Linux. The first plan shows only where the host and your circuit disagree, so nothing changes until you've read it. Steps take a `lifecycle` block too: `prevent_destroy`, `ignore_changes`, `replace_triggered_by`, and preconditions and postconditions, with OpenTofu's own messages. [Adopt servers you already run](/guides/adopt-servers) walks through a whole server.
- **Linux hosts.** Conn3x configures Rocky Linux, RHEL, AlmaLinux, Fedora, Debian and Ubuntu. Every change to Conn3x is tested on Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13.
- **Windows hosts, in preview.** Windows Server 2022 and 2025, over OpenSSH, from the same plan as everything else. Twenty-three `windows_*` modules cover PowerShell scripts, reboots and waits, files, folders and access rules, registry values, services and features, users and groups, firewall rules, MSI packages, scheduled tasks, IIS sites and app pools, a network interface's DNS servers, a new Active Directory forest, joining a domain, adding a domain controller, and the OUs, groups and users inside it. `conn3x drift` checks these hosts the way it checks Linux ones. The [azure-windows-server](https://github.com/conn3xorg/conn3x/tree/main/examples/azure-windows-server) example builds a Windows Server VM on Azure and configures it in one plan. Windows as a whole is in preview, and every one of these modules is experimental, which its [page](/modules/windows_file) says: a module's arguments may change between releases. [Preview and experimental together](/reference/maturity#preview-and-experimental-together) explains how the two fit.
- **127 official circuits.** Web servers, databases, monitoring, Kubernetes, DNS, VPNs, hardening, identity, detection and response, vulnerability scanning, compliance tracking, CI runners and a private AI stack, each pinned to a release and tested on the systems its page lists. [IIS](/circuits/iis) and [Active Directory](/circuits/active-directory) are for Windows Server, and they're experimental, like the modules they use. The [circuit catalogue](/circuits) has them all.
- **The [Circuit Builder](https://conn3x.org/build).** Pick a distribution and the circuits you want, fill in a short form, and get a config that's ready to plan. k3s, Zabbix, FreeIPA and Velociraptor take their hosts by role, servers on some and agents or clients on others. It can also create the servers on AWS, Azure, Google Cloud or DigitalOcean, in the same plan. That part is in preview, and on Azure it means Linux hosts, with Windows still to come. It won't let you pick two circuits that fight over a port, and CI validates every circuit it offers, alone and in a set of realistic builds. Your picks live in the page address, so you can share a build as a link. Some circuits aren't in it yet, IIS and the network-device ones among them, and the [Builder page](https://conn3x.org/build#not-yet) names each with the reason.
- **AI you can account for.** A private AI stack from circuits: [Open WebUI](/circuits/openwebui) and [Ollama](/circuits/ollama) for chat that stays on your servers, a [LiteLLM](/circuits/litellm) gateway with per-team keys and budgets, [Presidio](/circuits/presidio) masking personal data before a model sees it, and [Langfuse](/circuits/langfuse) keeping a trace of every call.
- **Your playbooks come with you.** `conn3x convert ansible` rewrites the tasks it can prove and marks the rest with the reason.
- **Any OpenTofu provider.** Conn3x runs the same providers OpenTofu does, so whatever creates your servers today can keep doing it. Four clouds are tested end to end, on real servers: [AWS](/tutorials/aws), [Azure](/tutorials/azure), [Google Cloud](/tutorials/google-cloud) and [DigitalOcean](/tutorials/digitalocean) each have a tutorial, and we've applied Builder configs on all four. Google Cloud has a [BigQuery](/tutorials/bigquery) example too. The rest work the same way, and we haven't run them ourselves.
- **Runs on** Linux and macOS, on amd64 and arm64.

## Now: Windows at scale

You can build a small domain now, and fill it. [windows_ad_forest](/modules/windows_ad_forest) makes a new forest, [windows_dns_client](/modules/windows_dns_client) points a server's DNS at it, and since v0.7.2 [windows_domain_membership](/modules/windows_domain_membership) joins a server to the domain and [windows_ad_domain_controller](/modules/windows_ad_domain_controller) promotes a member to another domain controller. Since v0.7.3, [windows_ad_ou](/modules/windows_ad_ou), [windows_ad_group](/modules/windows_ad_group) and [windows_ad_user](/modules/windows_ad_user) keep what lives inside the domain, run on a domain controller, and a hand edit in Active Directory Users and Computers shows up as drift. The [azure-domain](https://github.com/conn3xorg/conn3x/tree/main/examples/azure-domain) example builds a forest on one Windows Server 2025 VM, joins a second to it, and creates a `Lab` OU with a user and a group she's in, all from one config. We've promoted that second VM to a domain controller on Azure too. Every one of these modules is experimental. Promoting a domain controller straight from a workgroup server and child domains haven't been tested yet, and a group can't list members from another domain.

The Active Directory lab works. One config builds two domain controllers and two member servers on Azure, with the OUs, users and groups inside the domain, and shows every step in the plan first, reboots included. [circuit-active-directory](/circuits/active-directory) does it by role, and the [lab tutorial](/tutorials/active-directory-lab) walks through a run, with what it costs and how to tear it down. We built it from nothing three times in a row, and each time the second plan was empty and both domain controllers replicated cleanly.

The work now is Windows at scale: many hosts in one apply rather than four, and the `windows_*` modules moving from experimental to preview, with arguments you can count on between releases.

## Next: network devices over their own CLI

Switches, routers and firewalls, configured in the same plan as the hosts behind them.

The first three are out, and they work through community OpenTofu providers rather than Conn3x's own connection: [RouterOS baseline](/circuits/routeros-baseline), [OPNsense VLANs](/circuits/opnsense-vlans) and [Proxmox VE network](/circuits/proxmox-network). They're [experimental](/reference/maturity): each was tested on a virtual image, not hardware, and its page names the image and the provider. Next is talking to devices over their own CLI, starting with Arista EOS. The first EOS modules, `eos_config`, `eos_hostname` and `eos_vlan`, arrive in the next release as experimental; [Network devices](/network-devices) explains how they work and what they need from the switch. One session per switch per apply comes after that, then more EOS modules, then Junos, VyOS and classic Cisco IOS.

## After that: Ansible roles and Galaxy

`conn3x convert ansible` handles tasks and plays today, not roles. This is where that changes: convert a role, or one you pull from Ansible Galaxy, into a circuit, with the same rule as now. What the converter can prove, it rewrites. Everything else it marks with the reason.

## Then: ad-hoc commands

Sometimes you just want to run one thing on every web server and see what comes back, without writing a circuit first. A `conn3x` command for that, over the same SSH connections and host keys a plan uses.

## Then: a web UI

A self-hosted, open-source web app for teams: run plans and applies from a browser, see each run's output and history, approve a plan before it applies, schedule drift checks, and keep credentials and access per project. Think [Semaphore UI](https://github.com/semaphoreui/semaphore) or AWX, built for one plan that covers the cloud and the servers in it.

## Toward full IaCC

Infrastructure as code and configuration: the five steps above are the start of it. These are the rest, in the order we expect to build them. A few slot in between those steps, and each one says where.

- **The rest of OpenTofu, on host steps.** Most of it is here. Since v0.8.0 a step takes `import` and a `lifecycle` block, so you can adopt a running server and put `prevent_destroy` on the step that matters. What's left: import for the other Linux modules, such as `authorized_key`, `cron`, `sysctl`, `mount` and firewall rules; adopting through a shared circuit you call as a module; import on Windows once its preview settles; and `conn3x generate step`, which reads what's on a host and writes the step for you, the way `-generate-config-out` writes a resource. It goes alongside Windows and network devices.
- **Inventory and host data.** Bring your Ansible inventory across with its `group_vars` and `host_vars`, and look a value up by host, group, environment or a common default, the way Hiera or Chef attributes do. This lands right after roles, since real roles lean on all of it, and before ad-hoc commands, so "every web server" can mean a group rather than a list you typed.
- **Rolling updates and orchestration.** Patch twenty servers five at a time, and stop if two fail. Run a step once, or on a machine other than the one it configures. Name a set of steps as a task, then chain tasks into a plan, the job Bolt does for Puppet. It builds on ad-hoc commands and comes before the web UI, which runs these as jobs.
- **Servers that keep themselves right.** Puppet and Chef put a server back every half hour without anyone asking. Conn3x tells you about drift today; here it fixes it on a schedule from the web UI, and keeps every run's report and every host's facts somewhere you can search. A pull mode, where the host asks for its own config, comes after, with its own design.
- **Encrypted secrets you can commit.** Ephemeral variables and write-only files already keep secrets out of state. This adds encrypted variable files, like Ansible Vault or Chef's encrypted data bags, sharing the web UI's way of holding credentials.
- **Compliance, tests and policy.** Checks that only report, the way InSpec does, so an auditor gets an answer and nobody's server changes. A test command that starts containers for a circuit, like Test Kitchen or Molecule. And policy that reads a plan, host steps included, before anything applies.
- **Your own modules, and your Chef and Puppet code.** A way to write a module without changing Conn3x itself. Converters for Chef cookbooks and Puppet modules that behave like `conn3x convert ansible`: rewrite what they can prove, mark the rest with the reason. And a registry for circuits, with versions and search.
- **Runs that start on an event.** An alert fires or a webhook arrives, and the right job runs, as Event-Driven Ansible does.

## Alongside: more circuits

New circuit rounds wait while the work above gets built, unless people ask. Requests still count: the last batch came from lists people sent us, so keep them coming.

## Later

macOS hosts.

## Last

The Circuit Builder as an app: desktop apps for Windows and macOS, and phone apps for iOS and Android.

## Help shape it

Open work is in [GitHub issues](https://github.com/conn3xorg/conn3x/issues), and every circuit repository has [good first issues](https://github.com/search?q=org%3Aconn3xorg+label%3A%22good+first+issue%22+state%3Aopen&type=issues) if you'd like somewhere to start. The order on this page moves when people tell us what they need. If Windows, network devices, roles, the web UI or a circuit you're missing matter to you, say so in [Discussions](https://github.com/conn3xorg/conn3x/discussions). See [Get involved](/contribute) for other ways to help.
