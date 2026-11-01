---
title: Python
description: "Your distribution's Python with working venvs, and optional environments holding pinned packages."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-python at v0.1.0. -->

A Conn3x circuit that installs Python from each distribution's own packages, makes sure `python3 -m venv` works, and can build virtual environments with packages at versions you pin.

Be clear on one thing before you use it. **The Python version differs per distribution**, because the distributions ship it and this circuit takes what they ship:

| Distribution | Python, checked October 2026 |
| --- | --- |
| Ubuntu 24.04 | 3.12.3 |
| Debian 13 | 3.13.5 |
| Rocky Linux 10 | 3.12.13 |
| Fedora 45 | 3.15.0 |

We picked this route on purpose. Distribution Python gets its security fixes with the host's other updates, nobody has to remember to bump a pin, and system tools already depend on it. If your code needs one version on every host, this isn't the circuit for it: look at [uv's managed Python builds](https://docs.astral.sh/uv/guides/install-python/) instead. Only the packages in `venvs` are the same version everywhere.

## Usage

```hcl
module "python" {
  source = "github.com/conn3xorg/circuit-python?ref=v0.1.0"

  hosts                = { app1 = "203.0.113.10", app2 = "203.0.113.11" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  venvs = {
    "/opt/tools" = { cowsay = "6.1" }
  }
}
```

Then run `conn3x init` and `conn3x apply`. A second `conn3x plan` says `No changes.`

For hosts created in the same plan, pass host objects with the host key you generated, so Conn3x checks it without a known_hosts entry:

```hcl
hosts = {
  for name, d in digitalocean_droplet.app : name => {
    address  = d.ipv4_address
    host_key = tls_private_key.host[name].public_key_openssh
  }
}
```

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-python/tree/v0.1.0/examples/local).

## What it does

On each host, in order:

1. Installs `python3`, and `python3-venv` on Debian and Ubuntu, where it's split out.
2. Runs `python3 -m venv` for each of `venvs`, unless that environment already has a working pip. A distribution upgrade to a new Python minor release leaves an environment without its packages. The next apply fills it again, which was tested by emptying its `site-packages`, not by a real upgrade.
3. Runs `pip install name==version` for each package, unless that exact version is already in the environment.

Before the circuit runs, the `conn3x_host` data source reads each host's distribution over SSH.

### What it doesn't do

- It doesn't pin Python. Updates arrive with the host's other package updates.
- It doesn't pin a package's dependencies or check hashes. pip takes what the package asks for, so those can differ between two hosts installed at different times. Use your own lock file for an application.
- It doesn't install a compiler or headers. A package with no wheel for your Python will fail to build; add those first.
- It doesn't set an owner on an environment: `venvs` are owned by the user applying them, root as a rule, and readable by everyone.
- It doesn't uninstall anything. A package or environment you take out, and everything else when you delete the module, stays on the host.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `venvs` | map(map(string)) | `{}` | Virtual environments to create, by absolute path, each with the packages to install at exact versions, such as `{ "/opt/tools" = { cowsay = "6.1" } }`. |

## Outputs

| Name | Description |
| --- | --- |
| `python` | Path of the Python interpreter on each host, by host name: `/usr/bin/python3`. |

## Requirements

Requires Conn3x v0.6.10 or later, and a package mirror each host can reach, plus outbound HTTPS to pypi.org and files.pythonhosted.org when you list packages. amd64 and arm64.

## Tested on

Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13. [examples/local](https://github.com/conn3xorg/circuit-python/tree/v0.1.0/examples/local) was applied to each on arm64, and the second plan had no changes. The `cowsay` 6.1 command ran from the environment the circuit built, and a fresh `python3 -m venv` installed the same package and ran it. CI runs the same checks on amd64.

On an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, both `s-1vcpu-1gb`, amd64, each shared with the other circuits of this batch: the same checks passed, and after a reboot the plan had no changes and they still passed.

`ssh_become` wasn't exercised: every test logged in as root.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-python/blob/v0.1.0/LICENSE). Python is under the PSF License. Packages carry their own licenses.

## Source

- Repository: [conn3xorg/circuit-python](https://github.com/conn3xorg/circuit-python). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-python/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-python/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-python/tree/v0.1.0/examples/local).
- Related circuits: [Java](/circuits/java), [PHP-FPM](/circuits/php), [Jenkins](/circuits/jenkins), [GitHub Actions runner](/circuits/github-runner), [GitLab Runner](/circuits/gitlab-runner), [Cinc Client](/circuits/cinc), [Node.js](/circuits/nodejs), [Perl](/circuits/perl), [Bun](/circuits/bun), [Selenium Grid](/circuits/selenium), [OpenVox](/circuits/openvox), [Rust](/circuits/rust), [Go](/circuits/go), [Ruby](/circuits/ruby), [Kotlin](/circuits/kotlin), [.NET](/circuits/dotnet), [C toolchain](/circuits/c-toolchain).
