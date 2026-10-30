---
title: Agent box
description: "Remote dev box for coding agents: key-only user, git, tmux, ripgrep, Node.js LTS, agent CLIs via npm. Works with Orca or plain SSH."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-agentbox at v0.1.0. -->

A Conn3x circuit that turns a Linux host into a remote box for coding agents: one ordinary user you log in to with your SSH key, with git, tmux, a C toolchain, ripgrep, jq and a current Node.js LTS, plus whichever agent CLIs you list, installed in that user's own npm prefix. Your laptop stays cool, the agents get the cores and the RAM, and when you close the lid the tmux session is still there in the morning.

It's the box, not the client. Plain SSH and tmux work with it as they are. So does [Orca](https://github.com/stablyai/orca), which runs agents on a remote host over SSH: Orca creates the git worktrees on the host and brings its own server and Node.js runtime, so what it needs from the box is git, a home directory it can run programs from, an SSH server that allows port forwarding, and the agents themselves. This circuit sets up the first three and installs the agents you name.

The circuit never sees an API key or a subscription. Each agent logs itself in the first time you run it on the box, the same way it would on your laptop.

## Usage

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

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

Log in and start work:

```sh
ssh dev@203.0.113.10
tmux new -A -s agents
cd ~/code/app && claude
```

The first run of each agent asks you to sign in, or for its API key, and stores that in the user's home on the box. Nothing in `npm_packages` is installed unless you list it. The three names above are the npm packages for Claude Code, Codex CLI and Gemini CLI, checked on npm in October 2026; any other npm package with a command works the same way.

For hosts created in the same plan, pass host objects with the host key you generated, so Conn3x checks it without a known_hosts entry. Give each one's distribution in `os` too: the circuit picks its packages and NodeSource's repository by distribution, and Conn3x can't ask a host that doesn't exist yet. If `os` turns out not to match the host, Conn3x stops before configuring it. Set `os` as well when you put `depends_on` on this module: `depends_on` holds back reading the hosts until the apply, so without `os` the plan fails with `Invalid for_each argument`.

```hcl
hosts = {
  for name, d in digitalocean_droplet.box : name => {
    address  = d.ipv4_address
    host_key = tls_private_key.host[name].public_key_openssh
    os       = "ubuntu"
  }
}
```

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-agentbox/tree/v0.1.0/examples/local).

### With circuit-baseline and circuit-hardening

The account has no password, so it can only log in with one of `ssh_keys`. The circuit leaves `sshd_config` alone, though, so other accounts keep whatever sshd allows. To turn password logins off for the whole host, pair it with [circuit-baseline](/circuits/baseline), which does that by default.

[circuit-hardening](/circuits/hardening) sets `AllowTcpForwarding no`, and Orca can't start its server on a host that refuses port forwarding. If you use both, give hardening `sshd_settings = { AllowTcpForwarding = "yes" }`. Plain SSH and tmux don't need forwarding.

### Updating the agents

The circuit installs a package once and then leaves it. Claude Code updates itself. For the others, log in and run `npm update -g`, or `npm install -g @openai/codex@latest` for one of them.

## What it does

On each host, in order:

1. On Rocky Linux and AlmaLinux, installs `epel-release` from the distribution's extras repository, which turns on EPEL, since ripgrep is only there. EPEL stays on afterwards. RHEL doesn't ship `epel-release`, so on RHEL turn EPEL on yourself first.
2. Installs `git`, `tmux`, `ripgrep` and `jq`, with `build-essential` on Debian and Ubuntu, or `gcc`, `gcc-c++` and `make` on the Red Hat family, so npm packages with native parts can build.
3. Adds NodeSource's repository for `node_major` and installs `nodejs` from it, which includes npm. On Debian and Ubuntu that's `https://deb.nodesource.com/node_26.x` with the suite `nodistro`, signed with the key in `files/nodesource-deb.asc`. On the Red Hat family it's `https://rpm.nodesource.com/pub_26.x/nodistro/nodejs/$basearch` in `/etc/yum.repos.d/nodesource-nodejs.repo`, signed with `files/nodesource-rpm.asc`, at priority 9 as NodeSource's own setup script sets it. When `node --version` already reports `node_major`, it does nothing; when it reports an older NodeSource release, it moves it up.
4. Creates `user` with `/home/USER` and bash as its login shell, and no password, then adds each of `ssh_keys` to its `~/.ssh/authorized_keys`. Keys you add to that file by hand stay.
5. As that user, sets git's `user.name` and `user.email` with `git config --global`, and npm's `prefix` to `~/.local` with `npm config set`, so other settings in `~/.gitconfig` and `~/.npmrc` stay.
6. As that user, runs `npm install -g` for `npm_packages` that aren't installed yet. Their commands land in `~/.local/bin`, which the shell startup files every supported distribution gives a new user put on the `PATH` of a login shell. tmux starts login shells, and so does `ssh` without a command.
7. Creates `workspace`, owned by the user, and clones each of `repos` into it as that user, unless it's already there.

Before the circuit runs, the `conn3x_host` data source reads each host's distribution over SSH.

### Why NodeSource

