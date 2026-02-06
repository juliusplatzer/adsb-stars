// app/lib/bitmapFont.tsx

export type GlyphMetric = {
    sx: number; sy: number; w: number; h: number;
    offX: number; offY: number; stepX: number;
  };
  
  type FontMeta = {
    height: number;
    width: number;
    pointSize: number;
    metrics: GlyphMetric[]; // indexed by charCode 0..255
  };
  
  export type LoadedBitmapFont = {
    height: number;
    width: number;
    metrics: GlyphMetric[];
    atlas: HTMLImageElement;
  };
  
  // Small cache to avoid re-downloading the same font repeatedly (RAM efficient)
  const fontCache = new Map<string, Promise<LoadedBitmapFont>>();
  
  export function loadBitmapFont(basePath: string): Promise<LoadedBitmapFont> {
    const cached = fontCache.get(basePath);
    if (cached) return cached;
  
    const p = (async () => {
      const metaPromise = fetch(`${basePath}.json`).then(async (r) => {
        if (!r.ok) throw new Error(`Failed to load ${basePath}.json (${r.status})`);
        return (await r.json()) as FontMeta;
      });
  
      const imgPromise = new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error(`Failed to load ${basePath}.png`));
        im.src = `${basePath}.png`;
      });
  
      const [meta, img] = await Promise.all([metaPromise, imgPromise]);
  
      return {
        height: meta.height,
        width: meta.width,
        metrics: meta.metrics,
        atlas: img,
      };
    })();
  
    fontCache.set(basePath, p);
    return p;
  }
  
  export function drawBitmapText(
    ctx: CanvasRenderingContext2D,
    font: LoadedBitmapFont,
    x0: number,
    y0: number,
    text: string,
    scale = 1,
    lineGap = 0
  ) {
    // Pixel crispness
    ctx.imageSmoothingEnabled = false;
  
    let x = x0;
    let y = y0;
    const H = font.height;
  
    const q = "?".charCodeAt(0);
    const fallback = (q >= 0 && q < font.metrics.length) ? font.metrics[q] : font.metrics[0];
  
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
  
      if (ch === "\n") {
        x = x0;
        y += (H + lineGap) * scale;
        continue;
      }
  
      const c = text.charCodeAt(i);
      const g = (c >= 0 && c < font.metrics.length) ? font.metrics[c] : fallback;
      if (!g) continue;
  
      if (g.w > 0 && g.h > 0) {
        // Placement consistent with vice-style metrics:
        // dx = x + offX, dy = y + (H - offY - h)
        const dx = x + g.offX * scale;
        const dy = y + (H - g.offY - g.h) * scale;
  
        ctx.drawImage(
          font.atlas,
          g.sx, g.sy, g.w, g.h,
          dx, dy,
          g.w * scale, g.h * scale
        );
      }
  
      x += g.stepX * scale;
    }
  }
  