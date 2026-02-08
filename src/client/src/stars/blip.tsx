import { loadBitmapFont, type LoadedBitmapFont } from "../lib/bitmapFont.js";
import colors from "./colors.json";

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

export interface BlipColors {
  searchTargetBlue: string;
  green: string;
  white: string;
  black: string;
}

const DEFAULT_COLORS: BlipColors = {
  searchTargetBlue: colors.SEARCH_TARGET_BLUE,
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

// STARS symbol codepoints in the bitmap atlas.
// 128: triangle (delta), 129: openSquare, 138: X/star target marker.
const BLIP_SYMBOL_CHARCODE: Record<Exclude<BlipCenterGlyphKind, "letter">, number> = {
  triangle: 128,
  square: 129,
  star: 138
};

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

export class RadarBlipRenderer {
  private constructor(
    private readonly fonts: BlipFonts,
    private readonly colors: BlipColors
  ) {}

  static async create(colors: Partial<BlipColors> = {}): Promise<RadarBlipRenderer> {
    const [fill, outline] = await Promise.all([
      loadBitmapFont("/font/sddCharFontSetASize1"),
      loadBitmapFont("/font/sddCharOutlineFontSetASize1")
    ]);

    return new RadarBlipRenderer(
      { fill, outline },
      { ...DEFAULT_COLORS, ...colors }
    );
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
}
