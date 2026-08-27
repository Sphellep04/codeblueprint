import type { CodeGraph, FileModel } from "../types";
import { classifyFileKind } from "./fileKind";

export type ArchitectureLayer = "Presentation" | "Application" | "Services" | "Data" | "Infrastructure" | "Other";

const DATA_RE = /(^|\/)(models?|db|database|repositories|schema|prisma|migrations)(\/|$)/i;
const INFRA_RE = /(^|\/)(config|infra|infrastructure|middleware)(\/|$)/i;
const SERVICE_RE = /(^|\/)(services|api|clients)(\/|$)/i;
const PRESENTATION_RE = /(^|\/)(components|pages|app|views|screens)(\/|$)/i;
const APPLICATION_RE = /(^|\/)(hooks|store|state|context|reducers|lib|core)(\/|$)/i;

/**
 * Heuristic architectural-layer classification for the Architecture view — folder-convention-based,
 * same spirit as fileKind.ts: a best-effort signal, not a guarantee. Checked most-specific-first
 * (e.g. "src/services/db/" lands in Data, the more specific signal, rather than Services). Anything
 * matching none of the folder conventions, and not flagged as a component by symbol kind, falls
 * into the honest "Other" catch-all — better an admitted unknown than a confidently wrong guess.
 */
export function classifyLayer(file: FileModel, codeGraph: CodeGraph): ArchitectureLayer {
  const p = file.absolutePath.toLowerCase();
  if (DATA_RE.test(p)) return "Data";
  if (INFRA_RE.test(p)) return "Infrastructure";
  if (SERVICE_RE.test(p)) return "Services";
  if (PRESENTATION_RE.test(p) || classifyFileKind(file, codeGraph) === "component") return "Presentation";
  if (APPLICATION_RE.test(p)) return "Application";
  return "Other";
}

export const LAYER_ORDER: ArchitectureLayer[] = ["Presentation", "Application", "Services", "Data", "Infrastructure", "Other"];
