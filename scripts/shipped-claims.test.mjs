// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

// Once a release ships something, no page may still call it "next".
// When a feature ships, add the phrases that announced it as future work.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SHIPPED = [
  { feature: "Windows Server preview (v0.7.0)", stale: [/Windows (?:servers?|Server) (?:comes?|is) next/i, /Windows support is coming/i, /Windows comes next/i] },
  { feature: "network-device circuits (N1)", stale: [/Then network devices\./] },
  {
    feature: "Windows domain join and more domain controllers (v0.7.2)",
    stale: [
      /\bno domain join\b/i,
      /domain join (?:isn't|is not|aren't) (?:there|here|supported|available)/i,
      /(?:can't|cannot|can not) join (?:a server to )?(?:a|the) domain/i,
      /joining (?:a server to )?a domain (?:and adding a second domain controller )?(?:isn't|aren't|is not|are not) there/i,
      /joining (?:a server to )?a domain has no module/i,
      /no module (?:adds a second domain controller|joins a (?:member )?server)/i,
      /(?:more|second|additional) domain controllers? and domain join are the work now/i,
    ],
  },
  {
    feature: "Active Directory OUs, groups and users (v0.7.3)",
    stale: [
      /no modules? for OUs, groups or users/i,
      /(?:can't|cannot|can not) manage OUs, groups or users/i,
      /OUs, groups and users (?:are|is) (?:the work|what we're building) now/i,
      /what's next is what lives inside the domain/i,
    ],
  },
  {
    feature: "import and lifecycle on host steps (v0.8.0)",
    stale: [
      /`(?:import|lifecycle)` (?:on|in) a step is new on `main`/i,
      /host steps (?:can't|cannot|can not) be imported/i,
      /(?:can't|cannot|can not) `?import`? (?:the files and packages|what) a server already has/i,
      /(?:a )?steps? (?:can't|cannot|can not) take a `?lifecycle`? block/i,
      /no `?prevent_destroy`? and no precondition/i,
      /no `?lifecycle`? (?:block )?on (?:host )?steps/i,
    ],
  },
];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(astro|md|mdx|json)$/.test(name) ? [p] : [];
  });
}

// Docs too, since the roadmap, maturity and compare pages make these claims.
const pages = [...files("apps/site/src/pages"), ...files("apps/site/src/components"), ...files("apps/docs/src/content/docs")];

test("no page calls a shipped feature future work", () => {
  const hits = [];
  for (const p of pages) {
    const text = readFileSync(p, "utf8");
    for (const { feature, stale } of SHIPPED)
      for (const re of stale) if (re.test(text)) hits.push(`${p}: ${feature} matches ${re}`);
  }
  assert.deepEqual(hits, []);
});

test("the check catches the old homepage line", () => {
  const old = "Windows servers come next, with Azure examples tested end to end. Then network devices.";
  assert.ok(SHIPPED.some(({ stale }) => stale.some((re) => re.test(old))));
});

test("the check catches the old domain join lines", () => {
  const old = [
    "Windows in Conn3x is a preview, every `windows_*` module is experimental, and domain join isn't there yet.",
    "Joining a server to a domain and adding a second domain controller aren't there yet.",
    "Joining a domain and adding a second domain controller aren't there yet.",
    "no module adds a second domain controller to a forest, or joins a member server to a domain.",
    "More domain controllers and domain join are the work now.",
    "Joining a server to a domain has no module yet, so `win_domain_membership` stays for review as well.",
    "Conn3x can't join a domain yet.",
  ];
  for (const line of old) assert.ok(SHIPPED.some(({ stale }) => stale.some((re) => re.test(line))), line);
});

test("the check catches the old OU, group and user lines", () => {
  const old = [
    "A domain can be built, joined and given more controllers, but there are no modules for OUs, groups or users in it yet, and child domains aren't tested.",
    "It can build a forest, join servers and add a domain controller, but it can't manage OUs, groups or users in the domain yet.",
    "OUs, groups and users are the work now.",
    "OUs, groups and users are what we're building now.",
    "What's next is what lives inside the domain: organizational units, groups and users.",
  ];
  for (const line of old) assert.ok(SHIPPED.some(({ stale }) => stale.some((re) => re.test(line))), line);
});

test("the check leaves a circuit that doesn't join a domain alone", () => {
  const ok = "It doesn't join an Active Directory domain or act as a domain controller.";
  assert.ok(!SHIPPED.some(({ stale }) => stale.some((re) => re.test(ok))));
});

test("the check catches the old import and lifecycle lines", () => {
  const old = [
    "`import` on a step is new on `main` and comes in the next release. v0.7.3 and earlier reject it with \"Unsupported argument in step\".",
    "`lifecycle` in a step is new on `main` and comes in the next release. v0.7.3 and earlier reject it with \"Unsupported block in step\".",
    "- Host steps can't be imported with `conn3x import` or `import` blocks.",
    "Host steps don't yet: you can't `import` the files and packages a server already has, and a step can't take a `lifecycle` block, so there's no `prevent_destroy` and no precondition.",
  ];
  for (const line of old) assert.ok(SHIPPED.some(({ stale }) => stale.some((re) => re.test(line))), line);
});
