import type { WxReflectivityResponse, WxRegion } from "@vstars/shared";

interface WxReflectivityConfig {
  samplesUrl: string;
  maxCells: number | null;
  requestChunkSize: number;
}

interface RegionBounds {
  region: WxRegion;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

interface GridPoint {
  index: number;
  x: number;
  y: number;
}

const REGIONS: RegionBounds[] = [
  { region: "HAWAII", minLat: 17, maxLat: 25, minLon: -165, maxLon: -150 },
  { region: "GUAM", minLat: 5, maxLat: 25, minLon: 130, maxLon: 155 },
  { region: "CARIB", minLat: 8, maxLat: 28, minLon: -90, maxLon: -55 },
  { region: "ALASKA", minLat: 50, maxLat: 72, minLon: -180, maxLon: -129 },
  { region: "CONUS", minLat: 20, maxLat: 55, minLon: -130, maxLon: -60 }
];

function normalizeLon(lon: number): number {
  let out = lon;
  while (out > 180) {
    out -= 360;
  }
  while (out < -180) {
    out += 360;
  }
  return out;
}

function selectRegion(lat: number, lon: number): WxRegion | null {
  const normalizedLon = normalizeLon(lon);
  for (const region of REGIONS) {
    if (
      lat >= region.minLat &&
      lat <= region.maxLat &&
      normalizedLon >= region.minLon &&
      normalizedLon <= region.maxLon
    ) {
      return region.region;
    }
  }
  return null;
}

function thresholdLevel(dbzU8: number): number {
  if (dbzU8 > 55) return 6;
  if (dbzU8 > 50) return 5;
  if (dbzU8 > 45) return 4;
  if (dbzU8 > 40) return 3;
  if (dbzU8 > 30) return 2;
  if (dbzU8 > 20) return 1;
  return 0;
}

function toWebMercator(lat: number, lon: number): { x: number; y: number } {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const x = (lon * 20037508.34) / 180;
  const y =
    (Math.log(Math.tan(((90 + clampedLat) * Math.PI) / 360)) / (Math.PI / 180)) *
    (20037508.34 / 180);
  return { x, y };
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

function extractSampleValue(sample: unknown): number | null {
  if (!sample || typeof sample !== "object") {
    return null;
  }
  const obj = sample as Record<string, unknown>;
  const value = toNumber(obj.value);
  let maxValue = value ?? null;
  const values = obj.values;
  if (Array.isArray(values)) {
    for (const candidate of values) {
      const numeric = toNumber(candidate);
      if (numeric !== null && (maxValue === null || numeric > maxValue)) {
        maxValue = numeric;
      }
    }
  }
  return maxValue;
}

function extractSamples(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const obj = payload as Record<string, unknown>;
  if (Array.isArray(obj.samples)) {
    return obj.samples;
  }
  if (Array.isArray(obj.results)) {
    return obj.results;
  }
  return [];
}

export class WxRadarService {
  constructor(private readonly config: WxReflectivityConfig) {}

  async fetchGrid(centerLat: number, centerLon: number, radiusNm: number): Promise<WxReflectivityResponse> {
    const region = selectRegion(centerLat, centerLon);
    if (!region) {
      throw new Error("Center point is outside supported MRMS regions");
    }

    const cellSizeNm = 0.5;
    const width = Math.floor((2 * radiusNm) / cellSizeNm) + 1;
    const height = width;
    const cellCount = width * height;
    if (this.config.maxCells !== null && cellCount > this.config.maxCells) {
      throw new Error(`Requested grid too large (${cellCount} cells), reduce radius`);
    }

    const cosLat = Math.cos((centerLat * Math.PI) / 180);
    const lonNmFactor = Math.abs(cosLat) < 1e-9 ? 1e-9 : cosLat;
    const points: GridPoint[] = [];

    for (let row = 0; row < height; row += 1) {
      const yNm = radiusNm - row * cellSizeNm;
      const lat = centerLat + yNm / 60;
      for (let col = 0; col < width; col += 1) {
        const xNm = -radiusNm + col * cellSizeNm;
        const lon = centerLon + xNm / (60 * lonNmFactor);
        const { x, y } = toWebMercator(lat, normalizeLon(lon));
        points.push({ index: row * width + col, x, y });
      }
    }

    const levels = new Array<number>(cellCount).fill(0);
    for (let start = 0; start < points.length; start += this.config.requestChunkSize) {
      const chunk = points.slice(start, start + this.config.requestChunkSize);
      const chunkLevels = await this.fetchChunk(chunk);
      for (let i = 0; i < chunk.length; i += 1) {
        levels[chunk[i].index] = chunkLevels[i];
      }
    }

    return {
      updatedAtMs: Date.now(),
      region,
      center: {
        lat: centerLat,
        lon: normalizeLon(centerLon)
      },
      radiusNm,
      cellSizeNm: 0.5,
      width,
      height,
      levels
    };
  }

  private async fetchChunk(points: GridPoint[]): Promise<number[]> {
    const geometry = JSON.stringify({
      points: points.map((point) => [point.x, point.y]),
      spatialReference: { wkid: 3857 }
    });

    const body = new URLSearchParams({
      f: "pjson",
      geometry,
      geometryType: "esriGeometryMultipoint",
      returnFirstValueOnly: "false"
    });

    const response = await fetch(this.config.samplesUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      throw new Error(`WX samples request failed with ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    const samples = extractSamples(payload);
    if (samples.length === 0) {
      return new Array<number>(points.length).fill(0);
    }

    const out = new Array<number>(points.length).fill(0);
    for (let i = 0; i < points.length; i += 1) {
      const dbzU8 = extractSampleValue(samples[i]);
      out[i] = dbzU8 === null ? 0 : thresholdLevel(dbzU8);
    }
    return out;
  }
}
