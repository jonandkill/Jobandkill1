import { copyFile, mkdir, rm } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const output = new URL("../dist/", import.meta.url);
const publicFiles = [
  "index.html",
  "styles.css",
  "app.mjs",
  "core.mjs",
  "experience-diagnosis.html",
  "experience-diagnosis.css",
  "experience-diagnosis.mjs",
  "assets/experience-diagnosis-hero-v2.webp",
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await Promise.all(
  publicFiles.map(async (file) => {
    const destination = new URL(file, output);
    await mkdir(new URL(".", destination), { recursive: true });
    await copyFile(new URL(file, root), destination);
  }),
);

console.log(`Prepared ${publicFiles.length} public files in dist/`);
