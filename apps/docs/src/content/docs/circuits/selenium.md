---
title: Selenium Grid
description: "Selenium Grid under Podman, official images pinned by digest, on loopback by default."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-selenium at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/selenium/grade.svg)](https://conn3x.org/circuits/selenium/grade)

A Conn3x circuit that runs a Selenium Grid under Podman: a hub and a browser node for each browser you ask for, from Selenium's official images, as systemd services pinned by tag and digest. Your tests point a `RemoteWebDriver` at one address and the Grid hands them a browser.

**The Grid has no authentication.** Anyone who can reach its port can start a browser on your host and send it anywhere that host can reach, including services on its private network. So it listens only on `127.0.0.1` unless you say otherwise.

## Usage

```hcl
module "selenium" {
  source = "github.com/conn3xorg/circuit-selenium?ref=v0.1.0"

  hosts                = { grid = "203.0.113.10" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  browsers = ["chromium", "firefox"]
}
```

Then run `conn3x init` and `conn3x apply`. The apply finishes once the Grid reports ready, and a second `conn3x plan` says `No changes.`

From your own machine, reach the Grid through an SSH tunnel, which keeps it off the network:

```sh
ssh -N -L 4444:127.0.0.1:4444 root@203.0.113.10
```

Then, in Python for example:

```python
from selenium import webdriver

driver = webdriver.Remote("http://127.0.0.1:4444", options=webdriver.ChromeOptions())
driver.get("http://your-app.internal/")
print(driver.title)
driver.quit()
```

The Grid's own page is at `http://127.0.0.1:4444/ui`, and `/status` says which nodes have registered.

To try it on a throwaway container first, see [examples/local](https://github.com/conn3xorg/circuit-selenium/tree/v0.1.0/examples/local).

## Opening it up

Setting `listen_address` to a real address makes the Grid answer there, with nothing in front of it. On a test droplet, `listen_address = "0.0.0.0"` made `/status` answer from the internet straight away. A published port is a NAT rule rather than a listening socket, so don't assume a host firewall covers it: try it from another machine.

If other machines need the Grid, use a private address on a network you trust, or keep the default and use SSH tunnels. A reverse proxy with authentication in front of the loopback address works too, as long as your clients can send its credentials. The event bus on 4442 and 4443 is never published, whatever `listen_address` says, because it would let anyone register a node of their own and receive your test sessions.

## What it does

1. Writes a Quadlet network, `/etc/containers/systemd/selenium.network`, so the containers find each other by name and the hub's ports stay off the host.
2. Through [circuit-podman](/circuits/podman) v0.1.0, installs Podman and runs one container per service:

| Service | Image | What it does |
| --- | --- | --- |
| `selenium-hub.service` | `docker.io/selenium/hub` | Takes WebDriver requests on `listen_address:port` and hands them to a node. |
| `selenium-node-chromium.service` | `docker.io/selenium/node-chromium` | Runs Chromium. Ask for `browserName` `chrome`. |
| `selenium-node-firefox.service` | `docker.io/selenium/node-firefox` | Runs Firefox. Only with `"firefox"` in `browsers`. |

3. Waits until `/status` reports the Grid ready, which means a node has registered. A later plan that finds the Grid not ready shows this step again.

The nodes keep VNC turned off and get 2 GB of `/dev/shm`, since browsers crash on a container's default 64 MB. Nothing is stored, so there are no volumes.

### Why Chromium and not Chrome

Chromium and Firefox run on amd64 and arm64 alike. Upstream builds Edge for amd64 only, and Chrome for arm64 only from version 150. If you need either, open an issue: it's a small addition.

## Which version

`selenium_version` is a full tag with its build date, and each image has its own digest. Podman pulls by the digest, so a tag re-pushed upstream can't change what runs. To upgrade, change all of them together:

```sh
v=4.51.0-20261010
for i in hub node-chromium node-firefox; do
  skopeo inspect --format "$i {{.Digest}}" docker://docker.io/selenium/$i:$v
done
```

The apply restarts the containers, which ends any sessions running at the time.

## What it doesn't do

- It doesn't add authentication or TLS. See [Opening it up](#opening-it-up).
- It doesn't record video, or run nodes on other hosts. Every node lives on the hub's host.
- It doesn't offer Chrome or Edge. See above.
- It doesn't support distributions other than the four below, because they haven't been tested. There's no check that stops them.
- It doesn't remove anything. Deleting the module, or taking a browser out of `browsers`, leaves that unit file and service running, as [circuit-podman](https://github.com/conn3xorg/circuit-podman#removing-a-container) describes. Stop the service and delete its file on the host first.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, such as `"203.0.113.10"`, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`. A host object can also set `user`, `port`, `private_key_file` and `jump_hosts`. The two forms can be mixed. |
| `ssh_user` | string | `"root"` | User to log in as. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. When null, `~/.ssh/known_hosts`. Not used for a host object with `host_key`. |
| `ssh_become` | bool | `false` | Run commands as root through sudo. Set it when `ssh_user` isn't root. |
| `selenium_version` | string | `"4.51.0-20261010"` | Tag shared by the hub and node images. Change the digests with it. |
| `hub_image_digest` | string | `"sha256:4f94ce0c..."` | Digest of `docker.io/selenium/hub` for `selenium_version`. |
| `chromium_image_digest` | string | `"sha256:1aa008be..."` | Digest of `docker.io/selenium/node-chromium` for `selenium_version`. |
| `firefox_image_digest` | string | `"sha256:e6a109a1..."` | Digest of `docker.io/selenium/node-firefox` for `selenium_version`. |
| `browsers` | list(string) | `["chromium"]` | Browsers to run, each in its own node: `"chromium"`, `"firefox"` or both. |
| `node_max_sessions` | number | `1` | Browser sessions each node runs at once. |
| `listen_address` | string | `"127.0.0.1"` | IPv4 address the Grid listens on. See [Opening it up](#opening-it-up). |
| `port` | number | `4444` | Port the Grid listens on. |

## Outputs

| Name | Description |
| --- | --- |
| `grid_url` | Address to give a `RemoteWebDriver`. |
| `services` | The systemd service of each container, by container name. |
| `images` | The image each container runs, with its tag and digest. |

## Requirements

Requires Conn3x v0.6.10 or later and systemd on each host. Hosts need to reach their package mirror and Docker Hub. The hub and Chromium images come to 3 GB on disk. Each browser session wants about 1 GB of memory. `conn3x init` fetches circuit-podman from GitHub.

## Tested on

Ubuntu 24.04, Debian 13, Rocky Linux 10 and Fedora 45, with Selenium 4.51.0. [examples/local](https://github.com/conn3xorg/circuit-selenium/tree/v0.1.0/examples/local) was applied to each in a container on arm64 with both browsers, and CI does the same on amd64. It checks that the second plan has no changes and that only port 4444 is published, on loopback. Then a real WebDriver session in each browser, through that port, loads a page served only inside the node and reads back its title. Chromium does it again after the hub restarts.

On an Ubuntu 24.04 droplet and a Rocky Linux 10 droplet with SELinux enforcing, both `s-1vcpu-2gb` and running Chromium only, the same check passed three times in a row. From outside, ports 4444 and 4442 didn't answer. With `listen_address = "0.0.0.0"` on the Ubuntu droplet, 4444 answered from outside and 4442 still didn't. After a reboot the services came back, the session check passed and the plan had no changes. `node_max_sessions` above 1 wasn't tried.

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-selenium/blob/v0.1.0/LICENSE). Selenium and its Docker images are Apache-2.0.

## Source

- Repository: [conn3xorg/circuit-selenium](https://github.com/conn3xorg/circuit-selenium). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-selenium/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-selenium/tags) list every release.
- Examples: [examples/local](https://github.com/conn3xorg/circuit-selenium/tree/v0.1.0/examples/local).
- Related circuits: [Podman](/circuits/podman), [Java](/circuits/java), [PHP-FPM](/circuits/php), [Jenkins](/circuits/jenkins), [GitHub Actions runner](/circuits/github-runner), [GitLab Runner](/circuits/gitlab-runner), [Cinc Client](/circuits/cinc), [Node.js](/circuits/nodejs), [Perl](/circuits/perl), [Bun](/circuits/bun), [OpenVox](/circuits/openvox), [Rust](/circuits/rust), [Go](/circuits/go), [Python](/circuits/python), [Ruby](/circuits/ruby), [Kotlin](/circuits/kotlin), [.NET](/circuits/dotnet), [C toolchain](/circuits/c-toolchain).
