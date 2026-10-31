---
title: GitHub Actions runner
description: "GitHub Actions self-hosted runners on Linux hosts: pinned release, dedicated user, one-time registration, a systemd service per runner."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-github-runner at v0.1.0. -->

A Conn3x circuit that turns Linux hosts into GitHub Actions self-hosted runners. Each host gets GitHub's runner release, checked against its SHA-256, a dedicated user without sudo, and one or more runners registered with your repository or organization, each as its own systemd service.

You'd want one when GitHub's hosted runners can't reach what a job needs, such as a database on your network or a box with a GPU, or when your builds have outgrown the free minutes. Doing it by hand means the "New self-hosted runner" page, a pasted token, `config.sh` answering questions, and `svc.sh install`, once per runner, on every host. Here you write the runners down once, and a new host is one more line in `hosts`.

## Usage

```hcl
module "github_runner" {
  source = "github.com/conn3xorg/circuit-github-runner?ref=v0.1.0"

  hosts                = { ci1 = "203.0.113.10", ci2 = "203.0.113.11" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  github_url         = "https://github.com/acme/app"
  registration_token = var.registration_token

  runners = {
    build = { labels = ["linux-build"] }
  }
}

variable "registration_token" {
  type      = string
  ephemeral = true
}
```

Get a registration token from the repository's **Settings > Actions > Runners > New self-hosted runner** page, or from the API:

```sh
export TF_VAR_registration_token=$(gh api -X POST repos/acme/app/actions/runners/registration-token -q .token)
conn3x init
conn3x apply
```

A second `conn3x plan` with the same token says `No changes.` The runners show up as `ci1-build` and `ci2-build`, and a job reaches them with `runs-on: [self-hosted, linux-build]`.

For an organization, set `github_url` to `https://github.com/acme` and use the organization's runners page, or `orgs/acme/actions/runners/registration-token`. Put runners in an organization's runner group with `group`.

### Register once, then set register = false

A registration token works for an hour. While `register` is true, every plan needs one, and passing a fresh one shows up as a change to the token file. The intended flow is the same as for an auth key in [circuit-tailscale](/circuits/tailscale):

1. Apply once with `register = true`, the default, and a token. Every runner registers.
2. Set `register = false` and apply again. Conn3x deletes `/etc/github-runner/token` from each host and drops the registration steps from state. The runners stay registered and keep running.
3. From then on, plan and apply without a token.

To add a host or a runner later, set `register = true` with a new token for that apply, then back to false. Runners that are already registered are skipped: `config.sh` runs only where the runner's `.runner` file is missing.

While `register` is false, Conn3x keeps the runners enabled at boot but doesn't start a stopped one, since it can't tell from the plan whether a runner was ever registered. A runner that isn't registered stays stopped: its unit only starts when `.runner` exists.

### Several runners on one host

Each key in `runners` is a separate runner, with its own copy of the release under `/opt/actions-runner/KEY`, its own work directory and its own service, `github-runner@KEY`. Each runner takes one job at a time, so two runners on a host run two jobs at once:

```hcl
runners = {
  build  = { labels = ["linux-build"] }
  deploy = { name = "ci1-deploy", labels = ["deploy"], group = "production" }
}
```

`name` defaults to the host's key and the runner's key, such as `ci1-build`, and must be unique across the repository or organization. Set it only when `hosts` has one host: the same name on two hosts would make the second replace the first. `labels` are added to the ones every runner gets, `self-hosted`, `Linux` and `X64` or `ARM64`.

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-github-runner/tree/v0.1.0/examples/local).

## Security

Read this before you register a runner. A self-hosted runner runs whatever code a workflow tells it to, on your machine, with your network around it.

- **Don't use self-hosted runners with public repositories.** This is GitHub's own advice. Anyone can fork a public repository and open a pull request whose workflow runs on your runner. Keep runners on private repositories, or on an organization whose repositories are all private.
- **The runner and every job run as an unprivileged user,** `github-runner` by default, created without a password, sudo or any extra groups. The circuit won't run a runner as root. If jobs need root for something, give the user exactly that through `/etc/sudoers.d`, for example with [circuit-users](/circuits/users), and know that any workflow on the repository then has it too.
- **Keep the box single-purpose.** A job can read anything the runner's user can read, and what one job leaves behind, the next one sees. Don't put a runner on a host that also holds secrets or serves production traffic, and don't share a host between repositories that don't trust each other.
- **Mind Docker.** Adding the runner's user to the `docker` group, so jobs can use containers, is the same as giving it root.
- **The registration token stays out of the plan and state.** `registration_token` is ephemeral and sensitive. Conn3x writes it to `/etc/github-runner/token`, mode `0600` and readable only by root, and `config.sh` gets it from the environment, so it doesn't show in the process list. Setting `register = false` deletes the file. A registration token can register new runners until it expires, which is an hour after it was made.

