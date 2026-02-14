import { createElement, useEffect, useRef, useState } from "https://esm.sh/react@18";
import { createRoot } from "https://esm.sh/react-dom@18/client";
import { StarsUiRenderer } from "./stars/ui.js";
import { StarsListsRenderer } from "./stars/lists.js";
import { DCB_MAPS_CATEGORY_WIDTH_PX, StarsDcbRenderer } from "./stars/dcb.js";
import { StarsWxRenderer } from "./stars/wx.js";
import { RadarBlipRenderer } from "./stars/blip.js";
import {
  StarsDatablockRenderer,
  type DatablockHitRegion,
  type DatablockLeaderDirection
} from "./stars/datablock.js";
import type {
  DcbBriteControlHit,
  DcbBriteInput,
  DcbLeaderControlHit,
  DcbLeaderControlsInput,
  DcbMapCategoryInput,
  DcbRangeRingControlHit,
  DcbWxLevelsInput
} from "./stars/dcb.js";
import { fetchAircraftFeed, fetchQnhByIcao, fetchWxReflectivity } from "./api.js";
import type { AircraftFeedItem, WxReflectivityResponse } from "@vstars/shared";

const SCOPE_MARGIN_X_PX = 0;
const SCOPE_MARGIN_BOTTOM_PX = 18;
const SSA_MARGIN_LEFT_PX = 75;
const SSA_MARGIN_TOP_PX = 9;
const DCB_MAPS_X_PX = 0;
const DCB_MAPS_Y_PX = 6;
const DCB_MAPS_HEIGHT_PX = 60;
const DCB_MAPS_TOTAL_WIDTH_PX = DCB_MAPS_CATEGORY_WIDTH_PX;
const DCB_WX_GAP_PX = 2;
const DCB_WX_X_PX = DCB_MAPS_X_PX + DCB_MAPS_TOTAL_WIDTH_PX + DCB_WX_GAP_PX;
const DCB_WX_Y_PX = DCB_MAPS_Y_PX;
const DCB_WX_BUTTON_COUNT = 6;
const DCB_WX_TOTAL_WIDTH_PX = DCB_WX_BUTTON_COUNT * 30 + (DCB_WX_BUTTON_COUNT - 1) * DCB_WX_GAP_PX;
const DCB_BRITE_GAP_PX = 2;
const DCB_BRITE_BUTTON_WIDTH_PX = 60;
const DCB_BRITE_X_PX = DCB_WX_X_PX + DCB_WX_TOTAL_WIDTH_PX + DCB_BRITE_GAP_PX;
const DCB_BRITE_Y_PX = DCB_MAPS_Y_PX;
const DCB_LDR_GAP_PX = 2;
const DCB_LDR_X_PX = DCB_BRITE_X_PX + DCB_BRITE_BUTTON_WIDTH_PX + DCB_LDR_GAP_PX;
const DCB_LDR_Y_PX = DCB_MAPS_Y_PX;
const DCB_SCOPE_TOP_MARGIN_PX = 1.5;
const DCB_RESERVED_HEIGHT_PX = DCB_MAPS_Y_PX + DCB_MAPS_HEIGHT_PX + DCB_SCOPE_TOP_MARGIN_PX;
const TOWER_LIST_AIRPORT_IATA = "JFK";
const TOWER_LIST_AIRPORT_ICAO = "KJFK";
const TOWER_LIST_TRACON = "N90";
const VIDEO_MAP_CENTER_AIRPORT_ICAO = "KJFK";
const TOWER_LIST_TOP_RATIO = 0.62;
const TOWER_LIST_RESERVED_AIRCRAFT_ROWS = 6;
const VFR_LIST_GAP_LINES = 1;
const CONTROL_POSITION_ID = "2A";
const CONTROL_POSITION_MARGIN_RIGHT_PX = SSA_MARGIN_LEFT_PX;
const SSA_SYMBOL_SIZE_PX = 11;
const SSA_FIRST_TEXT_ROW_OFFSET_PX = SSA_SYMBOL_SIZE_PX + 3;
const RIGHT_LISTS_LEFT_FROM_RIGHT_PX = 195;
const LA_CA_MCI_MARGIN_BOTTOM_PX = 120;
const RIGHT_LISTS_VERTICAL_NUDGE_UP_PX = 12;
const FONT_BASE_PATH = "/public/font/sddCharFontSetASize1";
const SSA_AIRPORT_ICAO = "KJFK";
const SSA_QNH_REFRESH_MS = 60_000;
const AIRCRAFT_REFRESH_MS = 5_000;
const COAST_SUSPEND_MAX_CALLSIGNS = 5;
const LA_CA_MCI_MAX_CONFLICTS = 5;
const CA_LATERAL_THRESHOLD_NM = 3;
const CA_VERTICAL_THRESHOLD_FT = 1000;
const API_BASE_URL = "http://localhost:8080";
const TOWER_LIST_AIRPORT_IATA_NORMALIZED = TOWER_LIST_AIRPORT_IATA.trim().toUpperCase();
const TOWER_LIST_AIRPORT_ICAO_NORMALIZED = TOWER_LIST_AIRPORT_ICAO.trim().toUpperCase();
const TOWER_LIST_TRACON_NORMALIZED = TOWER_LIST_TRACON.trim().toUpperCase();
const VIDEO_MAP_CENTER_AIRPORT_ICAO_NORMALIZED = VIDEO_MAP_CENTER_AIRPORT_ICAO.trim().toUpperCase();
const VIDEO_MAP_STROKE_COLOR = "rgb(255, 255, 255)";
const VIDEO_MAP_STROKE_WIDTH_PX = 0.5;
const VIDEO_MAP_RANGE_NM = 50;
const VIDEO_MAP_MIN_RANGE_NM = 5;
const VIDEO_MAP_MAX_RANGE_NM = 250;
const VIDEO_MAP_WHEEL_ZOOM_STEP = 0.001;
const WHEEL_STEP_THRESHOLD_PX = 90;
const RANGE_RING_SPACING_OPTIONS_NM = [2, 5, 10, 20] as const;
const RANGE_RING_DEFAULT_SPACING_NM = 10;
const RANGE_RING_MAX_DRAW_NM = 200;
const RANGE_RING_STROKE_WIDTH_PX = 0.8;
const RANGE_RING_DEFAULT_BRIGHTNESS_PERCENT = 20;
const RANGE_RING_BRIGHTNESS_STEP_PERCENT = 5;
const DATABLOCK_LEADER_DIRECTIONS: readonly DatablockLeaderDirection[] = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW"
];
const DATABLOCK_LEADER_LEVEL_MIN = 0;
const DATABLOCK_LEADER_LEVEL_MAX = 7;
const DATABLOCK_LEADER_DEFAULT_LEVEL = 1;
const DATABLOCK_LEADER_LEVEL_1_PX = 15;
const DATABLOCK_LEADER_LEVEL_STEP_PX = 10;
const DATABLOCK_LEADER_ZERO_MARGIN_PX = 5;
const WX_REFRESH_MS = 30_000;
const WX_FETCH_MIN_RADIUS_NM = 50;
const WX_FETCH_PADDING_NM = 20;
const WX_FETCH_MAX_RADIUS_NM = 150;
const VFR_TL_INDEX_MIN = 0;
const VFR_TL_INDEX_MAX = 99;
const LOW_ALT_AIRPORT_EXEMPT_RADIUS_NM = 5;
const LOW_ALT_LOCALIZER_EXEMPT_LENGTH_NM = 12;
const LOW_ALT_LOCALIZER_EXEMPT_HALF_WIDTH_NM = 1.5;
const BLIP_RENDER_VFR_1200_ONLY = true;

interface LatLon {
  lat: number;
  lon: number;
}

interface ScopeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TraconRunwayConfig {
  threshold?: string;
  heading_true?: number;
  heading_mag?: number;
}

interface TraconAirportConfig {
  ref?: string;
  runways?: Record<string, TraconRunwayConfig>;
}

interface TraconConfigPayload {
  videomaps?: string;
  mva?: string;
  airports?: Record<string, TraconAirportConfig>;
}

type VideoMapLines = LatLon[][];

interface TouchPinchState {
  startDistancePx: number;
  startRangeNm: number;
}

interface FlightRulesSsePayload {
  callsign?: string;
  rulesLabel?: string;
  flightRules?: string;
  beaconCode?: string;
}

interface MvaPoint {
  lon: number;
  lat: number;
}

