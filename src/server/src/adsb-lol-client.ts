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

  const callsign = (toStringOrNull(raw.flight ?? raw.callsign) ?? null)?.toUpperCase() ?? null;
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
      throw new Error(`ADSB.lol request failed with ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    return resolveAircraftList(payload).map(normalizeAircraft).filter((entry): entry is AdsbAircraft => entry !== null);
  }
}
