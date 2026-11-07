---
title: Build an Active Directory lab on Azure
description: "One config, four Windows Server VMs: a new forest, a second domain controller, two member servers, and OUs, users and groups, with every reboot in the plan. Then check replication and tear it all down."
---

You want a domain to test against. Building one by hand means four RDP sessions, three wizards, a DNS change on every server and six reboots, and next month you'll do it all again. In this tutorial one configuration builds the whole lab on Azure: `dc1` makes a new forest, `dc2` becomes its second domain controller, `srv1` and `srv2` join as member servers, and the directory gets OUs, users and groups. You'll see every step in the plan before anything changes, reboots included.

**Time:** about 35 minutes, most of it waiting for Windows.

:::caution[This tutorial costs money]
It creates four real VMs. Four `Standard_B2s_v2` Windows VMs in `westus2`, with their disks and public addresses, cost about $0.44 an hour together. Our runs took about 27 minutes from the first apply to the deleted resource group, about 20 cents each. Left up, the lab costs about $10 a day, so finish with [Tear it down](#tear-it-down).
:::

:::note[Experimental]
Windows support in Conn3x is in preview, and every `windows_*` module this lab uses is experimental: its arguments may change between releases.
:::

## Prerequisites

- Conn3x v0.7.3 or later [installed](/install). It's the first release with the OU, group and user modules the lab needs.
- An Azure subscription and the [`az` CLI](https://learn.microsoft.com/cli/azure/install-azure-cli), signed in with `az login`. `Contributor` on the subscription is enough.
- Room for 8 vCPUs of the `Bsv2` family in `westus2`. A new pay-as-you-go subscription can start lower. Check yours:

  ```sh
  az vm list-usage -l westus2 -o table | grep -E 'Total Regional|BSv2'
  ```

- An SSH key at `~/.ssh/id_ed25519`. Conn3x logs in to every VM with it.
- `git` and `jq`.

## Get the example

The lab lives in the Conn3x repository:

```sh
git clone https://github.com/conn3xorg/conn3x.git
cd conn3x/examples/azure-ad-lab
```

`main.tf` makes the network and the four VMs, then hands them to [circuit-active-directory](/circuits/active-directory) by role:

```hcl
module "ad" {
  source = "github.com/conn3xorg/circuit-active-directory?ref=v0.1.1"

  depends_on = [azurerm_virtual_machine_extension.bootstrap]

  domain_name        = local.domain
  netbios_name       = "LAB"
  domain_controllers = { for k in local.dcs : k => local.hosts[k] }
  members            = { for k, h in local.hosts : k => h if !contains(local.dcs, k) }

  ssh_user             = "azadmin"
  ssh_private_key_file = var.admin_private_key_file
  safe_mode_password   = var.dsrm_password

  domain_admin_password = random_password.first_admin["dc1"].result

  ous = {
    Lab     = { description = "Made by Conn3x" }
    Servers = { path = "OU=Lab", description = "Member servers" }
    People  = { path = "OU=Lab" }
  }
  member_ou = "OU=Servers,OU=Lab"

  users = {
    alice = { path = "OU=People,OU=Lab", given_name = "Alice", surname = "Example", display_name = "Alice Example" }
    bob   = { path = "OU=People,OU=Lab", given_name = "Bob", surname = "Example", display_name = "Bob Example" }
  }
  user_passwords = var.user_passwords

  groups = {
    LabAdmins = { path = "OU=Lab", description = "Can manage the lab", members = ["alice"] }
    Helpdesk  = { path = "OU=Lab", description = "Resets passwords", members = ["alice", "bob"] }
  }
}
```

Three things in there are worth knowing before you run it:

- **Each host is a host object** with its public `address`, its pinned `host_key`, and a `private_ip`. The circuit points every server's DNS at the domain controllers' private addresses, which is why the VMs get fixed ones.
- **The first password does one job.** Azure makes each VM with a password, and promotion turns `dc1`'s into the domain admin's. `dc2` and the members join with it, and the last steps of `main.tf` replace it, and each member's local one, with passwords nobody knows. Key login keeps working.
- **Your passwords stay out of state.** `dsrm_password` and `user_passwords` are ephemeral variables, so they never reach the plan or the state file.

## Set your inputs

```sh
export ARM_SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
export TF_VAR_state_passphrase="$(openssl rand -hex 16)"   # keep this; state needs it
export TF_VAR_dsrm_password="a long password of your own"
export TF_VAR_user_passwords='{alice="one for alice", bob="one for bob"}'
export TF_VAR_admin_cidrs="[\"$(curl -4 -s https://ifconfig.me)/32\"]"
export TF_VAR_admin_public_key_file=~/.ssh/id_ed25519.pub
export TF_VAR_admin_private_key_file=~/.ssh/id_ed25519
```

The state holds secrets of Azure's making, such as each VM's host private key, so the example encrypts it with `state_passphrase`. Lose the passphrase and the state is gone with it. SSH is open to `admin_cidrs` only, and RDP stays closed.

## Plan

```sh
conn3x init
conn3x plan -out tfplan
```

The end of the plan lists every step on every host, 59 resources in all:

```text
  # module.ad.conn3x_windows_ad_domain_controller.domain_controllers__dc["dc2"] will be created
  # module.ad.conn3x_windows_ad_forest.forest__forest["dc1"] will be created
  # module.ad.conn3x_windows_ad_group.forest__groups["dc1/Helpdesk"] will be created
  # module.ad.conn3x_windows_ad_group.forest__groups["dc1/LabAdmins"] will be created
  # module.ad.conn3x_windows_ad_ou.forest__child_ous["dc1/People"] will be created
  # module.ad.conn3x_windows_ad_ou.forest__child_ous["dc1/Servers"] will be created
  # module.ad.conn3x_windows_ad_ou.forest__ous["dc1/Lab"] will be created
  # module.ad.conn3x_windows_ad_user.forest__users["dc1/alice"] will be created
  # module.ad.conn3x_windows_ad_user.forest__users["dc1/bob"] will be created
  # module.ad.conn3x_windows_domain_membership.domain_controllers__join["dc2"] will be created
  # module.ad.conn3x_windows_domain_membership.members__join["srv1"] will be created
  # module.ad.conn3x_windows_domain_membership.members__join["srv2"] will be created
  # module.ad.conn3x_windows_reboot.domain_controllers__joined["dc2"] will be created
  # module.ad.conn3x_windows_reboot.domain_controllers__promoted["dc2"] will be created
  # module.ad.conn3x_windows_reboot.forest__promoted["dc1"] will be created
  # module.ad.conn3x_windows_reboot.members__joined["srv1"] will be created
  # module.ad.conn3x_windows_reboot.members__joined["srv2"] will be created
...
Plan: 59 to add, 0 to change, 0 to destroy.
```

That's shortened: the DNS, feature and wait steps are in there too.

The steps read in the order they'll run. On `dc1`: AD DS, the forest, its reboot, a wait for Active Directory Web Services on port 9389, a wait for `Get-ADDomain`, then DNS, the OUs, the users and the groups. On `dc2`: AD DS, DNS, the join, a reboot, promotion, another reboot and the same two waits. On each member: DNS, the join and a reboot. Nothing's been touched yet.

## Apply

```sh
conn3x apply tfplan
```

It took 15 and a half minutes when we ran it. The VMs and their bootstrap take the first five, then the domain comes together:

```text
module.ad.conn3x_windows_feature.forest__ad_ds["dc1"]: Creation complete after 3m12s
module.ad.conn3x_windows_ad_forest.forest__forest["dc1"]: Creation complete after 1m0s
module.ad.conn3x_windows_reboot.forest__promoted["dc1"]: Creation complete after 1m12s
module.ad.conn3x_windows_powershell.forest__ad_answers["dc1"]: Creation complete after 24s
module.ad.conn3x_windows_ad_ou.forest__child_ous["dc1/Servers"]: Creation complete after 3s
module.ad.conn3x_windows_ad_user.forest__users["dc1/alice"]: Creation complete after 4s
module.ad.conn3x_windows_domain_membership.domain_controllers__join["dc2"]: Creation complete after 3s
module.ad.conn3x_windows_ad_group.forest__groups["dc1/Helpdesk"]: Creation complete after 4s
module.ad.conn3x_windows_domain_membership.members__join["srv1"]: Creation complete after 3s
module.ad.conn3x_windows_reboot.members__joined["srv1"]: Creation complete after 31s
module.ad.conn3x_windows_reboot.domain_controllers__joined["dc2"]: Creation complete after 36s
module.ad.conn3x_windows_ad_domain_controller.domain_controllers__dc["dc2"]: Creation complete after 45s
module.ad.conn3x_windows_reboot.domain_controllers__promoted["dc2"]: Creation complete after 1m14s
module.ad.conn3x_windows_powershell.domain_controllers__ad_answers["dc2"]: Creation complete after 25s
conn3x_windows_powershell.dc_password__forget_first_password["dc1"]: Creation complete after 4s
Apply complete! Resources: 59 added, 0 changed, 0 destroyed.
```

`dc2` installs AD DS while `dc1` is still making the forest, and the members join while `dc1` adds the users and groups, so the four VMs finish in about the time `dc2` takes on its own.

## Plan again

```sh
conn3x plan
```

```text
No changes. Your infrastructure matches the configuration.
```

Conn3x read every step back from every VM, domain controllers included, and found nothing to do.

## Check the domain

Log in to `dc1` and ask AD about replication. `azadmin` on a domain controller is now the domain's `LAB\azadmin`, with the same key:

```sh
ssh azadmin@$(conn3x output -json ips | jq -r .dc1) repadmin /replsummary
```

```text
Source DSA          largest delta    fails/total %%   error
 dc2                       01m:56s    0 /   5    0
Destination DSA     largest delta    fails/total %%   error
 dc1                       01m:56s    0 /   5    0
Experienced the following operational errors trying to retrieve replication information:
         110 - dc2.lab.conn3x.test
```

Five naming contexts from `dc2`, 0 failures. Run it on `dc2` and you see the same from `dc1`. Two things might surprise you. Right after promotion, `dc1` can take a few minutes to list `dc2` at all, until Windows' consistency checker builds the link; `repadmin /kcc` hurries it along. And the `110` line is `repadmin` failing to ask the *other* DC for its side. An SSH key login has no password to hand on to another server, so that's expected here and not a replication fault. Each DC's own view is the one that counts.

Now a member server's trust with the domain:

```sh
ssh azadmin@$(conn3x output -json ips | jq -r .srv1) powershell Test-ComputerSecureChannel
```

```text
True
```

And the directory, from `dc1`:

```sh
ssh azadmin@$(conn3x output -json ips | jq -r .dc1) powershell \
  "Get-ADUser -Filter * -SearchBase 'OU=Lab,DC=lab,DC=conn3x,DC=test' | Select-Object -ExpandProperty DistinguishedName; Get-ADGroupMember Helpdesk | Select-Object -ExpandProperty SamAccountName; Get-ADComputer -Filter * | Select-Object -ExpandProperty DistinguishedName"
```

```text
CN=bob,OU=People,OU=Lab,DC=lab,DC=conn3x,DC=test
CN=alice,OU=People,OU=Lab,DC=lab,DC=conn3x,DC=test
alice
bob
CN=dc1,OU=Domain Controllers,DC=lab,DC=conn3x,DC=test
CN=dc2,OU=Domain Controllers,DC=lab,DC=conn3x,DC=test
CN=srv2,OU=Servers,OU=Lab,DC=lab,DC=conn3x,DC=test
CN=srv1,OU=Servers,OU=Lab,DC=lab,DC=conn3x,DC=test
```

The users are in `People`, the member servers' computer accounts are in `Servers`, and Helpdesk has both users.

## Try drift

Take `bob` out of Helpdesk by hand:

```sh
ssh azadmin@$(conn3x output -json ips | jq -r .dc1) powershell "Remove-ADGroupMember Helpdesk bob -Confirm:\$false"
conn3x drift
```

`conn3x drift` exits 2 and names the group:

```text
Drift found in 1 resource.

Hosts
  ~ module.ad.conn3x_windows_ad_group.forest__groups["dc1/Helpdesk"]  changed

Run conn3x plan to see what Conn3x would change to put them back.
```

Below that it lists some Azure resources whose read-only fields moved, which your config wouldn't change back and which aren't drift. Run `conn3x apply`, and it changes one resource and puts bob back. The next `conn3x plan` is empty again.

## Tear it down

Delete the resource group. That's the whole lab, and nothing in it is worth keeping:

```sh
az group delete -n conn3x-ad-lab --yes
az group list -o table
```

```text
Name              Location    Status
----------------  ----------  ---------
NetworkWatcherRG  westus2     Succeeded
```

`NetworkWatcherRG` is Azure's own, made the first time you build a network in a region, and it costs nothing. `conn3x destroy` works too, but it asks each Conn3x step to forget its host first, which is slower and gets you nothing here.

Then remove the state, which still holds the hosts' private keys:

```sh
rm -f terraform.tfstate terraform.tfstate.backup tfplan
```

## What to know

- **The second plan is empty right after apply.** Hours later it may not be. Windows updates Defender on its own, and when that leaves a reboot pending, the next plan shows a DC's reboot step again. That's `only_if_pending` doing its job.
- **Removing a step doesn't undo it.** Conn3x never demotes a domain controller or takes a server out of a domain. Delete the VMs for that.
- **It's a lab.** AD's database stays on the OS disk, and both DCs share one DSRM password. For a domain you'd keep, see the [circuit's page](/circuits/active-directory) for what it doesn't do yet.

## Next steps

- [circuit-active-directory](/circuits/active-directory) lists every input, and what CI and Azure each test.
- [windows_ad_forest](/modules/windows_ad_forest) and [windows_ad_domain_controller](/modules/windows_ad_domain_controller) explain promotion, logins afterwards and the passwords.
- [Provision and configure on Azure](/tutorials/azure) is the same pattern with Linux VMs.
