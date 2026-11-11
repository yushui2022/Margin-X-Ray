import { build, context } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { watch } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const isWatch = process.argv.includes("--watch");

const ENTRIES = [
  {
    entryPoints: [join(root, "src/background/index.ts")],
    outfile: join(dist, "background.js"),
    format: "iife",
  },
  {
    entryPoints: [join(root, "src/content/index.ts")],
    outfile: join(dist, "content.js"),
    format: "iife",
  },
  {
    entryPoints: [join(root, "src/popup/popup.ts")],
    outfile: join(dist, "popup.js"),
    format: "iife",
  },
  {
    entryPoints: [join(root, "src/options/options.ts")],
    outfile: join(dist, "options.js"),
    format: "iife",
  },
  {
    entryPoints: [join(root, "src/demo/demo.ts")],
    outfile: join(dist, "demo/demo.js"),
    format: "iife",
  },
];

const buildOptions = {
  bundle: true,
  platform: "browser",
  target: ["chrome114"],
  sourcemap: true,
  legalComments: "none",
  charset: "utf8",
  loader: {
    ".css": "text",
  },
  logLevel: "info",
};

async function copyStatic() {
  await mkdir(dist, { recursive: true });

  await cp(join(root, "manifest.json"), join(dist, "manifest.json"));

  const staticFiles = [
    ["src/popup/popup.html", "popup.html"],
    ["src/popup/popup.css", "popup.css"],
    ["src/options/options.html", "options.html"],
    ["src/options/options.css", "options.css"],
    ["src/demo/index.html", "demo/index.html"],
    ["src/demo/demo.css", "demo/demo.css"],
  ];

  for (const [from, to] of staticFiles) {
    await mkdir(dirname(join(dist, to)), { recursive: true });
    await cp(join(root, from), join(dist, to));
  }

  try {
    await cp(join(root, "assets"), join(dist, "assets"), { recursive: true });
  } catch {
    // Icons are optional during early development.
  }
}

async function runBuild() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  if (isWatch) {
    const contexts = await Promise.all(
      ENTRIES.map((entry) =>
        context({
          ...buildOptions,
          entryPoints: entry.entryPoints,
          outfile: entry.outfile,
          format: entry.format,
        }),
      ),
    );
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    await copyStatic();
    console.log("\nWatching src/, manifest.json and assets/…\n");

    let timer;
    const scheduleCopy = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void copyStatic().catch((error) => console.error(error));
      }, 120);
    };
    watch(join(root, "src"), { recursive: true }, scheduleCopy);
    watch(join(root, "manifest.json"), scheduleCopy);
    watch(join(root, "assets"), { recursive: true }, scheduleCopy);
    return;
  }

  await Promise.all(
    ENTRIES.map((entry) =>
      build({
        ...buildOptions,
        entryPoints: entry.entryPoints,
        outfile: entry.outfile,
        format: entry.format,
      }),
    ),
  );
  await copyStatic();
  console.log("\nBuilt extension to dist/\n");
}

runBuild().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
