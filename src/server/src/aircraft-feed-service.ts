import type { AircraftFeedItem, AircraftFeedResponse, PositionSample } from "@vstars/shared";
import { recatForAircraftType } from "./recat.js";
import type { AdsbAircraft } from "./adsb-lol-client.js";
import { AdsbLolClient } from "./adsb-lol-client.js";
import { Fr24Client } from "./fr24-client.js";
import { RingBuffer } from "./ring-buffer.js";

interface ServiceConfig {
  pollIntervalMs: number;
  center: {
    lat: number;
    lon: number;
  };
  radiusNm: number;
}

interface FlightTrackState {
  current: PositionSample | null;
  previous: RingBuffer<PositionSample>;
}

function positionsEqual(a: PositionSample, b: PositionSample): boolean {
  return a.lat === b.lat && a.lon === b.lon;
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

function destinationFromTrack(start: PositionSample, trackDeg: number, distanceNm: number): PositionSample {
  const radiusNm = 3440.065;
  const angularDistance = distanceNm / radiusNm;
  const bearing = toRadians(trackDeg);
  const lat1 = toRadians(start.lat);
  const lon1 = toRadians(start.lon);

  const sinLat2 = Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing);
  const lat2 = Math.asin(sinLat2);
  const y = Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1);
  const x = Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2);
  const lon2 = lon1 + Math.atan2(y, x);

  return {
    lat: toDegrees(lat2),
    lon: ((toDegrees(lon2) + 540) % 360) - 180,
    timestampMs: Date.now(),
    source: "interpolated"
  };
}

function normalizeTrackDeg(trackDeg: number): number {
  const normalized = trackDeg % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function interpolatePosition(
  current: PositionSample,
  history: RingBuffer<PositionSample>,
  aircraft: AdsbAircraft,
  pollIntervalMs: number
): PositionSample {
  const previous = history.last();
  if (previous) {
    const deltaLat = current.lat - previous.lat;
    const deltaLon = current.lon - previous.lon;
    if (deltaLat !== 0 || deltaLon !== 0) {
      return {
        lat: current.lat + deltaLat,
        lon: current.lon + deltaLon,
        timestampMs: Date.now(),
        source: "interpolated"
      };
    }
  }

  if (aircraft.groundspeedKts && aircraft.trackDeg !== null) {
    const distanceNm = (aircraft.groundspeedKts * pollIntervalMs) / 3_600_000;
    const deltaSeconds = pollIntervalMs / 1_000;
    const trackRate = aircraft.trackRateDegPerSec ?? 0;
    const projectedTrack = normalizeTrackDeg(aircraft.trackDeg + trackRate * deltaSeconds);
    return destinationFromTrack(current, projectedTrack, distanceNm);
  }

  return {
    ...current,
    timestampMs: Date.now(),
    source: "interpolated"
  };
}

export class AircraftFeedService {
  private readonly tracks = new Map<string, FlightTrackState>();
  private latest: AircraftFeedResponse;
  private timer: NodeJS.Timeout | null = null;
  private pollInFlight = false;

  constructor(
    private readonly adsbClient: AdsbLolClient,
    private readonly fr24Client: Fr24Client,
    private readonly config: ServiceConfig
  ) {
    this.latest = {
      updatedAtMs: 0,
      center: { lat: this.config.center.lat, lon: this.config.center.lon },
      radiusNm: this.config.radiusNm,
      aircraft: []
    };
  }

  start(): void {
    this.timer = setInterval(() => void this.poll(), this.config.pollIntervalMs);
    void this.poll();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getLatestFeed(): AircraftFeedResponse {
    return this.latest;
  }

  private async poll(): Promise<void> {
    if (this.pollInFlight) {
      return;
    }
    this.pollInFlight = true;

    try {
      const now = Date.now();
      const inRange = await this.adsbClient.fetchAircraftInRadius(
        this.config.center.lat,
        this.config.center.lon,
        this.config.radiusNm
      );
      const airborne = inRange.filter((ac) => !ac.onGround);

      const activeIds = new Set(airborne.map((ac) => ac.id));
      for (const id of this.tracks.keys()) {
        if (!activeIds.has(id)) {
          this.tracks.delete(id);
        }
      }

      const aircraft = await Promise.all(airborne.map((entry) => this.transformAircraft(entry, now)));
      this.latest = {
        updatedAtMs: now,
        center: { ...this.config.center },
        radiusNm: this.config.radiusNm,
        aircraft
      };
    } catch (error) {
      console.error("[poll] unable to update aircraft feed", error);
    } finally {
      this.pollInFlight = false;
    }
  }

  private async transformAircraft(aircraft: AdsbAircraft, now: number): Promise<AircraftFeedItem> {
    const existing = this.tracks.get(aircraft.id) ?? {
      current: null,
      previous: new RingBuffer<PositionSample>(5)
    };

    const observed: PositionSample = {
      lat: aircraft.lat,
      lon: aircraft.lon,
      timestampMs: now,
      source: "observed"
    };

    let current = observed;
    if (existing.current && positionsEqual(existing.current, observed)) {
      current = interpolatePosition(existing.current, existing.previous, aircraft, this.config.pollIntervalMs);
    }

    if (existing.current && !positionsEqual(existing.current, current)) {
      existing.previous.push(existing.current);
    }

    existing.current = current;
    this.tracks.set(aircraft.id, existing);

    return {
      id: aircraft.id,
      callsign: aircraft.callsign,
      aircraftTypeIcao: aircraft.aircraftTypeIcao,
      wakeCategory: recatForAircraftType(aircraft.aircraftTypeIcao),
      trackDeg: aircraft.trackDeg,
      coast: current.source === "interpolated",
      groundspeedKts: aircraft.groundspeedKts,
      altitudeAmslFt: aircraft.altitudeAmslFt,
      onGround: aircraft.onGround,
      squawk: aircraft.squawk,
      destinationIata: await this.getDestination(aircraft),
      position: current,
      previousPositions: existing.previous.toArray()
    };
  }

  private async getDestination(aircraft: AdsbAircraft): Promise<string | null> {
    if (!this.fr24Client.isEnabled()) {
      return null;
    }
    return this.fr24Client.getCachedDestination(aircraft);
  }
}
