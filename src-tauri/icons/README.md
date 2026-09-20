# Icons

`tauri.conf.json` references `32x32.png`, `128x128.png`, `128x128@2x.png`,
`icon.icns` and `icon.ico`. They are **generated**, not hand-drawn, so they are not
committed until the first release build:

```bash
# from the repository root, with @tauri-apps/cli installed
npm run tauri icon web/public/logo.svg
```

That writes every size and the platform bundles into this directory.

If `web/public/logo.svg` does not exist yet, either add the source SVG or point the
command at any square source image at least 1024×1024. A missing icon is a build
failure in `tauri build`, and `npm run desktop:verify` reports the icon list but
cannot generate the files — it has no image tooling and no Rust toolchain.
