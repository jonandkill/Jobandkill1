import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [html, app, css, packageJson, server] = await Promise.all([
  readFile(new URL("index.html", root), "utf-8"),
  readFile(new URL("app.mjs", root), "utf-8"),
  readFile(new URL("styles.css", root), "utf-8"),
  readFile(new URL("package.json", root), "utf-8"),
  readFile(new URL("scripts/serve.mjs", root), "utf-8"),
]);

test("document has one instance of every id", () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
});

test("static JavaScript id selectors resolve to document elements", () => {
  const selectors = [...app.matchAll(/querySelector\("#([a-z0-9-]+)"\)/giu)].map((match) => match[1]);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]));
  const missing = [...new Set(selectors)].filter((selector) => !ids.has(selector));
  assert.deepEqual(missing, []);
});

test("keyword generation is the default form action", () => {
  assert.match(html, /name="compositionMode" value="generate" checked/gu);
  assert.match(html, /id="compose-label">키워드로 본문 생성/gu);
  assert.match(html, /id="form-error"[^>]*role="alert"/gu);
  assert.match(html, /name="primaryKeyword" required/gu);
  assert.equal(/name="topic"[^>]*required/gu.test(html), false);
  assert.equal(/name="draft"[^>]*required/gu.test(html), false);
  assert.match(app, /createKeywordDraft\(rawInput\)/gu);
  assert.match(app, /resultState\.scrollIntoView/gu);
});

test("every explicit label target exists", () => {
  const targets = [...html.matchAll(/<label\s+for="([^"]+)"/gu)].map((match) => match[1]);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]));
  assert.deepEqual(targets.filter((target) => !ids.has(target)), []);
});

test("interactive controls have touch-sized mobile rules and focus styles", () => {
  assert.match(css, /min-height:\s*44px/gu);
  assert.match(css, /:focus-visible/gu);
  assert.match(css, /@media \(max-width: 420px\)/gu);
  assert.match(css, /@media \(max-width: 768px\)/gu);
  assert.match(css, /@media \(max-width: 1120px\)/gu);
  assert.match(css, /prefers-reduced-motion/gu);
});

test("runtime has no browser automation dependencies", () => {
  const manifest = JSON.parse(packageJson);
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.devDependencies, undefined);
  const runtime = `${app}\n${server}`.toLocaleLowerCase("en-US");
  for (const forbidden of ["selenium", "puppeteer", "playwright", "pyautogui", "webdriver", "randomdelay"]) {
    assert.equal(runtime.includes(forbidden), false, `found forbidden runtime token: ${forbidden}`);
  }
});

test("publishing is gated by four explicit human checks", () => {
  const checks = [...html.matchAll(/data-final-check/gu)];
  assert.equal(checks.length, 4);
  assert.match(html, /id="open-naver"[^>]*disabled/gu);
  assert.match(app, /openNaverButton\.disabled = !ready/gu);
  assert.match(app, /window\.open\("https:\/\/blog\.naver\.com\/"/gu);
  assert.equal(/자동\s*발행/u.test(html), false);
});

test("publish-ready tools and local queue are connected", () => {
  for (const id of [
    "title-candidates",
    "copy-rich",
    "image-plan",
    "copy-image-plan",
    "queue-add",
    "queue-schedule",
    "post-queue",
    "queue-export",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`, "u"));
  }
  assert.match(app, /createPublishPackage/gu);
  assert.match(app, /createQueueRecord/gu);
  assert.match(app, /ClipboardItem/gu);
  assert.match(app, /localStorage\.setItem\(QUEUE_STORAGE_KEY/gu);
});

test("responsive layouts cover phone, tablet, and desktop breakpoints", () => {
  assert.match(css, /grid-template-columns:\s*repeat\(5,/gu);
  assert.match(css, /@media \(max-width: 1120px\)/gu);
  assert.match(css, /@media \(max-width: 768px\)/gu);
  assert.match(css, /@media \(max-width: 420px\)/gu);
  assert.match(css, /\.image-plan\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,/gu);
});

test("local server blocks external connections and frames", () => {
  assert.match(server, /connect-src 'none'/gu);
  assert.match(server, /frame-src 'none'/gu);
  assert.match(server, /object-src 'none'/gu);
  assert.match(server, /listen\(port, "127\.0\.0\.1"/gu);
});
