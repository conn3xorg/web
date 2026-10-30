// Copyright (c) The Conn3x Authors
// SPDX-License-Identifier: MPL-2.0

import { test, expect } from "@playwright/test";

test("builds a config and greys out what conflicts", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/build");
  await page.locator('input[name=pick][value="nginx"]').check({ force: true });
  await expect(page.locator('input[name=pick][value="apache"]')).toBeDisabled();
  await expect(page.locator("[data-why='Web and proxies']")).toContainText("apache: Can't go with nginx");
  await page.locator('input[name=pick][value="grafana"]').check({ force: true });
  await page.fill("#hosts", "web1 203.0.113.10");
  await page.click("button[type=submit]");
  await expect(page.locator("#code")).toContainText('source = "github.com/conn3xorg/circuit-nginx?ref=');
  await expect(page.locator("#code")).toContainText("admin_password       = var.grafana_admin_password");
  await expect(page.locator("#tabs button")).toHaveText(["main.tf", "variables.tf", "README.md"]);
  expect(errors).toEqual([]);
});

test("never offers excluded circuits", async ({ page }) => {
  await page.goto("/build");
  for (const name of ["kubeadm", "proxmox", "microshift", "zabbix", "lastrack"]) {
    await expect(page.locator(`input[name=pick][value="${name}"]`)).toHaveCount(0);
  }
  await expect(page.locator(".later")).toContainText("kubeadm has control planes and workers");
});

test("waits for a person to accept the SQL Server licence", async ({ page }) => {
  await page.goto("/build");
  await page.locator('input[name=distro][value="ubuntu2404"]').check({ force: true });
  await page.locator('input[name=pick][value="mssql"]').check({ force: true });
  const eula = page.locator("#f-mssql-accept_eula");
  await expect(eula).not.toBeChecked();
  await expect(page.locator("#write")).toBeDisabled();
  await expect(page.locator("#f-mssql-edition option")).toHaveText(["Developer", "EnterpriseDeveloper", "StandardDeveloper", "Express"]);
  await eula.check();
  await expect(page.locator("#write")).toBeEnabled();
  await page.fill("#hosts", "db1 203.0.113.20");
  await page.click("#write");
  await expect(page.locator("#code")).toContainText("accept_eula          = true");
  await eula.uncheck();
  await expect(page.locator("#write")).toBeDisabled();
});

test("a link brings the picks back, and nothing typed", async ({ page }) => {
  await page.goto("/build");
  await page.locator('input[name=distro][value="ubuntu2404"]').check({ force: true });
  await page.locator('input[name=pick][value="nginx"]').check({ force: true });
  await page.fill("#hosts", "web1 203.0.113.10");
  await expect(page).toHaveURL(/#distro=ubuntu2404&picks=nginx$/);

  await page.goto("about:blank");
  await page.goto("/build#distro=ubuntu2404&picks=nginx,apache,mssql");
  await expect(page.locator('input[name=distro][value="ubuntu2404"]')).toBeChecked();
  await expect(page.locator('input[name=pick][value="nginx"]')).toBeChecked();
  await expect(page.locator('input[name=pick][value="apache"]')).not.toBeChecked();
  await expect(page.locator("#hosts")).toHaveValue("");
  await expect(page.locator("#f-mssql-accept_eula")).not.toBeChecked();
  await expect(page.locator("#write")).toBeDisabled();
});

test("asks for k3s hosts by role, and drops the shared list", async ({ page }) => {
  await page.goto("/build");
  await page.locator('input[name=pick][value="k3s"]').check({ force: true });
  await expect(page.locator("#hosts-field")).toBeHidden();
  await page.fill("#f-k3s-servers", "cp1 203.0.113.20\ncp2 203.0.113.21");
  await page.click("#write");
  await expect(page.locator("#errors")).toContainText("odd number");
  await page.fill("#f-k3s-servers", "cp1 203.0.113.20");
  await page.fill("#f-k3s-agents", "w1 203.0.113.21");
  await expect(page.locator("#code")).toContainText('cp1 = "203.0.113.20"');
  await expect(page.locator("#code")).not.toContainText("local.hosts");
});
