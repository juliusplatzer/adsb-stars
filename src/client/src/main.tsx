import { createElement, useEffect, useRef, useState } from "https://esm.sh/react@18";
import { createRoot } from "https://esm.sh/react-dom@18/client";
import { StarsUiRenderer } from "./stars/ui.js";

const SCOPE_MARGIN_X_PX = 0;
const SCOPE_MARGIN_BOTTOM_PX = 18;
const DCB_RESERVED_HEIGHT_PX = 72;
const FONT_BASE_PATH = "/public/font/sddCharFontSetASize1";

function StarsApp(): ReturnType<typeof createElement> {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<StarsUiRenderer>(null);
  const headingOffsetRef = useRef<number>(0);
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

        const renderer = await StarsUiRenderer.create({ fontBasePath: FONT_BASE_PATH });
        if (disposed) {
          return;
        }
        rendererRef.current = renderer;

        let cssWidth = 0;
        let cssHeight = 0;

        const render = (): void => {
          if (!rendererRef.current) {
            return;
          }

          rendererRef.current.draw(ctx, {
            scopeRect: {
              x: SCOPE_MARGIN_X_PX,
              y: DCB_RESERVED_HEIGHT_PX,
              width: Math.max(1, cssWidth - SCOPE_MARGIN_X_PX * 2),
              height: Math.max(1, cssHeight - DCB_RESERVED_HEIGHT_PX - SCOPE_MARGIN_BOTTOM_PX)
            },
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

        window.addEventListener("resize", resize);
        window.addEventListener("keydown", onKeyDown);
        resize();
        console.info("STARS React demo running. Use Left/Right arrows to rotate compass, R to reset.");

        cleanup = () => {
          window.removeEventListener("resize", resize);
          window.removeEventListener("keydown", onKeyDown);
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
      background: "black"
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
