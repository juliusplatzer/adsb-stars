import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./env.js";
import { AdsbLolClient } from "./adsb-lol-client.js";
import { AircraftFeedService } from "./aircraft-feed-service.js";
import { QnhService } from "./qnh-service.js";
import { WxRadarService } from "./wx-radar-service.js";

function loadLocalEnv(): void {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
  if (!existsSync(envPath)) {
    return;
  }
  const contents = readFileSync(envPath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const equalIndex = line.indexOf("=");
    if (equalIndex === -1) {
      continue;
    }
    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();
    if (!key) {
      continue;
    }
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();
const FLIGHT_RULES_TOKEN = process.env.TAIS_INGEST_TOKEN ?? "";
const WX_INGEST_TOKEN =
  process.env.WX_INGEST_TOKEN ??
  process.env.ITWS_INGEST_TOKEN ??
  process.env.TAIS_INGEST_TOKEN ??
  "";
const WX_INGEST_MAX_BYTES = (() => {
  const parsed = Number(process.env.WX_INGEST_MAX_BYTES ?? "");
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return 8 * 1024 * 1024;
})();

// Keep last N messages in RAM so new SSE clients get a little history
const FLIGHT_RULES_RING_SIZE = 200;
const flightRulesRing: string[] = new Array(FLIGHT_RULES_RING_SIZE);
let flightRulesRingIdx = 0;
let flightRulesRingLen = 0;

const flightRulesClients = new Set<ServerResponse>();

function broadcastFlightRules(jsonLine: string): void {
  const frame = `event: flightRules\ndata: ${jsonLine}\n\n`;
  for (const res of flightRulesClients) {
    try {
      res.write(frame);
    } catch {
      flightRulesClients.delete(res);
    }
  }
}

function addToFlightRulesRing(jsonLine: string): void {
  flightRulesRing[flightRulesRingIdx] = jsonLine;
  flightRulesRingIdx = (flightRulesRingIdx + 1) % FLIGHT_RULES_RING_SIZE;
  if (flightRulesRingLen < FLIGHT_RULES_RING_SIZE) flightRulesRingLen++;
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error("payload too large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks, total)));
    req.on("error", reject);
  });
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
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
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

function normalizeRegion(value: unknown): string {
  const region = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (region === "CONUS" || region === "ALASKA" || region === "CARIB" || region === "GUAM" || region === "HAWAII") {
    return region;
  }
  return "CONUS";
}

function normalizeWxLevel(value: unknown): number {
  const parsed = asFiniteNumber(value);
  if (parsed === null) {
    return 0;
  }
  const rounded = Math.round(parsed);
  if (rounded < 0) {
    return 0;
  }
  if (rounded > 6) {
    return 6;
  }
  return rounded;
}

function extractLevelsFromCells(cellsRaw: unknown, width: number, height: number): number[] | null {
  if (!Array.isArray(cellsRaw)) {
    return null;
  }

  // ITWS ingest can provide a flat row-major array of numeric levels.
  if (cellsRaw.length > 0 && (typeof cellsRaw[0] === "number" || typeof cellsRaw[0] === "string")) {
    const expected = width * height;
    const out = new Array<number>(expected).fill(0);
    const limit = Math.min(expected, cellsRaw.length);
    for (let index = 0; index < limit; index += 1) {
      out[index] = normalizeWxLevel(cellsRaw[index]);
    }
    return out;
  }

  const out = new Array<number>(width * height).fill(0);
  let wroteAny = false;
  for (const entry of cellsRaw) {
    const obj = asObject(entry);
    if (!obj) {
      continue;
    }
    const x = asNonNegativeInt(obj.x ?? obj.col ?? obj.column);
    const y = asNonNegativeInt(obj.y ?? obj.row);
    if (x === null || y === null) {
      continue;
    }
    const ix = x;
    const iy = y;
    if (ix < 0 || iy < 0 || ix >= width || iy >= height) {
      continue;
    }
    const idx = iy * width + ix;
    out[idx] = normalizeWxLevel(obj.level ?? obj.intensity ?? obj.value);
    wroteAny = true;
  }
  return wroteAny ? out : null;
}

function normalizeWxIngestPayload(
  payload: unknown,
  fallbackCenter: { lat: number; lon: number },
  fallbackRadiusNm: number
): Record<string, unknown> | null {
  const root = asObject(payload);
  if (!root) {
    return null;
  }

  const trpObj = asObject(root.trp);
  const gridGeomObj = asObject(root.gridGeom);

  const centerObj = asObject(root.center);
  const centerLat =
    asFiniteNumber(centerObj?.lat) ??
    asFiniteNumber(trpObj?.latDeg) ??
    asFiniteNumber(root.centerLat) ??
    asFiniteNumber(root.lat) ??
    fallbackCenter.lat;
  const centerLon =
    asFiniteNumber(centerObj?.lon) ??
    asFiniteNumber(trpObj?.lonDeg) ??
    asFiniteNumber(root.centerLon) ??
    asFiniteNumber(root.lon) ??
    fallbackCenter.lon;

  const dxMeters = asFiniteNumber(gridGeomObj?.dxM) ?? asFiniteNumber(root.dxM);
  const dyMeters = asFiniteNumber(gridGeomObj?.dyM) ?? asFiniteNumber(root.dyM);
  const gridCellNmFromMeters =
    Number.isFinite(dxMeters) && dxMeters !== null && dxMeters > 0
      ? dxMeters / 1852
      : Number.isFinite(dyMeters) && dyMeters !== null && dyMeters > 0
        ? dyMeters / 1852
        : null;

  const cellSizeNm =
    asFiniteNumber(root.cellSizeNm) ??
    asFiniteNumber(root.cellSize) ??
    gridCellNmFromMeters ??
    0.5;

  let width = asPositiveInt(root.width) ?? asPositiveInt(root.cols) ?? asPositiveInt(root.columns);
  let height = asPositiveInt(root.height) ?? asPositiveInt(root.rows);

  const rawLevels = Array.isArray(root.levels) ? root.levels : null;
  if ((width === null || height === null) && rawLevels && rawLevels.length > 0) {
    const count = rawLevels.length;
    const side = Math.sqrt(count);
    if (Number.isInteger(side)) {
      width = side;
      height = side;
    } else {
      width = count;
      height = 1;
    }
  }

  if (width === null || height === null || width <= 0 || height <= 0) {
    return null;
  }

  const derivedRadiusNm = Math.max(width, height) * cellSizeNm * 0.5;
  const radiusNm =
    asFiniteNumber(root.radiusNm) ??
    asFiniteNumber(root.radius) ??
    (Number.isFinite(derivedRadiusNm) && derivedRadiusNm > 0 ? derivedRadiusNm : null) ??
    fallbackRadiusNm;

  const expectedCount = width * height;
  let levels: number[] | null = null;
  if (rawLevels) {
    levels = rawLevels.map((value) => normalizeWxLevel(value));
  } else {
    levels = extractLevelsFromCells(root.cells ?? root.data, width, height);
  }
  if (!levels) {
    return null;
  }

  if (levels.length < expectedCount) {
    levels = levels.concat(new Array<number>(expectedCount - levels.length).fill(0));
  } else if (levels.length > expectedCount) {
    levels = levels.slice(0, expectedCount);
  }

  const trpLatDeg = asFiniteNumber(trpObj?.latDeg) ?? centerLat;
  const trpLonDeg = asFiniteNumber(trpObj?.lonDeg) ?? centerLon;

  const xOffsetM = Math.round(asFiniteNumber(gridGeomObj?.xOffsetM) ?? asFiniteNumber(root.xOffsetM) ?? 0);
  const yOffsetM = Math.round(asFiniteNumber(gridGeomObj?.yOffsetM) ?? asFiniteNumber(root.yOffsetM) ?? 0);
  const dxM = Math.round(dxMeters ?? 0);
  const dyM = Math.round(dyMeters ?? 0);
  const rotationDeg = asFiniteNumber(gridGeomObj?.rotationDeg) ?? asFiniteNumber(root.rotationDeg) ?? 0;

  const productId = asNonNegativeInt(root.productId) ?? asNonNegativeInt(root.product_id) ?? -1;
  const productName = asString(root.productName) ?? asString(root.product_name) ?? "";
  const site = asString(root.site) ?? "";
  const airport = asString(root.airport) ?? "";
  const compression = asString(root.compression) ?? "";
  const maxPrecipLevel = asNonNegativeInt(root.maxPrecipLevel) ?? asNonNegativeInt(root.max_precip_level) ?? 0;
  const filledCells = asNonNegativeInt(root.filledCells) ?? levels.length;
  const receivedAt =
    asString(root.receivedAt) ??
    asString(root.timestamp) ??
    new Date(Math.floor(asFiniteNumber(root.updatedAtMs) ?? Date.now())).toISOString();
  const cellsTruncated = root.cellsTruncated === true;

  const normalized: Record<string, unknown> = {
    updatedAtMs: Math.floor(asFiniteNumber(root.updatedAtMs) ?? Date.now()),
    region: normalizeRegion(root.region),
    center: {
      lat: centerLat,
      lon: centerLon
    },
    radiusNm,
    cellSizeNm,
    width,
    height,
    levels,

    // ITWS-native fields expected by downstream consumers.
    receivedAt,
    productId,
    productName,
    site,
    airport,
    rows: height,
    cols: width,
    compression,
    maxPrecipLevel,
    filledCells,
    layout: "row-major",
    cells: levels,
    trp: {
      latDeg: trpLatDeg,
      lonDeg: trpLonDeg
    },
    gridGeom: {
      xOffsetM,
      yOffsetM,
      dxM,
      dyM,
      rotationDeg
    }
  };

  if (cellsTruncated) {
    normalized.cellsTruncated = true;
  }

  return normalized;
}

async function handleFlightRulesRoute(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (!req.url) return false;
  const pathname = req.url.split("?")[0];
  if (pathname !== "/api/flightRules") return false;

  // GET => SSE stream
  if (req.method === "GET") {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    });

    flightRulesClients.add(res);

    res.write("retry: 1000\n");
    res.write(": connected\n\n");

    // Replay ring buffer oldest -> newest
    const start = flightRulesRingLen < FLIGHT_RULES_RING_SIZE ? 0 : flightRulesRingIdx;
    for (let i = 0; i < flightRulesRingLen; i++) {
      const idx = (start + i) % FLIGHT_RULES_RING_SIZE;
      const line = flightRulesRing[idx];
      if (line) res.write(`event: flightRules\ndata: ${line}\n\n`);
    }

    // Keepalive
    const ping = setInterval(() => {
      try {
        res.write(":\n\n");
      } catch {
        flightRulesClients.delete(res);
        clearInterval(ping);
      }
    }, 15000);

    req.on("close", () => {
      flightRulesClients.delete(res);
      clearInterval(ping);
    });

    return true;
  }

  // POST => ingest from Java (token-protected)
  if (req.method === "POST") {
    const token = req.headers["x-tais-token"];
    if (!FLIGHT_RULES_TOKEN || token !== FLIGHT_RULES_TOKEN) {
      res.writeHead(401, { "content-type": "text/plain" });
      res.end("unauthorized");
      return true;
    }

    let body: Buffer;
    try {
      body = await readBody(req, 1024 * 1024); // 1 MiB cap (your JSON is tiny)
    } catch (e: any) {
      res.writeHead(e?.statusCode ?? 400, { "content-type": "text/plain" });
      res.end(e?.message ?? "bad request");
      return true;
    }

    const text = body.toString("utf8").trim();

    // Reject garbage: must be valid JSON
    try {
      JSON.parse(text);
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("invalid json");
      return true;
    }

    addToFlightRulesRing(text);
    broadcastFlightRules(text);

    res.writeHead(204);
    res.end();
    return true;
  }

  res.writeHead(405, { "content-type": "text/plain" });
  res.end("method not allowed");
  return true;
}

