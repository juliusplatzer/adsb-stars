import { loadBitmapFont, type LoadedBitmapFont } from "../lib/bitmapFont.js";
import colors from "./colors.js";

type DcbTileTone = "normal" | "wx" | "gray";

export interface DcbMapSmallButton {
  top: string;
  bottom: string;
  active?: boolean;
  tone?: DcbTileTone;
  mapId?: number;
}

export interface DcbMapCategoryInput {
  x: number;
  y: number;
  rangeLabel?: string;
  rangeValue?: string;
  rangeActive?: boolean;
  rangeTone?: DcbTileTone;
  rrLabel?: string;
  rrValue?: string;
  rrActive?: boolean;
  rrTone?: DcbTileTone;
  placeRrTop?: string;
  placeRrBottom?: string;
  placeRrActive?: boolean;
  placeRrTone?: DcbTileTone;
  rrCntrTop?: string;
  rrCntrBottom?: string;
  rrCntrActive?: boolean;
  rrCntrTone?: DcbTileTone;
  mapsLabel?: string;
  mapsActive?: boolean;
  mapsTone?: DcbTileTone;
  topRow: DcbMapSmallButton[];
  bottomRow: DcbMapSmallButton[];
}

export interface DcbWxLevelButton {
  label: string;
  active?: boolean;
  tone?: DcbTileTone;
}

export interface DcbWxLevelsInput {
  x: number;
  y: number;
  buttons: DcbWxLevelButton[];
}

export interface DcbLeaderControlsInput {
  x: number;
  y: number;
  directionLabel?: string;
  directionValue?: string;
  directionActive?: boolean;
  directionTone?: DcbTileTone;
  lengthLabel?: string;
  lengthValue?: string;
  lengthActive?: boolean;
  lengthTone?: DcbTileTone;
}

export interface DcbBriteMenuButton {
  top: string;
  bottom: string;
  active?: boolean;
  tone?: DcbTileTone;
  textColor?: string;
}

export interface DcbBriteInput {
  x: number;
  y: number;
  label?: string;
  active?: boolean;
  tone?: DcbTileTone;
  expanded?: boolean;
  topRow?: DcbBriteMenuButton[];
  bottomRow?: DcbBriteMenuButton[];
}

export interface DcbColors {
  text: string;
  inactive: string;
  active: string;
  wxInactive: string;
  wxActive: string;
  gray: string;
  borderDark: string;
  borderLight: string;
}

export interface DcbCreateOptions {
  fontBasePath?: string;
  colors?: Partial<DcbColors>;
}

const MAPS_BIG_BUTTON_WIDTH = 60;
const MAPS_BIG_BUTTON_HEIGHT = 60;
const MAPS_SMALL_BUTTON_WIDTH = 60;
const MAPS_SMALL_BUTTON_HEIGHT = 30;
const MAPS_BUTTON_GAP_PX = 2;
const RANGE_COLUMN_X = 0;
const RR_COLUMN_X = RANGE_COLUMN_X + MAPS_BIG_BUTTON_WIDTH + MAPS_BUTTON_GAP_PX;
const PLACE_RR_COLUMN_X = RR_COLUMN_X + MAPS_BIG_BUTTON_WIDTH + MAPS_BUTTON_GAP_PX;
const MAPS_COLUMN_X = PLACE_RR_COLUMN_X + MAPS_BIG_BUTTON_WIDTH + MAPS_BUTTON_GAP_PX;
const MAPS_SMALL_COLUMNS_X =
  MAPS_COLUMN_X + MAPS_BIG_BUTTON_WIDTH + MAPS_BUTTON_GAP_PX;
export const DCB_MAPS_CATEGORY_WIDTH_PX =
  MAPS_SMALL_COLUMNS_X + 3 * MAPS_SMALL_BUTTON_WIDTH + 2 * MAPS_BUTTON_GAP_PX;
