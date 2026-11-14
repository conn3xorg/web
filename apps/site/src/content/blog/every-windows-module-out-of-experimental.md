---
title: "Every Windows module, out of experimental"
description: "All 25 of Conn3x's Windows modules now meet the readiness bar, Active Directory and Windows Update included. Here's what that bar is, and what it took to get the last three over it: a forest trust, a new tree, and a server eight months behind on updates."
date: 2026-12-10
author: James Conway
image: /media/blog/windows-out-of-experimental/card.png
imageAlt: "Social card: All 25 Windows modules, out of experimental. Below it, three rows of the readiness table: windows_ad_group yes, forest trust and GC lookup; windows_ad_domain yes, new tree and import on DCs; windows_update yes, 8 months behind and brought current."
---

"Experimental" is a polite way of saying *don't build on this yet*. It's an honest label for a new module, and it's also the reason a Windows team reads the page, nods, and goes back to what it was using. So since v0.19.0 there's one fewer reason: every one of Conn3x's 25 Windows modules is out of experimental. That includes Active Directory, local users and groups, and Windows Update.

That doesn't mean we declared victory and peeled the stickers off. Each module had to clear the same bar, in writing, and the last three took the most work, because they're the ones that change the most about a server.

## What "out of experimental" means

The bar lives in [`docs/windows-readiness.md`](https://github.com/conn3xorg/conn3x/blob/main/docs/windows-readiness.md), and a module leaves experimental only when all five points hold:

1. Its runner test passes on Windows Server 2022 and 2025 in CI.
2. A real circuit has used it, in an Azure example or test.
3. `import` works, so you can adopt what a server already has.
4. No bug labelled `windows` is open against it.
5. Its page says what it does, shows an example, and explains removal.

For you, what changes is a promise: a configuration that uses these modules keeps working across releases without its arguments shifting under it. Fifteen modules made it in v0.15.0 and twenty-two by v0.16.0. Then three were left, each with one gap we hadn't closed.

## windows_ad_group: across a forest trust

Groups could already take members from other domains in the same forest. What nobody had tried was a member from another forest, across a trust, where Active Directory stores the member as a foreign security principal instead of the account itself.

So we built two forests on Azure, `a.conn3x.test` and `b.conn3x.test`, with a two-way trust between them, and gave a group in the first a member from the second: `members = ["B\\carol"]`. The apply put her in, and the next plan was clean. When we took her out by hand, the plan put her back. When we added someone else by hand, `authoritative = true` took them out on the next apply. Along the way, `pending_changes` showed us what a cross-forest member looks like from the inside: a DN under `ForeignSecurityPrincipals`, with her SID as its name.

The same lab closed a smaller gap. Before Conn3x takes anyone out of a group its own login gets rights through, Domain Admins for example, it checks that it isn't about to remove itself. For a member whose SID the read doesn't return, that check asks the global catalog. That had never run against a real directory. A contact in Domain Admins, which has no SID at all, finally made it run.

## windows_ad_domain: a new tree, and adoption

Child domains worked, such as `emea.lab.example.com` under `lab.example.com`. What didn't exist was the other shape a growing company needs, especially after a merger: a new tree in the same forest, such as `apac.example.net` beside `lab.example.com`.

That's now one argument, `domain_type = "tree"`, plus the forest domain it joins. On a third Azure server, promotion took a minute. The forest came out listing `apac.test` with a two-way TreeRoot trust to the root, and the plan after was clean.

The module's other gap was `import`: it was unit-tested, but it had never adopted a domain on a real domain controller. So a second configuration pointed `import = true` at the child domain's controller and then the tree's. Each came back `1 imported` with a clean plan after, and naming a domain the controller isn't in was refused with an explanation instead of guessed at.

## windows_update: a server that's really behind

Every Azure VM we'd tested on was nearly current, so `windows_update` had only ever installed a Defender definition and a small platform update. Real patching looks nothing like that.

Azure keeps old images, so we booted Windows Server 2022 from the oldest one on offer, build 20348.4893 from March 2026, eight months behind. Windows itself offered four updates. The plan listed two, the November cumulative update and the October .NET cumulative update, because the module installs critical and security updates unless you ask for more, and those are exactly the two in that category. The apply installed both in 23 minutes, the `windows_reboot` step after it took six, and the next plan was empty at build 20348.5870.

## Still a preview, and why

Every module is ready. Windows as a whole keeps its preview label for now, and that's deliberate. Twenty servers in one apply have run on Azure, but a few hundred, with the slow, uneven reboots real fleets have, haven't. That's the work now, and Windows comes out of preview when it's done, not before.

If you run Windows Server, now's a good time to try it. The [Active Directory lab tutorial](https://docs.conn3x.org/tutorials/active-directory-lab) builds a whole domain from one configuration, reboots and all, and tells you what it costs. If something doesn't behave the way the module page says, that's a bug we want: [open an issue](https://github.com/conn3xorg/conn3x/issues/new/choose).
