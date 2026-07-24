import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { copyFileSync } from "fs";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
  // pdfjs-dist uses canvas optionally — ignore it if unavailable
  plugins: [
    {
      name: "ignore-canvas",
      setup(build) {
        build.onResolve({ filter: /^canvas$/ }, () => ({ path: "canvas", namespace: "ignore" }));
        build.onLoad({ filter: /.*/, namespace: "ignore" }, () => ({ contents: "module.exports = {}", loader: "js" }));
      },
    },
  ],
});

// Always keep the PDF.js worker file in sync
copyFileSync(
  "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.js",
  "pdf.worker.min.js"
);

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
