# Apply clip

`apply.tape` records `apps/site/public/media/blog/why-conn3x/apply.mp4` with
[VHS](https://github.com/charmbracelet/vhs), using conn3x v0.2.2 against two
local Rocky Linux 10 containers (the e2e image from `conn3xorg/conn3x`,
`test/images/rocky10`).

1. Start two hosts on ports 2221 and 2222, install a fresh `id_ed25519.pub`
   as root's `authorized_keys` (`podman exec -i`), and write `known_hosts`
   with `ssh-keyscan -p 2221 127.0.0.1` and `-p 2222`.
2. Create `deploy.pub` (`ssh-keygen -t ed25519 -C deploy -f deploy`), copy
   `main.tf` beside it and run `conn3x init`.
3. Run `vhs apply.tape`, then encode for the web:

```sh
ffmpeg -i apply.mp4 -an -c:v libx264 -pix_fmt yuv420p -crf 24 -preset slow -movflags +faststart out.mp4
ffmpeg -ss 9.6 -i apply.mp4 -frames:v 1 poster.png && cwebp -q 85 poster.png -o apply.webp
```