const WX_BUTTON_WIDTH = MAPS_SMALL_BUTTON_WIDTH / 2;
const WX_BUTTON_HEIGHT = MAPS_BIG_BUTTON_HEIGHT;
const WX_BUTTON_GAP_PX = MAPS_BUTTON_GAP_PX;
const BRITE_MENU_COLUMNS = 9;
const BRITE_RR_COLUMN_INDEX = 5;

export type DcbRangeRingControlHit = "rr" | "place-rr" | "rr-cntr";
export type DcbLeaderControlHit = "ldr-dir" | "ldr-length";
export type DcbBriteControlHit = "brite-toggle" | "brite-menu" | "brite-done" | "brite-rr";

interface DcbMapTileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DcbMapTile extends DcbMapTileRect {
  mapId: number | null;
}

interface DcbRangeRingControlTile extends DcbMapTileRect {
  control: DcbRangeRingControlHit;
}

interface DcbWxTile extends DcbMapTileRect {
  level: number;
}

interface DcbLeaderControlTile extends DcbMapTileRect {
  control: DcbLeaderControlHit;
}

interface DcbBriteMenuTile extends DcbMapTileRect {
  control: DcbBriteControlHit;
}

const DEFAULT_DCB_COLORS: DcbColors = {
  text: colors.WHITE,
  inactive: colors.DCB_INACTIVE,
  active: colors.DCB_ACTIVE,
  wxInactive: colors.DCB_WX_INACTIVE,
  wxActive: colors.DCB_WX_ACTIVE,
  gray: colors.DCB_GRAY,
  borderDark: colors.DCB_GRAY,
  borderLight: colors.DCB_LIGHT_GRAY
};

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

        const dx = Math.round(x + metric.offX);
        const dy = Math.round(y + (fontHeight - metric.offY - metric.h));
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(offscreen, dx, dy);
      }
    }

    x += metric.stepX;
  }
}

function resolveButtonFillColor(
  palette: DcbColors,
  active: boolean | undefined,
  tone: DcbTileTone | undefined
): string {
  if (tone === "wx") {
    return active ? palette.wxActive : palette.wxInactive;
  }
  if (tone === "gray") {
    return palette.gray;
  }
  return active ? palette.active : palette.inactive;
}

function pointInsideRect(px: number, py: number, rect: DcbMapTileRect): boolean {
  return px >= rect.x && py >= rect.y && px <= rect.x + rect.width && py <= rect.y + rect.height;
}

function drawButtonFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fillColor: string,
  palette: DcbColors
): void {
  const pxX = Math.round(x);
  const pxY = Math.round(y);
  const pxW = Math.max(1, Math.round(width));
  const pxH = Math.max(1, Math.round(height));

  ctx.fillStyle = fillColor;
  ctx.fillRect(pxX, pxY, pxW, pxH);

  // Beveled border look.
  ctx.strokeStyle = palette.borderDark;
  ctx.lineWidth = 1;
  ctx.strokeRect(pxX + 0.5, pxY + 0.5, pxW - 1, pxH - 1);

  ctx.strokeStyle = palette.borderLight;
  ctx.beginPath();
  ctx.moveTo(pxX + 0.5, pxY + pxH - 0.5);
  ctx.lineTo(pxX + 0.5, pxY + 0.5);
  ctx.lineTo(pxX + pxW - 0.5, pxY + 0.5);
  ctx.stroke();
}

function drawCenteredLines(
  ctx: CanvasRenderingContext2D,
  font: LoadedBitmapFont,
  x: number,
  y: number,
  width: number,
  height: number,
  lines: string[],
  textColor: string
): void {
  const validLines = lines
    .map((line) => line.trim().toUpperCase())
    .filter((line) => line.length > 0);
  if (validLines.length === 0) {
    return;
  }

  const totalTextHeight = validLines.length * font.height;
  const startY = Math.round(y + (height - totalTextHeight) * 0.5);

  for (let i = 0; i < validLines.length; i += 1) {
    const line = validLines[i];
    const lineWidth = measureBitmapTextWidth(font, line);
    const lineX = Math.round(x + (width - lineWidth) * 0.5);
    const lineY = startY + i * font.height;
    drawTintedBitmapText(ctx, font, lineX, lineY, line, textColor);
  }
}

