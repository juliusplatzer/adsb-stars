const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_HTTP_PORT = 8080;
const DEFAULT_ADSBLOL_BASE_URL = "https://api.adsb.lol";
const DEFAULT_ADSBLOL_SEARCH_PATH = "/v2/lat/{lat}/lon/{lon}/dist/{radius}";
const DEFAULT_ADSBLOL_ROUTESET_PATH = "/api/0/routeset/";
const DEFAULT_ADSBLOL_ROUTESET_BATCH_SIZE = 50;
const DEFAULT_AVWX_BASE_URL = "https://aviationweather.gov";
const DEFAULT_AVWX_METAR_PATH = "/api/data/metar";
const DEFAULT_AVWX_CACHE_TTL_MS = 60_000;
const DEFAULT_WX_SAMPLES_URL =
  "https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity_time/ImageServer/getSamples";
const DEFAULT_WX_MAX_CELLS = 40_000;
const DEFAULT_WX_REQUEST_CHUNK_SIZE = 1_000;

export interface ServerConfig {
  pollIntervalMs: number;
  port: number;
  centerLat: number;
  centerLon: number;
  radiusNm: number;
  adsbLol: {
    baseUrl: string;
    searchPathTemplate: string;
    routeSetPath: string;
    routeSetBatchSize: number;
  };
  aviationWeather: {
    baseUrl: string;
    metarPath: string;
    cacheTtlMs: number;
  };
  wxReflectivity: {
    samplesUrl: string;
    maxCells: number | null;
    requestChunkSize: number;
  };
}

function readRequiredNumber(envKey: string): number {
  const value = process.env[envKey];
  if (!value) {
    throw new Error(`Missing required environment variable ${envKey}`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${envKey} must be a valid number`);
  }
  return parsed;
}

function readOptionalNumber(envKey: string, fallback: number): number {
  const value = process.env[envKey];
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${envKey} must be a valid number`);
  }
  return parsed;
}

function readOptionalNumberOrNull(envKey: string, fallback: number): number | null {
  const value = process.env[envKey];
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "null" || normalized === "none" || normalized === "off" || normalized === "false" || normalized === "0") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${envKey} must be a valid number or null`);
  }
  return parsed;
}

export function loadConfig(): ServerConfig {
  const centerLat = readRequiredNumber("CENTER_LAT");
  const centerLon = readRequiredNumber("CENTER_LON");
  const radiusNm = readRequiredNumber("RADIUS_NM");

  return {
    pollIntervalMs: readOptionalNumber("POLL_INTERVAL_MS", DEFAULT_POLL_INTERVAL_MS),
    port: readOptionalNumber("PORT", DEFAULT_HTTP_PORT),
    centerLat,
    centerLon,
    radiusNm,
    adsbLol: {
      baseUrl: process.env.ADSBLOL_BASE_URL ?? DEFAULT_ADSBLOL_BASE_URL,
      searchPathTemplate: process.env.ADSBLOL_SEARCH_PATH_TEMPLATE ?? DEFAULT_ADSBLOL_SEARCH_PATH,
      routeSetPath: process.env.ADSBLOL_ROUTESET_PATH ?? DEFAULT_ADSBLOL_ROUTESET_PATH,
      routeSetBatchSize: readOptionalNumber("ADSBLOL_ROUTESET_BATCH_SIZE", DEFAULT_ADSBLOL_ROUTESET_BATCH_SIZE)
    },
    aviationWeather: {
      baseUrl: process.env.AWX_BASE_URL ?? DEFAULT_AVWX_BASE_URL,
      metarPath: process.env.AWX_METAR_PATH ?? DEFAULT_AVWX_METAR_PATH,
      cacheTtlMs: readOptionalNumber("AWX_CACHE_TTL_MS", DEFAULT_AVWX_CACHE_TTL_MS)
    },
    wxReflectivity: {
      samplesUrl: process.env.WX_REFLECTIVITY_SAMPLES_URL ?? DEFAULT_WX_SAMPLES_URL,
      maxCells: readOptionalNumberOrNull("WX_REFLECTIVITY_MAX_CELLS", DEFAULT_WX_MAX_CELLS),
      requestChunkSize: readOptionalNumber("WX_REFLECTIVITY_REQUEST_CHUNK_SIZE", DEFAULT_WX_REQUEST_CHUNK_SIZE)
    }
  };
}
