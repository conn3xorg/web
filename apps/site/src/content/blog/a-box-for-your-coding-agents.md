---
title: "A box for your coding agents"
description: "Coding agents want cores, memory and hours, and your laptop wants to sleep. circuit-agentbox turns any Linux host into a box for them: one SSH user, the tools they expect, the agents you list, and no API key ever passing through Conn3x."
date: 2026-12-09
author: James Conway
image: /media/blog/a-box-for-your-coding-agents/card.png
imageAlt: "A box for your coding agents. A laptop runs ssh dev@box and tmux; the box has git, tmux, Node.js 26 and claude in ~/.local/bin; Conn3x never sees API keys or subscriptions."
series: "AI you can account for"
---

You've watched it happen. An agent is halfway through a refactor, the fans are going, and you need to leave for the train. Close the lid and the session dies. Leave it open and your bag gets warm. And somewhere in the back of your mind is the fact that this thing has a shell on the same laptop as your SSH keys, your browser sessions and your password manager.

Agents don't need to live there. They need a shell, git, a toolchain, a current Node.js, and somewhere to keep running when you walk away. [circuit-agentbox](https://github.com/conn3xorg/circuit-agentbox) turns any Linux host you have into that place: a droplet, a server in the cupboard, a VM at work.

It's the fifth post in our series on [AI you can account for](/blog/ai-you-can-account-for), and it answers a smaller question than the others, but one worth asking: where do the agents run, and what can they reach?

<figure>
  <a href="/media/blog/a-box-for-your-coding-agents/agentbox.png">
    <img src="/media/blog/a-box-for-your-coding-agents/agentbox.png" width="1600" height="1600" loading="lazy" decoding="async" alt="A box for your coding agents. Plain SSH and tmux, or Orca, reach the host over SSH with a key. The host has git, tmux, ripgrep, jq, a C toolchain and Node.js 26 from NodeSource. The user dev has no password and no sudo, with agents such as claude, codex and gemini in ~/.local/bin, and repos cloned once into ~/code. Conn3x never sees a key, never opens a port and never gives sudo." />
  </a>
  <figcaption>One user, the tools agents expect, and nothing listening on the network.</figcaption>
</figure>

<details>
<summary>Read the diagram as text</summary>

- **How you get in:** plain SSH and tmux (`ssh dev@203.0.113.10`, `tmux new -A -s agents`, `cd ~/code/app && claude`), or Orca, which makes git worktrees on the box, brings its own server, and needs SSH port forwarding. Both log in as `dev` with a key; the account has no password.
- **On the host:** git, tmux, ripgrep, jq and a C toolchain, and Node.js 26 LTS from NodeSource's signed repository, the same on Ubuntu, Debian, Rocky Linux and Fedora.
- **The user `dev`:** no password, no sudo. Agents from `npm_packages`, such as `claude`, `codex` and `gemini`, in `~/.local/bin`; each signs itself in the first time you run it. Repositories cloned once into `~/code`, and git set up with your name and email.
- **Never:** Conn3x never sees an API key, token or subscription; the circuit never opens a port or changes `sshd_config`; and it never gives the user sudo.
- **Tested:** in CI on all four distributions. On droplets, `claude --version` ran as `dev`, an SSH local forward opened as Orca needs, and after a reboot the plan was clean.

</details>

## What one apply sets up

```hcl
module "agentbox" {
  source = "github.com/conn3xorg/circuit-agentbox?ref=v0.1.0"

  hosts                = { box = "203.0.113.10" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  user      = "dev"
  ssh_keys  = [file("~/.ssh/id_ed25519.pub")]
  git_name  = "Ada Lovelace"
  git_email = "ada@example.com"

  npm_packages = ["@anthropic-ai/claude-code", "@openai/codex", "@google/gemini-cli"]

  workspace = "code"
  repos     = ["https://github.com/example/app.git"]
}
```

