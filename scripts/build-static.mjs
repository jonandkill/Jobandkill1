import { copyFile, mkdir, rm } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const output = new URL("../dist/", import.meta.url);
const publicFiles = ["index.html", "styles.css", "app.mjs", "core.mjs"];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await Promise.all(
  publicFiles.map((file) => copyFile(new URL(file, root), new URL(file, output))),
);

console.log(`Prepared ${publicFiles.length} public files in dist/`);
