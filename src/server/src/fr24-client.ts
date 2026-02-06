import type { AdsbAircraft } from "./adsb-lol-client.js";

interface Fr24ClientConfig {
  baseUrl: string;
  liveFullPath: string;
  apiToken: string | null;
  acceptVersion: string;
  bounds: string;
}

interface Fr24FlightRecord {
  id: string | null;
  hex: string | null;
  callsign: string | null;
  destinationIata: string | null;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeIata(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const cleaned = value.toUpperCase();
  return /^[A-Z]{3}$/.test(cleaned) ? cleaned : null;
}

function normalizeKey(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const cleaned = value.trim().toUpperCase();
  return cleaned.length > 0 ? cleaned : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function extractDestinationIata(record: Record<string, unknown>): string | null {
  const destination = asObject(record.destination);
  const route = asObject(record.route);
  const airports = asObject(record.airports);
  const routeDestination = asObject(route?.destination);
  const airportsDestination = asObject(airports?.destination);

  const candidates: unknown[] = [
    record.destination_iata,
    record.destinationIata,
    destination?.iata,
    routeDestination?.iata,
    airportsDestination?.iata
  ];

  for (const candidate of candidates) {
    const normalized = normalizeIata(toStringOrNull(candidate));
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function extractFlightRecord(raw: unknown): Fr24FlightRecord | null {
  const record = asObject(raw);
  if (!record) {
    return null;
  }

  const identification = asObject(record.identification);
  const hexObject = asObject(record.hex);
  const flightObject = asObject(record.flight);

  const id = normalizeKey(
    toStringOrNull(record.id) ??
      toStringOrNull(record.flight_id) ??
      toStringOrNull(record.flightId) ??
      toStringOrNull(identification?.id)
  );
  const hex = normalizeKey(
    toStringOrNull(record.hex) ??
      toStringOrNull(record.icao24) ??
      toStringOrNull(hexObject?.code) ??
      toStringOrNull(hexObject?.id)
  );
  const callsign = normalizeKey(
    toStringOrNull(record.callsign) ??
      toStringOrNull(record.flight) ??
      toStringOrNull(flightObject?.number) ??
      toStringOrNull((asObject(flightObject?.identification) ?? {}).callsign)
  );

  const destinationIata = extractDestinationIata(record);
  if (!destinationIata) {
    return null;
  }

  return { id, hex, callsign, destinationIata };
}

function extractRecords(payload: unknown): Fr24FlightRecord[] {
  const root = asObject(payload);
  if (!root) {
    return [];
  }

  const candidates = [root.data, root.flights, root.results, root.items];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }
    return candidate.map(extractFlightRecord).filter((record): record is Fr24FlightRecord => record !== null);
  }

  if (Array.isArray(payload)) {
    return payload.map(extractFlightRecord).filter((record): record is Fr24FlightRecord => record !== null);
  }

  return [];
}

export class Fr24Client {
  private readonly destinationByKey = new Map<string, string | null>();
  private refreshPromise: Promise<void> | null = null;

  constructor(private readonly config: Fr24ClientConfig) {}

  isEnabled(): boolean {
    return Boolean(this.config.apiToken);
  }

  async fetchDestinationIata(aircraft: AdsbAircraft): Promise<string | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const keys = [aircraft.id, aircraft.hex, aircraft.callsign].map(normalizeKey).filter((key): key is string => key !== null);
    const cached = this.readFromCache(keys);
    if (cached !== undefined) {
      return cached;
    }

    await this.refreshLiveSnapshot();
    const fromSnapshot = this.readFromCache(keys);
    return fromSnapshot ?? null;
  }

  private readFromCache(keys: string[]): string | null | undefined {
    for (const key of keys) {
      if (this.destinationByKey.has(key)) {
        return this.destinationByKey.get(key) ?? null;
      }
    }
    return undefined;
  }

  private async refreshLiveSnapshot(): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.refreshLiveSnapshotInternal().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async refreshLiveSnapshotInternal(): Promise<void> {
    const url = new URL(this.config.liveFullPath, this.config.baseUrl);
    url.searchParams.set("bounds", this.config.bounds);

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "accept-version": this.config.acceptVersion,
        authorization: `Bearer ${this.config.apiToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`FR24 request failed with ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    const records = extractRecords(payload);
    for (const record of records) {
      if (record.id) {
        this.destinationByKey.set(record.id, record.destinationIata);
      }
      if (record.hex) {
        this.destinationByKey.set(record.hex, record.destinationIata);
      }
      if (record.callsign) {
        this.destinationByKey.set(record.callsign, record.destinationIata);
      }
    }
  }
}
