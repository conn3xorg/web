---
title: Renovate
description: "Self-hosted Renovate on a systemd timer against the repositories you list, its config checked with the strict validator and its token kept out of state."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-renovate at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/renovate/grade.svg)](https://conn3x.org/circuits/renovate/grade)

A Conn3x circuit that runs [Renovate](https://docs.renovatebot.com) on a host you own, on a timer, against the repositories you list. Renovate reads each repository's dependency files, finds what's out of date and opens pull requests to update it. Running it yourself means it works with a Forgejo, Gitea or GitLab on your own network, and the token it pushes with never leaves your hosts.

Each run is the official image under Podman, pinned by tag and digest, started by a systemd timer: hourly unless you say otherwise. The token goes to a root-only file, written from an ephemeral value, so it's not in the plan or state. Renovate's own validator checks the config before it's written. It runs on Debian, Ubuntu, Fedora and Rocky Linux.

## Usage

```hcl
variable "renovate_token" {
  type      = string
  ephemeral = true
  sensitive = true
}

module "renovate" {
  source = "github.com/conn3xorg/circuit-renovate?ref=v0.1.0"

  hosts                = { tools = "192.168.1.70" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  platform     = "forgejo"
  endpoint     = "https://git.example.com/api/v1"
  token        = var.renovate_token
  repositories = ["infra/homelab", "infra/website"]
  git_author   = "Renovate Bot <renovate@example.com>"
}
```

Then run `conn3x init` and `conn3x apply` with the token in the environment:

```sh
export TF_VAR_renovate_token='...'
conn3x apply
```

A second `conn3x plan` says `No changes.` Every plan needs the token too, since Conn3x checks the file it's kept in on the host against it.

The first run on a repository opens an onboarding pull request that adds `renovate.json`. Merge it and the next run starts on updates. To try it on a throwaway container with its own Forgejo first, see [examples/local](https://github.com/conn3xorg/circuit-renovate/tree/v0.1.0/examples/local).

### The token

Make a dedicated account for Renovate on your forge, so its pull requests and commits are plainly its own, and give it write access to the repositories you list. For Forgejo, Renovate's docs ask for a token with `repo` and `issue` read and write, and `user` and `organization` read. For GitHub, use a fine-grained token, or better, a GitHub App; for GitLab, a token with `api` and `write_repository`. [Renovate's platform pages](https://docs.renovatebot.com/modules/platform/) list each one.

When `platform` isn't `github`, Renovate still looks things up on GitHub.com, for release notes and for dependencies that live there. Without a token, GitHub's limit for anonymous calls stops those quickly. Give `github_com_token` a read-only GitHub.com token to lift it. Both tokens go in the same root-only file.

### More options

`config` takes any of Renovate's [self-hosted](https://docs.renovatebot.com/self-hosted-configuration/) and [repository](https://docs.renovatebot.com/configuration-options/) options, merged over the ones the circuit sets:

```hcl
  config = {
    onboarding    = false
    requireConfig = "optional"
    extends       = ["config:recommended"]
    timezone      = "Europe/London"
    schedule      = ["before 6am on monday"]
  }
```

Renovate's validator, from the same image, checks the whole config in `--strict` mode before it replaces the old one, so a typo or a misspelt option fails the apply instead of a run at night. Keep secrets out of `config`: it's written to the plan and state as it stands.

`schedule` on the module decides when Renovate runs. `schedule` in `config` decides when, during those runs, it may open pull requests. Run hourly and limit pull requests to a quiet window: Renovate also rebases and closes pull requests on every run, so a run once a week leaves them stale.

## What it does

On each host, in order:

1. Installs Podman and pulls `ghcr.io/renovatebot/renovate:VERSION@DIGEST`.
2. Writes `/etc/renovate/config.json`, mode `0644`, with `platform`, `endpoint`, `repositories`, `git_author` and `config`, after `renovate-config-validator --strict` in the image passes it.
3. Writes `/etc/renovate/token.env`, mode `0600`, with `RENOVATE_TOKEN` and, if set, `GITHUB_COM_TOKEN`. It's written from ephemeral values: the plan and state hold an HMAC of the content, never the tokens.
4. Creates `/var/cache/renovate`, mode `0700`, for clones and the tools Renovate installs as it needs them. Podman hands it to the container's user, UID 12021, at the start of each run.
5. Writes `/usr/local/sbin/conn3x-renovate`, which runs one Renovate pass in a container that's removed when it ends.
6. Sets up `renovate.timer` and `renovate.service`, which runs the script. A run missed while the host was off happens at the next boot.

The container shares the host's network, so a forge that listens only on the host's loopback is reachable, and it listens on nothing itself. Each run's log goes to the journal: `journalctl -u renovate.service`. To run now rather than wait, `systemctl start renovate.service`; it returns when the run ends.

### Why a container

Renovate is a Node.js program, and the image is how its maintainers ship and test it. It's the default image, not `-full`: it has Node.js and installs whatever else a repository needs, such as a Go toolchain or Poetry, into the cache the first time it's needed, about 450 MB to start with rather than several gigabytes. `renovate_version` and `image_digest` go into the script together, so a tag that's re-pushed upstream can't change what runs. Renovate releases several times a week; change both inputs to upgrade.

### What it doesn't do

- It doesn't run Renovate's webhook server, or Mend's Community Edition. Runs happen on the timer, not when someone pushes.
- It doesn't make the account or the token. Do that on your forge first.
- It doesn't keep a copy of the logs beyond the journal.
- Deleting the module removes the timer and its service, and leaves Podman, `/etc/renovate` and the cache in place.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"192.168.1.70"`, or a host object such as `{ address = "192.168.1.70", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `platform` | string | Required | `"github"`, `"gitlab"`, `"forgejo"`, `"gitea"`, `"bitbucket"`, `"bitbucket-server"` or `"azure"`. |
| `endpoint` | string | `null` | The platform's API address, such as `"https://git.example.com/api/v1"` for Forgejo. When null, the public service, such as GitHub.com. |
| `repositories` | list(string) | Required | Repositories to run on, such as `["acme/api"]`. |
| `token` | string, sensitive, ephemeral | Required | Access token for Renovate's account. Ephemeral and sensitive: it reaches a root-only file on the host but never the plan or state. |
| `github_com_token` | string, sensitive, ephemeral | `null` | A read-only GitHub.com token for release notes and lookups when `platform` isn't `github`. Ephemeral and sensitive. |
| `git_author` | string | `null` | Author of Renovate's commits, such as `"Renovate Bot <bot@example.com>"`. |
| `config` | any | `{}` | More of Renovate's options, merged over the ones above. Checked by Renovate's validator. In the plan and state, so no secrets. |
| `schedule` | string | `"hourly"` | When Renovate runs, as a systemd calendar expression. |
| `log_level` | string | `"info"` | `"debug"`, `"info"`, `"warn"` or `"error"`. |
| `renovate_version` | string | `"44.220.0"` | Tag of Renovate's image. Change `image_digest` with it. |
| `image_digest` | string | `"sha256:71599a20..."` | Digest of the image for `renovate_version`. Podman pulls by the digest. Find it on the [package page](https://github.com/renovatebot/renovate/pkgs/container/renovate) or with `skopeo inspect docker://ghcr.io/renovatebot/renovate:TAG`. |
| `image_repository` | string | `"ghcr.io/renovatebot/renovate"` | Where to pull the image from. `"docker.io/renovate/renovate"` serves the same digests. |

## Outputs

| Name | Description |
| --- | --- |
| `service` | `renovate.service`, which runs Renovate once. |
| `timer` | `renovate.timer`, which starts each run. |
| `image` | The image each run uses, with its tag and digest. |
| `config_file` | `/etc/renovate/config.json`. |

## Requirements

Requires Conn3x v0.7.0 or later and systemd on each host. The image is built for amd64 and arm64. Each host needs to reach its package mirror, GitHub's registry, your forge, and the registries your repositories' dependencies come from.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. CI starts a throwaway Forgejo 17 beside the host from [examples/local](https://github.com/conn3xorg/circuit-renovate/tree/v0.1.0/examples/local), with a repository whose `package.json` pins lodash 4.17.20 and an access token made for the job. It applies the example with Renovate 44.219.0, upgrades to the default, and checks the next plan has no changes and the token isn't in state. [check.sh](https://github.com/conn3xorg/circuit-renovate/blob/v0.1.0/examples/local/check.sh) then starts `renovate.service`, waits for the run, and checks Renovate opened a pull request for lodash on Forgejo, and that the token is only in `token.env`. CI restarts the host, checks the timer is active, runs Renovate again, and plans clean once more.

The same runs passed by hand on arm64 in rootful Podman on a Mac. By hand on DigitalOcean droplets, Ubuntu 24.04 and Rocky Linux 10 with SELinux enforcing, each with its own throwaway Forgejo: Renovate opened the lodash pull request, the token wasn't in state, and after a reboot the timer was active, a run worked and the plan was clean. The Rocky audit log had no denials. Other platforms, such as GitHub and GitLab, haven't been tried.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-renovate/blob/v0.1.0/LICENSE).

Renovate itself is under the GNU Affero General Public License v3.0. Running it on your own hosts is fine; changing it and offering it to others over a network means sharing your changes.

## Source

- Repository: [conn3xorg/circuit-renovate](https://github.com/conn3xorg/circuit-renovate). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-renovate/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-renovate/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-renovate/tree/v0.1.0/examples/local).
- Related circuits: [Java](/circuits/java), [PHP-FPM](/circuits/php), [Jenkins](/circuits/jenkins), [GitHub Actions runner](/circuits/github-runner), [GitLab Runner](/circuits/gitlab-runner), [Cinc Client](/circuits/cinc), [Node.js](/circuits/nodejs), [Perl](/circuits/perl), [Bun](/circuits/bun), [Selenium Grid](/circuits/selenium), [k6](/circuits/k6), [OpenVox](/circuits/openvox), [Rust](/circuits/rust), [Go](/circuits/go), [Python](/circuits/python), [Ruby](/circuits/ruby), [Kotlin](/circuits/kotlin), [.NET](/circuits/dotnet), [C toolchain](/circuits/c-toolchain), [Semaphore UI](/circuits/semaphore).
