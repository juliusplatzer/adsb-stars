export interface AdsbAircraft {
  id: string;
  hex: string;
  callsign: string | null;
  aircraftTypeIcao: string | null;
  groundspeedKts: number | null;
  altitudeAmslFt: number | null;
  onGround: boolean;
  squawk: string | null;
  lat: number;
  lon: number;
  trackDeg: number | null;
  trackRateDegPerSec: number | null;
}

interface AdsbLolClientConfig {
  baseUrl: string;
  searchPathTemplate: string;
  routeSetPath: string;
  routeSetBatchSize: number;
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

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeCallsign(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const cleaned = value.trim().toUpperCase();
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeIata(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const cleaned = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(cleaned) ? cleaned : null;
}

function ensureLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function ensureTrailingSlash(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

function resolveAircraftList(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null);
  }

  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const candidates = [obj.ac, obj.aircraft, obj.data];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.filter(
          (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null
        );
      }
    }
  }

  return [];
}

function normalizeAircraft(raw: Record<string, unknown>): AdsbAircraft | null {
  const lat = toNumber(raw.lat ?? raw.latitude);
  const lon = toNumber(raw.lon ?? raw.lng ?? raw.longitude);
  if (lat === null || lon === null) {
    return null;
  }

  const hex = toStringOrNull(raw.hex ?? raw.icao ?? raw.icao24);
  if (!hex) {
    return null;
  }

  const id = (
    toStringOrNull(raw.flight_id ?? raw.flightId ?? raw.id) ??
    hex
  ).toUpperCase();

  const callsign = normalizeCallsign(toStringOrNull(raw.flight ?? raw.callsign));
  const aircraftTypeIcao = toStringOrNull(raw.t ?? raw.type ?? raw.aircraft_type)?.toUpperCase() ?? null;

  const onGroundRaw = raw.gnd ?? raw.on_ground ?? raw.onGround ?? raw.alt_baro;
  const onGround =
    onGroundRaw === true ||
    onGroundRaw === 1 ||
    onGroundRaw === "1" ||
    (typeof onGroundRaw === "string" && onGroundRaw.toLowerCase() === "ground");

  return {
    id,
    hex: hex.toUpperCase(),
    callsign,
    aircraftTypeIcao,
    groundspeedKts: toNumber(raw.gs ?? raw.ground_speed ?? raw.groundSpeed),
    altitudeAmslFt: toNumber(raw.alt_geom ?? raw.altitude ?? raw.alt_baro),
    onGround,
    squawk: toStringOrNull(raw.squawk),
    lat,
    lon,
    trackDeg: toNumber(raw.track ?? raw.trk ?? raw.heading),
    trackRateDegPerSec: toNumber(raw.track_rate ?? raw.trackRate)
  };
}

function extractDestinationIataFromRouteRecord(raw: unknown): {
  callsign: string;
  destinationIata: string | null;
} | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const callsign = normalizeCallsign(toStringOrNull(record.callsign));
  if (!callsign) {
    return null;
  }

  const airportCodesIata = toStringOrNull(record._airport_codes_iata ?? record.airport_codes_iata);
  if (airportCodesIata) {
    const parts = airportCodesIata
      .split("-")
      .map((part) => normalizeIata(part))
      .filter((part): part is string => part !== null);
    if (parts.length >= 2) {
      return {
        callsign,
        destinationIata: parts[parts.length - 1]
      };
    }
  }

  const airports = Array.isArray(record._airports) ? record._airports : null;
  if (airports && airports.length >= 2) {
    const lastAirport = airports[airports.length - 1];
    if (lastAirport && typeof lastAirport === "object") {
      const destIata = normalizeIata(toStringOrNull((lastAirport as Record<string, unknown>).iata));
      if (destIata) {
        return {
          callsign,
          destinationIata: destIata
        };
      }
    }
  }

  return {
    callsign,
    destinationIata: null
  };
}

export class AdsbLolClient {
  constructor(private readonly config: AdsbLolClientConfig) {}

