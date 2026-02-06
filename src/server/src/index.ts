import { createServer } from "node:http";
import { loadConfig } from "./env.js";
import { AdsbLolClient } from "./adsb-lol-client.js";
import { AircraftFeedService } from "./aircraft-feed-service.js";
import { Fr24Client } from "./fr24-client.js";
import { QnhService } from "./qnh-service.js";
import { WxRadarService } from "./wx-radar-service.js";

const config = loadConfig();
const MAX_WX_RADIUS_NM = 150;

const feedService = new AircraftFeedService(
  new AdsbLolClient(config.adsbLol),
  new Fr24Client(config.fr24),
  {
    pollIntervalMs: config.pollIntervalMs,
    center: {
      lat: config.centerLat,
      lon: config.centerLon
    },
    radiusNm: config.radiusNm
  }
);
feedService.start();
const qnhService = new QnhService(config.aviationWeather);
const wxReflectivityService = new WxRadarService(config.wxReflectivity);

function parseIcaoParams(reqUrl: string): string[] {
  const url = new URL(reqUrl, "http://localhost");
  const fromRepeating = url.searchParams.getAll("icao");
  if (fromRepeating.length > 0) {
    return fromRepeating.flatMap((value) => value.split(","));
  }
  const ids = url.searchParams.get("ids");
  if (!ids) {
    return [];
  }
  return ids.split(",");
}

const server = createServer((req, res) => {
  const reqUrl = req.url ?? "/";
  const url = new URL(reqUrl, "http://localhost");

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "GET" && req.url === "/api/aircraft") {
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store"
    });
    res.end(JSON.stringify(feedService.getLatestFeed()));
    return;
  }

  if (req.method === "GET" && reqUrl.startsWith("/api/qnh")) {
    const icaos = parseIcaoParams(reqUrl);
    if (icaos.length === 0) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Provide at least one ICAO via ?icao=KJFK&icao=KLAX or ?ids=KJFK,KLAX" }));
      return;
    }

    void qnhService
      .getQnh(icaos)
      .then((payload) => {
        res.writeHead(200, {
          "content-type": "application/json",
          "cache-control": "no-store"
        });
        res.end(JSON.stringify(payload));
      })
      .catch((error) => {
        console.error("[qnh] lookup failed", error);
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to fetch QNH data" }));
      });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/wx/radar") {
    const lat = Number(url.searchParams.get("lat"));
    const lon = Number(url.searchParams.get("lon"));
    const radiusNm = Number(url.searchParams.get("radiusNm") ?? "80");

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radiusNm) || radiusNm <= 0) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Provide valid lat, lon, and positive radiusNm query params" }));
      return;
    }
    const effectiveRadiusNm = Math.min(radiusNm, MAX_WX_RADIUS_NM);

    void wxReflectivityService
      .fetchGrid(lat, lon, effectiveRadiusNm)
      .then((payload) => {
        res.writeHead(200, {
          "content-type": "application/json",
          "cache-control": "no-store"
        });
        res.end(JSON.stringify(payload));
      })
      .catch((error) => {
        console.error("[wx] radar lookup failed", error);
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to fetch radar data" }));
      });
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
});

server.listen(config.port, () => {
  console.log(`Aircraft feed server listening on http://localhost:${config.port}`);
});

const shutdown = (): void => {
  feedService.stop();
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