## What it does

On each host, in order:

1. Installs `curl`, `tar`, `gzip` and `git`. Jobs need git for `actions/checkout` to clone the repository instead of downloading a tarball of it.
2. Creates the `github-runner` system user, with its home in `/var/lib/github-runner`.
3. Writes the systemd template unit `/etc/systemd/system/github-runner@.service`, which runs each runner's `run.sh` as that user.
4. Downloads `actions-runner-linux-x64-VERSION.tar.gz` or `actions-runner-linux-arm64-VERSION.tar.gz` from [actions/runner](https://github.com/actions/runner/releases) into `/opt/actions-runner`, and checks its SHA-256 before using it.
5. Unpacks it into `/opt/actions-runner/KEY` for each runner, owned by the runner's user so the runner can update itself.
6. Installs ICU, which the runner can't start without. On Debian and Ubuntu that's GitHub's own `bin/installdependencies.sh`, which also finds ICU's versioned package name, such as `libicu74`. On Fedora and Rocky Linux it's `dnf install libicu`: the script also wants `lttng-ust`, which Rocky Linux only has in EPEL and the runner doesn't need.
7. With `register = true`, writes the token to `/etc/github-runner/token` and, for each runner without a `.runner` file, runs `config.sh --unattended --replace` as the runner's user with `--url`, `--name`, `--labels`, `--runnergroup` and `--work _work`. `--replace` takes over a runner of the same name, so rebuilding a host doesn't leave a dead runner behind.
8. Starts and enables `github-runner@KEY` for each runner.

The circuit writes its own unit instead of running `svc.sh install`. `svc.sh` names its unit after the repository and the runner, such as `actions.runner.acme-app.ci1-build.service`, and writes it as root on the first run only. A template unit has a name Conn3x knows before the runner registers, and a plan shows it changing like any other file. The unit keeps what matters from GitHub's own: `KillMode=process` and a five-minute stop timeout, so a job that's running when the service stops gets to clean up.

### Updates

By default each runner updates itself when GitHub releases a new version, which is what GitHub expects. `runner_version` and `checksums` then only pick the version a new runner starts from, and the circuit leaves alone a runner that's already at or past it.

With `auto_update = false`, the runners register with `--disableupdate` and stay on `runner_version`. Update them by raising `runner_version` and `checksums`: Conn3x downloads the new release, unpacks it over each runner that's older, and restarts it. GitHub stops sending jobs to a runner that's more than 30 days behind the latest release, so don't leave it long.

### Ephemeral and just-in-time runners

The circuit registers long-lived runners only. `config.sh --ephemeral` makes a runner take one job and then remove itself, and a just-in-time runner gets its configuration from the API for one job. Both are better isolated, since no job sees what the last one left, but both need a fresh registration for every job, from something that holds a GitHub token and watches the queue, such as [Actions Runner Controller](https://github.com/actions/actions-runner-controller). That doesn't fit a circuit that registers once from a token you paste in, so neither is offered here.

### Removing a runner

Deleting a runner from `runners`, or deleting the module, stops and disables its service on the next apply, and leaves its directory. It stays registered with GitHub, shown as offline, until you remove it there. GitHub deletes self-hosted runners that haven't connected for 14 days on its own.

To remove a runner properly, get a removal token, which also lasts an hour, and run `config.sh remove` as the runner's user on the host:

```sh
token=$(gh api -X POST repos/acme/app/actions/runners/remove-token -q .token)
ssh root@203.0.113.10 "systemctl stop github-runner@build && cd /opt/actions-runner/build && ACTIONS_RUNNER_INPUT_TOKEN=$token runuser -u github-runner -- ./config.sh remove"
```

Or delete it from the runners page in GitHub, or with `gh api -X DELETE repos/acme/app/actions/runners/RUNNER_ID`, and then delete its directory.

### What it doesn't do

- It doesn't change a runner that's already registered. Changing `name`, `labels` or `group`, or `github_url`, doesn't reach a runner that has a `.runner` file. Remove the runner as above, and apply again with `register = true` and a token to register it with the new settings. Labels can also be changed on the runner's page in GitHub.
- It doesn't install what your jobs need, such as compilers, Docker or language runtimes. Add those with other circuits, or use `actions/setup-*` in the workflow.
- It doesn't clean up between jobs, beyond what the runner itself does in `_work`.
- It doesn't give the runner's user sudo, or add it to any group.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `github_url` | string | Required | Repository, organization or enterprise to register with, such as `"https://github.com/acme/app"` or `"https://github.com/acme"`. |
| `register` | bool | `true` | Register runners that aren't registered yet. Set it to false once they are, so later plans need no token. |
| `registration_token` | string, sensitive, ephemeral | `null` | Registration token. Ephemeral and sensitive. Required when `register` is true. |
| `runners` | map(object) | `{ runner = {} }` | Runners on each host, by key. Each takes optional `name` (default `HOST-KEY`), `labels` (default `[]`) and `group`, an organization's runner group. Keys name directories and units, so use letters, digits, `.`, `-` and `_`. |
| `runner_version` | string | `"2.338.2"` | [actions/runner](https://github.com/actions/runner/releases) release to install, without the leading `v`. |
| `checksums` | map(string) | the 2.338.2 tarballs | SHA-256 of the tarball for `x86_64` and `aarch64`, from the release notes. Change them with `runner_version`. |
| `auto_update` | bool | `true` | Let runners update themselves. When false, they register with `--disableupdate` and you update them through `runner_version`. |
| `user` | string | `"github-runner"` | System user the runners and their jobs run as. Can't be `root`. |
| `install_dir` | string | `"/opt/actions-runner"` | Directory that holds the tarball and one directory per runner. |

## Outputs

| Name | Description |
| --- | --- |
| `runner_names` | Name each runner registers with, by host and runner key, such as `{ ci1 = { build = "ci1-build" } }`. |
| `services` | systemd unit of each runner, by runner key, such as `{ build = "github-runner@build.service" }`. |

## Requirements

Requires Conn3x v0.6.9 or later and systemd on each host, on x86_64 or aarch64. Each host needs to reach github.com and its package mirror, and a runner needs outbound HTTPS to GitHub to take jobs; it doesn't need any inbound port. GitHub's runner is built for glibc, so Alpine and other musl distributions are out.

## Tested on

Ubuntu 24.04, Debian 13, Fedora 45 and Rocky Linux 10. CI applies [examples/local](https://github.com/conn3xorg/circuit-github-runner/tree/v0.1.0/examples/local) to each on amd64 without registering, since GitHub-hosted CI has no way to make a registration token without a stored personal access token. It checks the second plan has no changes, the tarball's checksum, that the runner starts as its own user with its libraries in place, and that the unit is installed and enabled.

Registration was tested by hand against a throwaway private repository. On arm64 containers of all four distributions, Conn3x applied with no changes on the second plan. On Ubuntu 24.04, Rocky Linux 10 and Debian 13 containers it also registered runners with a real token, and a workflow with `runs-on: [self-hosted, conn3x-test]` ran on Ubuntu's and Rocky Linux's as `github-runner`. The token never appeared in the plan, the apply output or the state. On Debian 13, two runners on one host both came online; dropping one from `runners` stopped and disabled its service, and setting `register = false` deleted the token file and left the next plan empty. `config.sh remove` with a removal token deregistered each runner.

On DigitalOcean, an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing registered with the same token, both took a job, and the second plan had no changes. On Rocky Linux the runner ran as `unconfined_service_t` with no denials in the audit log. After a reboot both runners came back by themselves and took a job each; Ubuntu's took about 40 seconds to come online while GitHub let go of its old session. Setting `register = false` afterwards removed the token file and left the next plan empty.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-github-runner/blob/v0.1.0/LICENSE). GitHub's runner is MIT-licensed.

## Source

- Repository: [conn3xorg/circuit-github-runner](https://github.com/conn3xorg/circuit-github-runner). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-github-runner/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-github-runner/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-github-runner/tree/v0.1.0/examples/local).
- Related circuits: [Tailscale](/circuits/tailscale), [Users](/circuits/users), [Java](/circuits/java), [PHP-FPM](/circuits/php), [Jenkins](/circuits/jenkins), [GitLab Runner](/circuits/gitlab-runner), [Cinc Client](/circuits/cinc), [Node.js](/circuits/nodejs), [Perl](/circuits/perl), [Bun](/circuits/bun), [Selenium Grid](/circuits/selenium), [OpenVox](/circuits/openvox).