export class StarsDcbRenderer {
  private constructor(
    private readonly font: LoadedBitmapFont,
    private readonly palette: DcbColors
  ) {}

  static async create(options: DcbCreateOptions = {}): Promise<StarsDcbRenderer> {
    const fontBasePath = options.fontBasePath ?? "/font/sddCharFontSetASize1";
    const font = await loadBitmapFont(fontBasePath);
    return new StarsDcbRenderer(font, { ...DEFAULT_DCB_COLORS, ...(options.colors ?? {}) });
  }

  private getMapsTiles(input: DcbMapCategoryInput): DcbMapTile[] {
    const originX = Math.round(input.x);
    const originY = Math.round(input.y);
    const topRow = input.topRow.slice(0, 3);
    const bottomRow = input.bottomRow.slice(0, 3);
    const tiles: DcbMapTile[] = [];
    const mapsX = originX + MAPS_SMALL_COLUMNS_X;

    for (let i = 0; i < 3; i += 1) {
      const columnX =
        mapsX + i * (MAPS_SMALL_BUTTON_WIDTH + MAPS_BUTTON_GAP_PX);
      const top = topRow[i] ?? null;
      const bottom = bottomRow[i] ?? null;
      tiles.push({
        x: columnX,
        y: originY,
        width: MAPS_SMALL_BUTTON_WIDTH,
        height: MAPS_SMALL_BUTTON_HEIGHT,
        mapId: top?.mapId ?? null
      });
      tiles.push({
        x: columnX,
        y: originY + MAPS_SMALL_BUTTON_HEIGHT + MAPS_BUTTON_GAP_PX,
        width: MAPS_SMALL_BUTTON_WIDTH,
        height: MAPS_SMALL_BUTTON_HEIGHT,
        mapId: bottom?.mapId ?? null
      });
    }

    return tiles;
  }

  private getRangeRingControlTiles(input: DcbMapCategoryInput): DcbRangeRingControlTile[] {
    const originX = Math.round(input.x);
    const originY = Math.round(input.y);
    const rrX = originX + RR_COLUMN_X;
    const placeRrX = originX + PLACE_RR_COLUMN_X;
    return [
      {
        x: rrX,
        y: originY,
        width: MAPS_BIG_BUTTON_WIDTH,
        height: MAPS_BIG_BUTTON_HEIGHT,
        control: "rr"
      },
      {
        x: placeRrX,
        y: originY,
        width: MAPS_SMALL_BUTTON_WIDTH,
        height: MAPS_SMALL_BUTTON_HEIGHT,
        control: "place-rr"
      },
      {
        x: placeRrX,
        y: originY + MAPS_SMALL_BUTTON_HEIGHT + MAPS_BUTTON_GAP_PX,
        width: MAPS_SMALL_BUTTON_WIDTH,
        height: MAPS_SMALL_BUTTON_HEIGHT,
        control: "rr-cntr"
      }
    ];
  }

  private getWxTiles(input: DcbWxLevelsInput): DcbWxTile[] {
    const originX = Math.round(input.x);
    const originY = Math.round(input.y);
    const buttons = input.buttons.slice(0, 6);
    const tiles: DcbWxTile[] = [];

    for (let i = 0; i < buttons.length; i += 1) {
      tiles.push({
        x: originX + i * (WX_BUTTON_WIDTH + WX_BUTTON_GAP_PX),
        y: originY,
        width: WX_BUTTON_WIDTH,
        height: WX_BUTTON_HEIGHT,
        level: i + 1
      });
    }

    return tiles;
  }

