import { loadBitmapFont, type LoadedBitmapFont } from "../lib/bitmapFont.js";
import colors from "./colors.js";

export interface RadarScopeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type CompassSide = "top" | "right" | "bottom" | "left";

interface CompassIntersection {
  x: number;
  y: number;
  dx: number;
  dy: number;
  side: CompassSide;
}

export interface CompassRoseOptions {
  headingOffsetDeg?: number;
  magneticVariation?: number | string;
  minorTickStepDeg?: number;
  majorTickStepDeg?: number;
  labelStepDeg?: number;
  edgeInsetPx?: number;
  minorTickLengthPx?: number;
  majorTickLengthPx?: number;
  labelInsetPx?: number;
  labelVerticalNudgePx?: number;
  showMinorTicks?: boolean;
  showMajorTicks?: boolean;
  tickColor?: string;
  textColor?: string;
}

export interface StarsUiColors {
  background: string;
  scopeBorder: string;
  compassTick: string;
  compassText: string;
}

export interface StarsUiDrawInput {
  scopeRect?: RadarScopeRect;
  compass?: CompassRoseOptions;
  clearCanvas?: boolean;
}

export interface StarsUiCreateOptions {
  colors?: Partial<StarsUiColors>;
  fontBasePath?: string;
}

const DEFAULT_UI_COLORS: StarsUiColors = {
  background: colors.BLACK,
  scopeBorder: colors.DIM_GRAY,
  compassTick: colors.DIM_GRAY,
  compassText: colors.DIM_GRAY
};

const DEFAULT_COMPASS_OPTIONS: Required<
  Omit<CompassRoseOptions, "tickColor" | "textColor" | "headingOffsetDeg">
> = {
  magneticVariation: 0,
  minorTickStepDeg: 5,
  majorTickStepDeg: 10,
  labelStepDeg: 10,
  edgeInsetPx: 20,
  minorTickLengthPx: 8,
  majorTickLengthPx: 14,
  labelInsetPx: 2,
  labelVerticalNudgePx: 0,
  showMinorTicks: true,
  showMajorTicks: true
};

function clampRect(rect: RadarScopeRect): RadarScopeRect {
  return {
    x: rect.x,
    y: rect.y,
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height)
  };
}

function normalizeHeadingDeg(heading: number): number {
  const normalized = heading % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function headingToUnitVector(headingDeg: number): { dx: number; dy: number } {
  const radians = (headingDeg * Math.PI) / 180;
  return {
    dx: Math.sin(radians),
    dy: -Math.cos(radians)
  };
}

function parseMagneticVariationDeg(value: number | string | undefined): number {
  if (value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/^([+-]?\d+(?:\.\d+)?)\s*([EW])?$/);
  if (!match) {
    return 0;
  }

  const magnitude = Number.parseFloat(match[1]);
  if (!Number.isFinite(magnitude)) {
    return 0;
  }

  const direction = match[2];
  if (direction === "W") {
    return -Math.abs(magnitude);
  }
  if (direction === "E") {
    return Math.abs(magnitude);
  }
  return magnitude;
}

function measureBitmapTextWidth(font: LoadedBitmapFont, text: string): number {
  let width = 0;
  const fallbackIndex = "?".charCodeAt(0);
  const fallback = font.metrics[fallbackIndex] ?? font.metrics[0];

  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const metric = font.metrics[code] ?? fallback;
    if (!metric) {
      continue;
    }
    width += metric.stepX;
  }

  return width;
}

function formatHeading(headingDeg: number): string {
  const rounded = Math.round(normalizeHeadingDeg(headingDeg));
  if (rounded === 0) {
    return "360";
  }
  return rounded.toString().padStart(3, "0");
}

function drawTintedBitmapText(
  ctx: CanvasRenderingContext2D,
  font: LoadedBitmapFont,
  x0: number,
  y0: number,
  text: string,
  tintColor: string
): void {
  let x = x0;
  let y = y0;
  const fontHeight = font.height;
  const fallbackIndex = "?".charCodeAt(0);
  const fallback = font.metrics[fallbackIndex] ?? font.metrics[0];

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "\n") {
      x = x0;
      y += fontHeight;
      continue;
    }

    const code = text.charCodeAt(i);
    const metric = font.metrics[code] ?? fallback;
    if (!metric) {
      continue;
    }

    if (metric.w > 0 && metric.h > 0) {
      const dx = Math.round(x + metric.offX);
      const dy = Math.round(y + (fontHeight - metric.offY - metric.h));

      const offscreen = document.createElement("canvas");
      offscreen.width = metric.w;
      offscreen.height = metric.h;
      const offCtx = offscreen.getContext("2d");
      if (offCtx) {
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
        ctx.drawImage(offscreen, dx, dy);
      }
    }

    x += metric.stepX;
  }
}

