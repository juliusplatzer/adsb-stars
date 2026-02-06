import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { WakeCategory } from "@vstars/shared";

type CwtValue = WakeCategory;

interface CwtEntry {
  cwt?: string;
  designator_raw?: string;
}

interface CwtData {
  aircraft?: Record<string, CwtEntry>;
}

const VALID_CWT = new Set<CwtValue>([
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "NOWGT",
  "UNKNOWN"
]);

const TYPE_TO_CWT = new Map<string, CwtValue>();
let initialized = false;

function normalizeType(value: string): string {
  return value.trim().toUpperCase();
}

function registerType(raw: string, cwt: CwtValue): void {
  const normalized = normalizeType(raw);
  if (normalized.length === 0) {
    return;
  }
  TYPE_TO_CWT.set(normalized, cwt);
}

function sanitizeDesignator(raw: string): string {
  return normalizeType(raw.replace(/\*+$/, ""));
}

function init(): void {
  if (initialized) {
    return;
  }
  initialized = true;

  const dataPath = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "recat_cwt.json");
  const raw = readFileSync(dataPath, "utf8");
  const parsed = JSON.parse(raw) as CwtData;

  if (!parsed.aircraft) {
    return;
  }

  for (const [designator, entry] of Object.entries(parsed.aircraft)) {
    const rawCwt = entry?.cwt;
    if (typeof rawCwt !== "string") {
      continue;
    }
    const cwt = normalizeType(rawCwt);
    if (!VALID_CWT.has(cwt as CwtValue)) {
      continue;
    }
    registerType(designator, cwt as CwtValue);
    if (entry?.designator_raw) {
      const raw = sanitizeDesignator(entry.designator_raw);
      if (raw.length === 4 && raw === normalizeType(designator)) {
        registerType(raw, cwt as CwtValue);
      }
    }
  }
}

export function recatForAircraftType(typeIcao: string | null | undefined): WakeCategory {
  if (!typeIcao) {
    return "UNKNOWN";
  }
  init();
  return TYPE_TO_CWT.get(normalizeType(typeIcao)) ?? "UNKNOWN";
}
