---
title: EOS device facts
description: "Read an Arista EOS switch's model, version and serial at plan time, with the conn3x_eos_device data source. Experimental, since v0.9.0."
---

:::note
`conn3x_eos_device` is in Conn3x since v0.9.0. Earlier releases don't have it.
:::

Experimental. `conn3x_eos_device` reads facts about an Arista EOS switch over SSH when you plan, from `show version` and `show hostname`, so a circuit can refuse a switch it wasn't written for.

```hcl
data "conn3x_eos_device" "leaf1" {
  ssh {
    host             = "10.0.0.11"
    user             = "ops"
    private_key_file = "~/.ssh/id_ed25519"
  }
}

output "leaf1_version" {
  value = data.conn3x_eos_device.leaf1.version
}
```

It takes the same `ssh` block as a circuit, with `host` set to the switch's address, and checks the host key the same way. The login has to start privileged; see [The login](/network-devices#the-login).

## Attributes

| Name | Type | Description |
| --- | --- | --- |
| `hostname` | string | The switch's hostname. |
| `model` | string | The model, such as `DCS-7050SX3-48YC8`, or `cEOSLab`. |
| `version` | string | The EOS version as `show version` prints it, such as `4.37.0F`. |
| `serial` | string | The serial number. cEOS-lab reports a made-up one. |
| `system_mac` | string | The system MAC address. |

See [Network devices](/network-devices) for the `eos_*` modules and how they change a switch.
