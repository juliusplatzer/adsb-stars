import { loadBitmapFont, type LoadedBitmapFont } from "../lib/bitmapFont.js";
import type { PositionSample } from "@vstars/shared";
import colors from "./colors.js";

export type BlipGlyphColor = "GREEN" | "WHITE";

export type BlipCenterGlyphKind = "triangle" | "square" | "star" | "letter";

export interface BlipRuleInput {
  squawk: string | null;
  hasAltitudeReport: boolean;
  trackedByTcp: boolean;
  tcpLetter: string | null;
}

export interface BlipDrawInput extends BlipRuleInput {
  x: number;
  y: number;
  glyphColor: BlipGlyphColor;
  radiusPx?: number;
}

export interface Vfr1200BlipDrawInput {
  x: number;
  y: number;
  squawk: string | null;
  trackDeg: number | null;
}

export interface BlipColors {
  searchTargetBlue: string;
  histBlue1: string;
  histBlue2: string;
  histBlue3: string;
  histBlue4: string;
  histBlue5: string;
  green: string;
  white: string;
  black: string;
}

const DEFAULT_COLORS: BlipColors = {
  searchTargetBlue: colors.SEARCH_TARGET_BLUE,
  histBlue1: colors.HIST_BLUE_1,
  histBlue2: colors.HIST_BLUE_2,
  histBlue3: colors.HIST_BLUE_3,
  histBlue4: colors.HIST_BLUE_4,
  histBlue5: colors.HIST_BLUE_5,
  green: colors.GREEN,
  white: colors.WHITE,
  black: colors.BLACK
};

interface BlipFonts {
  fill: LoadedBitmapFont;
  outline: LoadedBitmapFont;
}

export interface BlipResolvedCenterGlyph {
  kind: BlipCenterGlyphKind;
  letter: string | null;
}

export interface BlipProjectedPoint {
  x: number;
  y: number;
}

export type BlipHistoryPosition = PositionSample | BlipProjectedPoint;

export interface BlipHistoryDrawOptions {
  dotRadiusPx?: number;
  maxDots?: number;
  projectPosition?: (position: PositionSample) => BlipProjectedPoint | null;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function normalizeTcpLetter(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized.length === 0) {
    return null;
  }
  return normalized[0];
}

export function resolveBlipCenterGlyph(input: BlipRuleInput): BlipResolvedCenterGlyph {
  const squawk = (input.squawk ?? "").trim();

  // STARS default treatment for VFR 1200-series beacon codes.
  if (squawk.startsWith("12")) {
    return {
      kind: input.hasAltitudeReport ? "square" : "triangle",
      letter: null
    };
  }

  if (!input.trackedByTcp) {
    return {
      kind: "star",
      letter: null
    };
  }

  const tcpLetter = normalizeTcpLetter(input.tcpLetter);
  if (!tcpLetter) {
    return {
      kind: "star",
      letter: null
    };
  }

  return {
    kind: "letter",
    letter: tcpLetter
  };
}

function shapeFillColor(glyphColor: BlipGlyphColor, colors: BlipColors): string {
  return glyphColor === "WHITE" ? colors.white : colors.green;
}

function isPositionSample(position: BlipHistoryPosition): position is PositionSample {
  return "lat" in position && "lon" in position;
}

// STARS symbol codepoints in the bitmap atlas.
// 128: triangle (delta), 129: openSquare, 138: X/star target marker.
const BLIP_SYMBOL_CHARCODE: Record<Exclude<BlipCenterGlyphKind, "letter">, number> = {
  triangle: 128,
  square: 129,
  star: 138
};

const VFR_BODY_SHORT_SIDE_PX = 6;
const VFR_BODY_LONG_SIDE_PX = 16;

function drawLetterGlyph(
  ctx: CanvasRenderingContext2D,
  fonts: BlipFonts,
  x: number,
  y: number,
  letter: string,
  fillColor: string,
  haloColor: string
): void {
  const glyph = letter[0]?.toUpperCase() ?? "?";
  const glyphCode = glyph.charCodeAt(0);
  const outlineMetric = fonts.outline.metrics[glyphCode] ?? fonts.outline.metrics["?".charCodeAt(0)];
  const fillMetric = fonts.fill.metrics[glyphCode] ?? fonts.fill.metrics["?".charCodeAt(0)];
  if (!outlineMetric || !fillMetric) {
    return;
  }

  drawTintedGlyphFromAtlas(ctx, fonts.outline, outlineMetric, x, y, haloColor);
  drawTintedGlyphFromAtlas(ctx, fonts.fill, fillMetric, x, y, fillColor);
}

