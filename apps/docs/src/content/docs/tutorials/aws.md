---
title: Provision and configure on AWS
description: Create two Ubuntu EC2 instances on AWS and configure them in the same plan, with host keys checked from the first connection, then destroy them.
---

In this tutorial one configuration creates two EC2 instances running Ubuntu 24.04 and sets each one up: a `deploy` account with your public key. The security group, the instances, their SSH host keys and the steps on each instance are planned and applied together, and live in one state file.

**Time:** 15 minutes.

:::caution[This tutorial costs money]
It creates two real instances. In `us-west-2`, each `t3.micro` costs $0.0104 an hour and each public IPv4 address $0.005 an hour, at the on-demand rates in the [AWS Price List API](https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_pricing_GetProducts.html) on 1 November 2026. Two of each for an hour cost about 3 cents, and their 8 GB gp3 disks, at $0.08 per GB-month, add a fraction of a cent. They keep costing money until you destroy them, so finish with [Destroy everything](#destroy-everything).
:::

## Prerequisites

- Conn3x v0.6.12 [installed](/install).
- An AWS account and the [`aws` CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html). You need to be able to create instances and security groups, and to read images and VPCs. We ran this with the `PowerUserAccess` policy.
- A default VPC in `us-west-2`. If you've deleted it, `aws ec2 create-default-vpc --region us-west-2` brings it back.
- An SSH key at `~/.ssh/id_ed25519`, with its public half at `~/.ssh/id_ed25519.pub`. Conn3x logs in with it.

## Write the configuration

Make an empty directory and save this as `main.tf`:

```hcl
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
    tls = { source = "hashicorp/tls", version = "~> 4.0" }
  }
}

variable "admin_cidr" {
  type        = string
  description = "The address allowed to reach SSH, such as 203.0.113.10/32."
}

locals {
  servers = toset(["app-1", "app-2"])
}

provider "aws" {
  region = "us-west-2"
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

resource "aws_security_group" "tutorial" {
  name        = "conn3x-tutorial"
  description = "Conn3x tutorial instances"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "ssh" {
  security_group_id = aws_security_group.tutorial.id
  cidr_ipv4         = var.admin_cidr
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.tutorial.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# Each server's SSH host key, made here and installed by cloud-init,
# so Conn3x can check it on the very first connection.
resource "tls_private_key" "host" {
  for_each  = local.servers
  algorithm = "ED25519"
}

resource "aws_instance" "app" {
  for_each                    = local.servers
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = "t3.micro"
  vpc_security_group_ids      = [aws_security_group.tutorial.id]
  associate_public_ip_address = true
  tags                        = { Name = each.key }

  metadata_options {
    http_tokens = "required"
  }

  user_data = "#cloud-config\n${yamlencode({
    ssh_deletekeys = true
    ssh_keys = {
      ed25519_private = tls_private_key.host[each.key].private_key_openssh
      ed25519_public  = tls_private_key.host[each.key].public_key_openssh
    }
    users = [{
      name                = "conn3x"
      shell               = "/bin/bash"
      sudo                = "ALL=(ALL) NOPASSWD:ALL"
      ssh_authorized_keys = [trimspace(file(pathexpand("~/.ssh/id_ed25519.pub")))]
    }]
  })}"

  # Delete the SSH rule last, so destroy can still clean up over SSH.
  depends_on = [aws_vpc_security_group_ingress_rule.ssh]

  # A newer image shouldn't replace a running server.
  lifecycle {
    ignore_changes = [ami]
  }
}

circuit "app" {
  hosts = {
    for name, i in aws_instance.app : name => {
      address  = i.public_ip
      host_key = tls_private_key.host[name].public_key_openssh
    }
  }

  ssh {
    user             = "conn3x"
    private_key_file = "~/.ssh/id_ed25519"
    become           = true
    timeout          = "5m"
  }

  step "deploy_user" {
    user {
      name  = "deploy"
      shell = "/bin/bash"
    }
  }

  step "deploy_key" {
    authorized_key {
      user = "deploy"
      key  = file("${path.module}/deploy.pub")
    }
  }
}

output "addresses" {
  value = { for name, i in aws_instance.app : name => i.public_ip }
}

output "known_hosts" {
  value = join("", [for name, i in aws_instance.app : "${i.public_ip} ${tls_private_key.host[name].public_key_openssh}"])
}
```

The configuration does five things:

- **Opens SSH to one address** with a security group of its own, in your region's default VPC. No other inbound traffic gets in.
- **Generates a host key for each instance** with the `tls` provider, and hands it to the instance through cloud-init, which removes the image's own keys.
- **Makes a `conn3x` user** with your public key and sudo. Listing a user in cloud-init replaces the image's usual `ubuntu` user, so Conn3x logs in as `conn3x` with `become = true`.
- **Builds the circuit's `hosts` from the instances.** Each host is a [host object](/reference/circuits/hosts#a-map-of-names-to-host-objects) with the instance's address and its pinned `host_key`. Conn3x accepts only that key, so even the first connection to a new instance is verified, and you don't need a `known_hosts` entry.
- **Configures each instance** with two steps: a [`user`](/modules/user) and an [`authorized_key`](/modules/authorized_key).

`timeout = "5m"` keeps Conn3x retrying while a new instance boots. There's no wait step: both times we ran this, the first connection met the pinned key.

## Set your credentials

Point the `aws` provider at your credentials. It reads the same profile as the CLI:

```sh
export AWS_PROFILE=<your profile>
```

Pass your own address to the configuration:

```sh
export TF_VAR_admin_cidr="$(curl -4 -s https://ifconfig.me)/32"
```

The `deploy` user gets the public key in `deploy.pub`, next to `main.tf`. Copy yours there, or any public key you want the account to accept:

```sh
cp ~/.ssh/id_ed25519.pub deploy.pub
```

## Initialize

```sh
conn3x init
```

`init` downloads two providers:

```text
Initializing provider plugins...
- terraform.io/builtin/conn3x is built in to Conn3x
- Finding hashicorp/tls versions matching "~> 4.0"...
- Finding hashicorp/aws versions matching "~> 6.0"...
- Installing hashicorp/aws v6.71.0...
- Installing hashicorp/tls v4.4.2...
```

Your versions may be newer. `init` writes them to `.terraform.lock.hcl`.

Check the configuration before you plan:

```sh
conn3x validate
```

```text
Success! The configuration is valid.
```

## Plan

```sh
conn3x plan
```

The plan covers the cloud and the hosts at once:

```text
  # aws_instance.app["app-1"] will be created
  # aws_instance.app["app-2"] will be created
  # aws_security_group.tutorial will be created
  # aws_vpc_security_group_egress_rule.all will be created
  # aws_vpc_security_group_ingress_rule.ssh will be created
  # conn3x_authorized_key.app__deploy_key["app-1"] will be created
  # conn3x_authorized_key.app__deploy_key["app-2"] will be created
  # conn3x_user.app__deploy_user["app-1"] will be created
  # conn3x_user.app__deploy_user["app-2"] will be created
  # tls_private_key.host["app-1"] will be created
  # tls_private_key.host["app-2"] will be created

Plan: 11 to add, 0 to change, 0 to destroy.
```

The instances don't exist yet, so each step's address and host key are unknown until apply:

```text
      + ssh {
          + become           = true
          + host             = (known after apply)
          + host_key         = (known after apply)
          + private_key_file = "~/.ssh/id_ed25519"
          + timeout          = "5m"
          + user             = "conn3x"
        }
```

## Apply

```sh
conn3x apply
```

Type `yes` when asked. It took under 30 seconds when we ran it:

```text
Apply complete! Resources: 11 added, 0 changed, 0 destroyed.
```

List the addresses:

```sh
conn3x output addresses
```

```text
{
  "app-1" = "203.0.113.10"
  "app-2" = "203.0.113.11"
}
```

The addresses on this page are examples. Yours are real, public ones.

## Check the host keys yourself

`ssh` on your machine doesn't know these instances yet. Answer `yes` at its first prompt and you've trusted whatever answered, which is the one thing Conn3x refused to do. You don't have to: the configuration made the keys, so it can tell `ssh` what to expect.

Write them to a file next to `main.tf`:

```sh
conn3x output -raw known_hosts > known_hosts
ssh-keygen -lf known_hosts
```

`ssh-keygen` prints one fingerprint for each instance:

```text
256 SHA256:oMyNAtpCLTdn+8BMnuRSWCTvNdv3V8eQKiykMsBauyE 203.0.113.10 (ED25519)
256 SHA256:r2kWztWqBNA0JJw+e2+r0xXrLGDNcylDdSaFALqawhk 203.0.113.11 (ED25519)
```

Log in as `deploy`, with `ssh` told to use only that file and to refuse any other key. Use an address from `conn3x output addresses`:

```sh
ssh -o UserKnownHostsFile=known_hosts -o StrictHostKeyChecking=yes \
  -i ~/.ssh/id_ed25519 deploy@203.0.113.10 \
  'whoami; . /etc/os-release; echo $PRETTY_NAME'
```

There's no prompt:

```text
deploy
Ubuntu 24.04.5 LTS
```

To see the check do its job, give `ssh` a key the instance doesn't hold. This makes a throwaway one and lists it for the same address:

```sh
ssh-keygen -q -t ed25519 -N '' -f wrong_key
echo "203.0.113.10 $(cat wrong_key.pub)" > wrong_known_hosts
ssh -o UserKnownHostsFile=wrong_known_hosts -o StrictHostKeyChecking=yes \
  -i ~/.ssh/id_ed25519 deploy@203.0.113.10 whoami
```

`ssh` refuses, exits with status 255 and never runs `whoami`:

```text
Offending ED25519 key in wrong_known_hosts:1
Host key for 203.0.113.10 has changed and you have requested strict checking.
Host key verification failed.
```

Remove the throwaway files:

```sh
rm -f wrong_key wrong_key.pub wrong_known_hosts
```

Run `conn3x plan` again. It reads the instances from AWS and the steps from each instance, and reports no changes:

```text
No changes. Your infrastructure matches the configuration.
```

## Remove one instance

Take `app-2` out of `local.servers` in `main.tf`:

```hcl
locals {
  servers = toset(["app-1"])
}
```

Run `conn3x plan`, then `conn3x apply`. The same plan terminates the `app-2` instance, destroys its host key, and removes its two steps. The `authorized_key` step defaults to `on_remove = "delete"`, so Conn3x deletes the deploy key from `app-2` before the instance goes. See [Removal](/reference/circuits/removal) for each module's default.

```text
Plan: 0 to add, 0 to change, 4 to destroy.
```

## Destroy everything

Destroy everything the configuration created, and type `yes`:

```sh
conn3x destroy
```

```text
Destroy complete! Resources: 7 destroyed.
```

This terminates the instances, which deletes their disks and releases their addresses, and that stops the charges. Check that nothing is left:

```sh
aws ec2 describe-instances --region us-west-2 \
  --filters Name=tag:Name,Values=app-1,app-2 Name=instance-state-name,Values=pending,running,stopping,stopped \
  --query 'Reservations[].Instances[].InstanceId'
aws ec2 describe-security-groups --region us-west-2 \
  --filters Name=group-name,Values=conn3x-tutorial \
  --query 'SecurityGroups[].GroupId'
```

Both print `[]`. The filter on state matters: terminated instances stay in AWS's listings for a while, and they cost nothing. If you already had instances named `app-1` or `app-2`, the first list shows those.

The configuration creates no key pair and no VPC, so there's neither to clean up.

The state file holds each instance's private host key, so delete it as well, with your `known_hosts` file, which no longer points at anything:

```sh
rm -f terraform.tfstate terraform.tfstate.backup known_hosts
```

For a configuration you keep, turn on [state encryption](https://opentofu.org/docs/language/state/encryption/) or store state where you'd store a secret. The private host key also sits in each instance's user data: anything running on the instance can read it, and so can anyone who can view the instance's attributes in your account.

## Next steps

- [Reach hosts through a bastion](/tutorials/bastion), for servers without a public address.
- [Create and configure a server in one plan](/guides/provision-and-configure) adds nginx and a firewall to a single server.
- [Hosts](/reference/circuits/hosts) covers building `hosts` from resources.
