import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import type { AddressInfo } from "net";
import { createServer } from "../src/server";
import { ExplorerData, HotspotReport } from "../src/model";

const FIXTURE = path.join(__dirname, "..", "fixtures", "basic-react-app");

async function withServer<T>(uiDir: string | undefined, fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = createServer(FIXTURE, uiDir);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("GET /api/explorer-data returns the ExplorerData shape for the fixture", async () => {
  await withServer(undefined, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/explorer-data`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/json");

    const data = (await res.json()) as ExplorerData;
    assert.equal(data.projectName, "basic-react-app");
    assert.equal(data.files.length, 15);
    assert.ok(Array.isArray(data.edges));
    assert.ok(data.edges.length > 0);
  });
});

test("GET /api/hotspots returns the HotspotReport shape for the fixture", async () => {
  await withServer(undefined, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/hotspots`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/json");

    const data = (await res.json()) as HotspotReport;
    assert.equal(data.projectName, "basic-react-app");
    assert.ok(data.hotspots.length > 0);
    assert.equal(data.cycles.length, 2);
    assert.ok(data.modules.length > 0);
  });
});

test("with no UI build present, static requests respond 500 with a clear message instead of hanging or crashing", async () => {
  // A path guaranteed not to exist — passing `undefined` here wouldn't reliably test this, since a
  // parameter explicitly passed as `undefined` still triggers createServer's default (the real,
  // auto-detected uiDir), which may legitimately exist in this environment after `npm run build`.
  const missingUiDir = path.join(os.tmpdir(), "codeatlas-no-such-ui-dir-" + Date.now());
  await withServer(missingUiDir, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 500);
    assert.match(await res.text(), /npm run build/);
  });
});

test("static serving: known asset extensions serve with the correct content-type", async () => {
  const uiDir = fs.mkdtempSync(path.join(os.tmpdir(), "codeatlas-ui-test-"));
  fs.writeFileSync(path.join(uiDir, "index.html"), "<html><body>Explorer</body></html>");
  fs.writeFileSync(path.join(uiDir, "style.css"), "body { margin: 0; }");

  await withServer(uiDir, async (baseUrl) => {
    const htmlRes = await fetch(`${baseUrl}/index.html`);
    assert.equal(htmlRes.status, 200);
    assert.match(htmlRes.headers.get("content-type") ?? "", /text\/html/);
    assert.match(await htmlRes.text(), /Explorer/);

    const cssRes = await fetch(`${baseUrl}/style.css`);
    assert.equal(cssRes.status, 200);
    assert.match(cssRes.headers.get("content-type") ?? "", /text\/css/);
  });
});

test("static serving: an extensionless route falls back to index.html (SPA routing)", async () => {
  const uiDir = fs.mkdtempSync(path.join(os.tmpdir(), "codeatlas-ui-test-"));
  fs.writeFileSync(path.join(uiDir, "index.html"), "<html><body>Explorer shell</body></html>");

  await withServer(uiDir, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/some/client/route`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Explorer shell/);
  });
});

test("static serving: a missing asset with a real extension 404s rather than falling back", async () => {
  const uiDir = fs.mkdtempSync(path.join(os.tmpdir(), "codeatlas-ui-test-"));
  fs.writeFileSync(path.join(uiDir, "index.html"), "<html></html>");

  await withServer(uiDir, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/missing.js`);
    assert.equal(res.status, 404);
  });
});

test("static serving: a malformed percent-encoded path doesn't crash the server", async () => {
  const uiDir = fs.mkdtempSync(path.join(os.tmpdir(), "codeatlas-ui-test-"));
  fs.writeFileSync(path.join(uiDir, "index.html"), "<html><body>shell</body></html>");

  await withServer(uiDir, async (baseUrl) => {
    // decodeURIComponent throws URIError on a stray "%" — must not propagate as an uncaught
    // exception in the request handler (which would kill the whole --serve process).
    const malformed = await fetch(`${baseUrl}/%`);
    assert.equal(malformed.status, 200); // extensionless -> SPA fallback, same as any other unresolvable path

    const malformedWithExtension = await fetch(`${baseUrl}/%.js`);
    assert.equal(malformedWithExtension.status, 404); // looks like a missing asset, not a route

    // The server must still be responsive afterward.
    const stillAlive = await fetch(`${baseUrl}/index.html`);
    assert.equal(stillAlive.status, 200);
  });
});
