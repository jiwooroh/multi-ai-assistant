import esbuild from "esbuild";
import process from "node:process";
import { builtinModules } from "node:module";
import { copyFileSync, readFileSync } from "node:fs";

// Node built-ins must stay external — they are provided by Electron on desktop
// and are simply absent on mobile (where the code paths using them are guarded).
const builtins = [...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

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
  // Obsidian evaluates main.js as CommonJS, where a native `import()` is not
  // reliably available. Lowering it to a lazy require() keeps the deferred
  // loading of child_process / pdfjs-dist working inside the plugin sandbox.
  supported: { "dynamic-import": false },
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
  plugins: [
    // pdfjs-dist uses canvas optionally — ignore it if unavailable
    {
      name: "ignore-canvas",
      setup(build) {
        build.onResolve({ filter: /^canvas$/ }, () => ({ path: "canvas", namespace: "ignore" }));
        build.onLoad({ filter: /.*/, namespace: "ignore" }, () => ({ contents: "module.exports = {}", loader: "js" }));
      },
    },
    // PDF.js ships a `loadScript()` helper that injects a <script> tag to fetch its
    // worker. This plugin always points `GlobalWorkerOptions.workerSrc` at the worker
    // file shipped in the plugin folder, so that path is never taken — strip it so the
    // released bundle contains no dynamic script injection at all.
    {
      name: "strip-pdfjs-loadscript",
      setup(build) {
        const LOAD_SCRIPT_RE = /function loadScript\(src\) \{[\s\S]*?\n\}/;
        build.onLoad({ filter: /pdfjs-dist[\\/]legacy[\\/]build[\\/]pdf\.js$/ }, (args) => {
          const source = readFileSync(args.path, "utf8");
          if (!LOAD_SCRIPT_RE.test(source)) {
            throw new Error(
              "strip-pdfjs-loadscript: loadScript() not found in pdf.js. Re-check this patch after upgrading pdfjs-dist."
            );
          }
          const contents = source.replace(
            LOAD_SCRIPT_RE,
            'function loadScript(src) {\n  return Promise.reject(new Error("Dynamic script loading is disabled; the PDF.js worker ships with the plugin."));\n}'
          );
          return { contents, loader: "js" };
        });
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
