import type { AircraftFeedResponse, QnhResponse, WxReflectivityResponse } from "@vstars/shared";

export interface FetchAircraftFeedOptions {
  baseUrl?: string;
  signal?: AbortSignal;
}

export async function fetchAircraftFeed(
  options: FetchAircraftFeedOptions = {}
): Promise<AircraftFeedResponse> {
  const url = new URL("/api/aircraft", options.baseUrl ?? window.location.origin);
  const response = await fetch(url, {
    signal: options.signal,
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch aircraft feed: ${response.status}`);
  }

  return (await response.json()) as AircraftFeedResponse;
}

export interface FetchQnhOptions {
  baseUrl?: string;
  signal?: AbortSignal;
}

export async function fetchQnhByIcao(
  icaoCodes: string[],
  options: FetchQnhOptions = {}
): Promise<QnhResponse> {
  const uniqueCodes = [...new Set(icaoCodes.map((code) => code.trim().toUpperCase()).filter(Boolean))];
  if (uniqueCodes.length === 0) {
    return { requestedIcaos: [], results: [] };
  }

  const url = new URL("/api/qnh", options.baseUrl ?? window.location.origin);
  for (const icao of uniqueCodes) {
    url.searchParams.append("icao", icao);
  }

  const response = await fetch(url, {
    signal: options.signal,
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch QNH: ${response.status}`);
  }

  return (await response.json()) as QnhResponse;
}

