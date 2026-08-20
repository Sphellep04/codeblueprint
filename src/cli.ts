#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { Command, Option, InvalidArgumentError } from "commander";
import { runAnalysis, runGraphAnalysis, CodeAtlasError } from "./orchestrator";
import { printReport, printJson } from "./report";
import { startServer, DEFAULT_PORT } from "./server";

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new InvalidArgumentError(`"${value}" is not a valid port number.`);
  }
  return port;
}

function readOwnVersion(): string {
  try {
    const pkgPath = path.join(__dirname, "..", "package.json");
    return JSON.parse(fs.readFileSync(pkgPath, "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const program = new Command();

program
  .name("codeatlas")
  .description("Codebase intelligence CLI — structural analysis of a JS/TS/React/Next.js project")
  .version(readOwnVersion())
  .argument("<path>", "path to the project to analyze")
  .option("--json", "print machine-readable JSON instead of the formatted report")
  .option("--graph", "print the code graph (files/symbols/imports/call-and-render edges) as JSON")
  .addOption(new Option("--serve", "start a local web server with the CodeAtlas Explorer").conflicts(["json", "graph"]))
  .addOption(new Option("--port <number>", `port for --serve (default ${DEFAULT_PORT})`).argParser(parsePort))
  .action((targetPath: string, options: { json?: boolean; graph?: boolean; serve?: boolean; port?: number }) => {
    if (options.port !== undefined && !options.serve) {
      program.error("error: --port can only be used together with --serve");
    }
    try {
      if (options.serve) {
        startServer(targetPath, options.port);
      } else if (options.graph) {
        printJson(runGraphAnalysis(targetPath));
      } else if (options.json) {
        printJson(runAnalysis(targetPath));
      } else {
        printReport(runAnalysis(targetPath));
      }
    } catch (err) {
      if (err instanceof CodeAtlasError) {
        process.stderr.write(`Error: ${err.message}\n`);
        process.exitCode = 1;
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${message}\n`);
      process.exitCode = 1;
    }
  });

program.parse(process.argv);
