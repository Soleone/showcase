# Changelog

## [0.2.0](https://github.com/Soleone/showcase/compare/v0.1.0...v0.2.0) (2026-10-12)

### Features

* **brand:** add optional brand metadata (icon, logo, wordmark, colors) with an advice-only icon check ([0369097](https://github.com/Soleone/showcase/commit/03690977c0ad3a5ae82097026bedc6f227fd4b7d))
* **guide:** teach agents from the CLI with showcase guide, and shrink the skill to a pointer ([b7215ec](https://github.com/Soleone/showcase/commit/b7215ec9b3b10d788c1bbce665fe5803f2f18b31))
* **manage:** pick a project up with m and move it, saved to portfolio.json as you go ([7424969](https://github.com/Soleone/showcase/commit/742496931b72a3b6d74e78c83b4174df4067f215))
* **manage:** say where a project's goal comes from, and that a ceiling only lowers it ([f203725](https://github.com/Soleone/showcase/commit/f203725b04ef607121c7cee80f6b33ee7c45d2fe))
* **manage:** sort the list with s, by priority and tier first ([6c5c44b](https://github.com/Soleone/showcase/commit/6c5c44b8a056f40a74d0315127ffe9e52939f0c0))
* **review:** discover projects from folders and GitHub, and review them in manage ([5ebcfe0](https://github.com/Soleone/showcase/commit/5ebcfe0339d2024af433ca45a6d41f48f3708be4))
* **terminal:** add a theme picker that recolors the page and the terminal ([b8bd18e](https://github.com/Soleone/showcase/commit/b8bd18e0870e44b6016c4215b0dbcd54b2e81c99))

### Bug Fixes

* **demo:** ship a sample portfolio so manage has projects in the browser ([868a30c](https://github.com/Soleone/showcase/commit/868a30ceebf31866bf76dcb3f95b19ee92dc8043))
* **manage:** list a folder once when two entries reach it through a symlink ([6f31e76](https://github.com/Soleone/showcase/commit/6f31e763284fddf549cff7c195d78952c46de1f3))
* **review:** ask where projects live instead of guessing, and suggest home folders ([bb4a963](https://github.com/Soleone/showcase/commit/bb4a96336279bf7b9bcf95fd02459bcf5e480454))

## 0.1.0 (2026-10-11)

### ⚠ BREAKING CHANGES

* release locally with release-it instead of release-please
* **schema:** portfolio.json no longer accepts stage.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
* **portfolio:** portfolio.json entries use stage instead of type.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

### ci

* release locally with release-it instead of release-please ([0c6a7e9](https://github.com/Soleone/showcase/commit/0c6a7e9919bb0257aa7c710ad13648ab0b5a358e))

### Features

* browser terminal recipe, with logdig as the first ([124d38f](https://github.com/Soleone/showcase/commit/124d38f25e2d4ce57764ed9fc42311cb9cbbfc65))
* **browser-terminal:** Gilt theme, WebGL renderer, faster boot ([b74610b](https://github.com/Soleone/showcase/commit/b74610b8d84ee069993189337d6a92d8ab051dd2))
* **browser-terminal:** JetBrainsMono Nerd Font Mono ([e90e6d9](https://github.com/Soleone/showcase/commit/e90e6d9eda508ec7e77578eb7e7af7e01b3821bc))
* **capture:** record web apps and check the loop ([fca1f27](https://github.com/Soleone/showcase/commit/fca1f27294de5d7bb93bcc4f08b2c4e54ad5156a))
* **check:** --matrix shows every check against every project ([b2644e2](https://github.com/Soleone/showcase/commit/b2644e28527ba4b1e2f589b33d2211ce1f34f43d))
* collect a portfolio into feed.json ([096d974](https://github.com/Soleone/showcase/commit/096d9743555e8172065bcd8b3a4dbc5f194285e9))
* declare demo externals and their stand-ins ([1dd492c](https://github.com/Soleone/showcase/commit/1dd492c74279a6a808ba2840c22fab9456809d0e))
* grade project demoability from D to S ([4609b61](https://github.com/Soleone/showcase/commit/4609b616a75a2e83a1a156ebc38b95d5460b0d7a))
* **init:** take the live demo from README links to app hosts ([201c3f2](https://github.com/Soleone/showcase/commit/201c3f226bb8b1c022d3dd4a75d983e63eaa712c))
* **manage:** add projects that have no local folder by repo ([cc36083](https://github.com/Soleone/showcase/commit/cc360835d5b376bcd23266999e5437520b72cdfb))
* **manage:** hide the portfolio's title and repo once a showcase.json exists ([f8ace94](https://github.com/Soleone/showcase/commit/f8ace94b8d5768e609a2f8b9aa8c8496861e8326))
* **manage:** terminal UI and scriptable commands for the portfolio ([142f61b](https://github.com/Soleone/showcase/commit/142f61b7e31a5980ef561f37b0b9e659c183dfed))
* prefill media and demo commands in init ([fbc19b6](https://github.com/Soleone/showcase/commit/fbc19b64bc835e4eb6d8b177c1b5365e97505a12))
* **schema:** require a description next to the pitch ([7205b04](https://github.com/Soleone/showcase/commit/7205b04f4df123ee6586b69eef7244a1374ecc48))
* **schema:** stage moves into showcase.json as a choice ([c81cb65](https://github.com/Soleone/showcase/commit/c81cb65f824d43173262dc1e8fe2584e11a7a16d))
* showcase demos itself ([321cd5c](https://github.com/Soleone/showcase/commit/321cd5c6bc14fc6775e895a5c415d89744ba41a2))
* showcase skill for coding agents ([061e75a](https://github.com/Soleone/showcase/commit/061e75ab03c6aa1abb4c0a91a1c9a96c50ba74f3))
* **terminal:** build the browser terminal demo with showcase terminal ([256bed2](https://github.com/Soleone/showcase/commit/256bed2410866977de13cddbd84bfb07e2b4d9a8))

### Bug Fixes

* **manage:** show field descriptions in muted gray and wrap them ([a73ab68](https://github.com/Soleone/showcase/commit/a73ab68c378d02e7b687e961c1cbd3b4d717ae11))
* status badges are not hero visuals ([eea2fb8](https://github.com/Soleone/showcase/commit/eea2fb8478927fb6e957c81da07a2385fcab9119))

### Refactors

* **manage:** stop remembering a portfolio path passed once ([27788d7](https://github.com/Soleone/showcase/commit/27788d74e7b499456c1372b0cbfd971a3947b6e1))
* **portfolio:** rename the portfolio type to stage ([cce0819](https://github.com/Soleone/showcase/commit/cce0819fb906d77b9b0fe3a44f712774ba24c493))
* **recipes:** keep project recipes in their own repos ([9f2e19f](https://github.com/Soleone/showcase/commit/9f2e19fd972ceb8d9246a0e1adb8c33bc370b47c))