function intersectHeadingWithRect(
  rect: RadarScopeRect,
  headingDeg: number,
  edgeInsetPx: number
): CompassIntersection | null {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const { dx, dy } = headingToUnitVector(headingDeg);

  const left = rect.x + edgeInsetPx;
  const right = rect.x + rect.width - edgeInsetPx;
  const top = rect.y + edgeInsetPx;
  const bottom = rect.y + rect.height - edgeInsetPx;
  const epsilon = 1e-7;

  let best: { t: number; side: CompassSide; x: number; y: number } | null = null;

  const consider = (t: number, side: CompassSide, x: number, y: number): void => {
    if (!Number.isFinite(t) || t <= 0) {
      return;
    }
    if (x < left - epsilon || x > right + epsilon || y < top - epsilon || y > bottom + epsilon) {
      return;
    }
    if (!best || t < best.t - epsilon) {
      best = { t, side, x, y };
    }
  };

  if (Math.abs(dx) > epsilon) {
    consider((left - cx) / dx, "left", left, cy + ((left - cx) / dx) * dy);
    consider((right - cx) / dx, "right", right, cy + ((right - cx) / dx) * dy);
  }
  if (Math.abs(dy) > epsilon) {
    consider((top - cy) / dy, "top", cx + ((top - cy) / dy) * dx, top);
    consider((bottom - cy) / dy, "bottom", cx + ((bottom - cy) / dy) * dx, bottom);
  }

  if (!best) {
    return null;
  }

  const resolved = best as { t: number; side: CompassSide; x: number; y: number };

  return {
    x: resolved.x,
    y: resolved.y,
    dx,
    dy,
    side: resolved.side
  };
}

function drawCompassLabel(
  ctx: CanvasRenderingContext2D,
  font: LoadedBitmapFont,
  label: string,
  side: CompassSide,
  tickEndX: number,
  tickEndY: number,
  labelInsetPx: number,
  labelVerticalNudgePx: number,
  textColor: string
): void {
  const labelWidth = measureBitmapTextWidth(font, label);
  let x = 0;
  let y = 0;

  if (side === "top") {
    x = Math.round(tickEndX - labelWidth / 2);
    y = Math.round(tickEndY - font.height / 2 + labelInsetPx + labelVerticalNudgePx);
  } else if (side === "bottom") {
    x = Math.round(tickEndX - labelWidth / 2);
    y = Math.round(tickEndY - font.height / 2 - labelInsetPx - labelVerticalNudgePx);
  } else if (side === "left") {
    x = Math.round(tickEndX + labelInsetPx);
    y = Math.round(tickEndY - font.height / 2);
  } else {
    x = Math.round(tickEndX - labelInsetPx - labelWidth);
    y = Math.round(tickEndY - font.height / 2);
  }

  drawTintedBitmapText(ctx, font, x, y, label, textColor);
}

export class StarsUiRenderer {
  private constructor(
    private readonly textFont: LoadedBitmapFont,
    private readonly colors: StarsUiColors
  ) {}

  static async create(options: StarsUiCreateOptions = {}): Promise<StarsUiRenderer> {
    const fontBasePath = options.fontBasePath ?? "/font/sddCharFontSetASize1";
    const textFont = await loadBitmapFont(fontBasePath);
    return new StarsUiRenderer(textFont, { ...DEFAULT_UI_COLORS, ...(options.colors ?? {}) });
  }

  drawRadarScope(ctx: CanvasRenderingContext2D, rectInput: RadarScopeRect): RadarScopeRect {
    const rect = clampRect(rectInput);

    ctx.fillStyle = this.colors.background;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

    ctx.strokeStyle = this.colors.scopeBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);