  private getLeaderControlTiles(input: DcbLeaderControlsInput): DcbLeaderControlTile[] {
    const originX = Math.round(input.x);
    const originY = Math.round(input.y);
    return [
      {
        x: originX,
        y: originY,
        width: MAPS_SMALL_BUTTON_WIDTH,
        height: MAPS_SMALL_BUTTON_HEIGHT,
        control: "ldr-dir"
      },
      {
        x: originX,
        y: originY + MAPS_SMALL_BUTTON_HEIGHT + MAPS_BUTTON_GAP_PX,
        width: MAPS_SMALL_BUTTON_WIDTH,
        height: MAPS_SMALL_BUTTON_HEIGHT,
        control: "ldr-length"
      }
    ];
  }

  private getBriteMenuTiles(input: DcbBriteInput): DcbBriteMenuTile[] {
    const originX = Math.round(input.x);
    const originY = Math.round(input.y);
    const tiles: DcbBriteMenuTile[] = [
      {
        x: originX,
        y: originY,
        width: MAPS_BIG_BUTTON_WIDTH,
        height: MAPS_BIG_BUTTON_HEIGHT,
        control: "brite-toggle"
      }
    ];

    if (!input.expanded) {
      return tiles;
    }

    const menuOriginX = originX + MAPS_BIG_BUTTON_WIDTH + MAPS_BUTTON_GAP_PX;
    for (let i = 0; i < BRITE_MENU_COLUMNS; i += 1) {
      const columnX = menuOriginX + i * (MAPS_SMALL_BUTTON_WIDTH + MAPS_BUTTON_GAP_PX);
      tiles.push({
        x: columnX,
        y: originY,
        width: MAPS_SMALL_BUTTON_WIDTH,
        height: MAPS_SMALL_BUTTON_HEIGHT,
        control: i === BRITE_RR_COLUMN_INDEX ? "brite-rr" : "brite-menu"
      });
      tiles.push({
        x: columnX,
        y: originY + MAPS_SMALL_BUTTON_HEIGHT + MAPS_BUTTON_GAP_PX,
        width: MAPS_SMALL_BUTTON_WIDTH,
        height: MAPS_SMALL_BUTTON_HEIGHT,
        control: i === BRITE_MENU_COLUMNS - 1 ? "brite-done" : "brite-menu"
      });
    }

    return tiles;
  }

  hitTestMapsCategory(input: DcbMapCategoryInput, x: number, y: number): number | null {
    const tiles = this.getMapsTiles(input);
    for (const tile of tiles) {
      if (!pointInsideRect(x, y, tile)) {
        continue;
      }
      return tile.mapId;
    }
    return null;
  }

  hitTestRangeRingControls(
    input: DcbMapCategoryInput,
    x: number,
    y: number
  ): DcbRangeRingControlHit | null {
    const tiles = this.getRangeRingControlTiles(input);
    for (const tile of tiles) {
      if (!pointInsideRect(x, y, tile)) {
        continue;
      }
      return tile.control;
    }
    return null;
  }

  hitTestWxLevels(input: DcbWxLevelsInput, x: number, y: number): number | null {
    const tiles = this.getWxTiles(input);
    for (const tile of tiles) {
      if (!pointInsideRect(x, y, tile)) {
        continue;
      }
      return tile.level;
    }
    return null;
  }

  hitTestLeaderControls(
    input: DcbLeaderControlsInput,
    x: number,
    y: number
  ): DcbLeaderControlHit | null {
    const tiles = this.getLeaderControlTiles(input);
    for (const tile of tiles) {
      if (!pointInsideRect(x, y, tile)) {
        continue;
      }
      return tile.control;
    }
    return null;
  }

  hitTestBrite(input: DcbBriteInput, x: number, y: number): DcbBriteControlHit | null {
    const tiles = this.getBriteMenuTiles(input);
    for (const tile of tiles) {
      if (!pointInsideRect(x, y, tile)) {
        continue;
      }
      return tile.control;
    }
    return null;
  }