Ubuntu 24.04 ships Node.js 18 and Debian 13 ships Node.js 20, both past their end of life, and Claude Code needs 22 or later. NodeSource builds every LTS release for all four supported distributions from one place, which gives the same Node.js everywhere. Both keys have no expiry date. Their fingerprints are:

| File | Fingerprint |
| --- | --- |
| `files/nodesource-deb.asc` | `6F71 F525 2828 41EE DAF8 51B4 2F59 B5F9 9B1B E0B4` |
| `files/nodesource-rpm.asc` | `242B 8138 31AF 0956 2B6C 46F7 6B88 DA4E 3AF2 8A14` |

### What it doesn't do

- It never handles API keys, tokens or subscriptions. Each agent signs itself in.
- It doesn't give the user sudo. If your agents need it, add it with [circuit-users](/circuits/users), and think about what an agent with root can do.
- It doesn't change `sshd_config`, open ports or start any service that listens on the network.
- It doesn't keep the clones up to date. A repository is cloned once and then belongs to you and your agents; pulling over it would throw away their work. Only `https://` URLs without credentials are accepted, so private repositories are for you to clone after logging in, with your own credentials.
- It doesn't uninstall. Removing a package from `npm_packages` or a URL from `repos` leaves it on the host, and deleting the module leaves the user, Node.js and everything else.
- On the Red Hat family it doesn't replace a Node.js from the distribution's own repositories: its `nodejs-libs` and `nodejs-npm` conflict with NodeSource's package, and the install fails. Remove them first with `dnf remove nodejs nodejs-libs nodejs-npm`. Debian and Ubuntu don't have this problem.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file`, `jump_hosts` and `os`, the distribution's ID, such as `ubuntu` or `rocky`, which a host created in the same plan needs. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `user` | string | `"dev"` | Login name of the account you and your agents work as. Its home is `/home/USER`. Can't be `root`. |
| `ssh_keys` | list(string) | Required | Public keys that can log in as `user`, such as `[file("~/.ssh/id_ed25519.pub")]`. At least one. |
| `git_name` | string | `null` | git's `user.name` for `user`. When null, left as it is. |
| `git_email` | string | `null` | git's `user.email` for `user`. When null, left as it is. |
| `node_major` | number | `26` | Node.js major release to install from NodeSource. 26 became the LTS release on 28 October 2026. |
| `npm_packages` | list(string) | `[]` | npm packages to install globally as `user`, by name without a version, such as `["@anthropic-ai/claude-code", "@openai/codex", "@google/gemini-cli"]`. |
| `workspace` | string | `null` | Directory for your checkouts, owned by `user`: relative to the home directory, such as `"code"`, or absolute. When null, `repos` are cloned into the home directory. |
| `repos` | list(string) | `[]` | Repositories to clone once into `workspace`, as `https://` URLs without credentials. Each lands in a directory named after the repository, so `https://github.com/example/app.git` goes to `app`. |

## Outputs

| Name | Description |
| --- | --- |
| `user` | The account the circuit sets up. |
| `workspace` | Directory the repositories are cloned into, such as `/home/dev/code`. |
| `repos` | Path of each cloned repository, by name, such as `{ app = "/home/dev/code/app" }`. |

## Requirements

Requires Conn3x v0.6.9 or later and systemd on each host, with a package mirror, NodeSource, the npm registry and your git hosts reachable from it. On Rocky Linux and AlmaLinux, the host also needs to reach EPEL's mirrors; on RHEL, EPEL must already be on. The home directory must not be mounted `noexec`, or nothing in `~/.local/bin` runs, Orca's server included.

## Tested on

Ubuntu 24.04, Debian 13, Rocky Linux 10 and Fedora 45. CI applies [examples/local](https://github.com/conn3xorg/circuit-agentbox/tree/v0.1.0/examples/local) to each on amd64 and checks that the second plan has no changes. It then logs in over SSH as `dev` with the example's key, in a login shell, and checks `git`, Node.js 26, `tmux`, `rg`, `jq` and `cc` run, that `cowsay` and `semver`, installed through `npm_packages` as stand-ins for agents, run from `~/.local/bin`, that git has the example's email, and that the example repository is cloned and owned by `dev`. It also checks the account has no password.

The same apply and checks passed by hand on arm64 containers of all four, and on Ubuntu 24.04 and Rocky Linux 10 droplets, with SELinux enforcing on Rocky Linux. On the droplets `npm_packages` also held `@anthropic-ai/claude-code`, and `claude --version` ran as `dev`. As `dev`, an SSH local port forward opened, as Orca needs. After a reboot, the plan still had no changes and the checks passed again, and Rocky Linux's audit log had no denials.

Moving `node_major` from 24 to 26 was tried by hand on Debian 13 and Rocky Linux 10 containers: the apply upgraded Node.js and the next plan had no changes.

## Source

- Repository: [conn3xorg/circuit-agentbox](https://github.com/conn3xorg/circuit-agentbox). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-agentbox/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-agentbox/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-agentbox/tree/v0.1.0/examples/local).
- Related circuits: [Baseline](/circuits/baseline), [Hardening](/circuits/hardening), [Users](/circuits/users), [Ollama](/circuits/ollama), [Qdrant](/circuits/qdrant).