export interface FetchWxReflectivityOptions {
  baseUrl?: string;
  signal?: AbortSignal;
  radiusNm?: number;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asPositiveInt(value: unknown): number | null {
  const numeric = asFiniteNumber(value);
  if (numeric === null || numeric <= 0) {
    return null;
  }
  return Math.floor(numeric);
}

function asNonNegativeInt(value: unknown): number | null {
  const numeric = asFiniteNumber(value);
  if (numeric === null || numeric < 0) {
    return null;
  }
  return Math.floor(numeric);
}

function clampWxLevel(value: unknown): number {
  const numeric = asFiniteNumber(value);
  if (numeric === null) {
    return 0;
  }
  const rounded = Math.round(numeric);
  if (rounded < 0) {
    return 0;
  }
  if (rounded > 6) {
    return 6;
  }
  return rounded;
}

function normalizeWxRegion(value: unknown): WxReflectivityResponse["region"] {
  const region = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (region === "CONUS" || region === "ALASKA" || region === "CARIB" || region === "GUAM" || region === "HAWAII") {
    return region;
  }
  return "CONUS";
}

function deduceGridSize(levelCount: number): { width: number; height: number } {
  if (levelCount <= 0) {
    return { width: 1, height: 1 };
  }
  const side = Math.sqrt(levelCount);
  if (Number.isInteger(side)) {
    return { width: side, height: side };
  }
  return { width: levelCount, height: 1 };
}

function normalizeWxPayload(
  payload: unknown,
  requestedCenter: { lat: number; lon: number },
  requestedRadiusNm: number | undefined
): WxReflectivityResponse {
  const root = asObject(payload);
  const rootCenter = asObject(root?.center);
  const trp = asObject(root?.trp);
  const gridGeom = asObject(root?.gridGeom);

  const centerLat =
    asFiniteNumber(rootCenter?.lat) ??
    asFiniteNumber(trp?.latDeg) ??
    asFiniteNumber(root?.centerLat) ??
    asFiniteNumber(root?.lat) ??
    requestedCenter.lat;
  const centerLon =
    asFiniteNumber(rootCenter?.lon) ??
    asFiniteNumber(trp?.lonDeg) ??
    asFiniteNumber(root?.centerLon) ??
    asFiniteNumber(root?.lon) ??
    requestedCenter.lon;
  const radiusNm =
    asFiniteNumber(root?.radiusNm) ??
    asFiniteNumber(root?.radius) ??
    requestedRadiusNm ??
    80;
  const cellSizeNm =
    asFiniteNumber(root?.cellSizeNm) ??
    asFiniteNumber(root?.cellSize) ??
    0.5;

  let width = asPositiveInt(root?.width) ?? asPositiveInt(root?.cols);
  let height = asPositiveInt(root?.height) ?? asPositiveInt(root?.rows);
  const rawLevels = Array.isArray(root?.levels) ? root?.levels : null;

  if ((width === null || height === null) && rawLevels) {
    const deduced = deduceGridSize(rawLevels.length);
    width = deduced.width;
    height = deduced.height;
  }

  let levels: number[] | null = null;
  if (rawLevels) {
    levels = rawLevels.map((value) => clampWxLevel(value));
  } else {
    const rawCells = Array.isArray(root?.cells) ? root?.cells : Array.isArray(root?.data) ? root?.data : null;
    if (rawCells && width !== null && height !== null) {
      const expected = width * height;
      // ITWS payloads use flat row-major numeric cells.
      if (rawCells.length > 0 && (typeof rawCells[0] === "number" || typeof rawCells[0] === "string")) {
        const out = new Array<number>(expected).fill(0);
        const limit = Math.min(expected, rawCells.length);
        for (let index = 0; index < limit; index += 1) {
          out[index] = clampWxLevel(rawCells[index]);
        }
        levels = out;
      } else {
        const out = new Array<number>(expected).fill(0);
        let wroteAny = false;
        for (const rawCell of rawCells) {
          const cell = asObject(rawCell);
          if (!cell) {
            continue;
          }
          const x = asNonNegativeInt(cell.x ?? cell.col ?? cell.column);
          const y = asNonNegativeInt(cell.y ?? cell.row);
          if (x === null || y === null || x >= width || y >= height) {
            continue;
          }
          out[y * width + x] = clampWxLevel(cell.level ?? cell.intensity ?? cell.value);
          wroteAny = true;
        }
        levels = wroteAny ? out : null;
      }
    }
  }

  if (width === null || height === null) {
    const deduced = deduceGridSize(levels?.length ?? 0);
    width = deduced.width;
    height = deduced.height;
  }

  const expected = width * height;
  if (!levels) {
    levels = new Array<number>(expected).fill(0);
  } else if (levels.length < expected) {
    levels = levels.concat(new Array<number>(expected - levels.length).fill(0));
  } else if (levels.length > expected) {
    levels = levels.slice(0, expected);
  }

  const rows = asPositiveInt(root?.rows) ?? height;
  const cols = asPositiveInt(root?.cols) ?? width;
  const rawCells = Array.isArray(root?.cells) ? root.cells : null;
  let cells: number[] = levels.slice(0, rows * cols);
  if (rawCells && rawCells.length > 0 && (typeof rawCells[0] === "number" || typeof rawCells[0] === "string")) {
    const expectedCells = rows * cols;
    const flat = new Array<number>(expectedCells).fill(0);
    const limit = Math.min(expectedCells, rawCells.length);
    for (let i = 0; i < limit; i += 1) {
      flat[i] = clampWxLevel(rawCells[i]);
    }
    cells = flat;
  }

  const trpLatDeg = asFiniteNumber(trp?.latDeg) ?? centerLat;
  const trpLonDeg = asFiniteNumber(trp?.lonDeg) ?? centerLon;
  const dxM = asFiniteNumber(gridGeom?.dxM) ?? cellSizeNm * 1852;
  const dyM = asFiniteNumber(gridGeom?.dyM) ?? cellSizeNm * 1852;

  return {
    updatedAtMs: Math.floor(asFiniteNumber(root?.updatedAtMs) ?? Date.now()),
    region: normalizeWxRegion(root?.region),
    center: {
      lat: centerLat,
      lon: centerLon
    },
    radiusNm,
    cellSizeNm: cellSizeNm > 0 ? cellSizeNm : 0.5,
    width,
    height,
    levels,
    receivedAt: asString(root?.receivedAt) ?? undefined,
    productId: asNonNegativeInt(root?.productId) ?? undefined,
    productName: asString(root?.productName) ?? undefined,
    site: asString(root?.site) ?? undefined,
    airport: asString(root?.airport) ?? undefined,
    rows,
    cols,
    compression: asString(root?.compression) ?? undefined,
    maxPrecipLevel: asNonNegativeInt(root?.maxPrecipLevel) ?? undefined,
    filledCells: asNonNegativeInt(root?.filledCells) ?? undefined,
    layout: (asString(root?.layout) ?? "row-major") as WxReflectivityResponse["layout"],
    cells,
    cellsTruncated: root?.cellsTruncated === true ? true : undefined,
    trp: {
      latDeg: trpLatDeg,
      lonDeg: trpLonDeg
    },
    gridGeom: {
      xOffsetM: asFiniteNumber(gridGeom?.xOffsetM) ?? 0,
      yOffsetM: asFiniteNumber(gridGeom?.yOffsetM) ?? 0,
      dxM: Number.isFinite(dxM) && dxM > 0 ? dxM : cellSizeNm * 1852,
      dyM: Number.isFinite(dyM) && dyM > 0 ? dyM : cellSizeNm * 1852,
      rotationDeg: asFiniteNumber(gridGeom?.rotationDeg) ?? 0
    }
  };
}

export async function fetchWxReflectivity(
  center: { lat: number; lon: number },
  options: FetchWxReflectivityOptions = {}
): Promise<WxReflectivityResponse> {
  const url = new URL("/api/wx/radar", options.baseUrl ?? window.location.origin);
  url.searchParams.set("lat", String(center.lat));
  url.searchParams.set("lon", String(center.lon));
  if (options.radiusNm !== undefined) {
    url.searchParams.set("radiusNm", String(options.radiusNm));
  }

  const response = await fetch(url, {
    signal: options.signal,
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch radar data: ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  return normalizeWxPayload(payload, center, options.radiusNm);
}
