---
title: Conn3x vs Terraform and Ansible
description: "Conn3x compared with Terraform or OpenTofu plus Ansible: one AWS server and nginx config built both ways, and where the two-tool setup is the better choice."
---

This page is for you if Terraform or OpenTofu creates your servers and Ansible sets them up. You know both tools well, and you've probably written the glue between them more than once. Here's what Conn3x changes about that workflow, what it doesn't, and where you're better off staying as you are.

Conn3x is built on [OpenTofu](https://opentofu.org). Its plan, state, providers and modules are OpenTofu's, so everything below about the cloud half of the job is OpenTofu's work. What Conn3x adds is the other half: circuits that configure the servers, in the same plan.

## The hand-off you already maintain

Two tools means a seam between them, and somebody owns it. A typical week goes like this:

1. `tofu apply` (or `terraform apply`) creates the server.
2. Its address leaves Terraform somehow: an output you copy, a `local_file` that writes an inventory, or a dynamic inventory plugin that asks the cloud.
3. `ansible-playbook` logs in and configures it, once SSH is up and the host key is trusted.

That works, and plenty of teams run it for years. The cost shows up around the edges. You review two previews, `tofu plan` for the cloud and `ansible-playbook --check --diff` for the servers, and neither knows about the other. Terraform keeps state, and Ansible keeps none: it compares each host with the playbook on every run. That's a deliberate design, and it means there's no record of what the last run applied to compare against. So when something changes by hand, you're asking two tools two different questions to find out.

Conn3x puts both halves in one configuration. The server's address goes straight from the resource into the circuit, there's one plan to read, and one state file remembers both.

## At a glance

| | Terraform or OpenTofu, plus Ansible | Conn3x |
| --- | --- | --- |
| Tools | Two, each with its own CLI and config language | One binary, built on OpenTofu |
| Cloud resources | Any Terraform or OpenTofu provider | The same providers and modules, unchanged |
| Server configuration | Playbooks and roles, in YAML with Jinja | Circuits, in HCL, beside the resources |
| Getting addresses to the config tool | An output, a generated inventory, or a dynamic inventory plugin | A reference, such as `aws_instance.web.public_ip` |
| Preview before changes | `tofu plan`, then `ansible-playbook --check --diff`, separately | One `conn3x plan` for the cloud and the servers |
| State | Terraform state for the cloud; Ansible keeps none by design | One state for both |
| Taking over what's already running | `import` blocks for the cloud; Ansible keeps no state, so a playbook just runs against the server | `import` and `lifecycle` on cloud resources and on host steps alike |
| Spotting hand edits | `tofu plan` for the cloud, `--check --diff` for the servers | `conn3x drift`, which exits `2` when either has moved |
| Ad-hoc commands | `ansible all -a "uptime"` | [`conn3x run -i inventory.ini all -a uptime`](/reference/cli/run), against the same inventory |
| Windows | Ansible's Windows support is long established | [Preview](/reference/maturity#preview-and-experimental-together), with experimental modules |
| Network devices | Ansible collections for many vendors' gear | Three experimental circuits, through community OpenTofu providers |
| Ecosystem | The Terraform and OpenTofu registries, plus Ansible Galaxy | The same registries, plus [127 official circuits](/circuits) |
| Maturity | Ansible and Terraform have been in production use for more than a decade, and OpenTofu carries Terraform's codebase forward | Before 1.0, at v0.10.0 |

## The same job, both ways

The job: one Ubuntu 24.04 server on AWS, with nginx installed and running, and a site config at `/etc/nginx/conf.d/app.conf` that answers on port 8080. A change to the config reloads nginx. Both versions check the server's SSH host key on the first connection, by generating the key in the plan and handing it to the server through cloud-init, so neither side trusts whatever answers first.

Both versions share the cloud half. Save it as `main.tf`:

```hcl
terraform {
  required_providers {
    aws   = { source = "hashicorp/aws", version = "~> 6.0" }
    tls   = { source = "hashicorp/tls", version = "~> 4.0" }
    local = { source = "hashicorp/local", version = "~> 2.0" } # Ansible version only
  }
}

variable "admin_cidr" {
  type        = string
  description = "The address allowed to reach SSH, such as 203.0.113.10/32."
}

provider "aws" {
  region = "us-west-2"
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
}

resource "aws_key_pair" "me" {
  key_name   = "web1"
  public_key = file(pathexpand("~/.ssh/id_ed25519.pub"))
}

resource "aws_security_group" "web" {
  name = "web1"
}

resource "aws_vpc_security_group_ingress_rule" "ssh" {
  security_group_id = aws_security_group.web.id
  cidr_ipv4         = var.admin_cidr
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
}

resource "aws_vpc_security_group_ingress_rule" "app" {
  security_group_id = aws_security_group.web.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 8080
  to_port           = 8080
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.web.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# The server's SSH host key, made here and installed by cloud-init,
# so the first connection can be checked.
resource "tls_private_key" "host" {
  algorithm = "ED25519"
}

resource "aws_instance" "web" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = "t3.micro"
  key_name                    = aws_key_pair.me.key_name
  vpc_security_group_ids      = [aws_security_group.web.id]
  associate_public_ip_address = true
  tags                        = { Name = "web1" }

  user_data = "#cloud-config\n${yamlencode({
    ssh_deletekeys = true
    ssh_keys = {
      ed25519_private = tls_private_key.host.private_key_openssh
      ed25519_public  = tls_private_key.host.public_key_openssh
    }
  })}"
}
```

Nothing in it is specific to Conn3x. `tofu validate` and `conn3x validate` both accept it.

### With Terraform or OpenTofu, and Ansible

The hand-off comes first. Add two `local_file` resources to `main.tf`, so the apply writes an inventory and a `known_hosts` file for Ansible to read:

```hcl
# The hand-off: write what Ansible needs to know about the server.
resource "local_file" "inventory" {
  filename = "${path.module}/inventory.ini"
  content  = <<-EOT
    [web]
    web1 ansible_host=${aws_instance.web.public_ip} ansible_user=ubuntu ansible_ssh_private_key_file=~/.ssh/id_ed25519 ansible_ssh_common_args="-o UserKnownHostsFile=known_hosts"
  EOT
}

resource "local_file" "known_hosts" {
  filename = "${path.module}/known_hosts"
  content  = "${aws_instance.web.public_ip} ${tls_private_key.host.public_key_openssh}"
}
```

Then the playbook, `site.yml`:

```yaml
- hosts: web
  become: true
  gather_facts: false
  tasks:
    - name: Wait for the server to boot
      ansible.builtin.wait_for_connection:
        timeout: 300

    - name: Install nginx
      ansible.builtin.apt:
        name: nginx
        update_cache: true

    - name: Write the site config
      ansible.builtin.copy:
        dest: /etc/nginx/conf.d/app.conf
        content: |
          server {
            listen 8080;
            location / {
              return 200 "Hello from {{ inventory_hostname }}\n";
            }
          }
        mode: "0644"
      notify: Reload nginx

    - name: Start nginx
      ansible.builtin.service:
        name: nginx
        state: started
        enabled: true

  handlers:
    - name: Reload nginx
      ansible.builtin.service:
        name: nginx
        state: reloaded
```

And two runs, one per tool:

```sh
tofu apply
ansible-playbook -i inventory.ini site.yml
```

The first task is there because the playbook starts the moment the apply ends, and the instance won't be answering SSH yet. We found that out the honest way: without it, our first run stopped at `Connection refused`. Naming the key in the inventory came from a real run too, since `ssh` otherwise uses whatever your `~/.ssh/config` picks. A dynamic inventory, such as the `amazon.aws.aws_ec2` plugin, can replace the generated `inventory.ini` once you have more than a handful of servers.

### With Conn3x

Leave out the two `local_file` resources and the `local` provider. Add a circuit to `main.tf` instead:

```hcl
circuit "web" {
  hosts = {
    web1 = {
      address  = aws_instance.web.public_ip
      host_key = tls_private_key.host.public_key_openssh
    }
  }

  ssh {
    user             = "ubuntu"
    private_key_file = "~/.ssh/id_ed25519"
    become           = true
    timeout          = "5m"
  }

  step "nginx" {
    package { name = "nginx" }
  }

  step "site" {
    file {
      path    = "/etc/nginx/conf.d/app.conf"
      content = <<-EOT
        server {
          listen 8080;
          location / {
            return 200 "Hello from ${each.key}\n";
          }
        }
      EOT
    }
    notify = [handler.reload]
  }

  step "running" {
    service {
      name    = "nginx"
      state   = "started"
      enabled = true
    }
  }

  handler "reload" {
    service {
      name   = "nginx"
      action = "reload"
    }
  }
}
```

One run:

```sh
conn3x apply
```

The steps read like the tasks, and that's on purpose: a play maps onto a circuit, a task onto a step, a handler onto a handler. What's gone is the seam. `hosts` refers to the instance directly, the pinned `host_key` replaces the `known_hosts` file, and `timeout = "5m"` keeps Conn3x retrying while the instance boots. The `package` step doesn't need `update_cache`, because Conn3x refreshes the package lists itself when a package isn't found.

## Both, run for real

We applied both versions in `us-west-2` on 7 November 2026, each on a fresh instance, destroying everything in between. That was Conn3x v0.7.1, OpenTofu v1.12.6 and ansible-core 2.21.3, with `hashicorp/aws` v6. The only change to the configurations above was a `default_tags` block on the `aws` provider, which tags everything for the sweeper on our test account. Output is trimmed where it says so.

### Terraform or OpenTofu, then Ansible

`tofu apply` created the server and wrote the hand-off files. Trimmed to the completion lines:

```text
tls_private_key.host: Creation complete after 0s [id=907f699907402a1bbe2f90d0a4a740c12262ad53]
aws_key_pair.me: Creation complete after 1s [id=web1]
aws_security_group.web: Creation complete after 2s [id=sg-0d1978a1777984928]
aws_vpc_security_group_egress_rule.all: Creation complete after 1s [id=sgr-0baef3bc786bb3be9]
aws_vpc_security_group_ingress_rule.app: Creation complete after 1s [id=sgr-0820d0ba24187922d]
aws_vpc_security_group_ingress_rule.ssh: Creation complete after 1s [id=sgr-0a86028ece8efa9b0]
aws_instance.web: Creation complete after 13s [id=i-0b612405af7f52e58]
local_file.inventory: Creation complete after 0s [id=58e769bb4c1d712d93d51cff5a7038dc6c3f04b7]
local_file.known_hosts: Creation complete after 0s [id=3db230d3aa5ebf4d7de2cee63660dce45d62c56e]

Apply complete! Resources: 9 added, 0 changed, 0 destroyed.
```

Then `ansible-playbook -i inventory.ini site.yml`, with blank lines and an interpreter warning trimmed:

```text
PLAY [web] *********************************************************************
TASK [Wait for the server to boot] *********************************************
ok: [web1]
TASK [Install nginx] ***********************************************************
changed: [web1]
TASK [Write the site config] ***************************************************
changed: [web1]
TASK [Start nginx] *************************************************************
ok: [web1]
RUNNING HANDLER [Reload nginx] *************************************************
changed: [web1]
PLAY RECAP *********************************************************************
web1                       : ok=5    changed=3    unreachable=0    failed=0    skipped=0    rescued=0    ignored=0
```

The two runs took 54 seconds together, and `curl` on port 8080 answered `Hello from web1`. A second `tofu plan` found no differences, and a second playbook run reported `changed=0`. It works, and it's two previews, two runs and two files passed between them.

### Conn3x

`conn3x plan` put the cloud and the server in one list. The headers and the summary:

```text
  # aws_instance.web will be created
  # aws_key_pair.me will be created
  # aws_security_group.web will be created
  # aws_vpc_security_group_egress_rule.all will be created
  # aws_vpc_security_group_ingress_rule.app will be created
  # aws_vpc_security_group_ingress_rule.ssh will be created
  # conn3x_file.web__site["web1"] will be created
  # conn3x_package.web__nginx["web1"] will be created
  # conn3x_service.web__running["web1"] will be created
  # conn3x_service_action.web__reload["web1"] will be created
  # tls_private_key.host will be created

Plan: 11 to add, 0 to change, 0 to destroy.
```

The instance doesn't exist yet, so every step's connection is waiting on it. Here's the `ssh` block from the `site` step:

```text
      + ssh {
          + become           = true
          + host             = (known after apply)
          + host_key         = (known after apply)
          + private_key_file = "~/.ssh/id_ed25519"
          + timeout          = "5m"
          + user             = "ubuntu"
        }
```

`conn3x apply`, trimmed to the completion lines:

```text
tls_private_key.host: Creation complete after 0s [id=c899bdb5a3b16c0c4c9cb86a0281ff2f95c38fda]
aws_key_pair.me: Creation complete after 1s [id=web1]
aws_security_group.web: Creation complete after 2s [id=sg-0c442b6bc81ddf3ff]
aws_vpc_security_group_ingress_rule.app: Creation complete after 1s [id=sgr-01be1d989f129dab6]
aws_vpc_security_group_egress_rule.all: Creation complete after 1s [id=sgr-05f7eeeda5f04ecf3]
aws_vpc_security_group_ingress_rule.ssh: Creation complete after 1s [id=sgr-02b5c22e1405c0ce6]
aws_instance.web: Creation complete after 13s [id=i-035aca9359aabae78]
conn3x_package.web__nginx["web1"]: Creation complete after 32s [id=35.86.128.103:package:nginx]
conn3x_file.web__site["web1"]: Creation complete after 0s [id=35.86.128.103:/etc/nginx/conf.d/app.conf]
conn3x_service.web__running["web1"]: Creation complete after 0s [id=35.86.128.103:service:nginx.service]
conn3x_service_action.web__reload["web1"]: Creation complete after 0s [id=35.86.128.103:service-action:nginx.service]

Apply complete! Resources: 11 added, 0 changed, 0 destroyed.
```

That took 51 seconds and worked on the first try. The package step is the first to connect, so its 32 seconds cover waiting for SSH as well as installing nginx. `curl http://35.86.128.103:8080/` answered `Hello from web1`, and a second plan said `No changes.` (The address is gone now; AWS will hand it to someone else.)

### A hand edit

Then we logged in to the instance and added `access_log off;` to the config by hand. The next `conn3x plan`:

```text
  # conn3x_file.web__site["web1"] will be updated in-place
  ~ resource "conn3x_file" "web__site" {
      ~ content    = <<-EOT
            server {
              listen 8080;
          -   access_log off;
              location / {
                return 200 "Hello from web1\n";
              }
            }
        EOT
      ~ content_wo = (write-only attribute)
        id         = "35.86.128.103:/etc/nginx/conf.d/app.conf"
      ~ revision   = "831568a96f7ef583" -> (known after apply)
      ~ sha256     = "87e78eda4bda792140b41a833a7557c84224d0a23ce8831272001228d0b52562" -> "3eb5b493ef0a22f537bc4d4f6fa9151b97161ff194ca2565997fb5bca1adfaa4"
      ~ validate   = (write-only attribute)
        # (3 unchanged attributes hidden)

        # (1 unchanged block hidden)
    }

  # conn3x_service_action.web__reload["web1"] must be replaced
-/+ resource "conn3x_service_action" "web__reload" {
        id       = "35.86.128.103:service-action:nginx.service"
        name     = "nginx"
      ~ revision = "12c74e451fb34ca5" -> (known after apply)
      ~ triggers = [
          - "831568a96f7ef583",
          + (known after apply),
        ]
        # (1 unchanged attribute hidden)

        # (1 unchanged block hidden)
    }

Plan: 1 to add, 1 to change, 1 to destroy.
```

Two things in there are worth a second look. The diff is line by line, read from the server, not from a cache. And the reload shows up in the plan too, as the handler being replaced, so you can see that putting the file back will reload nginx before you agree to it. Had someone also changed the security group, it would have been in the same plan.

`conn3x drift` answered the narrower question, what's moved since the last apply, and exited with code `2`:

```text
Drift found in 1 resource.

Hosts
  ~ conn3x_file.web__site["web1"]  changed

Run conn3x plan to see what Conn3x would change to put them back.

Changed, but your config wouldn't change them back
  aws_security_group.web
  aws_key_pair.me
```

The last two lines aren't drift. When the AWS provider reads these resources back, it fills in attributes that the configuration doesn't set, such as the security group's inline `egress` list, which mirrors the separate egress rule. Nothing would change them back, so `drift` lists them apart and doesn't count them. `conn3x destroy` then removed all 11 resources.

## Where Terraform and Ansible are the better choice

We'd rather you pick the right tool than ours. Stay with the pair, or keep part of it, when:

- You lean on their ecosystems. The Terraform and OpenTofu registries and Ansible Galaxy hold years of providers, modules, roles and collections. Conn3x uses every OpenTofu provider and module, but its server-side modules and circuits are a much smaller set than Ansible's collections, and a role you depend on has no automatic equivalent.
- Your team already knows them. Both tools have long track records, wide hiring pools, books, courses and answers for nearly every error message. Two tools your team understands can beat one tool they'd have to learn, especially for a setup that already works.
- You live in ad-hoc mode. `conn3x run` does the one-off `systemctl restart nginx` across a group from the same inventory, but if most of your Ansible is `ansible web -m ...` during incidents, Ansible's ad-hoc modules are still broader.
- You configure network gear. Ansible's network collections cover switches, routers and firewalls from many vendors, over their own CLIs and APIs. Conn3x has three experimental network circuits, and talking to devices over their CLI is only planned.
- You manage Windows at scale. Ansible's Windows support has been in use for years. Windows in Conn3x is a preview: 22 of its 25 modules are out of experimental, and the other three, `windows_ad_domain`, `windows_ad_group` and `windows_update`, may still change their arguments between releases.
- You need a UI, RBAC and scheduling built in. AWX and Red Hat Ansible Automation Platform give you job templates, credentials, access control and a web UI. HCP Terraform and other platforms do the same for Terraform runs. Conn3x is a CLI: CI or cron runs it.
- You can't take on a pre-1.0 tool. Conn3x is at v0.10.0. Stable parts are tested on every change, but "stable" before 1.0 means tested, not frozen, and a release can change how you write something. [Maturity labels](/reference/maturity) says what each label promises.

None of that has to be all or nothing. Because Conn3x runs your existing configuration unchanged, you can move one group of servers into a circuit and keep running Ansible for the rest.

## What Conn3x can't do yet

- Windows Server is in preview, with experimental modules. A domain can be built, joined, given more controllers and filled with OUs, groups and users. Since v0.11.0 that includes a child domain, and group members from other domains in the forest, both tested on Azure. Members from across a forest trust haven't been tested.
- Network devices means Arista EOS for now: five experimental modules, `eos_config`, `eos_hostname`, `eos_interface`, `eos_user` and `eos_vlan`, over the switch's own CLI. Other vendors are planned.
- macOS hosts are planned, not shipped.
- There's no web UI. There are no dynamic inventory plugins either. `hosts` is an expression: read a static INI or YAML inventory with [`provider::conn3x::inventory`](/reference/circuits/hosts), or build it from resources and data sources.
- Adopting a running server works for 25 Linux modules, the database steps among them, and 21 Windows ones, Active Directory included; [Adopt servers](/guides/adopt-servers) lists them. None of the seven Linux steps new in v0.16.0 imports yet.
- Jinja templates don't carry over. You rewrite them in `templatefile` syntax for a [template](/modules/template) step.
- Ansible roles, `include_tasks` and `import_tasks` aren't converted by `conn3x convert ansible`. It marks them `TODO(convert)` and you add their tasks as steps.

The [roadmap](/roadmap) says what's being built now and in what order.

## Next step

[Try Conn3x locally](/tutorials/try-locally) on a throwaway Rocky Linux container. It takes about ten minutes, needs no cloud account, and walks through the same plan, hand edit and drift check you saw above. When you're ready to bring real configuration across, [Use Conn3x with Terraform or OpenTofu configuration](/guides/migrate-from-terraform) shows how to add a circuit beside what you have.