  drawMapsCategory(ctx: CanvasRenderingContext2D, input: DcbMapCategoryInput): void {
    const originX = Math.round(input.x);
    const originY = Math.round(input.y);
    const rangeX = originX + RANGE_COLUMN_X;
    const rrX = originX + RR_COLUMN_X;
    const placeRrX = originX + PLACE_RR_COLUMN_X;
    const mapsX = originX + MAPS_COLUMN_X;
    const mapsSmallX = originX + MAPS_SMALL_COLUMNS_X;

    // Left-most RANGE tile (same 60x60 footprint as MAPS).
    drawButtonFrame(
      ctx,
      rangeX,
      originY,
      MAPS_BIG_BUTTON_WIDTH,
      MAPS_BIG_BUTTON_HEIGHT,
      resolveButtonFillColor(this.palette, input.rangeActive, input.rangeTone),
      this.palette
    );
    drawCenteredLines(
      ctx,
      this.font,
      rangeX,
      originY,
      MAPS_BIG_BUTTON_WIDTH,
      MAPS_BIG_BUTTON_HEIGHT,
      [input.rangeLabel ?? "RANGE", input.rangeValue ?? ""],
      this.palette.text
    );

    drawButtonFrame(
      ctx,
      rrX,
      originY,
      MAPS_BIG_BUTTON_WIDTH,
      MAPS_BIG_BUTTON_HEIGHT,
      resolveButtonFillColor(this.palette, input.rrActive, input.rrTone),
      this.palette
    );
    drawCenteredLines(
      ctx,
      this.font,
      rrX,
      originY,
      MAPS_BIG_BUTTON_WIDTH,
      MAPS_BIG_BUTTON_HEIGHT,
      [input.rrLabel ?? "RR", input.rrValue ?? "10"],
      this.palette.text
    );

    drawButtonFrame(
      ctx,
      placeRrX,
      originY,
      MAPS_SMALL_BUTTON_WIDTH,
      MAPS_SMALL_BUTTON_HEIGHT,
      resolveButtonFillColor(this.palette, input.placeRrActive, input.placeRrTone),
      this.palette
    );
    drawCenteredLines(
      ctx,
      this.font,
      placeRrX,
      originY,
      MAPS_SMALL_BUTTON_WIDTH,
      MAPS_SMALL_BUTTON_HEIGHT,
      [input.placeRrTop ?? "PLACE", input.placeRrBottom ?? "RR"],
      this.palette.text
    );

    drawButtonFrame(
      ctx,
      placeRrX,
      originY + MAPS_SMALL_BUTTON_HEIGHT + MAPS_BUTTON_GAP_PX,
      MAPS_SMALL_BUTTON_WIDTH,
      MAPS_SMALL_BUTTON_HEIGHT,
      resolveButtonFillColor(this.palette, input.rrCntrActive, input.rrCntrTone ?? "normal"),
      this.palette
    );
    drawCenteredLines(
      ctx,
      this.font,
      placeRrX,
      originY + MAPS_SMALL_BUTTON_HEIGHT + MAPS_BUTTON_GAP_PX,
      MAPS_SMALL_BUTTON_WIDTH,
      MAPS_SMALL_BUTTON_HEIGHT,
      [input.rrCntrTop ?? "RR", input.rrCntrBottom ?? "CNTR"],
      this.palette.text
    );

    drawButtonFrame(
      ctx,
      mapsX,
      originY,
      MAPS_BIG_BUTTON_WIDTH,
      MAPS_BIG_BUTTON_HEIGHT,
      resolveButtonFillColor(this.palette, input.mapsActive, input.mapsTone),
      this.palette
    );
    drawCenteredLines(
      ctx,
      this.font,
      mapsX,
      originY,
      MAPS_BIG_BUTTON_WIDTH,
      MAPS_BIG_BUTTON_HEIGHT,
      [input.mapsLabel ?? "MAPS"],
      this.palette.text
    );

    const topRow = input.topRow.slice(0, 3);
    const bottomRow = input.bottomRow.slice(0, 3);
    for (let i = 0; i < 3; i += 1) {
      const columnX =
        mapsSmallX + i * (MAPS_SMALL_BUTTON_WIDTH + MAPS_BUTTON_GAP_PX);
      const top = topRow[i] ?? { top: "", bottom: "", active: false, tone: "normal" };
      const bottom = bottomRow[i] ?? { top: "", bottom: "", active: false, tone: "normal" };

      drawButtonFrame(
        ctx,
        columnX,
        originY,
        MAPS_SMALL_BUTTON_WIDTH,
        MAPS_SMALL_BUTTON_HEIGHT,
        resolveButtonFillColor(this.palette, top.active, top.tone),
        this.palette
      );
      drawCenteredLines(
        ctx,
        this.font,
        columnX,
        originY,
        MAPS_SMALL_BUTTON_WIDTH,
        MAPS_SMALL_BUTTON_HEIGHT,
        [top.top, top.bottom],
        this.palette.text
      );

      drawButtonFrame(
        ctx,
        columnX,
        originY + MAPS_SMALL_BUTTON_HEIGHT + MAPS_BUTTON_GAP_PX,
        MAPS_SMALL_BUTTON_WIDTH,
        MAPS_SMALL_BUTTON_HEIGHT,
        resolveButtonFillColor(this.palette, bottom.active, bottom.tone),
        this.palette
      );
      drawCenteredLines(
        ctx,
        this.font,
        columnX,
        originY + MAPS_SMALL_BUTTON_HEIGHT + MAPS_BUTTON_GAP_PX,
        MAPS_SMALL_BUTTON_WIDTH,
        MAPS_SMALL_BUTTON_HEIGHT,
        [bottom.top, bottom.bottom],
        this.palette.text
      );
    }
  }

