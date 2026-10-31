# Fontkit license provenance

This audit covers the **actual served UMD build** of `@pdf-lib/fontkit@1.1.1`.
The complete collected notices are in [NOTICES.txt](NOTICES.txt). They include
MIT, BSD-3-Clause, ISC, Zlib, and the Apache-2.0 text used by retained Google
Brotli decoder headers. Third-party code remains under its respective terms.

## Verification performed

- Downloaded the exact official npm tarball and verified both UMD files against
  the copies in this repository, byte for byte. The tarball SHA-256 is
  `6dd0ae9209fce419b2ed76c97166863167b4df56d75fbe3c7f1d1e6e49c85867`.
- Rebuilt official `Hopding/fontkit` commit
  `72b8e42bd6a398d496a63a6d483eabeed43861fb` using its frozen `yarn.lock`,
  Yarn 1.22.22, and Node v24.22.1, without running dependency install scripts.
- The unminified rebuild is **byte-for-byte identical** to the published
  1,506,282-byte npm UMD build, despite that source checkout's package.json
  still reporting version 1.1.0. The published artifact is the authority for
  the runtime version, rather than inferring that version from the checkout.
- A Rollup audit plugin records modules that actually contributed rendered
  bytes. Their nearest package metadata yields **32 dependency/version records**,
  including both embedded versions of base64-js and tiny-inflate. This list was
  independently derived from the build, not accepted from a third-party list.
- Each record preserves the exact package.json, complete upstream license files
  applying to its rendered files, and license/copyright comments from those
  source files. The original archive's SHA-512 integrity or SHA-1 was verified
  against Yarn's locked download metadata. `provenance.json` records origins,
  hashes, versions, license declarations, and rendered source paths.
- Runtime bundles were not modified. The original unminified distribution and
  README remain alongside these notices.

## Reading the notices

Package author and contributor fields are labeled as metadata credits. They
are not converted into invented copyright statements. Unmodified upstream
license files and source notices are copied verbatim. For packages declaring
MIT or ISC but publishing no standalone license file, the corresponding full
standard text is provided separately and in NOTICES.txt, with the missing-file
condition recorded. A generic standard text is not represented as an upstream
copyright notice.

The `@pdf-lib/brotli` wrapper declares MIT, while its rendered decoder sources
retain Google's 2013 Apache-2.0 notices. Both are preserved. Pako carries MIT
and Zlib: its MIT file and the full original Zlib source notice are retained.
Node built-in shims include Joyent/Node MIT notices in addition to the plugin's
ISC declaration. Fonts are outside this inventory.

## Upstream limitations

The fontkit package itself and several dependency versions do not publish a
standalone license/copyright notice. The audit preserves all available direct
metadata and notices without claiming to supply a missing historical statement
from upstream. In particular, the fork/wrapper authorship in
`@pdf-lib/restructure` and `@pdf-lib/brotli`, historical `dfa` and global-selector
notices, and source history of some iconv-lite generated encoding tables are
not independently settled by a package-level MIT declaration. The exact
upstream grants and original distribution are retained; this is a reproducible
notice inventory, not a legal opinion or a guarantee of a complete historical
provenance chain. No additional restrictive license was identified in this audit.

## Reproduce

Use a temporary directory outside the QFT PDF repository. These commands do not
install anything into the application or change its deployed libraries.

```sh
git clone https://github.com/Hopding/fontkit.git fontkit-audit
cd fontkit-audit
git checkout 72b8e42bd6a398d496a63a6d483eabeed43861fb
npx --yes yarn@1.22.22 install --frozen-lockfile --ignore-scripts --non-interactive
MODULE_TYPE=commonjs node node_modules/@babel/node/bin/babel-node.js src/opentype/shapers/generate-data.js
MODULE_TYPE=commonjs node node_modules/@babel/node/bin/babel-node.js src/opentype/shapers/gen-use.js
MODULE_TYPE=commonjs node node_modules/@babel/node/bin/babel-node.js src/opentype/shapers/gen-indic.js
```

Copy QFT PDF's `scripts/fontkit-rollup-audit.config.js` into that temporary
checkout as `rollup.audit.config.js`, then run:

```sh
MODULE_TYPE=umd node node_modules/rollup/dist/bin/rollup -c rollup.audit.config.js -o fontkit.audit.umd.js
npm pack @pdf-lib/fontkit@1.1.1 --ignore-scripts
npx --yes yarn@1.22.22 cache dir
```

From the QFT PDF checkout, run `scripts/collect-fontkit-notices.py` with
`--upstream-root` set to the temporary source checkout, `--module-report` to
its `audit-modules.json`, `--tarball` to the downloaded fontkit1.1.1 archive,
and `--yarn-cache` to the cache directory printed above. The script asserts
bundle equality and archive integrity before writing notices.

## Rendered dependencies

| Package | Version | Declared license | Upstream license file |
| --- | --- | --- | --- |
| @pdf-lib/brotli | 0.0.0 | MIT | No; declaration and source notices retained |
| @pdf-lib/restructure | 0.0.1 | MIT | No; declaration and source notices retained |
| @pdf-lib/unicode-properties | 0.0.1 | MIT | Yes |
| base64-arraybuffer | 0.1.5 | MIT | Yes |
| base64-js | 1.3.0 | MIT | Yes |
| base64-js | 1.3.1 | MIT | Yes |
| buffer | 5.6.0 | MIT | Yes |
| clone | 1.0.4 | MIT | Yes |
| deep-equal | 1.1.1 | MIT | Yes |
| define-properties | 1.1.3 | MIT | Yes |
| dfa | 1.2.0 | MIT | No; declaration and source notices retained |
| es-abstract | 1.17.5 | MIT | Yes |
| function-bind | 1.1.1 | MIT | Yes |
| has | 1.0.3 | MIT | Yes |
| has-symbols | 1.0.1 | MIT | Yes |
| iconv-lite | 0.4.24 | MIT | Yes |
| ieee754 | 1.1.13 | BSD-3-Clause | Yes |
| is-arguments | 1.0.4 | MIT | Yes |
| is-date-object | 1.0.2 | MIT | Yes |
| is-regex | 1.0.5 | MIT | Yes |
| object-is | 1.1.2 | MIT | Yes |
| object-keys | 1.1.1 | MIT | Yes |
| pako | 1.0.11 | (MIT AND Zlib) | Yes |
| process-es6 | 0.11.6 | MIT | Yes |
| regexp.prototype.flags | 1.3.0 | MIT | Yes |
| rollup-plugin-node-builtins | 2.1.2 | ISC | No; declaration and source notices retained |
| rollup-plugin-node-globals | 1.4.0 | MIT | No; declaration and source notices retained |
| safer-buffer | 2.1.2 | MIT | Yes |
| string_decoder | 0.10.31 | MIT | Yes |
| tiny-inflate | 1.0.2 | MIT | No; declaration and source notices retained |
| tiny-inflate | 1.0.3 | MIT | Yes |
| unicode-trie | 0.3.1 | MIT | No; declaration and source notices retained |
