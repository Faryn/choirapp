# PDF.js vendor source

The two minified browser artifacts in this directory are from
[`pdfjs-dist` 6.2.108](https://www.npmjs.com/package/pdfjs-dist/v/6.2.108),
licensed under Apache-2.0. They must always be updated as a matched viewer and
worker pair.

Update command (run from the repository root):

```bash
tmp_dir=$(mktemp -d)
npm pack --silent pdfjs-dist@VERSION --pack-destination "$tmp_dir"
tar -xzf "$tmp_dir"/pdfjs-dist-VERSION.tgz -C web/vendor/pdfjs --strip-components=2 \
  package/build/pdf.min.mjs package/build/pdf.worker.min.mjs
rm -rf "$tmp_dir"
```