    return rect;
  }

  drawCompassRose(ctx: CanvasRenderingContext2D, rectInput: RadarScopeRect, options: CompassRoseOptions = {}): void {
    const rect = clampRect(rectInput);
    const headingOffsetDeg = options.headingOffsetDeg ?? 0;
    const magneticVariationDeg = parseMagneticVariationDeg(options.magneticVariation);
    const minorTickStepDeg = Math.max(1, Math.round(options.minorTickStepDeg ?? DEFAULT_COMPASS_OPTIONS.minorTickStepDeg));
    const majorTickStepDeg = Math.max(minorTickStepDeg, Math.round(options.majorTickStepDeg ?? DEFAULT_COMPASS_OPTIONS.majorTickStepDeg));
    const labelStepDeg = Math.max(majorTickStepDeg, Math.round(options.labelStepDeg ?? DEFAULT_COMPASS_OPTIONS.labelStepDeg));
    const edgeInsetPx = Math.max(0, options.edgeInsetPx ?? DEFAULT_COMPASS_OPTIONS.edgeInsetPx);
    const minorTickLengthPx = Math.max(1, options.minorTickLengthPx ?? DEFAULT_COMPASS_OPTIONS.minorTickLengthPx);
    const majorTickLengthPx = Math.max(1, options.majorTickLengthPx ?? DEFAULT_COMPASS_OPTIONS.majorTickLengthPx);
    const labelInsetPx = Math.max(0, options.labelInsetPx ?? DEFAULT_COMPASS_OPTIONS.labelInsetPx);
    const labelVerticalNudgePx = options.labelVerticalNudgePx ?? 0;
    const showMinorTicks = options.showMinorTicks ?? DEFAULT_COMPASS_OPTIONS.showMinorTicks;
    const showMajorTicks = options.showMajorTicks ?? DEFAULT_COMPASS_OPTIONS.showMajorTicks;
    const tickColor = options.tickColor ?? this.colors.compassTick;
    const textColor = options.textColor ?? this.colors.compassText;

    ctx.strokeStyle = tickColor;
    ctx.lineWidth = 1;
    const borderLeft = rect.x + 0.5;
    const borderRight = rect.x + rect.width - 0.5;
    const borderTop = rect.y + 0.5;
    const borderBottom = rect.y + rect.height - 0.5;

    for (let heading = 0; heading < 360; heading += minorTickStepDeg) {
      const displayHeading = normalizeHeadingDeg(heading + headingOffsetDeg);
      // Convert true to magnetic for placement only:
      // magnetic = true - variation(east-positive).
      // Example: 13W => variation -13, so magnetic = true + 13.
      const plottedHeading = normalizeHeadingDeg(displayHeading - magneticVariationDeg);
      const anchor = intersectHeadingWithRect(rect, plottedHeading, edgeInsetPx);
      if (!anchor) {
        continue;
      }

      const isLabelHeading = heading % labelStepDeg === 0;
      const isMajor = heading % majorTickStepDeg === 0;
      const drawTick = isMajor ? showMajorTicks : showMinorTicks;
      const labelTickLength = Math.max(2, Math.floor(majorTickLengthPx * 0.35));
      const length = isLabelHeading ? labelTickLength : isMajor ? majorTickLengthPx : minorTickLengthPx;
      let x0 = anchor.x;
      let y0 = anchor.y;
      if (anchor.side === "top") {
        y0 = borderTop;
      } else if (anchor.side === "bottom") {
        y0 = borderBottom;
      } else if (anchor.side === "left") {
        x0 = borderLeft;
      } else {
        x0 = borderRight;
      }
      const x1 = x0 - anchor.dx * length;
      const y1 = y0 - anchor.dy * length;

      if (drawTick) {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }

      if (isLabelHeading) {
        ctx.fillStyle = textColor;
        drawCompassLabel(
          ctx,
          this.textFont,
          formatHeading(displayHeading),
          anchor.side,
          x1,
          y1,
          labelInsetPx,
          labelVerticalNudgePx,
          textColor
        );
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, input: StarsUiDrawInput = {}): void {
    const rect =
      input.scopeRect ??
      ({
        x: 0,
        y: 0,
        width: ctx.canvas.width,
        height: ctx.canvas.height
      } satisfies RadarScopeRect);

    if (input.clearCanvas ?? true) {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    const scopeRect = this.drawRadarScope(ctx, rect);
    this.drawCompassRose(ctx, scopeRect, input.compass);
  }
}
