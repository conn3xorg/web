# conn3x.org

Source for [conn3x.org](https://conn3x.org) (`apps/site`) and
[docs.conn3x.org](https://docs.conn3x.org) (`apps/docs`, Starlight). The Conn3x
project itself lives at [conn3xorg/conn3x](https://github.com/conn3xorg/conn3x).

Both are static [Astro](https://astro.build), served from Cloudflare Workers
static assets. The pages under `apps/docs/src/content/docs/modules/` are
generated from the provider's schemas; regenerate them from a conn3x checkout
with `go run ./internal/conn3x/provider/moddoc <path-to-this-repo>/apps/docs/src/content/docs/modules`
(except `template.md`, which is written by hand).

```sh
nvm use            # Node version from .nvmrc
pnpm install
pnpm -C apps/site dev   # or apps/docs
pnpm build         # also writes dist/_headers with the CSP
pnpm test
```

## Security headers

`scripts/csp.mjs` runs after every build. It writes one site-wide
Content-Security-Policy into `dist/_headers`, allowing each inline script or
style by its hash, and fails the build if a page has an inline `style=` or
`on*=` attribute. Keep scripts and styles in files where you can. The docs pass
`--wasm` (search compiles WebAssembly) and `--style-attrs` (the theme puts
`style=` on icons); scripts stay hash-only on both sites.

## License

[MPL-2.0](LICENSE)