  drawWxLevels(ctx: CanvasRenderingContext2D, input: DcbWxLevelsInput): void {
    const originX = Math.round(input.x);
    const originY = Math.round(input.y);
    const buttons = input.buttons.slice(0, 6);

    for (let i = 0; i < buttons.length; i += 1) {
      const button = buttons[i];
      const x = originX + i * (WX_BUTTON_WIDTH + WX_BUTTON_GAP_PX);
      const label = button.label.trim().toUpperCase() || `WX${i + 1}`;
      const tone = button.tone ?? "wx";
      const lines = tone === "wx" ? [label, "AVL"] : [label];

      drawButtonFrame(
        ctx,
        x,
        originY,
        WX_BUTTON_WIDTH,
        WX_BUTTON_HEIGHT,
        resolveButtonFillColor(this.palette, button.active, tone),
        this.palette
      );
      drawCenteredLines(
        ctx,
        this.font,
        x,
        originY,
        WX_BUTTON_WIDTH,
        WX_BUTTON_HEIGHT,
        lines,
        this.palette.text
      );
    }
  }

  drawLeaderControls(ctx: CanvasRenderingContext2D, input: DcbLeaderControlsInput): void {
    const originX = Math.round(input.x);
    const originY = Math.round(input.y);

    drawButtonFrame(
      ctx,
      originX,
      originY,
      MAPS_SMALL_BUTTON_WIDTH,
      MAPS_SMALL_BUTTON_HEIGHT,
      resolveButtonFillColor(this.palette, input.directionActive, input.directionTone),
      this.palette
    );
    drawCenteredLines(
      ctx,
      this.font,
      originX,
      originY,
      MAPS_SMALL_BUTTON_WIDTH,
      MAPS_SMALL_BUTTON_HEIGHT,
      [input.directionLabel ?? "LDR DIR", input.directionValue ?? "N"],
      this.palette.text
    );

    drawButtonFrame(
      ctx,
      originX,
      originY + MAPS_SMALL_BUTTON_HEIGHT + MAPS_BUTTON_GAP_PX,
      MAPS_SMALL_BUTTON_WIDTH,
      MAPS_SMALL_BUTTON_HEIGHT,
      resolveButtonFillColor(this.palette, input.lengthActive, input.lengthTone),
      this.palette
    );
    drawCenteredLines(
      ctx,
      this.font,
      originX,
      originY + MAPS_SMALL_BUTTON_HEIGHT + MAPS_BUTTON_GAP_PX,
      MAPS_SMALL_BUTTON_WIDTH,
      MAPS_SMALL_BUTTON_HEIGHT,
      [input.lengthLabel ?? "LDR", input.lengthValue ?? "1"],
      this.palette.text
    );
  }

