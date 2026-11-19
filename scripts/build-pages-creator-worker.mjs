import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const destination = process.argv[2];
if (!destination) throw new Error("Pass the output Worker module path.");
const result = await build({
  absWorkingDir: root, entryPoints: ["server/pages-creator-worker.mjs"], outfile: resolve(destination),
  bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true, metafile: true,
  plugins: [{
    name: "exclude-unused-node-io",
    setup(builder) {
      // Node HTTPS, DNS and hashing belong to other web shopping entry points.
      builder.onResolve({ filter: /^node:/ }, args => ({ path: args.path, external: true, sideEffects: false }));
    },
  }],
});
const external = Object.values(result.metafile.outputs).flatMap(output => output.imports).filter(item => item.external);
if (external.length) throw new Error("The edge worker depends on an external module: " + external[0].path);