const config = loadConfig();
const MAX_WX_RADIUS_NM = 150;
const feedService = new AircraftFeedService(
  new AdsbLolClient(config.adsbLol),
  {
    pollIntervalMs: config.pollIntervalMs,
    center: {
      lat: config.centerLat,
      lon: config.centerLon
    },
    radiusNm: config.radiusNm
  }
);
feedService.start();
const qnhService = new QnhService(config.aviationWeather);
const wxReflectivityService = new WxRadarService(config.wxReflectivity);
let latestIngestedWxRadar: Record<string, unknown> | null = null;

function parseIcaoParams(reqUrl: string): string[] {
  const url = new URL(reqUrl, "http://localhost");
  const fromRepeating = url.searchParams.getAll("icao");
  if (fromRepeating.length > 0) {
    return fromRepeating.flatMap((value) => value.split(","));
  }
  const ids = url.searchParams.get("ids");
  if (!ids) {
    return [];
  }
  return ids.split(",");
}

const server = createServer(async (req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,OPTIONS,POST");
  res.setHeader("access-control-allow-headers", "accept,content-type,x-tais-token,x-wx-token");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = req.url ?? "/";
  const url = new URL(reqUrl, "http://localhost");

  if (await handleFlightRulesRoute(req, res)) {
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/wx/radar") {
    const tokenHeader = req.headers["x-wx-token"] ?? req.headers["x-tais-token"];
    const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
    if (!WX_INGEST_TOKEN || token !== WX_INGEST_TOKEN) {
      res.writeHead(401, { "content-type": "text/plain" });
      res.end("unauthorized");
      return;
    }

    let body: Buffer;
    try {
      body = await readBody(req, WX_INGEST_MAX_BYTES);
    } catch (e: any) {
      res.writeHead(e?.statusCode ?? 400, { "content-type": "text/plain" });
      res.end(e?.message ?? "bad request");
      return;
    }

    const text = body.toString("utf8").trim();
    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(text);
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("invalid json");
      return;
    }

    const normalized = normalizeWxIngestPayload(parsedPayload, { lat: config.centerLat, lon: config.centerLon }, config.radiusNm);
    if (!normalized) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid wx payload" }));
      return;
    }

    latestIngestedWxRadar = normalized;
    res.writeHead(204);
    res.end();
    return;
  }
  
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "GET" && req.url === "/api/aircraft") {
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store"
    });
    res.end(JSON.stringify(feedService.getLatestFeed()));
    return;
  }

  if (req.method === "GET" && reqUrl.startsWith("/api/qnh")) {
    const icaos = parseIcaoParams(reqUrl);
    if (icaos.length === 0) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Provide at least one ICAO via ?icao=KJFK&icao=KLAX or ?ids=KJFK,KLAX" }));
      return;
    }

    void qnhService
      .getQnh(icaos)
      .then((payload) => {
        res.writeHead(200, {
          "content-type": "application/json",
          "cache-control": "no-store"
        });
        res.end(JSON.stringify(payload));
      })
      .catch((error) => {
        console.error("[qnh] lookup failed", error);
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to fetch QNH data" }));
      });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/wx/radar") {
    if (latestIngestedWxRadar !== null) {
      res.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store"
      });
      res.end(JSON.stringify(latestIngestedWxRadar));
      return;
    }

    const lat = Number(url.searchParams.get("lat"));
    const lon = Number(url.searchParams.get("lon"));
    const radiusNm = Number(url.searchParams.get("radiusNm") ?? "80");

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radiusNm) || radiusNm <= 0) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Provide valid lat, lon, and positive radiusNm query params" }));
      return;
    }
    const effectiveRadiusNm = Math.min(radiusNm, MAX_WX_RADIUS_NM);

    void wxReflectivityService
      .fetchGrid(lat, lon, effectiveRadiusNm)
      .then((payload) => {
        res.writeHead(200, {
          "content-type": "application/json",
          "cache-control": "no-store"
        });
        res.end(JSON.stringify(payload));
      })
      .catch((error) => {
        console.error("[wx] radar lookup failed", error);
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to fetch radar data" }));
      });
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
});

server.listen(config.port, () => {
  console.log(`Aircraft feed server listening on http://localhost:${config.port}`);
});

const shutdown = (): void => {
  feedService.stop();
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
