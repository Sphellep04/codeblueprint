import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { Project } from "ts-morph";
import { runGraphAnalysis } from "../src/orchestrator";
import { buildFileEdges, buildSymbolTable, buildUsageEdges, buildImportEdges } from "../src/codeGraph";
import { CodeGraph } from "../src/model";

const FIXTURE = path.join(__dirname, "..", "fixtures", "basic-react-app");

function basename(p: string): string {
  return path.basename(p);
}

function symbolLabel(graph: CodeGraph, id: string): string {
  const symbol = graph.symbols.find((s) => s.id === id);
  assert.ok(symbol, `no symbol registered for id ${id}`);
  return `${basename(symbol!.filePath)}#${symbol!.name}`;
}

function hasUsage(graph: CodeGraph, kind: "calls" | "renders", fromLabel: string, toLabel: string): boolean {
  return graph.usages.some((u) => symbolLabel(graph, u.from) === fromLabel && symbolLabel(graph, u.to) === toLabel && u.kind === kind);
}

let cached: CodeGraph | undefined;
function graph(): CodeGraph {
  if (!cached) cached = runGraphAnalysis(FIXTURE);
  return cached;
}

test("buildFileEdges: import vs re-export are kind-tagged correctly", () => {
  const g = graph();
  const bToA = g.files.find((e) => basename(e.from) === "b.ts" && basename(e.to) === "a.ts");
  const appToHeader = g.files.find((e) => basename(e.from) === "App.tsx" && basename(e.to) === "Header.tsx");
  assert.equal(bToA?.kind, "reExport");
  assert.equal(appToHeader?.kind, "import");
});

test("buildFileEdges: drops an edge whose target isn't in the given sourceFiles list", () => {
  // isInternalDependency only checks that a resolved import target is within rootAbs — it doesn't
  // know about files scanner.ts excludes afterward (e.g. gitignored files that are still resolvable
  // via TS module resolution because they exist on disk). buildFileEdges must not emit an edge to
  // such a file, since every consumer (the Explorer's Cytoscape graph, notably) assumes every
  // edge's "to" is one of the nodes it already has — Cytoscape throws synchronously otherwise.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codeblueprint-dangling-edge-"));
  const rootAbs = path.resolve(dir);
  fs.writeFileSync(path.join(dir, "a.ts"), `import { b } from "./b";\nb();\n`);
  fs.writeFileSync(path.join(dir, "b.ts"), `export function b() {}\n`);

  const project = new Project();
  const aFile = project.addSourceFileAtPath(path.join(dir, "a.ts"));
  project.addSourceFileAtPath(path.join(dir, "b.ts")); // resolvable, but deliberately not "known"

  const edges = buildFileEdges([aFile], rootAbs);
  assert.deepEqual(edges, []);
});

test("buildSymbolTable: a class expression bound to a variable registers as a resolvable 'class' symbol", () => {
  const project = new Project();
  const sf = project.createSourceFile("Widget.ts", `export const Widget = class {\n  render() {}\n};\n`);
  const table = buildSymbolTable([sf]);
  const widget = table.symbols.find((s) => s.name === "Widget");
  assert.ok(widget);
  assert.equal(widget!.kind, "class");
  assert.equal(widget!.exported, true);
});

test("buildSymbolTable: a class expression extending React.Component is classified as 'component', not 'class'", () => {
  const project = new Project();
  const sf = project.createSourceFile(
    "Widget.tsx",
    `import React from "react";\nexport const Widget = class extends React.Component {\n  render() { return null; }\n};\n`
  );
  const table = buildSymbolTable([sf]);
  const widget = table.symbols.find((s) => s.name === "Widget");
  assert.ok(widget);
  assert.equal(widget!.kind, "component");
});

test("buildSymbolTable: Header is an exported component symbol", () => {
  const g = graph();
  const header = g.symbols.find((s) => basename(s.filePath) === "Header.tsx" && s.name === "Header");
  assert.ok(header);
  assert.equal(header!.kind, "component");
  assert.equal(header!.exported, true);
});

test("buildSymbolTable: named-but-default-exported declarations (App, ClassComp) are exported under name 'default'", () => {
  const g = graph();
  const app = g.symbols.find((s) => basename(s.filePath) === "App.tsx" && s.name === "App");
  const classComp = g.symbols.find((s) => basename(s.filePath) === "ClassComp.tsx" && s.name === "ClassComp");
  assert.equal(app?.exported, true);
  assert.equal(classComp?.exported, true);
});

test("buildImportEdges: App.tsx's default import resolves to App's own default export, not just named exports", () => {
  const g = graph();
  const appImportsClassComp = g.imports.some(
    (e) => basename(e.file) === "index.tsx" && symbolLabel(g, e.symbol) === "App.tsx#App"
  );
  assert.equal(appImportsClassComp, true);
});

test("buildImportEdges: App.tsx resolves named + default imports to their target symbols", () => {
  const g = graph();
  const fromApp = g.imports.filter((e) => basename(e.file) === "App.tsx").map((e) => symbolLabel(g, e.symbol));
  assert.deepEqual(
    fromApp.sort(),
    ["AnonComponent.tsx#default", "Header.tsx#Header", "MemoBadge.tsx#MemoBadge", "helpers.ts#formatTitle"].sort()
  );
});

test("buildUsageEdges positive: App renders Header, MemoBadge, and AnonComponent", () => {
  const g = graph();
  assert.equal(hasUsage(g, "renders", "App.tsx#App", "Header.tsx#Header"), true);
  assert.equal(hasUsage(g, "renders", "App.tsx#App", "MemoBadge.tsx#MemoBadge"), true);
  assert.equal(hasUsage(g, "renders", "App.tsx#App", "AnonComponent.tsx#default"), true);
});