`conn3x init`, `conn3x apply`, and the box has a user called `dev` that you can only reach with your key, because it has no password. It has git, tmux, ripgrep, jq and a C compiler, so npm packages with native parts can build. It has Node.js 26 from NodeSource, because Ubuntu 24.04 ships Node.js 18 and Debian 13 ships 20, both past their end of life. It has Claude Code, Codex CLI and Gemini CLI in `~/.local/bin`, installed as `dev`, not as root. And your app is cloned into `~/code/app`.

Then you log in and start work:

```sh
ssh dev@203.0.113.10
tmux new -A -s agents
cd ~/code/app && claude
```

Close the lid. Get on the train. `ssh` back in, run the same `tmux` line, and you're looking at the same session, with the agent where you left it.

## Who holds the keys

This is the part that matters for this series. The circuit never sees an API key or a subscription. Each agent signs itself in the first time you run it on the box, exactly as it would on your laptop, and keeps that login in `dev`'s home. Nothing goes through your plan, your state or your CI.

That also means the boundary is easy to describe. The agents run as one ordinary user, on one host, with no sudo. They can reach what `dev` can reach: the repos in its workspace, the network the host is on, and whatever credentials you give them after you log in. If an agent should have root, the README sends you to [circuit-users](https://github.com/conn3xorg/circuit-users) to add it, with a line worth reading twice: think about what an agent with root can do.

Private repositories follow the same rule. The circuit only clones `https://` URLs without credentials. For the private ones, you log in and clone them with your own credentials, so a token never ends up in a plan.

## With Orca

[Orca](https://github.com/stablyai/orca) runs agents on a remote host over SSH. It makes the git worktrees on the box and brings its own server and Node.js runtime, so what it needs from the box is git, a home directory it can run programs from, an SSH server that allows port forwarding, and the agents themselves. This circuit sets up the first three and installs the agents you name.

One snag, if you also use [circuit-hardening](https://github.com/conn3xorg/circuit-hardening): it turns TCP forwarding off by default, and Orca can't start its server without it. Give hardening `sshd_settings = { AllowTcpForwarding = "yes" }`. Plain SSH and tmux don't need it.

## What we tested

CI applies the example to Ubuntu 24.04, Debian 13, Rocky Linux 10 and Fedora 45 and checks the second plan has no changes. Then it logs in as `dev` over SSH, in a login shell, and checks that git, Node.js 26, tmux, `rg`, `jq` and `cc` run, that two small npm packages standing in for agents run from `~/.local/bin`, that git has the right email, that the repository is cloned and owned by `dev`, and that the account has no password.

On Ubuntu 24.04 and Rocky Linux 10 droplets, with SELinux enforcing on Rocky, `npm_packages` also held `@anthropic-ai/claude-code`, and `claude --version` ran as `dev`. An SSH local port forward opened as `dev`, which is what Orca needs. After a reboot, the plan still had no changes.

Two things we haven't done, so you know. We haven't driven Orca itself against the box; we checked the forward it relies on. And Codex CLI and Gemini CLI are in the example because they're the right npm package names, checked on npm in October 2026, but only Claude Code was installed and run on the droplets.

## What it doesn't do

- **No keys, ever.** It doesn't handle API keys, tokens or subscriptions. Each agent signs itself in.
- **No sudo.** Add it with circuit-users if you must.
- **No network changes.** It doesn't touch `sshd_config`, open ports or start any service that listens. Pair it with [circuit-baseline](https://github.com/conn3xorg/circuit-baseline) to turn off password logins for the whole host.
- **No pulls.** A repository is cloned once and then belongs to you and your agents. Pulling over it would throw away their work.
- **No updates for agents.** Claude Code updates itself; for the others, log in and run `npm update -g`.
- **No uninstall.** Removing a package or a repo from the lists leaves it on the host.

## Try it

The [README](https://github.com/conn3xorg/circuit-agentbox) has every input, including how to pass host keys for a droplet made in the same plan, and [examples/local](https://github.com/conn3xorg/circuit-agentbox/tree/main/examples/local) runs it on a throwaway container.

Next week, the last piece: an audit trail for every prompt, with Langfuse.
