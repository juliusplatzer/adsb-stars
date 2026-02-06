export type PositionSource = "observed" | "interpolated";

export type WakeCategory =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "NOWGT"
  | "UNKNOWN";

export interface PositionSample {
  lat: number;
  lon: number;
  timestampMs: number;
  source: PositionSource;
}

export interface AircraftFeedItem {
  id: string;
  callsign: string | null;
  aircraftTypeIcao: string | null;
  wakeCategory: WakeCategory;
  trackDeg: number | null;
  coast: boolean;
  groundspeedKts: number | null;
  altitudeAmslFt: number | null;
  onGround: boolean;
  squawk: string | null;
  destinationIata: string | null;
  position: PositionSample;
  previousPositions: PositionSample[];
}

export interface AircraftFeedResponse {
  updatedAtMs: number;
  center: {
    lat: number;
    lon: number;
  };
  radiusNm: number;
  aircraft: AircraftFeedItem[];
}

export interface QnhItem {
  icao: string;
  qnhInHg: number | null;
  observedAt: string | null;
}

export interface QnhResponse {
  requestedIcaos: string[];
  results: QnhItem[];
}

export type WxRegion = "CONUS" | "ALASKA" | "CARIB" | "GUAM" | "HAWAII";

export interface WxReflectivityResponse {
  updatedAtMs: number;
  region: WxRegion;
  center: {
    lat: number;
    lon: number;
  };
  radiusNm: number;
  cellSizeNm: 0.5;
  width: number;
  height: number;
  levels: number[];
}
