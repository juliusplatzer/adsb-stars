import type { WxReflectivityResponse } from "@vstars/shared";
import colors from "./colors.js";

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

type WxStippleKind = "light" | "dense";

export interface StarsWxDrawInput {
  scopeRect: ScopeRect;
  viewCenter: LatLon | null;
  viewRadiusNm: number | null;
  panOffsetPxX: number;
  panOffsetPxY: number;
  activeLevels: ReadonlySet<number>;
  radar: WxReflectivityResponse | null;
}

const WX_STIPPLE_LIGHT: number[] = [
  0b00000000000000000000000000000000,
  0b00000000000000000000000000000000,
  0b00000000000011000000000000000000,
  0b00000000000011000000000000000000,
  0b00000000000000000000000000000000,
  0b00000000000000000000000000000000,
  0b00000000000000000000000000000000,
  0b00000000000000000000001100000000,
  0b00000000000000000000001100000000,
  0b00000000000000000000000000000000,
  0b00000000000000000000000000000000,
  0b00000001100000000000000000000000,
  0b00000001100000000000000000000000,
  0b00000000000000000000000000000000,
  0b00000000000000000000000000000000,
  0b00000000000000110000000000000000,
  0b00000000000000110000000000000000,
  0b00000000000000000000000000001100,
  0b00000000000000000000000000001100,
  0b00000000000000000000000000000000,
  0b00000000000000000000000000000000,
  0b00000000000000000000000000000000,
  0b00000000110000000000000000000000,
  0b00000000110000000000000000000000,
  0b00000000000000000000000000000000,
  0b00000000000000000011000000000000,
  0b00000000000000000011000000000000,
  0b00000000000000000000000000000000,
  0b00000000000000000000000000000000,
  0b00000000000000000000000000000000,
  0b11000000000000000000000000000000,
  0b11000000000000000000000000000000
];

const WX_STIPPLE_DENSE: number[] = [
  0b00000000000000000000000000000000,
  0b00000000000000000000000000000000,
  0b00001000000000000000100000000000,
  0b00001000000000000000100000000000,
  0b00000000000110000000000000011000,
  0b01000000000000000100000000000000,
  0b01000000000000000100000000000000,
  0b00000001100000000000000110000000,
  0b00000000000000000000000000000000,
  0b00000000000000110000000000000011,
  0b00000000000000000000000000000000,
  0b00011000000000000001100000000000,
  0b00000000000000000000000000000000,
  0b00000000001000000000000000100000,
  0b00000000001000000000000000100000,
  0b11000000000000001100000000000000,
  0b00000000000000000000000000000000,
  0b00000000000000000000000000000000,
  0b00001000000000000000100000000000,
  0b00001000000000000000100000000000,
  0b00000000000110000000000000011000,
  0b01000000000000000100000000000000,
  0b01000000000000000100000000000000,
  0b00000001100000000000000110000000,
  0b00000000000000000000000000000000,
  0b00000000000000110000000000000011,
  0b00000000000000000000000000000000,
  0b00011000000000000001100000000000,
  0b00000000000000000000000000000000,
  0b00000000001000000000000000100000,
  0b00000000001000000000000000100000,
  0b11000000000000001100000000000000
];

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function resolveStippleKind(level: number): WxStippleKind | null {
  if (level === 2 || level === 5) {
    return "light";
  }
  if (level === 3 || level === 6) {
    return "dense";
  }
  return null;
}