  drawBrite(ctx: CanvasRenderingContext2D, input: DcbBriteInput): void {
    const originX = Math.round(input.x);
    const originY = Math.round(input.y);

    drawButtonFrame(
      ctx,
      originX,
      originY,
      MAPS_BIG_BUTTON_WIDTH,
      MAPS_BIG_BUTTON_HEIGHT,
      resolveButtonFillColor(this.palette, input.active, input.tone),
      this.palette
    );
    drawCenteredLines(
      ctx,
      this.font,
      originX,
      originY,
      MAPS_BIG_BUTTON_WIDTH,
      MAPS_BIG_BUTTON_HEIGHT,
      [input.label ?? "BRITE"],
      this.palette.text
    );

    if (!input.expanded) {
      return;
    }

    const topRow = (input.topRow ?? []).slice(0, BRITE_MENU_COLUMNS);
    const bottomRow = (input.bottomRow ?? []).slice(0, BRITE_MENU_COLUMNS);
    const menuOriginX = originX + MAPS_BIG_BUTTON_WIDTH + MAPS_BUTTON_GAP_PX;
    const menuWidth =
      BRITE_MENU_COLUMNS * MAPS_SMALL_BUTTON_WIDTH +
      (BRITE_MENU_COLUMNS - 1) * MAPS_BUTTON_GAP_PX;
    const menuHeight = MAPS_SMALL_BUTTON_HEIGHT * 2 + MAPS_BUTTON_GAP_PX;

    // Keep the expanded submenu readable by masking underlying controls.
    ctx.save();
    ctx.fillStyle = colors.BLACK;
    ctx.fillRect(menuOriginX, originY, menuWidth, menuHeight);
    ctx.restore();

    for (let i = 0; i < BRITE_MENU_COLUMNS; i += 1) {
      const columnX = menuOriginX + i * (MAPS_SMALL_BUTTON_WIDTH + MAPS_BUTTON_GAP_PX);
      const top = topRow[i] ?? { top: "", bottom: "", active: false, tone: "normal" };
      const bottom = bottomRow[i] ?? { top: "", bottom: "", active: false, tone: "normal" };

      drawButtonFrame(
        ctx,
        columnX,
        originY,
        MAPS_SMALL_BUTTON_WIDTH,
        MAPS_SMALL_BUTTON_HEIGHT,
        resolveButtonFillColor(this.palette, top.active, top.tone),
        this.palette
      );
      drawCenteredLines(
        ctx,
        this.font,
        columnX,
        originY,
        MAPS_SMALL_BUTTON_WIDTH,
        MAPS_SMALL_BUTTON_HEIGHT,
        [top.top, top.bottom],
        top.textColor ?? this.palette.text
      );

      drawButtonFrame(
        ctx,
        columnX,
        originY + MAPS_SMALL_BUTTON_HEIGHT + MAPS_BUTTON_GAP_PX,
        MAPS_SMALL_BUTTON_WIDTH,
        MAPS_SMALL_BUTTON_HEIGHT,
        resolveButtonFillColor(this.palette, bottom.active, bottom.tone),
        this.palette
      );
      drawCenteredLines(
        ctx,
        this.font,
        columnX,
        originY + MAPS_SMALL_BUTTON_HEIGHT + MAPS_BUTTON_GAP_PX,
        MAPS_SMALL_BUTTON_WIDTH,
        MAPS_SMALL_BUTTON_HEIGHT,
        [bottom.top, bottom.bottom],
        bottom.textColor ?? this.palette.text
      );
    }
  }
}
