import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  external: ["vscode"],
  outfile: "dist/extension.js",
  sourcemap: true,
  target: "node20",
  logLevel: "info"
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("ata-credits extension watching");
} else {
  await build(options);
}
