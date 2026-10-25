variable "hosts" {
  default = {
    app-0 = { address = "127.0.0.1", port = 2221 }
    app-1 = { address = "127.0.0.1", port = 2222 }
  }
}

circuit "app" {
  hosts = var.hosts

  ssh {
    user             = "root"
    private_key_file = "./id_ed25519"
    known_hosts_file = "./known_hosts"
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
      key  = file("./deploy.pub")
    }
  }
}