function createStippleCanvas(bits: number[], alpha: number): HTMLCanvasElement {
  const size = bits.length;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  const imageData = context.createImageData(size, size);
  const data = imageData.data;
  for (let row = 0; row < size; row += 1) {
    const mask = bits[row] >>> 0;
    for (let col = 0; col < size; col += 1) {
      const isSet = ((mask >>> (31 - col)) & 1) === 1;
      if (!isSet) {
        continue;
      }
      const offset = (row * size + col) * 4;
      data[offset + 0] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = alpha;
    }
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}

export class StarsWxRenderer {
  private readonly lightCanvas = createStippleCanvas(WX_STIPPLE_LIGHT, 104);
  private readonly denseCanvas = createStippleCanvas(WX_STIPPLE_DENSE, 160);

  private drawLegacy(
    ctx: CanvasRenderingContext2D,
    input: StarsWxDrawInput,
    radar: WxReflectivityResponse,
    scopeCenterX: number,
    scopeCenterY: number,
    pixelsPerNm: number,
    viewCenter: LatLon
  ): void {
    const nmPerLonDeg = 60 * Math.cos(toRadians(viewCenter.lat));
    if (!Number.isFinite(nmPerLonDeg) || Math.abs(nmPerLonDeg) < 1e-9) {
      return;
    }

    if (radar.width <= 0 || radar.height <= 0) {
      return;
    }

    const radarCenterDxNm = (radar.center.lon - viewCenter.lon) * nmPerLonDeg;
    const radarCenterDyNm = (radar.center.lat - viewCenter.lat) * 60;
    const cellNm = radar.cellSizeNm;
    const halfCellNm = cellNm * 0.5;
    const cellPx = cellNm * pixelsPerNm;
    const halfCellPx = cellPx * 0.5;
    const startXNm = radarCenterDxNm - radar.radiusNm + halfCellNm;
    const startYNm = radarCenterDyNm + radar.radiusNm - halfCellNm;
    const maxIndex = radar.width * radar.height;
    const visibleMinX = input.scopeRect.x - cellPx;
    const visibleMaxX = input.scopeRect.x + input.scopeRect.width + cellPx;
    const visibleMinY = input.scopeRect.y - cellPx;
    const visibleMaxY = input.scopeRect.y + input.scopeRect.height + cellPx;
    const lightPattern = ctx.createPattern(this.lightCanvas, "repeat");
    const densePattern = ctx.createPattern(this.denseCanvas, "repeat");

    for (let row = 0; row < radar.height; row += 1) {
      const yNm = startYNm - row * cellNm;
      const y = scopeCenterY - yNm * pixelsPerNm - halfCellPx;
      if (y + cellPx < visibleMinY || y > visibleMaxY) {
        continue;
      }

      for (let col = 0; col < radar.width; col += 1) {
        const index = row * radar.width + col;
        if (index < 0 || index >= maxIndex) {
          continue;
        }

        const level = radar.levels[index] ?? 0;
        if (level < 1 || level > 6 || !input.activeLevels.has(level)) {
          continue;
        }

        const xNm = startXNm + col * cellNm;
        const x = scopeCenterX + xNm * pixelsPerNm - halfCellPx;
        if (x + cellPx < visibleMinX || x > visibleMaxX) {
          continue;
        }

        ctx.fillStyle = level <= 3 ? colors.DARK_GRAY_BLUE : colors.DARK_MUSTARD;
        ctx.fillRect(x, y, cellPx, cellPx);

        const stipple = resolveStippleKind(level);
        if (stipple === "light" && lightPattern) {
          ctx.fillStyle = lightPattern;
          ctx.fillRect(x, y, cellPx, cellPx);
        } else if (stipple === "dense" && densePattern) {
          ctx.fillStyle = densePattern;
          ctx.fillRect(x, y, cellPx, cellPx);
        }
      }
    }
  }

  private drawItws(
    ctx: CanvasRenderingContext2D,
    input: StarsWxDrawInput,
    radar: WxReflectivityResponse,
    scopeCenterX: number,
    scopeCenterY: number,
    pixelsPerNm: number,
    viewCenter: LatLon
  ): boolean {
    const rows = radar.rows ?? 0;
    const cols = radar.cols ?? 0;
    const cells = radar.cells ?? null;
    const trp = radar.trp;
    const gridGeom = radar.gridGeom;
    if (!trp || !gridGeom || !cells || rows <= 0 || cols <= 0 || cells.length === 0) {
      return false;
    }

    const nmPerLonDeg = 60 * Math.cos(toRadians(viewCenter.lat));
    if (!Number.isFinite(nmPerLonDeg) || Math.abs(nmPerLonDeg) < 1e-9) {
      return false;
    }

    const dxM = gridGeom.dxM;
    const dyM = gridGeom.dyM;
    if (!Number.isFinite(dxM) || !Number.isFinite(dyM) || dxM <= 0 || dyM <= 0) {
      return false;
    }

    const rotationRad = toRadians(gridGeom.rotationDeg);
    const cos = Math.cos(rotationRad);
    const sin = Math.sin(rotationRad);

    const trpDxNm = (trp.lonDeg - viewCenter.lon) * nmPerLonDeg;
    const trpDyNm = (trp.latDeg - viewCenter.lat) * 60;

    const east0M = gridGeom.xOffsetM * cos - gridGeom.yOffsetM * sin;
    const north0M = gridGeom.xOffsetM * sin + gridGeom.yOffsetM * cos;
    const originX = scopeCenterX + (trpDxNm + east0M / 1852) * pixelsPerNm;
    const originY = scopeCenterY - (trpDyNm + north0M / 1852) * pixelsPerNm;

    const colVecX = (dxM * cos * pixelsPerNm) / 1852;
    const colVecY = (-dxM * sin * pixelsPerNm) / 1852;
    // Row increases downward in row-major plotting.
    const rowVecX = (dyM * sin * pixelsPerNm) / 1852;
    const rowVecY = (dyM * cos * pixelsPerNm) / 1852;

    const visibleMinX = input.scopeRect.x - Math.abs(colVecX) - Math.abs(rowVecX);
    const visibleMaxX = input.scopeRect.x + input.scopeRect.width + Math.abs(colVecX) + Math.abs(rowVecX);
    const visibleMinY = input.scopeRect.y - Math.abs(colVecY) - Math.abs(rowVecY);
    const visibleMaxY = input.scopeRect.y + input.scopeRect.height + Math.abs(colVecY) + Math.abs(rowVecY);

    const lightPattern = ctx.createPattern(this.lightCanvas, "repeat");
    const densePattern = ctx.createPattern(this.denseCanvas, "repeat");

    for (let row = 0; row < rows; row += 1) {
      const rowBaseX = originX + row * rowVecX;
      const rowBaseY = originY + row * rowVecY;
      for (let col = 0; col < cols; col += 1) {
        const index = row * cols + col;
        const level = cells[index] ?? 0;
        if (level < 1 || level > 6 || !input.activeLevels.has(level)) {
          continue;
        }

        const x0 = rowBaseX + col * colVecX;
        const y0 = rowBaseY + col * colVecY;
        const x1 = x0 + colVecX;
        const y1 = y0 + colVecY;
        const x2 = x1 + rowVecX;
        const y2 = y1 + rowVecY;
        const x3 = x0 + rowVecX;
        const y3 = y0 + rowVecY;

        const minX = Math.min(x0, x1, x2, x3);
        const maxX = Math.max(x0, x1, x2, x3);
        const minY = Math.min(y0, y1, y2, y3);
        const maxY = Math.max(y0, y1, y2, y3);
        if (maxX < visibleMinX || minX > visibleMaxX || maxY < visibleMinY || minY > visibleMaxY) {
          continue;
        }

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.closePath();
        ctx.fillStyle = level <= 3 ? colors.DARK_GRAY_BLUE : colors.DARK_MUSTARD;
        ctx.fill();

        const stipple = resolveStippleKind(level);
        if (stipple === "light" && lightPattern) {
          ctx.fillStyle = lightPattern;
          ctx.fill();
        } else if (stipple === "dense" && densePattern) {
          ctx.fillStyle = densePattern;
          ctx.fill();
        }
      }
    }

    return true;
  }

  draw(ctx: CanvasRenderingContext2D, input: StarsWxDrawInput): void {
    const { radar, viewCenter, viewRadiusNm } = input;
    if (!radar || !viewCenter || viewRadiusNm === null || viewRadiusNm <= 0) {
      return;
    }
    if (input.activeLevels.size === 0) {
      return;
    }

    const scopeCenterX = input.scopeRect.x + input.scopeRect.width * 0.5 + input.panOffsetPxX;
    const scopeCenterY = input.scopeRect.y + input.scopeRect.height * 0.5 + input.panOffsetPxY;
    const pixelsPerNm = Math.min(input.scopeRect.width, input.scopeRect.height) / (2 * viewRadiusNm);
    if (!Number.isFinite(pixelsPerNm) || pixelsPerNm <= 0) {
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(input.scopeRect.x, input.scopeRect.y, input.scopeRect.width, input.scopeRect.height);
    ctx.clip();

    const drewItws = this.drawItws(ctx, input, radar, scopeCenterX, scopeCenterY, pixelsPerNm, viewCenter);
    if (!drewItws) {
      this.drawLegacy(ctx, input, radar, scopeCenterX, scopeCenterY, pixelsPerNm, viewCenter);
    }

    ctx.restore();
  }
}