function drawSymbolGlyph(
  ctx: CanvasRenderingContext2D,
  fonts: BlipFonts,
  x: number,
  y: number,
  glyphCode: number,
  fillColor: string,
  haloColor: string
): boolean {
  const outlineMetric = fonts.outline.metrics[glyphCode];
  const fillMetric = fonts.fill.metrics[glyphCode];
  if (!outlineMetric || !fillMetric) {
    return false;
  }

  drawTintedGlyphFromAtlas(ctx, fonts.outline, outlineMetric, x, y, haloColor);
  drawTintedGlyphFromAtlas(ctx, fonts.fill, fillMetric, x, y, fillColor);
  return true;
}

function drawSymbolGlyphPinnedCenter(
  ctx: CanvasRenderingContext2D,
  fonts: BlipFonts,
  centerX: number,
  centerY: number,
  glyphCode: number,
  fillColor: string,
  haloColor: string
): boolean {
  const outlineMetric = fonts.outline.metrics[glyphCode];
  const fillMetric = fonts.fill.metrics[glyphCode];
  if (!outlineMetric || !fillMetric) {
    return false;
  }

  drawTintedGlyphBoxCentered(ctx, fonts.outline, outlineMetric, centerX, centerY, haloColor);
  drawTintedGlyphBoxCentered(ctx, fonts.fill, fillMetric, centerX, centerY, fillColor);
  return true;
}

function drawTintedGlyphFromAtlas(
  ctx: CanvasRenderingContext2D,
  font: LoadedBitmapFont,
  metric: { sx: number; sy: number; w: number; h: number; offX: number; offY: number },
  centerX: number,
  centerY: number,
  tintColor: string
): void {
  if (metric.w <= 0 || metric.h <= 0) {
    return;
  }

  // Compute top-left render position using the same vertical metric system as drawBitmapText.
  const x = Math.round(centerX - metric.w / 2 - metric.offX);
  const y = Math.round(centerY - metric.h / 2 - (font.height - metric.offY - metric.h));

  const offscreen = document.createElement("canvas");
  offscreen.width = metric.w;
  offscreen.height = metric.h;
  const offCtx = offscreen.getContext("2d");
  if (!offCtx) {
    return;
  }

  offCtx.imageSmoothingEnabled = false;
  offCtx.clearRect(0, 0, metric.w, metric.h);
  offCtx.drawImage(
    font.atlas,
    metric.sx,
    metric.sy,
    metric.w,
    metric.h,
    0,
    0,
    metric.w,
    metric.h
  );
  offCtx.globalCompositeOperation = "source-in";
  offCtx.fillStyle = tintColor;
  offCtx.fillRect(0, 0, metric.w, metric.h);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(offscreen, x, y);
}

function drawTintedGlyphBoxCentered(
  ctx: CanvasRenderingContext2D,
  font: LoadedBitmapFont,
  metric: { sx: number; sy: number; w: number; h: number; offX: number; offY: number },
  centerX: number,
  centerY: number,
  tintColor: string
): void {
  if (metric.w <= 0 || metric.h <= 0) {
    return;
  }

  const x = Math.round(centerX - metric.w / 2);
  const y = Math.round(centerY - metric.h / 2);

  const offscreen = document.createElement("canvas");
  offscreen.width = metric.w;
  offscreen.height = metric.h;
  const offCtx = offscreen.getContext("2d");
  if (!offCtx) {
    return;
  }

  offCtx.imageSmoothingEnabled = false;
  offCtx.clearRect(0, 0, metric.w, metric.h);
  offCtx.drawImage(
    font.atlas,
    metric.sx,
    metric.sy,
    metric.w,
    metric.h,
    0,
    0,
    metric.w,
    metric.h
  );
  offCtx.globalCompositeOperation = "source-in";
  offCtx.fillStyle = tintColor;
  offCtx.fillRect(0, 0, metric.w, metric.h);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(offscreen, x, y);
}

export class RadarBlipRenderer {
  private constructor(
    private readonly fonts: BlipFonts,
    private readonly colors: BlipColors
  ) {}

  private historyColorByIndex(index: number): string {
    switch (index) {
      case 0:
        return this.colors.histBlue1;
      case 1:
        return this.colors.histBlue2;
      case 2:
        return this.colors.histBlue3;
      case 3:
        return this.colors.histBlue4;
      default:
        return this.colors.histBlue5;
    }
  }

