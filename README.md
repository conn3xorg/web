# conn3x.org

Source for [conn3x.org](https://conn3x.org). The Conn3x project itself lives at
[conn3xorg/conn3x](https://github.com/conn3xorg/conn3x).

The site is static [Astro](https://astro.build), served from Cloudflare
Workers static assets.

```sh
nvm use            # Node version from .nvmrc
pnpm install
pnpm -C apps/site dev
pnpm build         # also writes dist/_headers with the CSP
pnpm test
```

## Security headers

`scripts/csp.mjs` runs after every build. It writes one site-wide
Content-Security-Policy into `dist/_headers`, allowing each inline script or
style by its hash, and fails the build if a page has an inline `style=` or
`on*=` attribute. Keep scripts and styles in files where you can.

## License

[MPL-2.0](LICENSE)
