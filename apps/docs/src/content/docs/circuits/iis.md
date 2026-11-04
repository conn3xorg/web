---
title: IIS
description: "Experimental. Turns Windows Server 2022 or 2025 into an IIS web server: a site, its own app pool and the firewall port open."
---

<!-- Generated from the README, variables and outputs of conn3xorg/circuit-iis at v0.1.0. -->

[![Conn3x grade](https://conn3x.org/circuits/iis/grade.svg)](https://conn3x.org/circuits/iis/grade)

A Conn3x circuit that turns a Windows Server 2022 or 2025 host into an IIS web server: IIS installed, a site with its own app pool serving a folder only administrators can change, and the port opened in Windows Firewall. Optionally, Microsoft's URL Rewrite module, and a nightly app pool recycle at a time you pick.

**Experimental.** Windows support in Conn3x is new, and the modules this circuit uses may change between releases. It needs Conn3x v0.7.0 or later.

## Usage

```hcl
module "iis" {
  source = "github.com/conn3xorg/circuit-iis?ref=v0.1.0"

  hosts = {
    web1 = { address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }
  }
  ssh_user             = "Administrator"
  ssh_private_key_file = "~/.ssh/id_ed25519"

  pages = {
    "index.html" = file("${path.module}/site/index.html")
  }
}
```

Run `conn3x init` and `conn3x apply`. On a `Standard_B2s_v2` Azure VM the whole first apply, VM included, took about 11 minutes, and a second `conn3x plan` said `No changes.` Stop the site or edit a page by hand, and `conn3x drift` exits 2 and names it; `conn3x apply` puts it back.

The host needs OpenSSH Server running and your key in `administrators_authorized_keys`. [`examples/azure`](https://github.com/conn3xorg/circuit-iis/tree/v0.1.0/examples/azure) shows a VM that comes up that way, with its host key known from the first connection.

## What it does

On each host, in order:

1. Checks it's x86_64 Windows Server 2022 or 2025. The plan fails on anything else.
2. Installs the `Web-Server` feature, and `Web-Static-Content`, which a plain install includes but an image with IIS already on may not. Without it, IIS answers every page with an empty 200. Reboots only if Windows asks.
3. Stops `Default Web Site` and keeps it from starting with IIS, since it holds port 80 for every host name. It isn't deleted. Set `stop_default_site = false` to leave it alone.
4. With `url_rewrite = true`, installs IIS URL Rewrite 2.1 from `download.microsoft.com`, checked against its SHA-256 before msiexec sees it.
5. Creates an app pool named after the site: no managed code, integrated pipeline, `ApplicationPoolIdentity`.
6. Creates `C:\inetpub\<site_name>` with its own access rules from the moment it exists: SYSTEM and Administrators full control, the app pools (IIS_IUSRS) and anonymous visitors (IUSR) read only.
7. Writes each of `pages` into it.
8. Creates the site on `port`, for `host_header` or any name, and starts it.
9. Opens `port` in Windows Firewall, from anywhere, unless `open_firewall = false`.
10. With `recycle_at`, adds a daily task that recycles the pool at that time, as SYSTEM, through IIS's own `appcmd.exe`.

### Why the folder is locked down

Whoever can change the files a site serves can run code as its app pool, and every built-in pool identity can impersonate its way to SYSTEM. On a stock Azure image, any signed-in user can modify a new folder at the top of `C:\`. So Conn3x refuses to point a site at a folder anyone but administrators can change, and this circuit makes one that passes. Put your content in through `pages`, or as an administrator.

## What it doesn't do

- https. Only http bindings for now.
- ASP.NET or any other server-side framework. The pool runs no managed code.
- More than one site per host, or more than one binding per site.
- Server Core, or a domain member. Only the Datacenter editions with Desktop Experience have been tried.
- Removal. Deleting the module removes the site, the pool, the firewall rule and the task, and leaves IIS, the folder, its files and URL Rewrite in place. `Default Web Site` stays stopped.

## Inputs

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `hosts` | any | Required | Hosts to configure, by name. Each value is an address, or a host object such as `{ address = "203.0.113.10", host_key = "ssh-ed25519 AAAA..." }`, which can also set `user`, `port`, `private_key_file` and `jump_hosts`. |
| `ssh_user` | string | `"Administrator"` | User to log in as. It must be an administrator. |
| `ssh_port` | number | `22` | SSH port. |
| `ssh_private_key_file` | string | `null` | Path to a private key. When null, Conn3x uses the SSH agent. |
| `ssh_known_hosts_file` | string | `null` | known_hosts file to check host keys against. Not used for a host object with `host_key`. |
| `site_name` | string | `"conn3x"` | Name of the site and its app pool, and of its folder under `C:\inetpub`. Letters, digits, `_` and `-`. |
| `port` | number | `80` | Port the site listens on. |
| `host_header` | string | `""` | Host name the site answers to. Empty answers any. |
| `pages` | map(string) | a one-line `index.html` | Files to write into the site's folder, by file name. Other files there are left alone. |
| `stop_default_site` | bool | `true` | Stop `Default Web Site` and keep it stopped. |
| `open_firewall` | bool | `true` | Open `port` in Windows Firewall, from anywhere. |
| `url_rewrite` | bool | `false` | Install IIS URL Rewrite 2.1. |
| `recycle_at` | string | `null` | Recycle the pool daily at this local time, such as `"03:30"`. |

## Outputs

| Name | Description |
| --- | --- |
| `site_folder` | The folder the site serves. |
| `url` | The site's address on each host, by host name. |

## License

MPL-2.0. See [LICENSE](https://github.com/conn3xorg/circuit-iis/blob/v0.1.0/LICENSE).

## Source

- Repository: [conn3xorg/circuit-iis](https://github.com/conn3xorg/circuit-iis). This page covers [v0.1.0](https://github.com/conn3xorg/circuit-iis/tree/v0.1.0); the repository's [tags](https://github.com/conn3xorg/circuit-iis/tags) list every release.
- Examples: [examples/azure](https://github.com/conn3xorg/circuit-iis/tree/v0.1.0/examples/azure).
- Related circuits: [nginx](/circuits/nginx), [Apache httpd](/circuits/apache), [Caddy](/circuits/caddy), [HAProxy](/circuits/haproxy), [Traefik](/circuits/traefik), [certbot](/circuits/certbot).