  static async create(colors: Partial<BlipColors> = {}): Promise<RadarBlipRenderer> {
    const [fill, outline] = await Promise.all([
      loadBitmapFont("/public/font/sddCharFontSetASize1"),
      loadBitmapFont("/public/font/sddCharOutlineFontSetASize1")
    ]);

    return new RadarBlipRenderer(
      { fill, outline },
      { ...DEFAULT_COLORS, ...colors }
    );
  }

  drawVfr1200(ctx: CanvasRenderingContext2D, input: Vfr1200BlipDrawInput): boolean {
    const squawk = (input.squawk ?? "").trim();
    if (squawk !== "1200") {
      return false;
    }

    // Long side is perpendicular to track, short side parallel to track.
    const trackDeg = Number.isFinite(input.trackDeg) ? (input.trackDeg as number) : 0;
    const longAxisAngleRad = toRadians(trackDeg);
    const halfLong = VFR_BODY_LONG_SIDE_PX * 0.5;
    const halfShort = VFR_BODY_SHORT_SIDE_PX * 0.5;

    ctx.save();
    ctx.translate(input.x, input.y);
    ctx.rotate(longAxisAngleRad);
    ctx.fillStyle = this.colors.searchTargetBlue;
    ctx.fillRect(-halfLong, -halfShort, VFR_BODY_LONG_SIDE_PX, VFR_BODY_SHORT_SIDE_PX);
    ctx.restore();

    // Draw a green square with black halo at target center via outline atlas.
    const rendered = drawSymbolGlyphPinnedCenter(
      ctx,
      this.fonts,
      input.x,
      input.y,
      BLIP_SYMBOL_CHARCODE.square,
      this.colors.green,
      this.colors.black
    );
    if (!rendered) {
      // Fallback if square glyph code is absent in the atlas.
      ctx.fillStyle = this.colors.black;
      ctx.fillRect(Math.round(input.x - 3), Math.round(input.y - 3), 6, 6);
      ctx.fillStyle = this.colors.green;
      ctx.fillRect(Math.round(input.x - 2), Math.round(input.y - 2), 4, 4);
    }
    return true;
  }

  draw(ctx: CanvasRenderingContext2D, input: BlipDrawInput): BlipResolvedCenterGlyph {
    const radius = input.radiusPx ?? 8;
    const centerGlyph = resolveBlipCenterGlyph(input);

    // Blue radar target body.
    ctx.beginPath();
    ctx.arc(input.x, input.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = this.colors.searchTargetBlue;
    ctx.fill();

    const fill = shapeFillColor(input.glyphColor, this.colors);
    const stroke = this.colors.black;

    switch (centerGlyph.kind) {
      case "triangle":
        drawSymbolGlyph(ctx, this.fonts, input.x, input.y, BLIP_SYMBOL_CHARCODE.triangle, fill, stroke);
        break;
      case "square":
        drawSymbolGlyph(ctx, this.fonts, input.x, input.y, BLIP_SYMBOL_CHARCODE.square, fill, stroke);
        break;
      case "star":
        drawSymbolGlyph(ctx, this.fonts, input.x, input.y, BLIP_SYMBOL_CHARCODE.star, fill, stroke);
        break;
      case "letter":
        drawLetterGlyph(ctx, this.fonts, input.x, input.y, centerGlyph.letter ?? "?", fill, this.colors.black);
        break;
      default:
        break;
    }

    return centerGlyph;
  }

  drawHistoryDots(
    ctx: CanvasRenderingContext2D,
    positions: readonly BlipHistoryPosition[],
    options: BlipHistoryDrawOptions = {}
  ): void {
    if (positions.length === 0) {
      return;
    }

    const dotRadiusPx = options.dotRadiusPx ?? 2;
    const maxDots = Math.max(1, Math.min(5, options.maxDots ?? 5));
    // Backend history is oldest -> newest; color by recency so nearest trail point is HIST_BLUE_1.
    const ordered = [...positions].slice(-maxDots).reverse();

    for (let index = 0; index < ordered.length; index += 1) {
      const position = ordered[index];
      let point: BlipProjectedPoint | null;

      if (isPositionSample(position)) {
        if (!options.projectPosition) {
          continue;
        }
        point = options.projectPosition(position);
      } else {
        point = position;
      }

      if (!point) {
        continue;
      }

      ctx.beginPath();
      ctx.arc(Math.round(point.x), Math.round(point.y), dotRadiusPx, 0, Math.PI * 2);
      ctx.fillStyle = this.historyColorByIndex(index);
      ctx.fill();
    }
  }
}
