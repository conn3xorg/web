---
title: Build a private AI box, step by step
description: "One conn3x apply builds an EC2 instance that only answers SSH, runs Ollama and Qdrant on 127.0.0.1, and answers questions about your own notes through a tunnel. Then you write a homelab circuit of your own."
---

You've got notes you'd like to ask questions of: runbooks, meeting notes, the wiki page nobody has touched since spring. A hosted chatbot will read them for you, and then they live on someone else's servers.

In this tutorial you build the other option, on AWS, with one `conn3x apply`. An Ubuntu server that answers on SSH and nothing else. Ollama on it, turning text into vectors and writing answers, and Qdrant keeping the vectors. Both listen on `127.0.0.1` only, so the one way to reach them is an SSH tunnel from your machine. Then you load a file of notes and ask it things.

That's part 1. In part 2 you write a circuit of your own, a small homelab with Homepage and Uptime Kuma, test it on a container on your laptop, and publish it so anyone can pin it.

This is the long version of the blog post [A private AI box in one apply](https://conn3x.org/blog/private-ai-box). Rather watch first? The [eight-minute video](https://youtu.be/_6QoECh4AjM) covers the same run, and this page has every step it skims. Every command and every line of output on this page comes from a real run on 7 November 2026, trimmed where it's long and labelled where it's trimmed.

**Time:** about 30 minutes for part 1, and 20 for part 2.

:::caution[Part 1 costs money]
It creates a real instance. In `us-west-2`, a `t3.medium` costs $0.0416 an hour, its public IPv4 address $0.005 an hour, and its 20 GB gp3 disk $0.08 per GB-month, which comes to about 5 cents an hour, at the rates in the [AWS Price List API](https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_pricing_GetProducts.html) on 7 November 2026. Our whole run, apply to destroy, cost about 2 cents. It keeps costing money until you [destroy it](#destroy-it-and-check-nothings-left). Part 2 runs on your laptop and costs nothing.
:::

## What you're building

```text
 your laptop                          AWS, us-west-2
 ┌──────────────────────┐             ┌─ security group: SSH from your address, nothing else ──┐
 │ localhost:11434 ─────┼── SSH ────► │ Ubuntu 24.04, t3.medium                                │
 │ localhost:6333  ─────┼── tunnel ─► │   baseline, hardening, firewall (ufw: SSH only)        │
 └──────────────────────┘             │   Ollama  127.0.0.1:11434  nomic-embed-text, qwen2.5   │
                                      │   Qdrant  127.0.0.1:6333   wants its API key           │
                                      └────────────────────────────────────────────────────────┘
```

Five circuits from the [circuit directory](https://conn3x.org/circuits) do the work on the server:

| Circuit | What it does here |
| --- | --- |
| [baseline](/circuits/baseline) | chrony, the time zone, a few network settings, and SSH that only takes keys. |
| [hardening](/circuits/hardening) | Tighter SSH crypto and kernel settings, with tunnels allowed one way. |
| [firewall](/circuits/firewall) | ufw, denying everything incoming but SSH. |
| [ollama](/circuits/ollama) | Ollama from its official release, with the two models pulled. |
| [qdrant](/circuits/qdrant) | Qdrant from its official release, with an API key. |

Why go to the trouble of keeping them off the internet? Ollama's API has no login. Anyone who can reach port 11434 can run your models, pull new ones onto your disk and delete the ones you have. Qdrant has a key here, but it travels in plain HTTP. So neither faces the internet, and SSH carries your requests to them.

## Prerequisites

You need:

- An AWS account, and the [`aws` CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html). Your login has to be able to create instances and security groups, and read images and VPCs.
- A default VPC in `us-west-2`. If you've deleted it, `aws ec2 create-default-vpc --region us-west-2` brings it back.
- An SSH key pair.
- `curl` and `jq`, and `nc` for one check. macOS has all three apart from `jq`, which is `brew install jq`.
- Conn3x v0.8.0.

The next three sections set up the last three.

### Install Conn3x and check it

On a Mac with Homebrew, `brew install conn3xorg/tap/conn3x` does it. To install from the release and check you've got what the release workflow built, download the archive, the checksums and their signature. Set `OS` to `linux` or `darwin`, and `ARCH` to `amd64` or `arm64`:

```sh
VERSION=0.8.0 OS=darwin ARCH=arm64
curl -fsSLO "https://github.com/conn3xorg/conn3x/releases/download/v${VERSION}/conn3x_${VERSION}_${OS}_${ARCH}.tar.gz"
curl -fsSLO "https://github.com/conn3xorg/conn3x/releases/download/v${VERSION}/checksums.txt"
curl -fsSLO "https://github.com/conn3xorg/conn3x/releases/download/v${VERSION}/checksums.txt.sigstore.json"
```

[cosign](https://docs.sigstore.dev/cosign/system_config/installation/) checks that `checksums.txt` was signed by the Conn3x release workflow, and nothing else:

```sh
cosign verify-blob \
  --certificate-identity 'https://github.com/conn3xorg/conn3x/.github/workflows/release.yml@refs/heads/main' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --bundle checksums.txt.sigstore.json checksums.txt
```

```text
Verified OK
```

Then the checksum ties your archive to that file. On Linux, `sha256sum --check --ignore-missing checksums.txt` does the same:

```sh
shasum -a 256 --check --ignore-missing checksums.txt
```

```text
conn3x_0.8.0_darwin_arm64.tar.gz: OK
```

Unpack it, put it on your `PATH`, and ask it its version:

```sh
tar -xzf "conn3x_${VERSION}_${OS}_${ARCH}.tar.gz" conn3x
sudo install conn3x /usr/local/bin/
conn3x version
```

```text
Conn3x v0.8.0 (built on OpenTofu v1.13.2)
on darwin_arm64
agent: linux/amd64 6117b07a45e6, linux/arm64 4352d611dfe9
```

[Install](/install) has the other ways, including the container image.

### Sign in to AWS

Conn3x uses the AWS provider, which finds your credentials the way the `aws` CLI does. With IAM Identity Center, set up a profile once with `aws configure sso`, then sign in and tell your shell which profile to use:

```sh
aws sso login --profile my-profile
export AWS_PROFILE=my-profile
```

With access keys, export `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` instead. Either way, check who you are before you create anything:

```sh
aws sts get-caller-identity --query Account --output text
```

It prints your account number. The credentials stay in your shell; nothing in the configuration holds them.

### An SSH key

The configuration reads `~/.ssh/id_ed25519.pub`, puts it on the server, and logs in with `~/.ssh/id_ed25519`. If you don't have that pair yet, make one:

```sh
ssh-keygen -t ed25519
```

To use another key, set `ssh_public_key_file` and `ssh_private_key_file` in `terraform.tfvars`, which you'll write in a minute.

## Part 1: the private AI box

### Write the configuration

Make an empty directory and change into it. The configuration is four files, split by job, so you can see which part is AWS and which isn't.

#### variables.tf

```hcl
terraform {
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.0" }
    tls    = { source = "hashicorp/tls", version = "~> 4.0" }
  }
}

variable "admin_cidrs" {
  type        = list(string)
  description = "Addresses allowed to reach SSH, such as [\"203.0.113.7/32\"]. Nothing else can reach the server."

  validation {
    condition     = length(var.admin_cidrs) > 0 && alltrue([for c in var.admin_cidrs : can(cidrhost(c, 0))])
    error_message = "Give at least one address or network in CIDR form, such as \"203.0.113.7/32\"."
  }
}

variable "name" {
  type        = string
  default     = "aibox"
  description = "Name of the instance and its security group."
}

variable "region" {
  type    = string
  default = "us-west-2"
}

variable "instance_type" {
  type        = string
  default     = "t3.medium"
  description = "2 vCPUs and 4 GB. Ollama on the CPU wants at least 4 GB of memory."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Tags for everything this creates, such as { project = \"aibox\" }."
}

variable "ssh_public_key_file" {
  type    = string
  default = "~/.ssh/id_ed25519.pub"
}

variable "ssh_private_key_file" {
  type    = string
  default = "~/.ssh/id_ed25519"
}
```

Three providers: `aws` for the server, `tls` to make its SSH host key, and `random` for Qdrant's API key. `admin_cidrs` is the only input without a default, and the validation stops a plan that would open SSH to nothing, or to something that isn't an address. `t3.medium` is the smallest size that fits: both models run on the CPU in 4 GB with room to spare.

#### server.tf

```hcl
provider "aws" {
  region = var.region

  default_tags {
    tags = var.tags
  }
}

data "aws_vpc" "default" {
  default = true
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
}

# The server's SSH host key, made here and installed by cloud-init, so
# Conn3x can check it on the very first connection.
resource "tls_private_key" "host" {
  algorithm = "ED25519"
}

# SSH from admin_cidrs, and nothing else in.
resource "aws_security_group" "box" {
  name        = var.name
  description = "Conn3x private AI box: SSH only"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "ssh" {
  for_each = toset(var.admin_cidrs)

  security_group_id = aws_security_group.box.id
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
}

# Out stays open, for packages, the Ollama and Qdrant releases, and models.
resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.box.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_instance" "box" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  vpc_security_group_ids      = [aws_security_group.box.id]
  associate_public_ip_address = true
  tags                        = { Name = var.name }

  # Room for Ubuntu, the 1.5 GB Ollama release and the models.
  root_block_device {
    volume_type = "gp3"
    volume_size = 20
    tags        = merge(var.tags, { Name = var.name })
  }

  metadata_options {
    http_tokens = "required"
  }

  user_data = "#cloud-config\n${yamlencode({
    ssh_deletekeys = true
    ssh_keys = {
      ed25519_private = tls_private_key.host.private_key_openssh
      ed25519_public  = tls_private_key.host.public_key_openssh
    }
    users = [{
      name                = "conn3x"
      shell               = "/bin/bash"
      sudo                = "ALL=(ALL) NOPASSWD:ALL"
      ssh_authorized_keys = [trimspace(file(pathexpand(var.ssh_public_key_file)))]
    }]
  })}"

  # Delete the SSH rule last, so destroy can still reach the server.
  depends_on = [aws_vpc_security_group_ingress_rule.ssh]

  # A newer image shouldn't replace a running server.
  lifecycle {
    ignore_changes = [ami]
  }
}
```

This is the only AWS-shaped file, block by block:

- `default_tags` puts your `tags` on everything the provider creates, which makes the leftovers easy to find if something ever goes wrong.
- The two `data` blocks look things up rather than create them: your default VPC, and Canonical's newest Ubuntu 24.04 image. `099720109477` is Canonical's account, so nobody else's image with a similar name can sneak in.
- `tls_private_key.host` is the server's own SSH host key, made before the server exists. Cloud-init installs it, so when Conn3x connects it already knows which key to expect. Without this, the first connection would have to trust whatever answered.
- The security group lets in TCP 22 from each address in `admin_cidrs` and nothing else. Every port Ollama and Qdrant use stays shut at AWS's edge, before a packet reaches the server.
- `aws_instance.box` asks for IMDSv2 tokens (`http_tokens = "required"`), a 20 GB disk, and cloud-init that installs the host key and creates a `conn3x` user with your public key and sudo. Ubuntu's images keep root out of SSH, so that's who Conn3x logs in as.
- `depends_on` keeps the SSH rule alive until the instance is gone, and `ignore_changes = [ami]` stops next month's Ubuntu image from replacing a running server.

#### circuits.tf

```hcl
resource "random_password" "qdrant" {
  length  = 32
  special = false
}

locals {
  # The server doesn't exist at plan time, so os stands in for the facts
  # the circuits would otherwise read from it.
  hosts = {
    box = {
      address  = aws_instance.box.public_ip
      host_key = tls_private_key.host.public_key_openssh
      os       = "ubuntu"
    }
  }

  # How every circuit logs in: as the conn3x user cloud-init made, with sudo.
  ssh_user = "conn3x"
}

module "baseline" {
  source = "github.com/conn3xorg/circuit-baseline?ref=v0.2.0"

  hosts                = local.hosts
  ssh_user             = local.ssh_user
  ssh_private_key_file = var.ssh_private_key_file
  ssh_become           = true
}

module "hardening" {
  source = "github.com/conn3xorg/circuit-hardening?ref=v0.3.0"

  hosts                = local.hosts
  ssh_user             = local.ssh_user
  ssh_private_key_file = var.ssh_private_key_file
  ssh_become           = true

  # The tunnel is SSH local forwarding, which hardening turns off.
  # "local" allows -L and still refuses -R.
  sshd_settings = { AllowTcpForwarding = "local" }

  # ufw sets log_martians back to 0 each time it starts, so the two would
  # undo each other on every apply. Leave it to ufw.
  sysctl = {
    "net.ipv4.conf.all.log_martians"     = null
    "net.ipv4.conf.default.log_martians" = null
  }
}

module "firewall" {
  source = "github.com/conn3xorg/circuit-firewall?ref=v0.3.0"

  hosts                = local.hosts
  ssh_user             = local.ssh_user
  ssh_private_key_file = var.ssh_private_key_file
  ssh_become           = true
}

module "ollama" {
  source = "github.com/conn3xorg/circuit-ollama?ref=v0.1.4"

  hosts                = local.hosts
  ssh_user             = local.ssh_user
  ssh_private_key_file = var.ssh_private_key_file
  ssh_become           = true

  models = ["nomic-embed-text", "qwen2.5:0.5b"]
}

module "qdrant" {
  source = "github.com/conn3xorg/circuit-qdrant?ref=v0.1.2"

  hosts                = local.hosts
  ssh_user             = local.ssh_user
  ssh_private_key_file = var.ssh_private_key_file
  ssh_become           = true

  api_key = random_password.qdrant.result
}
```

Nothing in this file knows it's on AWS. That's what makes it portable.

- `local.hosts` is the bridge. It hands every circuit the instance's address and the host key from `server.tf`, as a [host object](/reference/circuits/hosts). Both are unknown until apply, and that's fine: Conn3x waits for them. `os = "ubuntu"` answers the question two of the circuits would otherwise ask a server that doesn't exist yet.
- Each `module` pins a circuit to a git tag with `?ref=`. A tag never moves, so the steps you plan today are the steps you get next month. Moving to a newer release is a one-line change you'll see in the plan.
- `AllowTcpForwarding = "local"` matters more than it looks. Hardening switches off SSH forwarding by default, which would kill your tunnel. `local` allows `ssh -L`, the kind you'll use, and still refuses `-R`, so nobody can use the box to publish a port of their own.
- The `sysctl` nulls leave `log_martians` to ufw. Without them, hardening and ufw would set it back and forth, and every plan would show a change.
- Ollama gets two models: `nomic-embed-text` turns text into 768 numbers, and `qwen2.5:0.5b` is a small chat model that writes the answers.
- Qdrant's API key comes from `random_password`, so nobody has to invent one, and you read it back with `conn3x output`.

There's no `depends_on` between the circuits, on purpose. They run side by side once the server answers on SSH, and when two want apt at the same moment, Conn3x waits for the lock.

#### outputs.tf

```hcl
output "ip" {
  value = aws_instance.box.public_ip
}

# The host key the configuration made, as a line for a known_hosts file.
output "known_hosts" {
  value = "${aws_instance.box.public_ip} ${tls_private_key.host.public_key_openssh}"
}

output "tunnel" {
  value = join(" ", [
    "ssh -N -L 11434:127.0.0.1:11434 -L 6333:127.0.0.1:6333",
    "-o UserKnownHostsFile=known_hosts -o StrictHostKeyChecking=yes",
    "-i ${var.ssh_private_key_file} ${local.ssh_user}@${aws_instance.box.public_ip}",
  ])
}

output "qdrant_api_key" {
  value     = random_password.qdrant.result
  sensitive = true
}
```

`tunnel` is the whole SSH command, so you never have to type it. It maps `localhost:11434` and `localhost:6333` on your machine to the same ports on the server's loopback, and it checks the server's host key against a `known_hosts` file you'll write from the `known_hosts` output. `qdrant_api_key` is marked sensitive, so it only prints when you ask for it by name.

#### terraform.tfvars

Find your public address:

```sh
curl -4 https://ifconfig.me
```

```text
203.0.113.7
```

Then save it, as a `/32`, in `terraform.tfvars`. Conn3x reads this file on every command, so `plan`, `apply`, `drift` and `destroy` all get the same value without a `-var`:

```hcl
admin_cidrs = ["203.0.113.7/32"]
```

The addresses on this page are examples. Yours is real. If your address changes, as home connections do, update this file and apply again: only the security group rule changes.

### Initialize

```sh
conn3x init
```

`init` downloads the five circuits at their tags and the three providers. Trimmed:

```text
Initializing modules...
Downloading git::https://github.com/conn3xorg/circuit-baseline.git?ref=v0.2.0 for baseline...
Downloading git::https://github.com/conn3xorg/circuit-firewall.git?ref=v0.3.0 for firewall...
Downloading git::https://github.com/conn3xorg/circuit-hardening.git?ref=v0.3.0 for hardening...
Downloading git::https://github.com/conn3xorg/circuit-ollama.git?ref=v0.1.4 for ollama...
Downloading git::https://github.com/conn3xorg/circuit-qdrant.git?ref=v0.1.2 for qdrant...

Initializing provider plugins...
- terraform.io/builtin/conn3x is built in to Conn3x
- Installed hashicorp/tls v4.4.2 (signed, key ID 0C0AF313E5FD9F80)
- Installed hashicorp/random v3.9.1 (signed, key ID 0C0AF313E5FD9F80)
- Installed hashicorp/aws v6.72.0 (signed, key ID 0C0AF313E5FD9F80)

Conn3x has been successfully initialized!
```

It also warns that state isn't encrypted. Take that one seriously here: state will hold the server's private host key and Qdrant's key. For a box you keep, turn on [state encryption](https://opentofu.org/docs/language/state/encryption/). For this tutorial, you'll delete the state file at the end.

`conn3x validate` checks the files without touching AWS:

```text
Success! The configuration is valid.
```

### Plan, and what to look for

```sh
conn3x plan
```

The plan is long, about 2,000 lines, because it shows every step every circuit will take. That's the point: before anything exists, you can read exactly what will happen to the server. Here's what's worth finding in it. Start at the end:

```text
Plan: 109 to add, 0 to change, 0 to destroy.
```

Six of the 109 are AWS and the two keys. The rest are steps on the server: 48 from hardening, 20 from Ollama, 17 from Qdrant, 14 from baseline and 4 from firewall.

Search for `ingress_rule`. There should be exactly one per address in `admin_cidrs`, on port 22, and no other way in:

```text
  # aws_vpc_security_group_ingress_rule.ssh["203.0.113.7/32"] will be created
  + resource "aws_vpc_security_group_ingress_rule" "ssh" {
      + cidr_ipv4              = "203.0.113.7/32"
      + from_port              = 22
      + ip_protocol            = "tcp"
      + to_port                = 22
      ...
    }
```

Search for `ollama__environment`. This is the file that decides where Ollama listens, and it says `127.0.0.1`:

```text
  # module.ollama.conn3x_file.ollama__environment["box"] will be created
  + resource "conn3x_file" "ollama__environment" {
      + content    = <<-EOT
            # Written by Conn3x. Changes here are overwritten on the next apply.
            [Service]
            Environment="OLLAMA_HOST=127.0.0.1:11434"
        EOT
      + path       = "/etc/systemd/system/ollama.service.d/conn3x.conf"
      ...
      + ssh {
          + become           = true
          + host             = (known after apply)
          + host_key         = (known after apply)
          + user             = "conn3x"
        }
    }
```

`host` and `host_key` are `(known after apply)` because the instance and its key don't exist yet. Conn3x fills them in as the apply goes.

And search for `hardening__sshd`, the SSH settings hardening writes. Your `AllowTcpForwarding local` is in there:

```text
  # module.hardening.conn3x_file.hardening__sshd["box"] will be created
  + resource "conn3x_file" "hardening__sshd" {
      + content    = <<-EOT
            # Written by Conn3x. Changes here are overwritten on the next apply.
            AllowAgentForwarding no
            AllowTcpForwarding local
            ...
```

### Apply

```sh
conn3x apply
```

Conn3x shows the plan again and asks. Type `yes`. Ours took 87 seconds. Here's what happens in that time, in order:

1. AWS creates the keys, the security group and its rules, then the instance. The instance took 13 seconds.
2. Conn3x waits for SSH, checks the server's host key against `tls_private_key.host`, and reads the server's facts.
3. The five circuits run side by side. The slow parts are Ollama's 1.5 GB release (22 seconds to download, 20 to unpack, on AWS's network) and the two models (6 seconds each).

The end of it:

```text
module.ollama.conn3x_download.ollama__download["box"]: Creation complete after 22s [id=16.148.113.204:download:/opt/ollama/ollama-linux-amd64-0.40.13.tar.zst]
module.ollama.conn3x_archive.ollama__unpack["box"]: Creation complete after 20s [id=16.148.113.204:archive:/opt/ollama/0.40.13]
module.ollama.conn3x_command.models__pull["box/nomic-embed-text"]: Creation complete after 6s [id=16.148.113.204:command]
module.ollama.conn3x_command.models__pull["box/qwen2.5:0.5b"]: Creation complete after 6s [id=16.148.113.204:command]

Apply complete! Resources: 109 added, 0 changed, 0 destroyed.

Outputs:

ip = "16.148.113.204"
known_hosts = <<EOT
16.148.113.204 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKXxCHLVDP4ZkEco9amgU0U2jQ37CnLskIwEniKsWi9T

EOT
qdrant_api_key = <sensitive>
tunnel = "ssh -N -L 11434:127.0.0.1:11434 -L 6333:127.0.0.1:6333 -o UserKnownHostsFile=known_hosts -o StrictHostKeyChecking=yes -i ~/.ssh/id_ed25519 conn3x@16.148.113.204"
```

That instance is gone now, so the address in it is safe to print. Yours will differ.

### Check it

Don't take the apply's word for it. Five checks, each a command.

#### The plan is clean

Plan again. Conn3x logs in to the server, reads every step back, and compares:

```sh
conn3x plan -detailed-exitcode
```

```text
No changes. Your infrastructure matches the configuration.
```

`-detailed-exitcode` makes it exit `0` here, and `2` if anything would change. A second plan that isn't clean means a step changed something it didn't plan, or planned something it can't keep.

#### The host key is the one you made

Write the `known_hosts` output to a file and look at its fingerprint:

```sh
conn3x output -raw known_hosts > known_hosts
ssh-keygen -lf known_hosts
```

```text
256 SHA256:EMpaGWyGoyg30EOEyLPzpTPLJ8BheX7D70kC+/giQ6M 16.148.113.204 (ED25519)
```

From here on, your own `ssh` checks the server against that file, and refuses if anything else answers.

#### Ollama and Qdrant listen on loopback

Ask the server what's listening on their ports:

```sh
IP=$(conn3x output -raw ip)
ssh -o UserKnownHostsFile=known_hosts -i ~/.ssh/id_ed25519 conn3x@$IP \
  'sudo ss -tln | grep -E ":(11434|6333|6334) "'
```

```text
LISTEN 0      128        127.0.0.1:6334       0.0.0.0:*
LISTEN 0      1024       127.0.0.1:6333       0.0.0.0:*
LISTEN 0      4096       127.0.0.1:11434      0.0.0.0:*
```

All three on `127.0.0.1`. 6334 is Qdrant's gRPC port.

#### Nothing answers from outside

Try each port from your machine. On Linux, use `nc -z -w 5` in place of `nc -z -G 5`:

```sh
for port in 11434 6333 6334; do
  nc -z -G 5 $IP $port && echo "$port open" || echo "$port closed from outside"
done
```

```text
11434 closed from outside
6333 closed from outside
6334 closed from outside
```

#### The tunnel works, and Qdrant wants its key

Open the tunnel in a second terminal, from the same directory, and leave it running:

```sh
$(conn3x output -raw tunnel)
```

It prints nothing and keeps the connection open; that's `-N`. Back in the first terminal, `localhost` is now the server:

```sh
curl -s localhost:11434/api/version; echo
curl -s localhost:11434/api/tags | jq -r ".models[].name"
curl -s -o /dev/null -w "%{http_code}\n" localhost:6333/collections
```

```text
{"version":"0.40.13"}
qwen2.5:0.5b
nomic-embed-text:latest
401
```

Ollama answers with both models, and Qdrant refuses a request without its key. Now give your shell the key:

```sh
export QDRANT_API_KEY="$(conn3x output -raw qdrant_api_key)"
```

### Load your notes and ask

Time to use it. Save a few notes, one per line, as `notes.txt`. Use your own, or these:

```text
The spare key to the shed is under the blue flowerpot.
The guest Wi-Fi password is written on the back of the router.
Backups run every night at 2am and go to the NAS in the garage.
The boiler was last serviced on 14 March by Hartley Heating.
Bins go out on Tuesday night; recycling is every other week.
```

Two short scripts do the rest. The first, `load.sh`, sends every line to Ollama in one request, gets a vector back for each, and stores each vector in Qdrant with its line beside it:

```sh
#!/bin/sh
# Stores each line of a file in Qdrant, with Ollama's vector for it.
# usage: ./load.sh notes.txt
set -eu
: "${QDRANT_API_KEY:?set it with: export QDRANT_API_KEY=\"\$(conn3x output -raw qdrant_api_key)\"}"
q() { curl -sf -H "api-key: $QDRANT_API_KEY" -H 'Content-Type: application/json' "$@"; }

# A collection sized for nomic-embed-text's 768-number vectors, made once.
q localhost:6333/collections/notes > /dev/null 2>&1 ||
  q -X PUT localhost:6333/collections/notes \
    -d '{"vectors": {"size": 768, "distance": "Cosine"}}' > /dev/null

lines=$(jq -R -s 'split("\n") | map(select(length > 0))' "$1")
vectors=$(curl -sf localhost:11434/api/embed \
  -d "$(jq -n --argjson l "$lines" '{model: "nomic-embed-text", input: $l}')" | jq -c '.embeddings')

jq -n --argjson l "$lines" --argjson v "$vectors" \
  '{points: [range($l | length) as $i | {id: ($i + 1), vector: $v[$i], payload: {text: $l[$i]}}]}' |
  q -X PUT 'localhost:6333/collections/notes/points?wait=true' -d @- > /dev/null

echo "Stored $(echo "$lines" | jq length) notes."
```

The second, `ask.sh`, turns your question into a vector the same way, asks Qdrant for the closest note, and hands that note and the question to the chat model:

```sh
#!/bin/sh
# Finds the note closest to a question, then has the chat model answer from it.
# usage: ./ask.sh "Where did I leave the shed key?"
set -eu
: "${QDRANT_API_KEY:?set it with: export QDRANT_API_KEY=\"\$(conn3x output -raw qdrant_api_key)\"}"

vector=$(curl -sf localhost:11434/api/embed \
  -d "$(jq -n --arg t "$1" '{model: "nomic-embed-text", input: $t}')" | jq -c '.embeddings[0]')

best=$(curl -sf -X POST localhost:6333/collections/notes/points/query \
  -H "api-key: $QDRANT_API_KEY" -H 'Content-Type: application/json' \
  -d "{\"query\": $vector, \"limit\": 1, \"with_payload\": true}" | jq -c '.result.points[0]')
note=$(echo "$best" | jq -r .payload.text)
echo "Closest note ($(echo "$best" | jq '.score * 100 | round / 100')): $note"

curl -sf localhost:11434/api/generate -d "$(jq -n --arg n "$note" --arg q "$1" \
  '{model: "qwen2.5:0.5b", stream: false,
    prompt: "Answer in one sentence, from this note only.\nNote: \($n)\nQuestion: \($q)"}')" |
  jq -r '"Answer: " + .response'
```

Make them executable, load the notes, and ask in your own words:

```sh
chmod +x load.sh ask.sh
./load.sh notes.txt
./ask.sh "Where did I leave the key for the garden shed?"
./ask.sh "What time do the backups happen?"
./ask.sh "Who looked at the heating, and when?"
```

```text
Stored 5 notes.
Closest note (0.81): The spare key to the shed is under the blue flowerpot.
Answer: I left the key for the garden shed under the blue flowerpot.
Closest note (0.73): Backups run every night at 2am and go to the NAS in the garage.
Answer: The backups happen every night at 2am.
Closest note (0.63): The boiler was last serviced on 14 March by Hartley Heating.
Answer: The heating was last serviced by Hartley Heating, and it was last serviced on 14 March.
```

"Flowerpot" isn't in the first question. "Boiler" isn't in the third. Qdrant found the right note anyway, because the vectors capture what a sentence means rather than the words in it. The scores are the same every time; the answers' wording isn't, since the chat model writes a fresh sentence each run.

That's retrieval-augmented generation, end to end. Your notes went through the tunnel and nowhere else. Nothing left the server at all.

Loading the same file again replaces the same points, since each line's `id` is its line number. For real documents, split them into paragraphs first, and keep `limit` at a few notes rather than one.

### Change something by hand, and catch it

Here's a change someone might make at 2am to "just test something": point Ollama at every address instead of loopback. Do it over SSH, the way they would:

```sh
ssh -o UserKnownHostsFile=known_hosts -i ~/.ssh/id_ed25519 conn3x@$IP \
  'sudo sed -i s/127.0.0.1:11434/0.0.0.0:11434/ /etc/systemd/system/ollama.service.d/conn3x.conf &&
   sudo systemctl daemon-reload && sudo systemctl restart ollama && sleep 2 && sudo ss -tln | grep 11434'
```

```text
LISTEN 0      4096               *:11434            *:*
```

Ollama now listens everywhere. Is it open to the internet?

```sh
nc -z -G 5 $IP 11434 && echo open || echo "still closed from outside"
```

```text
still closed from outside
```

Not yet, because the security group and ufw both still stand in front of it. That's why there are two of them. But the server isn't what you approved any more, and you want to know before the next change takes the second wall down. `conn3x drift` reads every step back from the server and compares it with the last apply. It changes nothing:

```sh
conn3x drift
```

```text
Drift found in 1 resource.

Hosts
  ~ module.ollama.conn3x_file.ollama__environment["box"]  changed

Run conn3x plan to see what Conn3x would change to put them back.

Changed, but your config wouldn't change them back
  aws_security_group.box
```

It exits with `2`, so a scheduled job can turn this into an alert; [Catch drift in CI](/tutorials/drift-in-ci) sets one up. The second list is AWS, not the hand edit: right after the first apply, the security group's own record doesn't yet list the rules you made as separate resources, and AWS fills them in. Nothing in your configuration would undo that, so `drift` reports it without counting it as drift, and the next apply records it.

Put the server back:

```sh
conn3x apply
```

The plan shows exactly what's wrong, line by line, and that Ollama will restart to pick it up:

```text
  # module.ollama.conn3x_file.ollama__environment["box"] will be updated in-place
  ~ resource "conn3x_file" "ollama__environment" {
      ~ content    = <<-EOT
            # Written by Conn3x. Changes here are overwritten on the next apply.
            [Service]
          - Environment="OLLAMA_HOST=0.0.0.0:11434"
          + Environment="OLLAMA_HOST=127.0.0.1:11434"
        EOT
      ...
    }

  # module.ollama.conn3x_service_action.ollama__restart["box"] must be replaced
  ...

Plan: 1 to add, 1 to change, 1 to destroy.
```

Type `yes`:

```text
Apply complete! Resources: 1 added, 1 changed, 1 destroyed.
```

The "1 destroyed" is the restart's own record being replaced, not anything on the server. Check:

```sh
ssh -o UserKnownHostsFile=known_hosts -i ~/.ssh/id_ed25519 conn3x@$IP 'sudo ss -tln | grep 11434'
conn3x drift
```

```text
LISTEN 0      4096       127.0.0.1:11434      0.0.0.0:*
No drift: the cloud and the hosts match the last apply.
```

### What it costs

| What | Rate in `us-west-2` | An hour |
| --- | --- | --- |
| `t3.medium` instance | $0.0416 an hour | $0.0416 |
| Public IPv4 address | $0.005 an hour | $0.005 |
| 20 GB gp3 disk | $0.08 per GB-month | about $0.0022 |
| Security group, rules, keys | free | $0 |
| Total | | about 5 cents |

Left running for a month, that's about $36. Our run went through two applies and two destroys and cost about 2 cents.

### Destroy it, and check nothing's left

Stop the tunnel with Ctrl-C in its terminal. Then:

```sh
conn3x destroy
```

Type `yes`. It took under a minute: 30 seconds of that is AWS terminating the instance.

```text
aws_instance.box: Destruction complete after 30s
aws_vpc_security_group_ingress_rule.ssh["203.0.113.7/32"]: Destruction complete after 0s
aws_security_group.box: Destruction complete after 0s

Destroy complete! Resources: 109 destroyed.
```

Terminating the instance deletes its disk and releases its address. Ask AWS to be sure:

```sh
aws ec2 describe-instances --region us-west-2 \
  --filters Name=tag:Name,Values=aibox Name=instance-state-name,Values=pending,running,stopping,stopped \
  --query 'Reservations[].Instances[].InstanceId'
aws ec2 describe-security-groups --region us-west-2 \
  --filters Name=group-name,Values=aibox --query 'SecurityGroups[].GroupId'
aws ec2 describe-volumes --region us-west-2 \
  --filters Name=tag:Name,Values=aibox --query 'Volumes[].VolumeId'
```

All three print `[]`. The state filter matters: a terminated instance stays in AWS's listings for a while, and costs nothing. The configuration creates no key pair and no Elastic IP, so there's neither to check.

Last, delete the state and `known_hosts`. State holds the server's private host key and Qdrant's key:

```sh
rm -f terraform.tfstate terraform.tfstate.backup known_hosts
```

### On Azure, Google Cloud and DigitalOcean

The same five circuits run on all three; we've built this box on each. On every cloud, `circuits.tf` stays as it is, and so does everything in `outputs.tf` but the address. What changes is the server:

- Azure: Replace `server.tf` with a resource group, network, network security group, public IP and `azurerm_linux_virtual_machine`, as in [Provision and configure on Azure](/tutorials/azure). The address is the VM's `public_ip_address`, and the login user stays `conn3x`. We ran it on `Standard_B2als_v2` (2 vCPUs, 4 GB) in `westus2`: the apply took 2 minutes 42 seconds, at $0.0376 an hour.
- Google Cloud: Replace `server.tf` with a network, a firewall rule and `google_compute_instance`, as in [Provision and configure on Google Cloud](/tutorials/google-cloud). The address is `network_interface[0].access_config[0].nat_ip`, and the user stays `conn3x`. We ran it on `e2-medium` in `us-central1-a`: 4 minutes 4 seconds, at $0.0335 an hour.
- DigitalOcean: circuit-ollama carries [a complete example](https://github.com/conn3xorg/circuit-ollama/tree/main/examples/digitalocean) for it. The address is the droplet's `ipv4_address`, and you log in as `root`, so `ssh_user = "root"` and no `ssh_become`. We ran it on `s-2vcpu-4gb` in `lon1`: 2 minutes 36 seconds, at $0.0357 an hour.

The [Circuit Builder](https://conn3x.org/build) writes the server half for AWS, Azure and Google Cloud. Pick the five circuits there, and add `models`, `api_key` and the hardening settings from `circuits.tf` above.

## Part 2: make your own circuit

Everything the server got in part 1 came from circuits somebody else wrote. Writing your own is the same language, and a circuit can be very small. In this part you build `circuit-mini-homelab`: Homepage, a dashboard with a tile for each app, and Uptime Kuma, which tells you when something stops answering. Both listen on `127.0.0.1`, like Ollama did, and you reach them the same way.

It's a cut-down version of [circuit-lempa-homelab](/circuits/lempa-homelab), which is named after [Christian Lempa](https://christianlempa.de/) and built from the list in his video [What software runs in my HomeLab in 2025?](https://www.youtube.com/watch?v=KJVe_E6tdzw). Christian didn't make either circuit and doesn't endorse them. The full one has a switch per chapter of that video; this one keeps two apps from its monitoring and dashboard chapters, so you can see every line.

You test it on a Rocky Linux 10 container on your laptop, so part 2 needs no cloud. You need:

- Conn3x v0.8.0, from part 1.
- [Podman](https://podman.io/docs/installation). Homepage and Uptime Kuma run under Podman inside the test container, so the container is privileged, which works best with rootful Podman. On a Mac, use the Podman machine's root connection: `export CONTAINER_CONNECTION=podman-machine-default-root`. On Linux, `export PODMAN="sudo podman"`.
- A GitHub account, for publishing.

### Lay out the repository

A shared circuit is an ordinary OpenTofu module with a circuit in it. Here's the whole repository:

```text
circuit-mini-homelab/
├── LICENSE
├── README.md
├── variables.tf          inputs
├── main.circuit.hcl      what it does
├── outputs.tf            what it hands back
└── examples/
    └── local/            a throwaway test host
        ├── Containerfile
        ├── up.sh
        ├── down.sh
        └── main.tf
```

```sh
mkdir -p circuit-mini-homelab/examples/local
cd circuit-mini-homelab
```

### Inputs: variables.tf

```hcl
variable "hosts" {
  type        = any
  description = "The homelab server: a map of one name to an address, or to a host object with an address and settings such as host_key."

  validation {
    condition     = can(keys(var.hosts)) && length(var.hosts) == 1 && alltrue([for v in values(var.hosts) : can(tostring(v)) || can(tostring(v.address))])
    error_message = "hosts must be a map of one name to an address, or to an object with an address."
  }
}

variable "ssh_user" {
  type    = string
  default = "root"
}

variable "ssh_port" {
  type    = number
  default = 22
}

variable "ssh_private_key_file" {
  type    = string
  default = null
}

variable "ssh_known_hosts_file" {
  type    = string
  default = null
}

variable "ssh_become" {
  type    = bool
  default = false
}

variable "title" {
  type        = string
  default     = "Homelab"
  description = "The title of Homepage's browser tab, and the first line of the login message."
}

variable "links" {
  type        = map(string)
  default     = {}
  description = "More tiles for Homepage, by name, such as { Router = \"http://192.168.1.1\" }."
}
```

The caller decides which server and how to get in, so those are inputs. `hosts` is `any` because a caller may pass a plain address or a host object with a `host_key`, like `local.hosts` in part 1, and `map(any)` can't hold that mix. The validation checks the shape, and that there's one host: both apps want the same ports, so one server is the honest limit.

The five `ssh_*` names are the ones every official circuit uses, so a caller can pass the same values to all of them. A `null` default means "Conn3x's own default", such as the SSH agent for the key.

`title` and `links` are the two choices worth giving people. Everything else has one sensible answer, so it isn't an input. Fewer inputs, fewer ways to hold it wrong.

### Steps: main.circuit.hcl

```hcl
locals {
  # Both apps listen on loopback, each on a port of its own.
  port = { homepage = 3000, uptimekuma = 3001 }

  # One tile per app, and one per link. Homepage checks each siteMonitor
  # from the server and shows how fast it answered, or that it's down.
  apps = {
    Apps = [
      { "Uptime Kuma" = {
        href        = "http://127.0.0.1:${local.port.uptimekuma}"
        description = "Is it up?"
        icon        = "uptime-kuma.png"
        siteMonitor = "http://127.0.0.1:${local.port.uptimekuma}"
      } },
    ]
  }
  links = [for name, url in var.links : { (name) = { href = url } }]

  # The Links group only appears when there are links.
  services = concat([local.apps], length(local.links) > 0 ? [{ Links = local.links }] : [])
}

module "uptimekuma" {
  source = "github.com/conn3xorg/circuit-uptimekuma?ref=v0.1.0"

  hosts                = var.hosts
  ssh_user             = var.ssh_user
  ssh_port             = var.ssh_port
  ssh_private_key_file = var.ssh_private_key_file
  ssh_known_hosts_file = var.ssh_known_hosts_file
  ssh_become           = var.ssh_become

  port = local.port.uptimekuma
}

module "homepage" {
  source = "github.com/conn3xorg/circuit-homepage?ref=v0.1.0"

  hosts                = var.hosts
  ssh_user             = var.ssh_user
  ssh_port             = var.ssh_port
  ssh_private_key_file = var.ssh_private_key_file
  ssh_known_hosts_file = var.ssh_known_hosts_file
  ssh_become           = var.ssh_become

  port     = local.port.homepage
  settings = { title = var.title }
  services = local.services
}

circuit "mini_homelab" {
  hosts = var.hosts

  ssh {
    user             = var.ssh_user
    port             = var.ssh_port
    private_key_file = var.ssh_private_key_file
    known_hosts_file = var.ssh_known_hosts_file
    become           = var.ssh_become
  }

  # Whoever logs in sees what runs here and how to reach it.
  step "motd" {
    file {
      path    = "/etc/motd"
      content = <<-EOT
        ${var.title}, set up by Conn3x.
          Homepage     http://127.0.0.1:${local.port.homepage}
          Uptime Kuma  http://127.0.0.1:${local.port.uptimekuma}
        From your laptop: ssh -L ${local.port.homepage}:127.0.0.1:${local.port.homepage} -L ${local.port.uptimekuma}:127.0.0.1:${local.port.uptimekuma} <this host>
      EOT
    }
  }
}
```

The file has three parts, and they show the two ways to build a circuit.

The `locals` work out the values once. The ports live in one map, so the tiles, the modules and the login message can't disagree. `services` is Homepage's `services.yaml` written as HCL: an `Apps` group with a tile for Uptime Kuma, whose `siteMonitor` makes Homepage check the port and show how fast it answered, or that it's down. The `Links` group only exists when someone passes `links`, which is what the `length(local.links) > 0 ? ... : []` is for.

The two `module` blocks reuse official circuits, the way part 1 did. Why write Uptime Kuma's install yourself when [circuit-uptimekuma](/circuits/uptimekuma) already runs it from the official image, pinned by tag and digest, as a systemd service under Podman, and waits for its port? Pass your inputs through and set what's different: the port, the title and the tiles. Both circuits install Podman for themselves; asking twice is harmless, since a step that's already done changes nothing. You'll see this composition throughout circuit-lempa-homelab.

The `circuit` block holds a step of your own. A circuit is a list of hosts, a way in, and steps that run in order on each host. This one has one step, a [`file`](/modules/file) that writes `/etc/motd`, so whoever logs in sees what runs there and how to reach it. Add more steps below it, such as a [`package`](/modules/package) or a [`service`](/modules/service); the [module reference](/modules/file) lists them all. Conn3x names each step's resource after the circuit and the step, so this one becomes `conn3x_file.mini_homelab__motd`.

### Outputs: outputs.tf

```hcl
output "urls" {
  description = "Where each app answers on the server itself. Reach them through an SSH tunnel."
  value = {
    homepage   = module.homepage.url
    uptimekuma = module.uptimekuma.url
  }
}

output "tunnel_ports" {
  description = "The -L arguments for ssh that bring both apps to the same ports on your machine."
  value       = join(" ", [for p in values(local.port) : "-L ${p}:127.0.0.1:${p}"])
}
```

Outputs are what a caller can build on: `module.homelab.urls`, say, for a reverse proxy in front later. `urls` takes each member circuit's own `url` output rather than writing the address again.

### Test it on a container

Before anyone else runs this as root on their server, you run it on a throwaway one. `examples/local` holds four files.

`Containerfile` describes a Rocky Linux 10 host with systemd and SSH, the same image Conn3x's own end-to-end tests use:

```dockerfile
# A throwaway Rocky Linux 10 host with systemd and sshd, for trying this
# circuit. It matches the image Conn3x's own end-to-end tests use.
FROM docker.io/rockylinux/rockylinux:10-ubi-init

RUN dnf -y install openssh-server sudo \
 && ssh-keygen -A \
 && systemctl enable sshd \
 && mkdir -p -m 700 /root/.ssh

EXPOSE 22
CMD ["/sbin/init"]
```

`up.sh` builds it, starts it on `127.0.0.1:2222`, makes an SSH key for it and records its host key, so Conn3x checks it from the first connection. The comments say why each line is there:

```sh
#!/usr/bin/env sh
# Starts a throwaway host on 127.0.0.1:$PORT (default 2222) that Conn3x can
# configure, with a fresh SSH key and its host key in ./known_hosts.
# CONTAINERFILE picks another image, such as one of Conn3x's test images.
# Needs Podman, since the host runs systemd. Podman inside runs containers of
# its own, so the host container is privileged and keeps /var/lib/containers on
# a volume, where the inner Podman can use overlayfs. That's only for this
# nested setup; a real host needs neither.
# Rootful Podman is simplest: CONTAINER_CONNECTION=podman-machine-default-root
# on a Mac, or PODMAN="sudo podman" on Linux.
set -eu
cd "$(dirname "$0")"
port=${PORT:-2222}
containerfile=${CONTAINERFILE:-Containerfile}
name=${CONTAINER_NAME:-circuit-mini-homelab}

podman=${PODMAN:-podman}
[ -f id_ed25519 ] || ssh-keygen -q -t ed25519 -N '' -C "$name" -f id_ed25519
$podman build -q -f "$containerfile" -t "$name" "$(dirname "$containerfile")" >/dev/null
$podman rm -f -v "$name" >/dev/null 2>&1 || true
$podman run -d --name "$name" --systemd=always --privileged -v /var/lib/containers \
  -p "127.0.0.1:$port:22" "$name" >/dev/null
$podman exec -i "$name" sh -c 'cat > /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys' < id_ed25519.pub
# The outer and inner Podman would both put their bridge on 10.88.0.0/16, so
# the inner one gets another subnet.
$podman exec "$name" sh -c 'mkdir -p /etc/containers/containers.conf.d && printf "[network]\ndefault_subnet = \"10.89.0.0/16\"\n" > /etc/containers/containers.conf.d/50-nested.conf'
$podman exec "$name" timeout 60 systemctl is-system-running --wait >/dev/null 2>&1 || true

for _ in 1 2 3 4 5 6 7 8 9 10; do
  if ssh-keyscan -p "$port" 127.0.0.1 > known_hosts 2>/dev/null && [ -s known_hosts ]; then
    echo "Ready on 127.0.0.1:$port. Now run: conn3x init && conn3x apply -var port=$port"
    exit 0
  fi
  sleep 1
done
echo "The container started, but SSH didn't answer on 127.0.0.1:$port." >&2
exit 1
```

`down.sh` removes the container and everything the test made:

```sh
#!/usr/bin/env sh
# Removes the container and everything up.sh and Conn3x created here.
set -eu
cd "$(dirname "$0")"
${PODMAN:-podman} rm -f -v "${CONTAINER_NAME:-circuit-mini-homelab}" >/dev/null 2>&1 || true
rm -rf id_ed25519 id_ed25519.pub known_hosts .terraform .terraform.lock.hcl terraform.tfstate terraform.tfstate.backup
echo "Removed."
```

And `main.tf` calls your circuit the way a user would, except that `source` is the directory two levels up instead of a GitHub tag:

```hcl
variable "port" {
  type    = number
  default = 2222
}

module "homelab" {
  source = "../.."

  hosts                = { lab = "127.0.0.1" }
  ssh_port             = var.port
  ssh_private_key_file = "./id_ed25519"
  ssh_known_hosts_file = "./known_hosts"

  title = "My homelab"
  links = { "Conn3x docs" = "https://docs.conn3x.org" }
}

output "urls" {
  value = module.homelab.urls
}

output "tunnel_ports" {
  value = module.homelab.tunnel_ports
}
```

Make the scripts executable, start the host, and apply:

```sh
cd examples/local
chmod +x up.sh down.sh
./up.sh
conn3x init
conn3x apply
```

```text
Ready on 127.0.0.1:2222. Now run: conn3x init && conn3x apply -var port=2222
```

The plan lists 22 steps: your `motd`, and the steps of the two circuits and the Podman circuit each one uses. Your own step shows up first:

```text
  # module.homelab.conn3x_file.mini_homelab__motd["lab"] will be created
  + resource "conn3x_file" "mini_homelab__motd" {
      + content    = <<-EOT
            My homelab, set up by Conn3x.
              Homepage     http://127.0.0.1:3000
              Uptime Kuma  http://127.0.0.1:3001
            From your laptop: ssh -L 3000:127.0.0.1:3000 -L 3001:127.0.0.1:3001 <this host>
        EOT
      + path       = "/etc/motd"
      ...
    }

Plan: 22 to add, 0 to change, 0 to destroy.
```

Type `yes`. Ours took under a minute, most of it Podman installing and the two images downloading:

```text
Apply complete! Resources: 22 added, 0 changed, 0 destroyed.

Outputs:

tunnel_ports = "-L 3000:127.0.0.1:3000 -L 3001:127.0.0.1:3001"
urls = {
  "homepage" = "http://127.0.0.1:3000"
  "uptimekuma" = "http://127.0.0.1:3001"
}
```

Now the test that matters most for a circuit you'll share. Plan again:

```sh
conn3x plan
```

```text
No changes. Your infrastructure matches the configuration.
```

If the second plan isn't clean, a step reports a change it didn't make, or makes one it didn't plan, and everyone who uses your circuit would see a change on every run. Fix that before anything else.

Log in and read the message your step wrote:

```sh
ssh -p 2222 -i id_ed25519 -o UserKnownHostsFile=known_hosts root@127.0.0.1 cat /etc/motd
```

```text
My homelab, set up by Conn3x.
  Homepage     http://127.0.0.1:3000
  Uptime Kuma  http://127.0.0.1:3001
From your laptop: ssh -L 3000:127.0.0.1:3000 -L 3001:127.0.0.1:3001 <this host>
```

Then open a tunnel and look:

```sh
ssh -N -p 2222 -i id_ed25519 -o UserKnownHostsFile=known_hosts \
  -L 3000:127.0.0.1:3000 -L 3001:127.0.0.1:3001 root@127.0.0.1
```

Open `http://localhost:3000`. Homepage shows an Apps group with Uptime Kuma and how many milliseconds it took to answer, and a Links group with the Conn3x docs. Its API says the same thing, which is handy in a test script:

```sh
curl -s http://localhost:3000/api/services | jq -c '.[] | {name, services: [.services[].name]}'
```

```text
{"name":"Apps","services":["Uptime Kuma"]}
{"name":"Links","services":["Conn3x docs"]}
```

:::caution[Claim Uptime Kuma straight away]
Uptime Kuma has no account until someone opens it, and the first person to load the page picks the username and password. Open `http://localhost:3001` through your tunnel right after the first apply, and create the admin account before anything else can reach the port.
:::

When you're done, Ctrl-C the tunnel and remove the host:

```sh
./down.sh
```

```text
Removed.
```

### Write the README

The README is what people read before they run your code as root. Keep it short and specific: what the circuit does to a host, a `module` block to copy, every input and output, what it's tested on, and what removing it leaves behind. A start:

````md
# circuit-mini-homelab

A Conn3x circuit that runs Homepage and Uptime Kuma on one server, both on
127.0.0.1, with a tile on Homepage for Uptime Kuma and any links you add.
Reach them through an SSH tunnel.

## Usage

```hcl
module "homelab" {
  source = "github.com/you/circuit-mini-homelab?ref=v0.1.0"

  hosts                = { lab = "192.168.1.20" }
  ssh_private_key_file = "~/.ssh/id_ed25519"

  links = { Router = "http://192.168.1.1" }
}
```

Then `ssh -L 3000:127.0.0.1:3000 -L 3001:127.0.0.1:3001 root@192.168.1.20`,
open http://localhost:3001 and create Uptime Kuma's admin first.

## What it does

Runs circuit-uptimekuma v0.1.0 on port 3001 and circuit-homepage v0.1.0 on
port 3000, each under Podman as a systemd service, and writes /etc/motd.
Removing it leaves both, and /etc/motd, in place.

## Tested on

Rocky Linux 10, in examples/local, with Conn3x v0.8.0. The second plan
says No changes.
````

Fill in the inputs and outputs tables from the two `.tf` files. [Share a circuit](/guides/share-a-circuit#write-the-readme) has the full list.

### Publish it and pin it

Pick an open-source licence and put it in `LICENSE`; the official circuits use MPL-2.0. Make a public repository on GitHub called `circuit-mini-homelab`, then, from the top of the repository:

```sh
cat > .gitignore <<'EOF'
.terraform/
.terraform.lock.hcl
terraform.tfstate*
examples/local/id_ed25519*
examples/local/known_hosts
EOF
git init -b main
git add .
git commit -m "feat: Homepage and Uptime Kuma on one server"
git remote add origin git@github.com:you/circuit-mini-homelab.git
git push -u origin main
git tag v0.1.0
git push origin v0.1.0
```

The `.gitignore` keeps the test host's private key and the state out of the repository. The tag is the release. Anyone, including you on your real server, uses it like this:

```hcl
module "homelab" {
  source = "github.com/you/circuit-mini-homelab?ref=v0.1.0"

  hosts                = { lab = "192.168.1.20" }
  ssh_private_key_file = "~/.ssh/id_ed25519"
}
```

That `?ref=v0.1.0` is the pin. Never move a tag once someone uses it: fix things in `v0.1.1`, and say in the release notes what changed on the host. Your circuit pins its own members the same way, `circuit-uptimekuma?ref=v0.1.0`, and those pin their images by digest, so every layer is something somebody tested.

Want to check yours against ours? We published this exact circuit as [conn3xorg/circuit-mini-homelab](https://github.com/conn3xorg/circuit-mini-homelab), with a CI workflow that applies `examples/local` on Rocky Linux 10, Fedora 45, Ubuntu 24.04 and Debian 13, plans again, fetches both apps, restarts the host and checks them once more. Its [directory page](/circuits/mini-homelab) shows the grade that earns.

To list it on [conn3x.org/circuits](https://conn3x.org/circuits), fill in the [Share a circuit](https://github.com/conn3xorg/web/issues/new?template=share-a-circuit.yml) form, or open a pull request with one JSON file. [Share a circuit](/guides/share-a-circuit#list-it) has both, and [Circuit grades](/reference/circuit-grades) shows how it'll be graded; most of the points come from running `examples/local` in CI.

## Next steps

- [circuit-lempa-homelab](/circuits/lempa-homelab) is the full homelab this part cut down: Traefik, BIND, Prometheus and Grafana, and a switch for each chapter of Christian's video.
- [Catch drift in CI](/tutorials/drift-in-ci) runs `conn3x drift` on a schedule, so the 2am change in part 1 becomes a red job.
- [Share a circuit](/guides/share-a-circuit) covers the rest of writing circuits for other people, including working safely in directories a service owns.
- The [Ollama](/circuits/ollama) and [Qdrant](/circuits/qdrant) pages list every input, such as a bigger model and the `size` it needs.
