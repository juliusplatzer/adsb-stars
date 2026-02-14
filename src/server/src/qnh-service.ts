import type { QnhItem, QnhResponse } from "@vstars/shared";

interface AviationWeatherConfig {
  baseUrl: string;
  metarPath: string;
  cacheTtlMs: number;
}

interface CachedQnh {
  expiresAtMs: number;
  value: QnhItem;
}

interface MetarRecord {
  stationId: string | null;
  qnhInHg: number | null;
  observedAt: string | null;
}

const HPA_TO_INHG = 0.0295299830714;

function toObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function toString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeIcao(icao: string): string {
  return icao.trim().toUpperCase();
}

function parseAltimeterFromRaw(rawMetar: string | null): number | null {
  if (!rawMetar) {
    return null;
  }
  const inHgMatch = rawMetar.match(/\bA(\d{4})\b/);
  if (inHgMatch) {
    return Number(inHgMatch[1]) / 100;
  }

  const hpaMatch = rawMetar.match(/\bQ(\d{4})\b/);
  if (hpaMatch) {
    const hpa = Number(hpaMatch[1]);
    return hpa * HPA_TO_INHG;
  }
  return null;
}

function normalizePressureToInHg(value: number): number | null {
  // Typical QNH in hPa.
  if (value >= 850 && value <= 1200) {
    return value * HPA_TO_INHG;
  }

  // Typical altimeter setting in inHg.
  if (value >= 20 && value <= 40) {
    return value;
  }

  // Some feeds provide inHg * 100 (e.g., 2992 => 29.92).
  if (value >= 2500 && value <= 3500) {
    return value / 100;
  }

  return null;
}

function parseQnhInHg(record: Record<string, unknown>): number | null {
  const direct = [
    record.altim,
    record.altimeter,
    record.altim_in_hg,
    record.altimInHg,
    record.qnh_in_hg,
    record.qnhInHg
  ];

  for (const candidate of direct) {
    const value = toNumber(candidate);
    if (value !== null) {
      const normalized = normalizePressureToInHg(value);
      if (normalized !== null) {
        return normalized;
      }
    }
  }

  const rawMetar = toString(record.rawOb ?? record.raw_text ?? record.rawText ?? record.raw);
  return parseAltimeterFromRaw(rawMetar);
}

function parseMetarRecord(raw: unknown): MetarRecord | null {
  const record = toObject(raw);
  if (!record) {
    return null;
  }

  const stationId = toString(record.icaoId ?? record.stationId ?? record.station ?? record.id);
  if (!stationId) {
    return null;
  }

  return {
    stationId: normalizeIcao(stationId),
    qnhInHg: parseQnhInHg(record),
    observedAt: toString(record.obsTime ?? record.observed ?? record.observedAt ?? record.reportTime)
  };
}

function parseMetarPayload(payload: unknown): MetarRecord[] {
  if (Array.isArray(payload)) {
    return payload.map(parseMetarRecord).filter((item): item is MetarRecord => item !== null);
  }

  const root = toObject(payload);
  if (!root) {
    return [];
  }

  const listCandidates = [root.data, root.metar];
  for (const candidate of listCandidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(parseMetarRecord).filter((item): item is MetarRecord => item !== null);
    }
  }

  return [];
}

function round(value: number, fractionDigits: number): number {
  const factor = 10 ** fractionDigits;
  return Math.round(value * factor) / factor;
}

export class QnhService {
  private readonly cache = new Map<string, CachedQnh>();

  constructor(private readonly config: AviationWeatherConfig) {}

  async getQnh(icaoCodes: string[]): Promise<QnhResponse> {
    const normalized = [...new Set(icaoCodes.map(normalizeIcao).filter((icao) => /^[A-Z]{4}$/.test(icao)))];
    const now = Date.now();

    const results = new Map<string, QnhItem>();
    const missing: string[] = [];
    for (const icao of normalized) {
      const cached = this.cache.get(icao);
      if (cached && cached.expiresAtMs > now) {
        results.set(icao, cached.value);
      } else {
        missing.push(icao);
      }
    }

    if (missing.length > 0) {
      const fetched = await this.fetchQnhBatch(missing);
      for (const item of fetched) {
        const cached: CachedQnh = {
          expiresAtMs: now + this.config.cacheTtlMs,
          value: item
        };
        this.cache.set(item.icao, cached);
        results.set(item.icao, item);
      }
      for (const icao of missing) {
        if (!results.has(icao)) {
          const empty: QnhItem = { icao, qnhInHg: null, observedAt: null };
          this.cache.set(icao, {
            expiresAtMs: now + this.config.cacheTtlMs,
            value: empty
          });
          results.set(icao, empty);
        }
      }
    }

    return {
      requestedIcaos: normalized,
      results: normalized.map((icao) => results.get(icao) ?? { icao, qnhInHg: null, observedAt: null })
    };
  }

  private async fetchQnhBatch(icaoCodes: string[]): Promise<QnhItem[]> {
    const url = new URL(this.config.metarPath, this.config.baseUrl);
    url.searchParams.set("ids", icaoCodes.join(","));
    url.searchParams.set("format", "json");

    const response = await fetch(url, {
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`AviationWeather request failed with ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    const parsed = parseMetarPayload(payload);

    return parsed.map((entry) => {
      const qnhInHg = entry.qnhInHg === null ? null : round(entry.qnhInHg, 2);
      return {
        icao: entry.stationId ?? "UNKNOWN",
        qnhInHg,
        observedAt: entry.observedAt
      };
    });
  }
}
