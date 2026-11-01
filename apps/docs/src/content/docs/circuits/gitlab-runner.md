---
title: GitLab Runner
description: "GitLab Runner from GitLab's packages, shell or Docker executor, its glrt- token kept out of plan and state."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-gitlab-runner at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/gitlab-runner/grade.svg)](https://conn3x.org/circuits/gitlab-runner/grade)

A Conn3x circuit that runs [GitLab Runner](https://docs.gitlab.com/runner/) on hosts of your own, from GitLab's official packages, and connects it to your GitLab. You create the runner in GitLab and hand the circuit its authentication token; the circuit adds GitLab's runner repository, installs the release you pinned, writes `config.toml` and keeps the service running. The token goes to the host and nowhere else: not the plan, not the state.

It pairs with [circuit-gitlab](/circuits/gitlab), which runs the GitLab these runners take jobs from, and with [circuit-docker](/circuits/docker) when you want each job in its own container. It works with any GitLab, though, GitLab.com included.

## Usage

First, create the runner in GitLab. For a runner every project can use, that's **Admin > CI/CD > Runners > Create instance runner**; for one project, **Settings > CI/CD > Runners > Create project runner** in that project. The form is where a runner's tags, whether it picks up untagged jobs, and whether it only runs protected branches are set. Then GitLab shows a runner authentication token, starting `glrt-`. Copy it; GitLab shows it once.

```hcl
variable "runner_token" {
  type      = string
  ephemeral = true
  sensitive = true
}

module "gitlab_runner" {
  source = "github.com/conn3xorg/circuit-gitlab-runner?ref=v0.1.0"

  hosts                = { ci1 = "203.0.113.20", ci2 = "203.0.113.21" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  gitlab_url   = "https://gitlab.example.com"
  runner_token = var.runner_token
  concurrent   = 4
}
```

Then run `conn3x init` and `conn3x apply`, with the token in `TF_VAR_runner_token`. Within a few seconds the runner shows up in GitLab as online, with one entry under its managers for each host. A second `conn3x plan` says `No changes.`

The same token on several hosts makes one runner in GitLab with several [runner managers](https://docs.gitlab.com/ci/runners/new_creation_workflow/), each asking for jobs on its own. For runners with different tags or executors, create one runner in GitLab for each and use the module once for each.

For hosts created in the same plan, pass host objects with the host key you generated, so Conn3x checks it without a known_hosts entry. Give each one's distribution in `os` too: the circuit picks its repository by distribution, and Conn3x can't ask a host that doesn't exist yet. If `os` turns out not to match the host, Conn3x stops before configuring it. Set `os` as well when you put `depends_on` on this module: `depends_on` holds back reading the hosts until the apply, so without `os` the plan fails with `Invalid for_each argument`.

```hcl
hosts = {
  ci1 = {
    address  = digitalocean_droplet.ci.ipv4_address
    host_key = tls_private_key.host.public_key_openssh
    os       = "ubuntu"
  }
}
```

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-gitlab-runner/tree/v0.1.0/examples/local).

### Getting a token from the API

To create the runner from a script rather than the web page, `POST /api/v4/user/runners` with a personal access token that has the `create_runner` scope. The `token` in the answer is the runner authentication token:

```sh
curl -sS --request POST "https://gitlab.example.com/api/v4/user/runners" \
  --header "PRIVATE-TOKEN: $GITLAB_PAT" \
  --data runner_type=instance_type --data "tag_list=linux,shell" \
  --data "description=ci shell runners"
```

`runner_type=project_type` with `project_id`, or `group_type` with `group_id`, makes a project or group runner. GitLab's [runner API docs](https://docs.gitlab.com/api/users/#create-a-runner-linked-to-a-user) have the rest of the fields.

### Executors

`executor` picks how the runner runs a job.

**`shell`**, the default, runs each job's script on the host itself, as the `gitlab-runner` user the package creates, in `/home/gitlab-runner/builds`. A job gets the tools installed on the host and nothing else, so install what your pipelines need, with another circuit or a package step of your own. It's simple and quick, and every job shares the host: one job can leave files behind for the next, and a job can do anything `gitlab-runner` can. Keep shell runners for trusted projects.

**`docker`** runs each job in a fresh container, from the job's `image:`, or `docker_image` (`alpine:3.24`) when it names none. The host needs Docker Engine; [circuit-docker](/circuits/docker) installs it:

```hcl
module "docker" {
  source = "github.com/conn3xorg/circuit-docker?ref=v0.1.1"

  hosts                = { ci1 = "203.0.113.20" }
  ssh_private_key_file = "~/.ssh/id_ed25519"
}

module "gitlab_runner" {
  source     = "github.com/conn3xorg/circuit-gitlab-runner?ref=v0.1.0"
  depends_on = [module.docker]

  hosts                = { ci1 = { address = "203.0.113.20", os = "ubuntu" } }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  gitlab_url   = "https://gitlab.example.com"
  runner_token = var.runner_token
  executor     = "docker"
}
```

Containers run unprivileged, so Docker-in-Docker builds (`docker build` inside a job) won't work. That's on purpose: a privileged job container can take over the host.

### With circuit-gitlab

Both circuits can live in one configuration, but the token can only exist once GitLab does. Apply circuit-gitlab first, sign in, create the runner, then add this module with `gitlab_url = module.gitlab.external_url` and apply again. Runners belong on other machines than GitLab itself: a job that eats memory shouldn't take your GitLab down with it.

### The token

`runner_token` is ephemeral and sensitive, so it never lands in the plan or the state. It goes into `/etc/gitlab-runner/config.toml`, mode `0600`, owned by root, written with the file's write-only content: state keeps only an HMAC of the whole file. Change anything else in `config.toml`, such as `concurrent`, and the plan shows that HMAC changing; edit the file by hand and the next plan shows it too, without showing either version.

`gitlab-runner register` isn't used. With an authentication token, registering only checks the token with GitLab and writes `config.toml`, the way GitLab's [registration docs](https://docs.gitlab.com/runner/register/) show it. The circuit writes the same file itself, the same way on every apply. GitLab Runner notices a change to `config.toml` within seconds and loads it without a restart, so jobs that are running carry on.

To change the token, create a new runner (or reset the old one's token in GitLab), set `runner_token` to it and apply. The circuit doesn't record when the token expires, so the runner won't renew it by itself; if your GitLab sets an expiry for runner tokens, replace it before then. GitLab's default is no expiry.

## What it does

On each host, in order:

1. Reads the host's facts, and stops if GitLab has no runner packages for its distribution.
2. Adds GitLab Runner's repository at `packages.gitlab.com`, the one GitLab's install script sets up: `runner/gitlab-runner/ubuntu` or `debian` with the release's suite, such as `noble`, and `runner/gitlab-runner/el/$releasever/$basearch` on Rocky Linux, AlmaLinux and RHEL. The keys are pinned in `files/`: apt checks the repository against `F6403F6544A38863DAA0B6E03F01618A51312F3F` in `gitlab-repo.asc`, which expires on 6 February 2028, and dnf checks each package against `931DA69CFA3AFEBBC97DAA8C6C57C29C6BA75A4E` in `gitlab-runner-packages.asc`, which expires on 26 February 2027.
3. On Debian and Ubuntu, writes `/etc/apt/preferences.d/gitlab-runner`, which pins `gitlab-runner` and `gitlab-runner-helper-images` to `runner_version`. `gitlab-runner` needs the helper images of exactly its own version, and without the pin apt either refuses an older release or, moving the helper images alone, removes the runner. The pin also keeps `apt upgrade` off both.
4. Installs `gitlab-runner` at `runner_version`, which brings the helper images along. The package creates the `gitlab-runner` user and a systemd service that runs jobs as that user.
5. Writes `/etc/gitlab-runner/config.toml`, mode `0600`, with the token. See [The token](#the-token).
6. Keeps the `gitlab-runner` service enabled and running.

`config.toml` belongs to the circuit: changes made to it by hand go on the next apply. GitLab Runner's own files next to it, such as `.runner_system_id`, which tells GitLab which manager is which, are left alone.

### What it doesn't do

- It doesn't create runners or tokens in GitLab. Do that in GitLab, as above.
- It doesn't take the old registration tokens (`GR1348941...`) that GitLab has [deprecated](https://docs.gitlab.com/ci/runners/new_creation_workflow/), or set tags, descriptions or `run_untagged` on the host. With authentication tokens, GitLab keeps those on the runner itself.
- It doesn't install Docker. Use [circuit-docker](/circuits/docker).
- It doesn't run privileged containers, set up a distributed cache, autoscale with docker-autoscaler, or use the Kubernetes executor. Those want settings in `config.toml` this circuit doesn't write.
- It doesn't trust a GitLab with a self-signed certificate by itself. Put its CA certificate in `/etc/gitlab-runner/certs/gitlab.example.com.crt`, named after the host in `gitlab_url`, with a file step of your own, as GitLab's [self-signed certificate docs](https://docs.gitlab.com/runner/configuration/tls-self-signed/) describe.
- It doesn't open firewall ports. The runner only makes outbound connections, to GitLab.
- Deleting the module leaves GitLab Runner installed and running. Delete the runner in GitLab too, or stop the service.
- It doesn't downgrade. Lowering `runner_version` fails on Debian and Ubuntu, since apt won't downgrade unattended.

## Supported distributions

The circuit installs only where GitLab [publishes runner packages](https://docs.gitlab.com/runner/install/linux-repository/): Ubuntu 22.04, 24.04 and 26.04, Debian 12 and 13, and Rocky Linux, AlmaLinux and RHEL, from GitLab's `el` packages. Ubuntu 24.04, Debian 13 and Rocky Linux 10 were tested; see below.

Fedora isn't supported. GitLab's runner repository stops at Fedora 44, with nothing yet for Fedora 45.

## Upgrades

Raise `runner_version` and apply. apt or dnf moves `gitlab-runner` and its helper images to the new release together, and the service is running again afterwards. GitLab [recommends](https://docs.gitlab.com/runner/#gitlab-runner-versions) keeping the runner at the same major and minor version as GitLab; a runner a few minor releases either side usually works, but new features need both ends.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.20"`, or a host object such as `{ address = "203.0.113.20", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file`, `jump_hosts` and `os`, the distribution's ID, such as `ubuntu` or `rocky`, which a host created in the same plan or behind `depends_on` needs. The two forms can be mixed. The name becomes the runner's name in `config.toml`. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `gitlab_url` | string | Required | Address of your GitLab, such as `"https://gitlab.example.com"`. |
| `runner_token` | string, sensitive, ephemeral | Required | Runner authentication token, starting `glrt-`. Ephemeral and sensitive: pass it with `-var` or `TF_VAR_`. See [The token](#the-token). |
| `runner_version` | string | `"19.5.2"` | GitLab Runner release to install. Raising it upgrades the runner. |
| `executor` | string | `"shell"` | `"shell"` or `"docker"`. See [Executors](#executors). |
| `concurrent` | number | `1` | Most jobs each host runs at once. |
| `docker_image` | string | `"alpine:3.24"` | Image the `docker` executor uses for a job whose `.gitlab-ci.yml` names none. |

Tags, untagged jobs, protected branches, the description and the maximum job timeout aren't inputs: GitLab keeps them on the runner, so set them where you created it.

## Outputs

| Name | Description |
| --- | --- |
| `config_file` | Path of the file the circuit writes on each host, `/etc/gitlab-runner/config.toml`. |
| `gitlab_url` | GitLab instance the runners take jobs from. |

## Requirements

Requires Conn3x v0.6.9 or later, systemd on each host, and outbound HTTPS to `packages.gitlab.com`, your distribution's mirrors and your GitLab. GitLab publishes amd64 and arm64 packages, among others.

The package signing key that dnf checks expires on 26 February 2027. When GitLab extends it or publishes a new one at `https://packages.gitlab.com/gpgkey/runner/`, a release of this circuit with the new key replaces it on the next apply. The apt repository key expires on 6 February 2028.

## Tested on

Ubuntu 24.04, Debian 13 and Rocky Linux 10, with GitLab Runner 19.5.2. CI applies [examples/local](https://github.com/conn3xorg/circuit-gitlab-runner/tree/v0.1.0/examples/local) to each in a container on amd64, with a placeholder token and no GitLab, and checks that the second plan has no changes and that the token isn't in the state. Then it checks that both packages are at 19.5.2, that the service runs and hands jobs to `gitlab-runner`, that `config.toml` is root's alone, and that the runner loaded it: `gitlab-runner list` shows the example's runner and URL, and the runner's log shows the example's `concurrent = 2`. Without a GitLab, no job runs there.

Before tagging, the same checks passed by hand in arm64 containers of all three on Apple silicon. On Debian 13 and Rocky Linux 10, installing 19.5.1 and then raising `runner_version` to 19.5.2 moved both packages up together, each followed by a clean plan. Restarting the Ubuntu container gave a clean plan too.

Jobs were run end to end on DigitalOcean droplets (amd64): GitLab CE 19.5.3 from [circuit-gitlab](/circuits/gitlab) on an 8 GB Ubuntu 24.04 droplet, and two 2 GB runner droplets. Two project runners were created through `POST /api/v4/user/runners`, tagged `docker` and `shell`, with a personal access token made with `gitlab-rails runner`. Ubuntu 24.04 got Docker from [circuit-docker](/circuits/docker) and the `docker` executor, behind `depends_on` with the `os` hint; Rocky Linux 10, with SELinux enforcing, got the `shell` executor and `concurrent = 2`. Both runners came up online in GitLab straight after the apply, and the second plan had no changes. A `.gitlab-ci.yml` with a job for each tag passed on both: the Docker job ran in `alpine:3.24`, and the shell job ran as `gitlab-runner` and uploaded an artifact, with no SELinux denials. The plan stayed clean after the jobs, and again after rebooting both runners, when a second pipeline passed too. Raising `concurrent` to 3 changed only the `config.toml` HMAC in the plan, and the runner loaded it without restarting.

Fedora isn't tested, since GitLab Runner has no packages for Fedora 45.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-gitlab-runner/blob/v0.1.0/LICENSE). GitLab Runner itself is MIT.

## Source

- Repository: [conn3xorg/circuit-gitlab-runner](https://github.com/conn3xorg/circuit-gitlab-runner). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-gitlab-runner/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-gitlab-runner/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-gitlab-runner/tree/v0.1.0/examples/local).
- Related circuits: [GitLab CE](/circuits/gitlab), [Docker](/circuits/docker), [Java](/circuits/java), [PHP-FPM](/circuits/php), [Jenkins](/circuits/jenkins), [GitHub Actions runner](/circuits/github-runner), [Cinc Client](/circuits/cinc), [Node.js](/circuits/nodejs), [Perl](/circuits/perl), [Bun](/circuits/bun), [Selenium Grid](/circuits/selenium), [OpenVox](/circuits/openvox), [Rust](/circuits/rust), [Go](/circuits/go), [Python](/circuits/python), [Ruby](/circuits/ruby), [Kotlin](/circuits/kotlin), [.NET](/circuits/dotnet), [C toolchain](/circuits/c-toolchain).
