# libzim (WebAssembly) — vendored, unmodified

Kiwix's ZIM reader, compiled to WebAssembly, that chrome-chat runs in a Web Worker to read a visitor's own `.zim` file inside the page (`/wiki:offline`). It's loaded only when a file is connected.

- **Project:** [openzim/javascript-libzim](https://github.com/openzim/javascript-libzim), release **v0.95** (2026-08-06)
- **Source for these exact files:** https://github.com/openzim/javascript-libzim/releases/tag/v0.95 (built from [libzim](https://github.com/openzim/libzim), which is GPLv2-or-later)
- **Licence:** GPL-3.0 — see [LICENSE](LICENSE)
- **Files, unmodified from `libzim_wasm_0.95.zip`** (sha256 `896e4eab4986670ae9c0858312fa5225436e3498990c45df752e0be46eb4fe3d`):
  - `libzim-wasm.js` (Web Worker glue) — sha256 `132bf25528a97dbeae4b33b925062c45aff3d9eb0f8ff3b3a9f3dc85a5f4ceb8`
  - `libzim-wasm.wasm` — sha256 `2c30977782b682b84a73445cb8d5b27996ee2b401f508c75b4d6b950956ccbd8`

To update: download the release zip, check its hashes, replace both files, update this README, and re-run `eval/offline-parity.html`.
