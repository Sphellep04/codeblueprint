#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { Command } from "commander";
import { runAnalysis, CodeAtlasError } from "./orchestrator";
import { printReport, printJson } from "./report";

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
  .action((targetPath: string, options: { json?: boolean }) => {
    try {
      const summary = runAnalysis(targetPath);
      if (options.json) {
        printJson(summary);
      } else {
        printReport(summary);
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
