---
title: template
description: "A file rendered from a template on your machine, then written to the host."
---

A file whose content is rendered from a template with Terraform's `templatefile` syntax, `${var}` and `%{ if }`. It renders on your machine, so only the finished file travels to the host, and the plan shows the diff of the rendered result.

```hcl
step "config" {
  template {
    source      = "${path.module}/nginx.conf.tftpl"
    destination = "/etc/nginx/nginx.conf"
    vars        = { server_name = each.key }
  }
}
```

## Arguments

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `source` | string | Yes | Path to the template file. |
| `destination` | string | Yes | Absolute path of the file on the host. |
| `vars` | map | No | Values the template can use. |
| `mode` | string | No | Four octal digits, such as `"0644"`. |
| `owner` | string | No | Owner of the file. |
| `group` | string | No | Group of the file. |
| `on_remove` | string | No | `"forget"` (default) leaves the file, `"delete"` removes it. |

A template step is a [file](/modules/file) step whose content is `templatefile(source, vars)`, so it becomes a `conn3x_file` resource.