  async fetchAircraftInRadius(lat: number, lon: number, radiusNm: number): Promise<AdsbAircraft[]> {
    const path = this.config.searchPathTemplate
      .replace("{lat}", String(lat))
      .replace("{lon}", String(lon))
      .replace("{radius}", String(radiusNm));
    const url = new URL(path, this.config.baseUrl);

    const response = await fetch(url);

    if (!response.ok) {
      const {status} = response;
      const detail = status === 422 ? "Validation error (check lat/lon/radius)" : `HTTP ${status}`;
      throw new Error(`ADSB.lol request failed: ${detail}`);
    }

    const payload = (await response.json()) as unknown;
    return resolveAircraftList(payload).map(normalizeAircraft).filter((entry): entry is AdsbAircraft => entry !== null);
  }

  async fetchDestinationsByCallsign(
    planes: Array<{ callsign: string; lat: number; lon: number }>
  ): Promise<Map<string, string | null>> {
    const byCallsign = new Map<string, { callsign: string; lat: number; lon: number }>();
    for (const plane of planes) {
      const callsign = normalizeCallsign(plane.callsign);
      if (!callsign) {
        continue;
      }
      if (!Number.isFinite(plane.lat) || !Number.isFinite(plane.lon)) {
        continue;
      }
      if (!byCallsign.has(callsign)) {
        byCallsign.set(callsign, { callsign, lat: plane.lat, lon: plane.lon });
      }
    }

    const unique = Array.from(byCallsign.values());
    if (unique.length === 0) {
      return new Map();
    }

    const out = new Map<string, string | null>();
    const batchSize = Math.max(1, Math.floor(this.config.routeSetBatchSize));
    for (let i = 0; i < unique.length; i += batchSize) {
      const chunk = unique.slice(i, i + batchSize);
      const chunkResult = await this.fetchDestinationsBatch(chunk);
      for (const [callsign, destinationIata] of chunkResult) {
        out.set(callsign, destinationIata);
      }
      for (const plane of chunk) {
        if (!out.has(plane.callsign)) {
          out.set(plane.callsign, null);
        }
      }
    }

    return out;
  }

  private async fetchDestinationsBatch(
    planes: Array<{ callsign: string; lat: number; lon: number }>
  ): Promise<Map<string, string | null>> {
    const normalizedPath = ensureLeadingSlash(this.config.routeSetPath);
    const pathCandidates = Array.from(
      new Set([
        normalizedPath,
        ensureTrailingSlash(normalizedPath),
        "/api/0/routeset",
        "/api/0/routeset/"
      ])
    );
    const planesWithLng = planes.map((plane) => ({
      callsign: plane.callsign,
      lat: plane.lat,
      lng: plane.lon
    }));
    const planesWithLon = planes.map((plane) => ({
      callsign: plane.callsign,
      lat: plane.lat,
      lon: plane.lon
    }));
    const bodyCandidates: Array<Record<string, unknown>> = [
      { planes: planesWithLng },
      { planes: planesWithLon },
      { aircraft: planesWithLng },
      { aircraft: planesWithLon }
    ];

    let lastError: string | null = null;
    for (const path of pathCandidates) {
      const url = new URL(path, this.config.baseUrl);
      for (const body of bodyCandidates) {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json"
          },
          body: JSON.stringify(body)
        });

        if (response.ok) {
          const payload = (await response.json()) as unknown;
          const out = new Map<string, string | null>();
          if (!Array.isArray(payload)) {
            return out;
          }

          for (const entry of payload) {
            const record = extractDestinationIataFromRouteRecord(entry);
            if (!record) {
              continue;
            }
            out.set(record.callsign, record.destinationIata);
          }

          return out;
        }

        const { status } = response;
        const responseText = await response.text();
        lastError = `path=${path} status=${status} body=${responseText.slice(0, 240)}`;

        // Retry on likely schema/path mismatch statuses; fail fast on others.
        if (![400, 404, 405, 415, 422].includes(status)) {
          throw new Error(`ADSB.lol routeset request failed: ${lastError}`);
        }
      }
    }

    throw new Error(
      `ADSB.lol routeset request failed after fallback attempts: ${lastError ?? "unknown error"}`
    );
  }
}