test("buildUsageEdges positive: cross-file calls, including inside a cycle", () => {
  const g = graph();
  assert.equal(hasUsage(g, "calls", "a.ts#a", "b.ts#b"), true);
  assert.equal(hasUsage(g, "calls", "Header.tsx#Header", "helpers.ts#isTitleValid"), true);
});

test("buildUsageEdges positive: a component called directly as a function is still a 'calls' edge", () => {
  const g = graph();
  assert.equal(hasUsage(g, "calls", "index.tsx#mount", "App.tsx#App"), true);
});

test("buildUsageEdges positive: typed method call resolves through the object to the class method", () => {
  const g = graph();
  assert.equal(hasUsage(g, "calls", "userService.ts#loadUser", "userService.ts#getUser"), true);
  assert.equal(hasUsage(g, "calls", "index.tsx#mount", "userService.ts#loadUser"), true);
});

test("buildUsageEdges negative: a bare property reference (Header.name) is not a usage edge", () => {
  const g = graph();
  const anyEdgeToHeaderFromHelpers = g.usages.some(
    (u) => symbolLabel(g, u.to) === "Header.tsx#Header" && symbolLabel(g, u.from) === "helpers.ts#describeHeader"
  );
  assert.equal(anyEdgeToHeaderFromHelpers, false);
});

test("buildUsageEdges negative: an unattributed module-top-level call produces no edge", () => {
  const g = graph();
  // index.tsx's top-level `mount();` has no enclosing symbol, so nothing should call "mount" itself.
  const anyEdgeToMount = g.usages.some((u) => symbolLabel(g, u.to) === "index.tsx#mount");
  assert.equal(anyEdgeToMount, false);
});

test("buildImportEdges: import * as ns attributes only the symbols actually accessed via ns.X", () => {
  const project = new Project();
  const nsFile = project.createSourceFile("ns.ts", `export function foo() {}\nexport function bar() {}\n`);
  const consumerFile = project.createSourceFile(
    "consumer.ts",
    `import * as NS from "./ns";\nNS.foo();\nconst other = NS;\n` // "other" references NS itself, not a property — must not be attributed as "other"
  );
  const rootAbs = path.resolve(path.dirname(nsFile.getFilePath()));
  const table = buildSymbolTable([nsFile, consumerFile]);
  const edges = buildImportEdges([nsFile, consumerFile], rootAbs, table);

  const foo = table.symbols.find((s) => s.name === "foo");
  const bar = table.symbols.find((s) => s.name === "bar");
  assert.ok(foo && bar);
  assert.deepEqual(
    edges.map((e) => e.symbol),
    [foo!.id] // only foo was accessed via NS.foo() — bar was never referenced, so it's not attributed
  );
});

test("buildImportEdges: a same-named local variable isn't mistaken for a namespace import's member access", () => {
  const project = new Project();
  const nsFile = project.createSourceFile("ns.ts", `export function foo() {}\n`);
  const consumerFile = project.createSourceFile(
    "consumer.ts",
    `import * as NS from "./ns";\nconst other = { foo: () => {} };\nother.foo();\n`
  );
  const rootAbs = path.resolve(path.dirname(nsFile.getFilePath()));
  const table = buildSymbolTable([nsFile, consumerFile]);
  const edges = buildImportEdges([nsFile, consumerFile], rootAbs, table);
  assert.deepEqual(edges, []); // "other.foo()" must not be misattributed to NS's foo just by name
});

test("buildUsageEdges positive: a dotted JSX tag (<NS.Bar/>) resolves through a namespace import", () => {
  const project = new Project();
  const barFile = project.createSourceFile("Bar.tsx", `export function Bar() { return null; }\n`);
  const consumerFile = project.createSourceFile(
    "consumer.tsx",
    `import * as NS from "./Bar";\nfunction Widget() { return <NS.Bar />; }\n`
  );
  const table = buildSymbolTable([barFile, consumerFile]);
  const usages = buildUsageEdges([barFile, consumerFile], table);

  const widget = table.symbols.find((s) => s.name === "Widget");
  const bar = table.symbols.find((s) => s.name === "Bar");
  assert.ok(widget && bar);
  const usage = usages.find((u) => u.from === widget!.id && u.to === bar!.id);
  assert.ok(usage, "expected Widget to render Bar through the NS.Bar dotted tag");
  assert.equal(usage?.kind, "renders");
});

test("buildUsageEdges positive: foo.bind(...)/foo.call(...) resolve to foo, not to the unresolvable 'bind'/'call' name", () => {
  const project = new Project();
  const sf = project.createSourceFile(
    "test.ts",
    `function target() {}\nfunction caller() {\n  const bound = target.bind(null);\n  target.call(null);\n  return bound;\n}\n`
  );
  const table = buildSymbolTable([sf]);
  const usages = buildUsageEdges([sf], table);

  const caller = table.symbols.find((s) => s.name === "caller");
  const target = table.symbols.find((s) => s.name === "target");
  assert.ok(caller && target);
  const usage = usages.find((u) => u.from === caller!.id && u.to === target!.id);
  assert.ok(usage, "expected caller to resolve a 'calls' edge to target through .bind()/.call()");
  assert.equal(usage?.kind, "calls");
});

test("buildUsageEdges negative: returning a symbol without calling or rendering it produces no edge", () => {
  const g = graph();
  const anyEdgeToClassComp = g.usages.some((u) => symbolLabel(g, u.to) === "ClassComp.tsx#ClassComp");
  assert.equal(anyEdgeToClassComp, false);
});