interface MvaBounds {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

interface MvaSector {
  name: string;
  minimumLimitFt: number;
  exterior: MvaPoint[];
  holes: MvaPoint[][];
  bounds: MvaBounds;
}

interface ApproachExemptionCorridor {
  runwayId: string;
  threshold: LatLon;
  outboundCourseTrueDeg: number;
  lengthNm: number;
  halfWidthNm: number;
}

interface FlightRuleState {
  rulesLabel: string;
  flightRules: string;
}

function buildDcbMapsCategory(
  activeMapIds: Set<number>,
  rangeNm: number,
  rangeRingSpacingNm: number,
  rangeRingAdjustMode: boolean,
  placeRangeRingCenterMode: boolean,
  rrCntrActive: boolean
): DcbMapCategoryInput {
  const roundedRange = Math.max(0, Math.round(rangeNm));
  const roundedRrSpacing = Math.max(1, Math.round(rangeRingSpacingNm));
  return {
    x: DCB_MAPS_X_PX,
    y: DCB_MAPS_Y_PX,
    rangeLabel: "RANGE",
    rangeValue: String(roundedRange),
    rangeActive: false,
    rangeTone: "normal",
    rrLabel: "RR",
    rrValue: String(roundedRrSpacing),
    rrActive: rangeRingAdjustMode,
    rrTone: "normal",
    placeRrTop: "PLACE",
    placeRrBottom: "RR",
    placeRrActive: placeRangeRingCenterMode,
    placeRrTone: "normal",
    rrCntrTop: "RR",
    rrCntrBottom: "CNTR",
    rrCntrActive,
    rrCntrTone: "normal",
    mapsLabel: "MAPS",
    mapsActive: false,
    topRow: [
      { top: "221", bottom: "J_RNAV", mapId: 221, active: activeMapIds.has(221) },
      { top: "851", bottom: "COAST", mapId: 851, active: activeMapIds.has(851) },
      { top: "849", bottom: "CLASS_B", mapId: 849, active: activeMapIds.has(849) }
    ],
    bottomRow: [
      { top: "220", bottom: "F_RNAV", mapId: 220, active: activeMapIds.has(220) },
      { top: "", bottom: "", active: false },
      { top: "803", bottom: "3NM_MVA", mapId: 803, active: activeMapIds.has(803) }
    ]
  };
}

function buildDcbWxLevels(
  activeLevels: Set<number>,
  levelsWithWxCells: ReadonlySet<number>
): DcbWxLevelsInput {
  return {
    x: DCB_WX_X_PX,
    y: DCB_WX_Y_PX,
    buttons: Array.from({ length: 6 }, (_, index) => {
      const level = index + 1;
      const hasWxCells = levelsWithWxCells.has(level);
      return {
        label: `WX${level}`,
        active: activeLevels.has(level),
        tone: hasWxCells ? "wx" : "normal"
      };
    })
  };
}

function buildDcbBriteInput(
  expanded: boolean,
  rrBrightnessPercent: number,
  rrBrightnessAdjustMode: boolean
): DcbBriteInput {
  const rrBrightnessValue = Math.max(0, Math.min(100, Math.round(rrBrightnessPercent)));
  const rrBrightnessLabel = rrBrightnessValue === 0 ? "OFF" : String(rrBrightnessValue);
  return {
    x: DCB_BRITE_X_PX,
    y: DCB_BRITE_Y_PX,
    label: "BRITE",
    active: expanded,
    tone: "normal",
    expanded,
    topRow: [
      { top: "DCB", bottom: "60" },
      { top: "MPA", bottom: "50" },
      { top: "FDB", bottom: "80" },
      { top: "POS", bottom: "80" },
      { top: "OTH", bottom: "60" },
      { top: "RR", bottom: rrBrightnessLabel, active: rrBrightnessAdjustMode },
      { top: "BCN", bottom: "55" },
      { top: "HST", bottom: "60" },
      { top: "WXC", bottom: "30" }
    ],
    bottomRow: [
      { top: "BKC", bottom: "OFF" },
      { top: "MPB", bottom: "40" },
      { top: "LST", bottom: "80" },
      { top: "LDB", bottom: "80" },
      { top: "TLS", bottom: "40" },
      { top: "CMP", bottom: "40" },
      { top: "PRI", bottom: "70" },
      { top: "WX", bottom: "30" },
      { top: "", bottom: "DONE" }
    ]
  };
}

function buildDcbLeaderControls(
  direction: DatablockLeaderDirection,
  lengthLevel: number,
  directionActive: boolean,
  lengthActive: boolean
): DcbLeaderControlsInput {
  const safeLevel = Math.min(DATABLOCK_LEADER_LEVEL_MAX, Math.max(DATABLOCK_LEADER_LEVEL_MIN, Math.round(lengthLevel)));
  return {
    x: DCB_LDR_X_PX,
    y: DCB_LDR_Y_PX,
    directionLabel: "LDR DIR",
    directionValue: direction,
    directionActive,
    directionTone: "normal",
    lengthLabel: "LDR",
    lengthValue: String(safeLevel),
    lengthActive,
    lengthTone: "normal"
  };
}

function leaderLengthLevelToLinePx(level: number): number {
  const safeLevel = Math.min(DATABLOCK_LEADER_LEVEL_MAX, Math.max(DATABLOCK_LEADER_LEVEL_MIN, Math.round(level)));
  if (safeLevel <= 0) {
    return 0;
  }
  return DATABLOCK_LEADER_LEVEL_1_PX + (safeLevel - 1) * DATABLOCK_LEADER_LEVEL_STEP_PX;
}

function leaderLengthLevelToLayoutPx(level: number): number {
  const linePx = leaderLengthLevelToLinePx(level);
  return linePx > 0 ? linePx : DATABLOCK_LEADER_ZERO_MARGIN_PX;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function distanceNmBetween(a: LatLon, b: LatLon): number {
  const lat1 = toRadians(a.lat);
  const lon1 = toRadians(a.lon);
  const lat2 = toRadians(b.lat);
  const lon2 = toRadians(b.lon);
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const haversine =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const centralAngle = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  const earthRadiusNm = 3440.065;
  return earthRadiusNm * centralAngle;
}

function lateralDistanceNm(a: AircraftFeedItem, b: AircraftFeedItem): number {
  return distanceNmBetween(
    { lat: a.position.lat, lon: a.position.lon },
    { lat: b.position.lat, lon: b.position.lon }
  );
}

function parseDmsToken(token: string, positiveHemisphere: string, negativeHemisphere: string): number | null {
  const trimmed = token.trim();
  if (trimmed.length < 2) {
    return null;
  }

  const hemisphere = trimmed[0].toUpperCase();
  if (hemisphere !== positiveHemisphere && hemisphere !== negativeHemisphere) {
    return null;
  }

  const body = trimmed.slice(1);
  const parts = body.split(".");
  if (parts.length < 3) {
    return null;
  }

  const degrees = Number(parts[0]);
  const minutes = Number(parts[1]);
  const seconds = Number(parts.slice(2).join("."));
  if (!Number.isFinite(degrees) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }

  const decimal = degrees + minutes / 60 + seconds / 3600;
  return hemisphere === negativeHemisphere ? -decimal : decimal;
}

function parseAirportRefCoordinates(ref: string): LatLon | null {
  const [latToken, lonToken] = ref.split(",").map((part) => part.trim());
  if (!latToken || !lonToken) {
    return null;
  }

  const lat = parseDmsToken(latToken, "N", "S");
  const lon = parseDmsToken(lonToken, "E", "W");
  if (lat === null || lon === null) {
    return null;
  }

  return { lat, lon };
}

function extractTowerAirportRef(
  payload: TraconConfigPayload,
  airportIcao: string
): LatLon | null {
  const airport = payload.airports?.[airportIcao];
  if (!airport?.ref) {
    return null;
  }
  return parseAirportRefCoordinates(airport.ref);
}

function normalizeHeadingDeg(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function headingToUnitVector(headingDeg: number): { x: number; y: number } {
  const radians = toRadians(headingDeg);
  return {
    x: Math.sin(radians),
    y: Math.cos(radians)
  };
}

function projectOffsetNm(point: LatLon, origin: LatLon): { x: number; y: number } {
  const nmPerLonDeg = 60 * Math.cos(toRadians(origin.lat));
  return {
    x: (point.lon - origin.lon) * nmPerLonDeg,
    y: (point.lat - origin.lat) * 60
  };
}

function findDescendantsByLocalName(root: Document | Element, localName: string): Element[] {
  return Array.from(root.getElementsByTagName("*")).filter((element) => element.localName === localName);
}

function readFirstDescendantText(root: Document | Element, localName: string): string | null {
  const first = findDescendantsByLocalName(root, localName)[0];
  if (!first) {
    return null;
  }
  const text = first.textContent?.trim();
  return text && text.length > 0 ? text : null;
}

function parseCrs84PosList(posListText: string): MvaPoint[] {
  const numbers = posListText
    .trim()
    .split(/\s+/)
    .map((token) => Number(token))
    .filter((value) => Number.isFinite(value));
  const points: MvaPoint[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    points.push({ lon: numbers[i], lat: numbers[i + 1] });
  }
  return points;
}

function computeMvaBounds(points: MvaPoint[]): MvaBounds {
  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    if (point.lon < minLon) minLon = point.lon;
    if (point.lon > maxLon) maxLon = point.lon;
    if (point.lat < minLat) minLat = point.lat;
    if (point.lat > maxLat) maxLat = point.lat;
  }

  return { minLon, maxLon, minLat, maxLat };
}

function pointInRing(point: MvaPoint, ring: MvaPoint[]): boolean {
  if (ring.length < 3) {
    return false;
  }

  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i].lon;
    const yi = ring[i].lat;
    const xj = ring[j].lon;
    const yj = ring[j].lat;
    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function containsPointInMvaSector(point: MvaPoint, sector: MvaSector): boolean {
  if (
    point.lon < sector.bounds.minLon ||
    point.lon > sector.bounds.maxLon ||
    point.lat < sector.bounds.minLat ||
    point.lat > sector.bounds.maxLat
  ) {
    return false;
  }
  if (!pointInRing(point, sector.exterior)) {
    return false;
  }
  for (const hole of sector.holes) {
    if (pointInRing(point, hole)) {
      return false;
    }
  }
  return true;
}

function findMvaForPosition(position: LatLon, sectors: MvaSector[]): number | null {
  const point: MvaPoint = {
    lon: position.lon,
    lat: position.lat
  };

  let matchedMvaFt: number | null = null;
  for (const sector of sectors) {
    if (!containsPointInMvaSector(point, sector)) {
      continue;
    }
    if (matchedMvaFt === null || sector.minimumLimitFt > matchedMvaFt) {
      matchedMvaFt = sector.minimumLimitFt;
    }
  }
  return matchedMvaFt;
}

function parseMvaSectorsFromXml(xmlText: string): MvaSector[] {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Failed to parse MVA XML document");
  }

  const sectors: MvaSector[] = [];
  for (const airspace of findDescendantsByLocalName(doc, "Airspace")) {
    const timeSlice = findDescendantsByLocalName(airspace, "AirspaceTimeSlice")[0];
    if (!timeSlice) {
      continue;
    }

    const sectorName = (readFirstDescendantText(timeSlice, "name") ?? "").trim().toUpperCase();
    const minimumLimitText = readFirstDescendantText(timeSlice, "minimumLimit");
    const minimumLimitFt = minimumLimitText ? Number(minimumLimitText) : NaN;
    if (!Number.isFinite(minimumLimitFt)) {
      continue;
    }

    const polygonPatches = findDescendantsByLocalName(timeSlice, "PolygonPatch");
    for (const patch of polygonPatches) {
      const exteriorElement = findDescendantsByLocalName(patch, "exterior")[0];
      if (!exteriorElement) {
        continue;
      }
      const exteriorPosList = readFirstDescendantText(exteriorElement, "posList");
      if (!exteriorPosList) {
        continue;
      }
      const exterior = parseCrs84PosList(exteriorPosList);
      if (exterior.length < 3) {
        continue;
      }

      const holes: MvaPoint[][] = [];
      for (const interiorElement of findDescendantsByLocalName(patch, "interior")) {
        const interiorPosList = readFirstDescendantText(interiorElement, "posList");
        if (!interiorPosList) {
          continue;
        }
        const interiorRing = parseCrs84PosList(interiorPosList);
        if (interiorRing.length >= 3) {
          holes.push(interiorRing);
        }
      }

      sectors.push({
        name: sectorName || "UNKNOWN",
        minimumLimitFt,
        exterior,
        holes,
        bounds: computeMvaBounds(exterior)
      });
    }
  }

  return sectors;
}

function extractApproachExemptionCorridors(
  payload: TraconConfigPayload,
  airportIcao: string
): ApproachExemptionCorridor[] {
  const airport = payload.airports?.[airportIcao];
  const runways = airport?.runways;
  if (!runways) {
    return [];
  }

  const corridors: ApproachExemptionCorridor[] = [];
  for (const [runwayId, runway] of Object.entries(runways)) {
    if (!runway) {
      continue;
    }
    const threshold = runway.threshold ? parseAirportRefCoordinates(runway.threshold) : null;
    const headingTrueDeg = Number(runway.heading_true ?? runway.heading_mag);
    if (!threshold || !Number.isFinite(headingTrueDeg)) {
      continue;
    }

    corridors.push({
      runwayId,
      threshold,
      outboundCourseTrueDeg: normalizeHeadingDeg(headingTrueDeg + 180),
      lengthNm: LOW_ALT_LOCALIZER_EXEMPT_LENGTH_NM,
      halfWidthNm: LOW_ALT_LOCALIZER_EXEMPT_HALF_WIDTH_NM
    });
  }
  return corridors;
}

function isInsideApproachExemptionCorridor(
  position: LatLon,
  corridor: ApproachExemptionCorridor
): boolean {
  const relative = projectOffsetNm(position, corridor.threshold);
  const axis = headingToUnitVector(corridor.outboundCourseTrueDeg);
  const alongNm = relative.x * axis.x + relative.y * axis.y;
  const crossNm = Math.abs(-relative.x * axis.y + relative.y * axis.x);
  return alongNm >= 0 && alongNm <= corridor.lengthNm && crossNm <= corridor.halfWidthNm;
}

function formatAltitudeHundreds(altitudeFt: number): string {
  const hundreds = Math.max(0, Math.round(altitudeFt / 100));
  return String(hundreds).padStart(3, "0");
}

function shouldCheckLowAltitude(
  aircraft: AircraftFeedItem,
  flightRulesByCallsign: Map<string, FlightRuleState>
): boolean {
  const squawk = (aircraft.squawk ?? "").trim();
  if (squawk === "1200") {
    return false;
  }

  const callsign = normalizeCallsign(aircraft.callsign);
  if (!callsign) {
    return squawk !== "1200";
  }

  const rules = flightRulesByCallsign.get(callsign);
  const rulesLabel = rules?.rulesLabel ?? "";
  const flightRules = rules?.flightRules ?? "";
  const hasExplicitRuleInfo = rulesLabel.length > 0 || flightRules.length > 0;
  if (!hasExplicitRuleInfo) {
    return squawk !== "1200";
  }

  return rulesLabel === "IFR" || flightRules === "IFR" || flightRules === "I";
}

function isLowAltitudeExempt(
  position: LatLon,
  mainAirportRef: LatLon | null,
  approachCorridors: ApproachExemptionCorridor[]
): boolean {
  if (mainAirportRef && distanceNmBetween(position, mainAirportRef) <= LOW_ALT_AIRPORT_EXEMPT_RADIUS_NM) {
    return true;
  }
  for (const corridor of approachCorridors) {
    if (isInsideApproachExemptionCorridor(position, corridor)) {
      return true;
    }
  }
  return false;
}

function collectLowAltitudeAlerts(
  aircraft: AircraftFeedItem[],
  sectors: MvaSector[],
  mainAirportRef: LatLon | null,
  approachCorridors: ApproachExemptionCorridor[],
  flightRulesByCallsign: Map<string, FlightRuleState>
): string[] {
  if (sectors.length === 0) {
    return [];
  }

  const alerts: string[] = [];
  const seenCallsigns = new Set<string>();
  for (const entry of aircraft) {
    const callsign = normalizeCallsign(entry.callsign);
    if (!callsign || seenCallsigns.has(callsign)) {
      continue;
    }
    if (entry.altitudeAmslFt === null || !Number.isFinite(entry.altitudeAmslFt)) {
      continue;
    }
    if (!shouldCheckLowAltitude(entry, flightRulesByCallsign)) {
      continue;
    }

    const position = { lat: entry.position.lat, lon: entry.position.lon };
    if (isLowAltitudeExempt(position, mainAirportRef, approachCorridors)) {
      continue;
    }

    const mvaFt = findMvaForPosition(position, sectors);
    if (mvaFt === null) {
      continue;
    }
    if (entry.altitudeAmslFt >= mvaFt) {
      continue;
    }

    seenCallsigns.add(callsign);
    alerts.push(`${callsign} ${formatAltitudeHundreds(entry.altitudeAmslFt)} LA`);
  }
  return alerts;
}

function resolveStaticAssetPath(path: string | undefined): string | null {
  if (!path) {
    return null;
  }
  const trimmed = path.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("src/client/")) {
    return `/${trimmed.slice("src/client/".length)}`;
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function parseVideoMapLines(raw: unknown): VideoMapLines {
  if (!Array.isArray(raw)) {
    return [];
  }
  const lines: VideoMapLines = [];
  for (const rawPolyline of raw) {
    if (!Array.isArray(rawPolyline)) {
      continue;
    }
    const polyline: LatLon[] = [];
    const flush = (): void => {
      if (polyline.length >= 2) {
        lines.push(polyline.slice());
      }
      polyline.length = 0;
    };
    for (const rawPoint of rawPolyline) {
      if (!Array.isArray(rawPoint) || rawPoint.length < 2) {
        flush();
        continue;
      }
      const lon = Number(rawPoint[0]);
      const lat = Number(rawPoint[1]);
      const isFinitePoint = Number.isFinite(lat) && Number.isFinite(lon);
      const isZeroSentinel = Math.abs(lat) < 1e-6 && Math.abs(lon) < 1e-6;
      if (!isFinitePoint || isZeroSentinel) {
        flush();
        continue;
      }
      polyline.push({ lat, lon });
    }
    flush();
  }
  return lines;
}

function parseVideoMapsById(payload: unknown): Map<number, VideoMapLines> {
  const out = new Map<number, VideoMapLines>();
  if (!Array.isArray(payload)) {
    return out;
  }

  for (const rawEntry of payload) {
    if (!rawEntry || typeof rawEntry !== "object") {
      continue;
    }
    const entry = rawEntry as Record<string, unknown>;
    const id = Number(entry.Id ?? entry.id);
    if (!Number.isFinite(id)) {
      continue;
    }
    const lines = parseVideoMapLines(entry.Lines ?? entry.lines);
    out.set(Math.floor(id), lines);
  }

  return out;
}

async function fetchTraconConfig(tracon: string): Promise<TraconConfigPayload> {
  const url = `/data/configs/${tracon}.json`;
  const response = await fetch(url, {
    headers: {
      accept: "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to load TRACON config ${tracon}: HTTP ${response.status}`);
  }

  return (await response.json()) as TraconConfigPayload;
}

function projectLatLonToScope(
  point: LatLon,
  center: LatLon,
  radiusNm: number,
  scopeRect: ScopeRect
): { x: number; y: number } {
  const nmPerLonDeg = 60 * Math.cos(toRadians(center.lat));
  const dxNm = (point.lon - center.lon) * nmPerLonDeg;
  const dyNm = (point.lat - center.lat) * 60;
  const pixelsPerNm = Math.min(scopeRect.width, scopeRect.height) / (2 * radiusNm);
  return {
    x: scopeRect.x + scopeRect.width * 0.5 + dxNm * pixelsPerNm,
    y: scopeRect.y + scopeRect.height * 0.5 - dyNm * pixelsPerNm
  };
}

function unprojectScopeToLatLon(
  pointPx: { x: number; y: number },
  center: LatLon,
  radiusNm: number,
  scopeRect: ScopeRect,
  panOffsetPxX: number,
  panOffsetPxY: number
): LatLon | null {
  if (!Number.isFinite(radiusNm) || radiusNm <= 0) {
    return null;
  }

  const pixelsPerNm = Math.min(scopeRect.width, scopeRect.height) / (2 * radiusNm);
  if (!Number.isFinite(pixelsPerNm) || pixelsPerNm <= 0) {
    return null;
  }

  const scopeCenterX = scopeRect.x + scopeRect.width * 0.5;
  const scopeCenterY = scopeRect.y + scopeRect.height * 0.5;
  const dxNm = (pointPx.x - scopeCenterX - panOffsetPxX) / pixelsPerNm;
  const dyNm = -(pointPx.y - scopeCenterY - panOffsetPxY) / pixelsPerNm;

  const lat = center.lat + dyNm / 60;
  const nmPerLonDeg = 60 * Math.cos(toRadians(center.lat));
  if (!Number.isFinite(nmPerLonDeg) || Math.abs(nmPerLonDeg) < 1e-9) {
    return null;
  }
  const lon = center.lon + dxNm / nmPerLonDeg;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return { lat, lon };
}

function stepRangeRingSpacingNm(
  currentSpacingNm: number,
  deltaDirection: number
): number {
  const normalizedDirection = deltaDirection === 0 ? 0 : deltaDirection > 0 ? 1 : -1;
  if (normalizedDirection === 0) {
    return currentSpacingNm;
  }

  let currentIndex = RANGE_RING_SPACING_OPTIONS_NM.findIndex((value) => value === currentSpacingNm);
  if (currentIndex === -1) {
    const fallback = [...RANGE_RING_SPACING_OPTIONS_NM].sort((a, b) => Math.abs(a - currentSpacingNm) - Math.abs(b - currentSpacingNm))[0];
    currentIndex = RANGE_RING_SPACING_OPTIONS_NM.findIndex((value) => value === fallback);
  }

  const nextIndex = Math.min(
    RANGE_RING_SPACING_OPTIONS_NM.length - 1,
    Math.max(0, currentIndex + normalizedDirection)
  );
  return RANGE_RING_SPACING_OPTIONS_NM[nextIndex] ?? currentSpacingNm;
}

function drawRangeRings(
  ctx: CanvasRenderingContext2D,
  scopeRect: ScopeRect,
  mapCenter: LatLon | null,
  mapRangeNm: number | null,
  panOffsetPxX: number,
  panOffsetPxY: number,
  ringCenter: LatLon | null,
  ringSpacingNm: number,
  ringBrightnessPercent: number
): void {
  if (!mapCenter || mapRangeNm === null || mapRangeNm <= 0 || !ringCenter || ringSpacingNm <= 0) {
    return;
  }

  const projectedCenter = projectLatLonToScope(ringCenter, mapCenter, mapRangeNm, scopeRect);
  const centerX = projectedCenter.x + panOffsetPxX;
  const centerY = projectedCenter.y + panOffsetPxY;
  const pixelsPerNm = Math.min(scopeRect.width, scopeRect.height) / (2 * mapRangeNm);
  if (!Number.isFinite(pixelsPerNm) || pixelsPerNm <= 0) {
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(scopeRect.x, scopeRect.y, scopeRect.width, scopeRect.height);
  ctx.clip();
  const alpha = Math.max(0, Math.min(1, ringBrightnessPercent / 100));
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.lineWidth = RANGE_RING_STROKE_WIDTH_PX;

  for (let radiusNm = ringSpacingNm; radiusNm <= RANGE_RING_MAX_DRAW_NM; radiusNm += ringSpacingNm) {
    const radiusPx = radiusNm * pixelsPerNm;
    if (!Number.isFinite(radiusPx) || radiusPx <= 0) {
      continue;
    }
    ctx.beginPath();
    ctx.arc(centerX, centerY, radiusPx, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawSelectedVideoMaps(
  ctx: CanvasRenderingContext2D,
  scopeRect: ScopeRect,
  center: LatLon | null,
  radiusNm: number | null,
  panOffsetPxX: number,
  panOffsetPxY: number,
  activeMapIds: Set<number>,
  videoMapsById: Map<number, VideoMapLines>
): void {
  if (!center || radiusNm === null || radiusNm <= 0 || activeMapIds.size === 0) {
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(scopeRect.x, scopeRect.y, scopeRect.width, scopeRect.height);
  ctx.clip();
  ctx.strokeStyle = VIDEO_MAP_STROKE_COLOR;
  ctx.lineWidth = VIDEO_MAP_STROKE_WIDTH_PX;

  const sortedIds = Array.from(activeMapIds).sort((a, b) => a - b);
  for (const mapId of sortedIds) {
    const lines = videoMapsById.get(mapId);
    if (!lines || lines.length === 0) {
      continue;
    }
    for (const polyline of lines) {
      if (polyline.length < 2) {
        continue;
      }
      const first = projectLatLonToScope(polyline[0], center, radiusNm, scopeRect);
      ctx.beginPath();
      ctx.moveTo(first.x + panOffsetPxX, first.y + panOffsetPxY);
      for (let i = 1; i < polyline.length; i += 1) {
        const projected = projectLatLonToScope(polyline[i], center, radiusNm, scopeRect);
        ctx.lineTo(projected.x + panOffsetPxX, projected.y + panOffsetPxY);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function clampVideoMapRange(rangeNm: number): number {
  return Math.min(VIDEO_MAP_MAX_RANGE_NM, Math.max(VIDEO_MAP_MIN_RANGE_NM, rangeNm));
}

function resolveWxFetchRadiusNm(viewRangeNm: number): number {
  const padded = Math.ceil(viewRangeNm + WX_FETCH_PADDING_NM);
  return Math.min(WX_FETCH_MAX_RADIUS_NM, Math.max(WX_FETCH_MIN_RADIUS_NM, padded));
}

function touchDistancePx(touchA: Touch, touchB: Touch): number {
  const dx = touchB.clientX - touchA.clientX;
  const dy = touchB.clientY - touchA.clientY;
  return Math.hypot(dx, dy);
}

function normalizeWheelDeltaPx(event: WheelEvent): number {
  if (event.deltaMode === 1) {
    return event.deltaY * 16;
  }
  if (event.deltaMode === 2) {
    return event.deltaY * window.innerHeight;
  }
  return event.deltaY;
}

function consumeWheelStepAccumulator(
  accumulatorPx: number,
  deltaPx: number
): { steps: number; accumulatorPx: number } {
  const combined = accumulatorPx + deltaPx;
  let steps = 0;
  if (combined >= WHEEL_STEP_THRESHOLD_PX) {
    steps = Math.floor(combined / WHEEL_STEP_THRESHOLD_PX);
  } else if (combined <= -WHEEL_STEP_THRESHOLD_PX) {
    steps = Math.ceil(combined / WHEEL_STEP_THRESHOLD_PX);
  }
  return {
    steps,
    accumulatorPx: combined - steps * WHEEL_STEP_THRESHOLD_PX
  };
}

function pointInScopeRect(
  x: number,
  y: number,
  scopeRect: ScopeRect
): boolean {
  return (
    x >= scopeRect.x &&
    y >= scopeRect.y &&
    x <= scopeRect.x + scopeRect.width &&
    y <= scopeRect.y + scopeRect.height
  );
}

function isConflictAlertPair(a: AircraftFeedItem, b: AircraftFeedItem): boolean {
  if (a.altitudeAmslFt === null || b.altitudeAmslFt === null) {
    return false;
  }
  if (!a.callsign || !b.callsign) {
    return false;
  }
  const squawkA = (a.squawk ?? "").trim();
  const squawkB = (b.squawk ?? "").trim();
  if (squawkA === "1200" && squawkB === "1200") {
    return false;
  }

  const verticalFt = Math.abs(a.altitudeAmslFt - b.altitudeAmslFt);
  if (verticalFt > CA_VERTICAL_THRESHOLD_FT) {
    return false;
  }

  const lateralNm = lateralDistanceNm(a, b);
  return lateralNm < CA_LATERAL_THRESHOLD_NM;
}

function conflictAlertLabel(a: AircraftFeedItem, b: AircraftFeedItem): string {
  const callsignA = (a.callsign ?? "").trim().toUpperCase();
  const callsignB = (b.callsign ?? "").trim().toUpperCase();
  const pair = callsignA < callsignB ? `${callsignA}*${callsignB}` : `${callsignB}*${callsignA}`;
  return `${pair} CA`;
}

function collectConflictAlertPairs(aircraft: AircraftFeedItem[]): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < aircraft.length; i += 1) {
    for (let j = i + 1; j < aircraft.length; j += 1) {
      const a = aircraft[i];
      const b = aircraft[j];
      if (!isConflictAlertPair(a, b)) {
        continue;
      }

      const label = conflictAlertLabel(a, b);
      if (seen.has(label)) {
        continue;
      }
      seen.add(label);
      labels.push(label);
      if (labels.length >= LA_CA_MCI_MAX_CONFLICTS) {
        return labels;
      }
    }
  }

  return labels;
}

function isVfr1200Target(aircraft: AircraftFeedItem): boolean {
  return (aircraft.squawk ?? "").trim() === "1200";
}

function normalizeCallsign(raw: unknown): string | null {
  const callsign = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return callsign || null;
}

function normalizeRulesLabel(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toUpperCase() : "";
}

function normalizeBeaconCode(raw: unknown): string | null {
  const beaconCode = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return beaconCode || null;
}

function chooseRandomUniqueTlIndex(used: Set<string>): string | null {
  const available: string[] = [];
  for (let i = VFR_TL_INDEX_MIN; i <= VFR_TL_INDEX_MAX; i += 1) {
    const candidate = String(i).padStart(2, "0");
    if (!used.has(candidate)) {
      available.push(candidate);
    }
  }
  if (available.length === 0) {
    return null;
  }
  return available[Math.floor(Math.random() * available.length)] ?? null;
}

function StarsApp(): ReturnType<typeof createElement> {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<StarsUiRenderer>(null);
  const listsRendererRef = useRef<StarsListsRenderer>(null);
  const dcbRendererRef = useRef<StarsDcbRenderer>(null);
  const wxRendererRef = useRef<StarsWxRenderer>(null);
  const blipRendererRef = useRef<RadarBlipRenderer>(null);
  const datablockRendererRef = useRef<StarsDatablockRenderer>(null);
  const headingOffsetRef = useRef<number>(0);
  const signedOnUtcRef = useRef<Date>(new Date());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.margin = "0";
    document.body.style.background = "black";
    document.body.style.overflow = "hidden";
  }, []);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;

    const initialize = async (): Promise<void> => {
      try {
        const canvas = canvasRef.current;
        if (!canvas) {
          throw new Error("Canvas mount failed.");
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Unable to initialize 2D canvas context.");
        }

        const [renderer, listsRenderer, dcbRenderer, blipRenderer, datablockRenderer] = await Promise.all([
          StarsUiRenderer.create({ fontBasePath: FONT_BASE_PATH }),
          StarsListsRenderer.create({ fontBasePath: FONT_BASE_PATH }),
          StarsDcbRenderer.create({ fontBasePath: FONT_BASE_PATH }),
          RadarBlipRenderer.create(),
          StarsDatablockRenderer.create()
        ]);
        if (disposed) {
          return;
        }
        rendererRef.current = renderer;
        listsRendererRef.current = listsRenderer;
        dcbRendererRef.current = dcbRenderer;
        wxRendererRef.current = new StarsWxRenderer();
        blipRendererRef.current = blipRenderer;
        datablockRendererRef.current = datablockRenderer;

        let cssWidth = 0;
        let cssHeight = 0;
        let ssaQnhInHg: number | null = null;
        let towerInboundAircraft: Array<{
          callsign: string | null;
          aircraftTypeIcao: string | null;
        }> = [];
        let towerAirportRef: LatLon | null = null;
        let videoMapCenterRef: LatLon | null = null;
        let videoMapsById = new Map<number, VideoMapLines>();
        let videoMapRangeNm = VIDEO_MAP_RANGE_NM;
        let videoMapPanOffsetPxX = 0;
        let videoMapPanOffsetPxY = 0;
        let rangeRingSpacingNm = RANGE_RING_DEFAULT_SPACING_NM;
        let rangeRingCenterRef: LatLon | null = null;
        let rangeRingAdjustMode = false;
        let placeRangeRingCenterMode = false;
        let leaderDirectionIndex = 0;
        let leaderLengthLevel = DATABLOCK_LEADER_DEFAULT_LEVEL;
        let leaderDirectionAdjustMode = false;
        let leaderLengthAdjustMode = false;
        let rrCntrFlashActive = false;
        let rrCntrFlashTimer: number | null = null;
        let briteExpanded = false;
        let rrBrightnessPercent = RANGE_RING_DEFAULT_BRIGHTNESS_PERCENT;
        let rrBrightnessAdjustMode = false;
        let rrSpacingWheelAccumulatorPx = 0;
        let leaderDirectionWheelAccumulatorPx = 0;
        let leaderLengthWheelAccumulatorPx = 0;
        let rrBrightnessWheelAccumulatorPx = 0;
        let videoMapPanDragLast: { x: number; y: number } | null = null;
        let videoMapPanDragActive = false;
        let warnedMissingWxDcbApi = false;
        const activeMapIds = new Set<number>();
        const activeWxLevels = new Set<number>();
        const wxLevelsWithCells = new Set<number>();
        let wxRadar: WxReflectivityResponse | null = null;
        let wxRefreshInFlight = false;
        let coastSuspendCallsigns: string[] = [];
        let laCaMciConflictAlerts: string[] = [];
        let displayedAircraft: AircraftFeedItem[] = [];
        const expandedDatablockAircraftIds = new Set<string>();
        let datablockHitRegions: DatablockHitRegion[] = [];
        let mvaSectors: MvaSector[] = [];
        let approachExemptionCorridors: ApproachExemptionCorridor[] = [];
        const flightRulesByCallsign = new Map<string, FlightRuleState>();
        const vfrEntriesByCallsign = new Map<string, { index: string; beaconCode: string | null }>();
        const vfrUsedTlIndices = new Set<string>();
        let vfrListEntries: Array<{ index: string; callsign: string; squawk: string | null }> = [];
        let touchPinchState: TouchPinchState | null = null;
        let flightRulesEventSource: EventSource | null = null;

        const getScopeRect = (): ScopeRect => ({
          x: SCOPE_MARGIN_X_PX,
          y: DCB_RESERVED_HEIGHT_PX,
          width: Math.max(1, cssWidth - SCOPE_MARGIN_X_PX * 2),
          height: Math.max(1, cssHeight - DCB_RESERVED_HEIGHT_PX - SCOPE_MARGIN_BOTTOM_PX)
        });

        const getDefaultRangeRingCenter = (): LatLon | null =>
          videoMapCenterRef ?? towerAirportRef;

        const getDcbMapsInput = (): DcbMapCategoryInput =>
          buildDcbMapsCategory(
            activeMapIds,
            videoMapRangeNm,
            rangeRingSpacingNm,
            rangeRingAdjustMode,
            placeRangeRingCenterMode,
            rrCntrFlashActive
          );

        const getLeaderDirection = (): DatablockLeaderDirection =>
          DATABLOCK_LEADER_DIRECTIONS[leaderDirectionIndex] ?? "N";

        const getDcbBriteInput = (): DcbBriteInput =>
          buildDcbBriteInput(briteExpanded, rrBrightnessPercent, rrBrightnessAdjustMode);

        const getDcbLeaderControlsInput = (): DcbLeaderControlsInput =>
          buildDcbLeaderControls(
            getLeaderDirection(),
            leaderLengthLevel,
            leaderDirectionAdjustMode,
            leaderLengthAdjustMode
          );

        const getLeaderLineLengthPx = (): number => leaderLengthLevelToLinePx(leaderLengthLevel);
        const getLeaderLayoutLengthPx = (): number => leaderLengthLevelToLayoutPx(leaderLengthLevel);

        const rebuildVfrListEntries = (): void => {
          const entries: Array<{ index: string; callsign: string; squawk: string | null }> = [];
          for (const [callsign, value] of vfrEntriesByCallsign.entries()) {
            entries.push({
              index: value.index,
              callsign,
              squawk: value.beaconCode
            });
          }
          entries.sort((a, b) => a.index.localeCompare(b.index));
          vfrListEntries = entries;
        };

        const resolveWxCenter = (): LatLon | null => videoMapCenterRef ?? towerAirportRef;

        const refreshWxRadar = async (force = false): Promise<void> => {
          if (activeWxLevels.size === 0) {
            return;
          }
          const center = resolveWxCenter();
          if (!center || wxRefreshInFlight) {
            return;
          }

          const requestedRadiusNm = resolveWxFetchRadiusNm(videoMapRangeNm);
          if (
            !force &&
            wxRadar &&
            Math.abs(wxRadar.center.lat - center.lat) < 1e-6 &&
            Math.abs(wxRadar.center.lon - center.lon) < 1e-6 &&
            wxRadar.radiusNm >= requestedRadiusNm
          ) {
            return;
          }

          wxRefreshInFlight = true;
          try {
            const response = await fetchWxReflectivity(center, {
              baseUrl: API_BASE_URL,
              radiusNm: requestedRadiusNm
            });
            if (disposed) {
              return;
            }
            wxRadar = response;
            wxLevelsWithCells.clear();
            for (let i = 0; i < response.levels.length; i += 1) {
              const level = response.levels[i];
              if (level >= 1 && level <= 6) {
                wxLevelsWithCells.add(level);
                if (wxLevelsWithCells.size === 6) {
                  break;
                }
              }
            }
            render();
          } catch (wxError) {
            console.error("Failed to refresh WX radar:", wxError);
          } finally {
            wxRefreshInFlight = false;
          }
        };

        const ensureWxCoverageForCurrentRange = (): void => {
          const neededRadiusNm = resolveWxFetchRadiusNm(videoMapRangeNm);
          if (!wxRadar || wxRadar.radiusNm < neededRadiusNm) {
            void refreshWxRadar(true);
          }
        };

        const render = (): void => {
          if (!rendererRef.current) {
            return;
          }

          const scopeRect = getScopeRect();
          const rightListsLeftX = scopeRect.x + scopeRect.width - RIGHT_LISTS_LEFT_FROM_RIGHT_PX;
          const controlPositionY = scopeRect.y + SSA_MARGIN_TOP_PX + SSA_FIRST_TEXT_ROW_OFFSET_PX;
          const towerListY = scopeRect.y + Math.round(scopeRect.height * TOWER_LIST_TOP_RATIO);
          const towerLineCount = 1 + TOWER_LIST_RESERVED_AIRCRAFT_ROWS;
          const listsLineHeightPx = listsRendererRef.current?.getLineHeight() ?? 14;
          const vfrListY = towerListY + (towerLineCount + VFR_LIST_GAP_LINES) * listsLineHeightPx;

          rendererRef.current.draw(ctx, {
            scopeRect,
            compass: {
              headingOffsetDeg: headingOffsetRef.current ?? 0,
              magneticVariation: "13W",
              edgeInsetPx: 0,
              minorTickStepDeg: 5,
              majorTickStepDeg: 10,
              labelStepDeg: 10,
              minorTickLengthPx: 8,
              majorTickLengthPx: 15,
              labelInsetPx: 6,
              labelVerticalNudgePx: 2
            }
          });

          wxRendererRef.current?.draw(ctx, {
            scopeRect,
            viewCenter: resolveWxCenter(),
            viewRadiusNm: videoMapRangeNm,
            panOffsetPxX: videoMapPanOffsetPxX,
            panOffsetPxY: videoMapPanOffsetPxY,
            activeLevels: activeWxLevels,
            radar: wxRadar
          });

          drawRangeRings(
            ctx,
            scopeRect,
            videoMapCenterRef,
            videoMapRangeNm,
            videoMapPanOffsetPxX,
            videoMapPanOffsetPxY,
            rangeRingCenterRef,
            rangeRingSpacingNm,
            rrBrightnessPercent
          );

          drawSelectedVideoMaps(
            ctx,
            scopeRect,
            videoMapCenterRef,
            videoMapRangeNm,
            videoMapPanOffsetPxX,
            videoMapPanOffsetPxY,
            activeMapIds,
            videoMapsById
          );

          const blipRenderer = blipRendererRef.current;
          const datablockRenderer = datablockRendererRef.current;
          const radarCenter = resolveWxCenter();
          if (blipRenderer && datablockRenderer && radarCenter && videoMapRangeNm > 0) {
            const aircraftToDraw = BLIP_RENDER_VFR_1200_ONLY
              ? displayedAircraft.filter(isVfr1200Target)
              : displayedAircraft;
            datablockHitRegions = [];
            const leaderDirection = getLeaderDirection();
            const leaderLineLengthPx = getLeaderLineLengthPx();
            const leaderLayoutLengthPx = getLeaderLayoutLengthPx();

            ctx.save();
            ctx.beginPath();
            ctx.rect(scopeRect.x, scopeRect.y, scopeRect.width, scopeRect.height);
            ctx.clip();

            for (const aircraft of aircraftToDraw) {
              const projectedCurrent = projectLatLonToScope(
                { lat: aircraft.position.lat, lon: aircraft.position.lon },
                radarCenter,
                videoMapRangeNm,
                scopeRect
              );
              const drawX = projectedCurrent.x + videoMapPanOffsetPxX;
              const drawY = projectedCurrent.y + videoMapPanOffsetPxY;

              blipRenderer.drawHistoryDots(ctx, aircraft.previousPositions, {
                dotRadiusPx: 3.5,
                maxDots: 5,
                projectPosition: (sample) => {
                  const projected = projectLatLonToScope(
                    { lat: sample.lat, lon: sample.lon },
                    radarCenter,
                    videoMapRangeNm,
                    scopeRect
                  );
                  return {
                    x: projected.x + videoMapPanOffsetPxX,
                    y: projected.y + videoMapPanOffsetPxY
                  };
                }
              });

              const datablockInput = {
                id: aircraft.id,
                blipX: drawX,
                blipY: drawY,
                altitudeAmslFt: aircraft.altitudeAmslFt,
                groundspeedKts: aircraft.groundspeedKts,
                squawk: aircraft.squawk,
                callsign: aircraft.callsign,
                expanded: expandedDatablockAircraftIds.has(aircraft.id),
                leaderLengthPx: leaderLayoutLengthPx,
                leaderDirection
              };

              // Draw leader first so the blip/symbol sits on top of it.
              datablockRenderer.drawWithOptions(ctx, datablockInput, {
                drawLeader: leaderLineLengthPx > 0,
                drawText: false
              });

              blipRenderer.drawVfr1200(ctx, {
                x: drawX,
                y: drawY,
                squawk: aircraft.squawk,
                trackDeg: aircraft.trackDeg
              });

              const hit = datablockRenderer.drawWithOptions(ctx, datablockInput, {
                drawLeader: false,
                drawText: true
              });
              datablockHitRegions.push(hit);
            }
            ctx.restore();
          }

          dcbRendererRef.current?.drawMapsCategory(ctx, getDcbMapsInput());
          const wxDrawer = dcbRendererRef.current as unknown as {
            drawWxLevels?: (ctxArg: CanvasRenderingContext2D, input: DcbWxLevelsInput) => void;
          } | null;
          if (wxDrawer && typeof wxDrawer.drawWxLevels === "function") {
            wxDrawer.drawWxLevels(ctx, buildDcbWxLevels(activeWxLevels, wxLevelsWithCells));
          } else if (!warnedMissingWxDcbApi) {
            warnedMissingWxDcbApi = true;
            console.warn("DCB WX API is missing in runtime module. Hard-refresh to load latest dcb.js.");
          }
          const ldrDrawer = dcbRendererRef.current as unknown as {
            drawLeaderControls?: (ctxArg: CanvasRenderingContext2D, input: DcbLeaderControlsInput) => void;
          } | null;
          if (ldrDrawer && typeof ldrDrawer.drawLeaderControls === "function") {
            ldrDrawer.drawLeaderControls(ctx, getDcbLeaderControlsInput());
          }
          const briteDrawer = dcbRendererRef.current as unknown as {
            drawBrite?: (ctxArg: CanvasRenderingContext2D, input: DcbBriteInput) => void;
          } | null;
          if (briteDrawer && typeof briteDrawer.drawBrite === "function") {
            briteDrawer.drawBrite(ctx, getDcbBriteInput());
          }

          listsRendererRef.current?.drawSsa(ctx, {
            x: scopeRect.x + SSA_MARGIN_LEFT_PX,
            y: scopeRect.y + SSA_MARGIN_TOP_PX,
            airportIcao: SSA_AIRPORT_ICAO,
            qnhInHg: ssaQnhInHg,
            rangeNm: videoMapRangeNm
          });

          listsRendererRef.current?.drawTowerList(ctx, {
            x: scopeRect.x + SSA_MARGIN_LEFT_PX,
            y: towerListY,
            align: "left",
            airportIata: TOWER_LIST_AIRPORT_IATA_NORMALIZED,
            aircraft: towerInboundAircraft
          });

          listsRendererRef.current?.drawVfrList(ctx, {
            x: scopeRect.x + SSA_MARGIN_LEFT_PX,
            y: vfrListY,
            align: "left",
            entries: vfrListEntries
          });

          listsRendererRef.current?.drawControlPosition(ctx, {
            x: scopeRect.x + scopeRect.width - CONTROL_POSITION_MARGIN_RIGHT_PX,
            y: controlPositionY,
            align: "right",
            positionId: CONTROL_POSITION_ID,
            signedOnUtc: signedOnUtcRef.current ?? new Date()
          });

          listsRendererRef.current?.drawCoastSuspend(ctx, {
            x: rightListsLeftX,
            y: scopeRect.y + Math.round(scopeRect.height * 0.5) - RIGHT_LISTS_VERTICAL_NUDGE_UP_PX,
            align: "left",
            callsigns: coastSuspendCallsigns
          });

          listsRendererRef.current?.drawLaCaMci(ctx, {
            x: rightListsLeftX,
            y:
              scopeRect.y +
              scopeRect.height -
              LA_CA_MCI_MARGIN_BOTTOM_PX -
              RIGHT_LISTS_VERTICAL_NUDGE_UP_PX,
            align: "left",
            conflictAlerts: laCaMciConflictAlerts
          });
        };

        const refreshSsaQnh = async (): Promise<void> => {
          try {
            const response = await fetchQnhByIcao([SSA_AIRPORT_ICAO], { baseUrl: API_BASE_URL });
            if (disposed) {
              return;
            }
            const match = response.results.find((item) => item.icao === SSA_AIRPORT_ICAO);
            ssaQnhInHg = match?.qnhInHg ?? null;
            render();
          } catch (qnhError) {
            console.error("Failed to refresh SSA QNH:", qnhError);
          }
        };

        const refreshTraconMetadata = async (): Promise<void> => {
          try {
            const traconConfig = await fetchTraconConfig(TOWER_LIST_TRACON_NORMALIZED);
            if (disposed) {
              return;
            }

            towerAirportRef = extractTowerAirportRef(traconConfig, TOWER_LIST_AIRPORT_ICAO_NORMALIZED);
            videoMapCenterRef = extractTowerAirportRef(
              traconConfig,
              VIDEO_MAP_CENTER_AIRPORT_ICAO_NORMALIZED
            );
            if (videoMapCenterRef === null) {
              videoMapCenterRef = towerAirportRef;
            }
            if (rangeRingCenterRef === null) {
              rangeRingCenterRef = videoMapCenterRef ?? towerAirportRef;
            }
            approachExemptionCorridors = extractApproachExemptionCorridors(
              traconConfig,
              VIDEO_MAP_CENTER_AIRPORT_ICAO_NORMALIZED
            );
            void refreshWxRadar(true);

            const configuredMvaPath = resolveStaticAssetPath(traconConfig.mva);
            const fallbackMvaPath = `/data/mva/${TOWER_LIST_TRACON_NORMALIZED}_MVA_FUS3.xml`;
            const mvaPath = configuredMvaPath ?? fallbackMvaPath;
            try {
              const mvaResponse = await fetch(mvaPath, {
                headers: {
                  accept: "application/xml,text/xml,*/*"
                }
              });
              if (!mvaResponse.ok) {
                throw new Error(`HTTP ${mvaResponse.status}`);
              }
              const mvaXmlText = await mvaResponse.text();
              if (disposed) {
                return;
              }
              mvaSectors = parseMvaSectorsFromXml(mvaXmlText);
            } catch (mvaError) {
              console.error("Failed to load MVA sectors:", mvaError);
              mvaSectors = [];
            }

            const videomapsPath = resolveStaticAssetPath(traconConfig.videomaps);
            if (!videomapsPath) {
              videoMapsById = new Map();
              render();
              return;
            }

            const mapsResponse = await fetch(videomapsPath, {
              headers: {
                accept: "application/json"
              }
            });
            if (!mapsResponse.ok) {
              throw new Error(`Failed to load videomap payload ${videomapsPath}: HTTP ${mapsResponse.status}`);
            }
            const mapsPayload = (await mapsResponse.json()) as unknown;
            if (disposed) {
              return;
            }
            videoMapsById = parseVideoMapsById(mapsPayload);
            if (disposed) {
              return;
            }
            render();
          } catch (traconLoadError) {
            console.error("Failed to load TRACON metadata:", traconLoadError);
          }
        };

        const refreshCoastSuspend = async (): Promise<void> => {
          try {
            const response = await fetchAircraftFeed({ baseUrl: API_BASE_URL });
            if (disposed) {
              return;
            }
            displayedAircraft = response.aircraft;

            const visibleAircraftIds = new Set(response.aircraft.map((aircraft) => aircraft.id));
            for (const id of [...expandedDatablockAircraftIds]) {
              if (!visibleAircraftIds.has(id)) {
                expandedDatablockAircraftIds.delete(id);
              }
            }

            const callsigns: string[] = [];
            const seen = new Set<string>();
            for (const aircraft of response.aircraft) {
              if (!aircraft.coast) {
                continue;
              }
              const callsign = (aircraft.callsign ?? "").trim().toUpperCase();
              if (!callsign || seen.has(callsign)) {
                continue;
              }
              seen.add(callsign);
              callsigns.push(callsign);
              if (callsigns.length >= COAST_SUSPEND_MAX_CALLSIGNS) {
                break;
              }
            }

            coastSuspendCallsigns = callsigns;
            const towerInbound: Array<{
              callsign: string | null;
              aircraftTypeIcao: string | null;
              distanceNm: number | null;
            }> = [];
            const towerSeen = new Set<string>();
            for (const aircraft of response.aircraft) {
              const destinationIata = (aircraft.destinationIata ?? "").trim().toUpperCase();
              if (destinationIata !== TOWER_LIST_AIRPORT_IATA_NORMALIZED) {
                continue;
              }

              const callsign = (aircraft.callsign ?? "").trim().toUpperCase();
              if (!callsign || towerSeen.has(callsign)) {
                continue;
              }
              towerSeen.add(callsign);
              const aircraftTypeIcao = (aircraft.aircraftTypeIcao ?? "").trim().toUpperCase() || null;
              const distanceNm =
                towerAirportRef === null
                  ? null
                  : distanceNmBetween(
                      { lat: aircraft.position.lat, lon: aircraft.position.lon },
                      towerAirportRef
                    );
              towerInbound.push({ callsign, aircraftTypeIcao, distanceNm });
            }
            towerInbound.sort((a, b) => {
              if (a.distanceNm === null && b.distanceNm === null) {
                return (a.callsign ?? "").localeCompare(b.callsign ?? "");
              }
              if (a.distanceNm === null) {
                return 1;
              }
              if (b.distanceNm === null) {
                return -1;
              }
              if (a.distanceNm !== b.distanceNm) {
                return a.distanceNm - b.distanceNm;
              }
              return (a.callsign ?? "").localeCompare(b.callsign ?? "");
            });
            towerInboundAircraft = towerInbound.map((entry) => ({
              callsign: entry.callsign,
              aircraftTypeIcao: entry.aircraftTypeIcao
            }));
            const lowAltitudeAlerts = collectLowAltitudeAlerts(
              response.aircraft,
              mvaSectors,
              videoMapCenterRef,
              approachExemptionCorridors,
              flightRulesByCallsign
            );
            const conflictAlerts = collectConflictAlertPairs(response.aircraft);
            const mergedAlerts: string[] = [];
            const seenAlerts = new Set<string>();
            for (const alert of [...lowAltitudeAlerts, ...conflictAlerts]) {
              if (seenAlerts.has(alert)) {
                continue;
              }
              seenAlerts.add(alert);
              mergedAlerts.push(alert);
              if (mergedAlerts.length >= LA_CA_MCI_MAX_CONFLICTS) {
                break;
              }
            }
            laCaMciConflictAlerts = mergedAlerts;
            render();
          } catch (aircraftError) {
            console.error("Failed to refresh COAST/SUSPEND list:", aircraftError);
          }
        };

        const handleFlightRulesMessage = (event: MessageEvent<string>): void => {
          let payload: FlightRulesSsePayload;
          try {
            payload = JSON.parse(event.data) as FlightRulesSsePayload;
          } catch {
            return;
          }

          const callsign = normalizeCallsign(payload.callsign);
          if (!callsign) {
            return;
          }

          const rulesLabel = normalizeRulesLabel(payload.rulesLabel);
          const flightRules = normalizeRulesLabel(payload.flightRules);
          flightRulesByCallsign.set(callsign, {
            rulesLabel,
            flightRules
          });

          const isVfr = rulesLabel === "VFR" || flightRules === "VFR" || flightRules === "V";
          if (!isVfr) {
            const existing = vfrEntriesByCallsign.get(callsign);
            if (!existing) {
              return;
            }
            vfrEntriesByCallsign.delete(callsign);
            vfrUsedTlIndices.delete(existing.index);
            rebuildVfrListEntries();
            render();
            return;
          }

          const beaconCode = normalizeBeaconCode(payload.beaconCode);
          const existing = vfrEntriesByCallsign.get(callsign);
          if (existing) {
            existing.beaconCode = beaconCode;
            rebuildVfrListEntries();
            render();
            return;
          }

          const index = chooseRandomUniqueTlIndex(vfrUsedTlIndices);
          if (index === null) {
            return;
          }
          vfrUsedTlIndices.add(index);
          vfrEntriesByCallsign.set(callsign, { index, beaconCode });
          rebuildVfrListEntries();
          render();
        };

        const connectFlightRulesStream = (): void => {
          try {
            const streamUrl = new URL("/api/flightRules", API_BASE_URL).toString();
            flightRulesEventSource = new EventSource(streamUrl);
            flightRulesEventSource.addEventListener(
              "flightRules",
              handleFlightRulesMessage as EventListener
            );
            flightRulesEventSource.onerror = (streamError) => {
              console.error("FlightRules stream error:", streamError);
            };
          } catch (streamError) {
            console.error("Failed to initialize FlightRules stream:", streamError);
          }
        };

        const resize = (): void => {
          const dpr = window.devicePixelRatio || 1;
          cssWidth = window.innerWidth;
          cssHeight = window.innerHeight;
          canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
          canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          render();
        };

        const onKeyDown = (event: KeyboardEvent): void => {
          if (event.key === "ArrowLeft") {
            headingOffsetRef.current = (headingOffsetRef.current ?? 0) - 5;
            render();
          } else if (event.key === "ArrowRight") {
            headingOffsetRef.current = (headingOffsetRef.current ?? 0) + 5;
            render();
          } else if (event.key.toLowerCase() === "r") {
            headingOffsetRef.current = 0;
            render();
          }
        };

        const resetWheelTuneAccumulators = (): void => {
          rrSpacingWheelAccumulatorPx = 0;
          leaderDirectionWheelAccumulatorPx = 0;
          leaderLengthWheelAccumulatorPx = 0;
          rrBrightnessWheelAccumulatorPx = 0;
        };

        const disableWheelTuneModes = (): void => {
          rangeRingAdjustMode = false;
          leaderDirectionAdjustMode = false;
          leaderLengthAdjustMode = false;
          rrBrightnessAdjustMode = false;
          resetWheelTuneAccumulators();
        };

        const onCanvasClick = (event: MouseEvent): void => {
          const dcbRenderer = dcbRendererRef.current;
          const rect = canvas.getBoundingClientRect();
          const clickX = event.clientX - rect.left;
          const clickY = event.clientY - rect.top;
          const dcbMapsInput = getDcbMapsInput();

          if (dcbRenderer) {
            const rrControlHitTester = dcbRenderer as unknown as {
              hitTestRangeRingControls?: (
                input: DcbMapCategoryInput,
                x: number,
                y: number
              ) => DcbRangeRingControlHit | null;
            };
            const clickedRrControl =
              typeof rrControlHitTester.hitTestRangeRingControls === "function"
                ? rrControlHitTester.hitTestRangeRingControls(dcbMapsInput, clickX, clickY)
                : null;
            if (clickedRrControl === "rr") {
              rangeRingAdjustMode = !rangeRingAdjustMode;
              if (rangeRingAdjustMode) {
                resetWheelTuneAccumulators();
                placeRangeRingCenterMode = false;
                leaderDirectionAdjustMode = false;
                leaderLengthAdjustMode = false;
                rrBrightnessAdjustMode = false;
              }
              render();
              return;
            }
            if (clickedRrControl === "place-rr") {
              placeRangeRingCenterMode = !placeRangeRingCenterMode;
              if (placeRangeRingCenterMode) {
                disableWheelTuneModes();
              }
              render();
              return;
            }
            if (clickedRrControl === "rr-cntr") {
              rangeRingCenterRef = getDefaultRangeRingCenter();
              placeRangeRingCenterMode = false;
              rrCntrFlashActive = true;
              if (rrCntrFlashTimer !== null) {
                window.clearTimeout(rrCntrFlashTimer);
              }
              rrCntrFlashTimer = window.setTimeout(() => {
                rrCntrFlashActive = false;
                rrCntrFlashTimer = null;
                if (!disposed) {
                  render();
                }
              }, 280);
              render();
              return;
            }

            const briteHitTester = dcbRenderer as unknown as {
              hitTestBrite?: (
                input: DcbBriteInput,
                x: number,
                y: number
              ) => DcbBriteControlHit | null;
            };
            const clickedBrite =
              typeof briteHitTester.hitTestBrite === "function"
                ? briteHitTester.hitTestBrite(getDcbBriteInput(), clickX, clickY)
                : null;
            if (clickedBrite === "brite-toggle") {
              briteExpanded = !briteExpanded;
              if (!briteExpanded) {
                rrBrightnessAdjustMode = false;
                resetWheelTuneAccumulators();
              }
              render();
              return;
            }
            if (clickedBrite === "brite-rr") {
              rrBrightnessAdjustMode = !rrBrightnessAdjustMode;
              if (rrBrightnessAdjustMode) {
                resetWheelTuneAccumulators();
                rangeRingAdjustMode = false;
                leaderDirectionAdjustMode = false;
                leaderLengthAdjustMode = false;
                placeRangeRingCenterMode = false;
              }
              render();
              return;
            }
            if (clickedBrite === "brite-done") {
              briteExpanded = false;
              rrBrightnessAdjustMode = false;
              resetWheelTuneAccumulators();
              render();
              return;
            }
            if (clickedBrite === "brite-menu") {
              return;
            }

            const ldrControlHitTester = dcbRenderer as unknown as {
              hitTestLeaderControls?: (
                input: DcbLeaderControlsInput,
                x: number,
                y: number
              ) => DcbLeaderControlHit | null;
            };
            const clickedLdrControl =
              typeof ldrControlHitTester.hitTestLeaderControls === "function"
                ? ldrControlHitTester.hitTestLeaderControls(getDcbLeaderControlsInput(), clickX, clickY)
                : null;
            if (clickedLdrControl === "ldr-dir") {
              leaderDirectionAdjustMode = !leaderDirectionAdjustMode;
              if (leaderDirectionAdjustMode) {
                resetWheelTuneAccumulators();
                leaderLengthAdjustMode = false;
                rangeRingAdjustMode = false;
                placeRangeRingCenterMode = false;
                rrBrightnessAdjustMode = false;
              }
              render();
              return;
            }
            if (clickedLdrControl === "ldr-length") {
              leaderLengthAdjustMode = !leaderLengthAdjustMode;
              if (leaderLengthAdjustMode) {
                resetWheelTuneAccumulators();
                leaderDirectionAdjustMode = false;
                rangeRingAdjustMode = false;
                placeRangeRingCenterMode = false;
                rrBrightnessAdjustMode = false;
              }
              render();
              return;
            }

            const wxHitTester = dcbRenderer as unknown as {
              hitTestWxLevels?: (input: DcbWxLevelsInput, x: number, y: number) => number | null;
            };
            const clickedWxLevel =
              typeof wxHitTester.hitTestWxLevels === "function"
                ? wxHitTester.hitTestWxLevels(
                    buildDcbWxLevels(activeWxLevels, wxLevelsWithCells),
                    clickX,
                    clickY
                  )
                : null;
            if (clickedWxLevel !== null) {
              if (activeWxLevels.has(clickedWxLevel)) {
                activeWxLevels.delete(clickedWxLevel);
              } else {
                activeWxLevels.add(clickedWxLevel);
              }
              if (activeWxLevels.size > 0) {
                void refreshWxRadar();
              }
              render();
              return;
            }

            const clickedMapId = dcbRenderer.hitTestMapsCategory(
              dcbMapsInput,
              clickX,
              clickY
            );
            if (clickedMapId !== null) {
              if (activeMapIds.has(clickedMapId)) {
                activeMapIds.delete(clickedMapId);
              } else {
                activeMapIds.add(clickedMapId);
              }
              render();
              return;
            }
          }

          if (placeRangeRingCenterMode && pointInScopeRect(clickX, clickY, getScopeRect())) {
            const mapCenter = videoMapCenterRef;
            if (mapCenter) {
              const candidateCenter = unprojectScopeToLatLon(
                { x: clickX, y: clickY },
                mapCenter,
                videoMapRangeNm,
                getScopeRect(),
                videoMapPanOffsetPxX,
                videoMapPanOffsetPxY
              );
              if (candidateCenter) {
                rangeRingCenterRef = candidateCenter;
              }
            }
            placeRangeRingCenterMode = false;
            render();
            return;
          }

          const clickedDatablockId = datablockRendererRef.current?.hitTest(datablockHitRegions, clickX, clickY);
          if (!clickedDatablockId) {
            return;
          }
          if (expandedDatablockAircraftIds.has(clickedDatablockId)) {
            expandedDatablockAircraftIds.delete(clickedDatablockId);
          } else {
            expandedDatablockAircraftIds.add(clickedDatablockId);
          }
          render();
        };

        const stopVideoMapPanDrag = (): void => {
          videoMapPanDragActive = false;
          videoMapPanDragLast = null;
        };

        const onCanvasMouseDown = (event: MouseEvent): void => {
          if (event.button !== 0 || event.detail < 2) {
            return;
          }
          const rect = canvas.getBoundingClientRect();
          const pointerX = event.clientX - rect.left;
          const pointerY = event.clientY - rect.top;
          if (!pointInScopeRect(pointerX, pointerY, getScopeRect())) {
            return;
          }
          videoMapPanDragActive = true;
          videoMapPanDragLast = { x: pointerX, y: pointerY };
          event.preventDefault();
        };

        const onCanvasMouseMove = (event: MouseEvent): void => {
          if (!videoMapPanDragActive || !videoMapPanDragLast) {
            return;
          }
          if ((event.buttons & 1) === 0) {
            stopVideoMapPanDrag();
            return;
          }
          const rect = canvas.getBoundingClientRect();
          const pointerX = event.clientX - rect.left;
          const pointerY = event.clientY - rect.top;
          const dx = pointerX - videoMapPanDragLast.x;
          const dy = pointerY - videoMapPanDragLast.y;
          if (dx === 0 && dy === 0) {
            return;
          }
          videoMapPanOffsetPxX += dx;
          videoMapPanOffsetPxY += dy;
          videoMapPanDragLast = { x: pointerX, y: pointerY };
          render();
          event.preventDefault();
        };

        const onCanvasWheel = (event: WheelEvent): void => {
          const rect = canvas.getBoundingClientRect();
          const pointerX = event.clientX - rect.left;
          const pointerY = event.clientY - rect.top;
          if (!pointInScopeRect(pointerX, pointerY, getScopeRect())) {
            return;
          }

          event.preventDefault();
          const deltaPx = normalizeWheelDeltaPx(event);
          if (deltaPx === 0) {
            return;
          }

          if (rangeRingAdjustMode) {
            const consumed = consumeWheelStepAccumulator(rrSpacingWheelAccumulatorPx, deltaPx);
            rrSpacingWheelAccumulatorPx = consumed.accumulatorPx;
            if (consumed.steps === 0) {
              return;
            }
            let nextSpacing = rangeRingSpacingNm;
            const direction = consumed.steps > 0 ? 1 : -1;
            for (let i = 0; i < Math.abs(consumed.steps); i += 1) {
              nextSpacing = stepRangeRingSpacingNm(nextSpacing, direction);
            }
            if (nextSpacing !== rangeRingSpacingNm) {
              rangeRingSpacingNm = nextSpacing;
              render();
            }
            return;
          }
          if (leaderDirectionAdjustMode) {
            const consumed = consumeWheelStepAccumulator(leaderDirectionWheelAccumulatorPx, deltaPx);
            leaderDirectionWheelAccumulatorPx = consumed.accumulatorPx;
            if (consumed.steps === 0) {
              return;
            }
            const count = DATABLOCK_LEADER_DIRECTIONS.length;
            const rawIndex = (leaderDirectionIndex + consumed.steps) % count;
            const nextIndex = rawIndex < 0 ? rawIndex + count : rawIndex;
            if (nextIndex !== leaderDirectionIndex) {
              leaderDirectionIndex = nextIndex;
              render();
            }
            return;
          }
          if (leaderLengthAdjustMode) {
            const consumed = consumeWheelStepAccumulator(leaderLengthWheelAccumulatorPx, deltaPx);
            leaderLengthWheelAccumulatorPx = consumed.accumulatorPx;
            if (consumed.steps === 0) {
              return;
            }
            const nextLevel = Math.min(
              DATABLOCK_LEADER_LEVEL_MAX,
              Math.max(DATABLOCK_LEADER_LEVEL_MIN, leaderLengthLevel + consumed.steps)
            );
            if (nextLevel !== leaderLengthLevel) {
              leaderLengthLevel = nextLevel;
              render();
            }
            return;
          }
          if (rrBrightnessAdjustMode) {
            const consumed = consumeWheelStepAccumulator(rrBrightnessWheelAccumulatorPx, deltaPx);
            rrBrightnessWheelAccumulatorPx = consumed.accumulatorPx;
            if (consumed.steps === 0) {
              return;
            }
            const nextBrightness = Math.min(
              100,
              Math.max(0, rrBrightnessPercent + consumed.steps * RANGE_RING_BRIGHTNESS_STEP_PERCENT)
            );
            if (nextBrightness !== rrBrightnessPercent) {
              rrBrightnessPercent = nextBrightness;
              render();
            }
            return;
          }

          const scale = Math.exp(deltaPx * VIDEO_MAP_WHEEL_ZOOM_STEP);
          const nextRangeNm = clampVideoMapRange(videoMapRangeNm * scale);
          if (nextRangeNm === videoMapRangeNm) {
            return;
          }
          videoMapRangeNm = nextRangeNm;
          ensureWxCoverageForCurrentRange();
          render();
        };

        const onTouchStart = (event: TouchEvent): void => {
          if (event.touches.length !== 2) {
            touchPinchState = null;
            return;
          }

          const rect = canvas.getBoundingClientRect();
          const touchA = event.touches[0];
          const touchB = event.touches[1];
          const midX = ((touchA.clientX + touchB.clientX) * 0.5) - rect.left;
          const midY = ((touchA.clientY + touchB.clientY) * 0.5) - rect.top;
          if (!pointInScopeRect(midX, midY, getScopeRect())) {
            touchPinchState = null;
            return;
          }

          touchPinchState = {
            startDistancePx: Math.max(1, touchDistancePx(touchA, touchB)),
            startRangeNm: videoMapRangeNm
          };
          event.preventDefault();
        };

        const onTouchMove = (event: TouchEvent): void => {
          if (!touchPinchState || event.touches.length !== 2) {
            return;
          }

          const currentDistancePx = Math.max(1, touchDistancePx(event.touches[0], event.touches[1]));
          const ratio = touchPinchState.startDistancePx / currentDistancePx;
          const nextRangeNm = clampVideoMapRange(touchPinchState.startRangeNm * ratio);
          if (nextRangeNm !== videoMapRangeNm) {
            videoMapRangeNm = nextRangeNm;
            ensureWxCoverageForCurrentRange();
            render();
          }
          event.preventDefault();
        };

        const onTouchEnd = (_event: TouchEvent): void => {
          if (touchPinchState && _event.touches.length < 2) {
            touchPinchState = null;
          }
        };

        window.addEventListener("resize", resize);
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("mouseup", stopVideoMapPanDrag);
        canvas.addEventListener("click", onCanvasClick);
        canvas.addEventListener("mousedown", onCanvasMouseDown);
        canvas.addEventListener("mousemove", onCanvasMouseMove);
        canvas.addEventListener("wheel", onCanvasWheel, { passive: false });
        canvas.addEventListener("touchstart", onTouchStart, { passive: false });
        canvas.addEventListener("touchmove", onTouchMove, { passive: false });
        canvas.addEventListener("touchend", onTouchEnd);
        canvas.addEventListener("touchcancel", onTouchEnd);
        const clockTimer = window.setInterval(render, 1000);
        const qnhTimer = window.setInterval(() => void refreshSsaQnh(), SSA_QNH_REFRESH_MS);
        const aircraftTimer = window.setInterval(() => void refreshCoastSuspend(), AIRCRAFT_REFRESH_MS);
        const wxTimer = window.setInterval(() => void refreshWxRadar(true), WX_REFRESH_MS);
        resize();
        void refreshSsaQnh();
        void refreshTraconMetadata();
        void refreshCoastSuspend();
        void refreshWxRadar();
        connectFlightRulesStream();
        console.info("STARS React demo running. Use Left/Right arrows to rotate compass, R to reset. Click MAP tiles to toggle videomaps.");

        cleanup = () => {
          window.removeEventListener("resize", resize);
          window.removeEventListener("keydown", onKeyDown);
          window.removeEventListener("mouseup", stopVideoMapPanDrag);
          canvas.removeEventListener("click", onCanvasClick);
          canvas.removeEventListener("mousedown", onCanvasMouseDown);
          canvas.removeEventListener("mousemove", onCanvasMouseMove);
          canvas.removeEventListener("wheel", onCanvasWheel);
          canvas.removeEventListener("touchstart", onTouchStart);
          canvas.removeEventListener("touchmove", onTouchMove);
          canvas.removeEventListener("touchend", onTouchEnd);
          canvas.removeEventListener("touchcancel", onTouchEnd);
          if (flightRulesEventSource) {
            flightRulesEventSource.removeEventListener(
              "flightRules",
              handleFlightRulesMessage as EventListener
            );
            flightRulesEventSource.close();
            flightRulesEventSource = null;
          }
          window.clearInterval(clockTimer);
          window.clearInterval(qnhTimer);
          window.clearInterval(aircraftTimer);
          window.clearInterval(wxTimer);
          if (rrCntrFlashTimer !== null) {
            window.clearTimeout(rrCntrFlashTimer);
            rrCntrFlashTimer = null;
          }
        };
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        setError(message);
        console.error("STARS React demo bootstrap failed:", caught);
      }
    };

    void initialize();

    return () => {
      disposed = true;
      if (cleanup) {
        cleanup();
      }
    };
  }, []);

  if (error) {
    return createElement(
      "pre",
      {
        style: {
          margin: "0",
          padding: "16px",
          whiteSpace: "pre-wrap",
          color: "#ff4444",
          background: "black",
          fontFamily: "monospace"
        }
      },
      `STARS React demo failed.\n\n${error}\n\nOpen devtools console for stack trace.`
    );
  }

  return createElement("canvas", {
    id: "stars-demo-canvas",
    ref: canvasRef,
    style: {
      display: "block",
      width: "100vw",
      height: "100vh",
      background: "black",
      touchAction: "none"
    }
  });
}

const rootElement = document.getElementById("app") ?? (() => {
  const div = document.createElement("div");
  div.id = "app";
  document.body.appendChild(div);
  return div;
})();

createRoot(rootElement).render(createElement(StarsApp));
