# vstars

STARS-style radar scope demo with:

- real-time aircraft feed from ADSB.lol,
- optional FAA SWIM ingest (TAIS + ITWS) via Java consumers,
- Node/TypeScript API for aircraft, QNH, flight-rules SSE, and weather radar,
- TypeScript canvas frontend demo.

## Prerequisites

- Node.js 20+ (tested with Node 24)
- pnpm 9+
- Python 3 (for serving the demo page)
- Optional: Java 17 + Maven (for SWIM consumers in `src/server/src/java`)

## Install

From repo root:

```bash
pnpm install
pnpm -r build
```

## Configure server env

1. Copy server env template:

```bash
cp src/server/.env.example src/server/.env
```

2. Set at least:

- `CENTER_LAT`
- `CENTER_LON`
- `RADIUS_NM`

3. If you use Java ingest, ensure token values match between Node server (`src/server/.env`) and Java env (`src/server/src/java/.env`):

- Flight rules: `TAIS_INGEST_TOKEN`
- WX ingest: `WX_INGEST_TOKEN` (or `ITWS_INGEST_TOKEN`)

## Run (core app)

Use two terminals from repo root.

Terminal 1 (API server):

```bash
pnpm --filter @vstars/server dev
```

Terminal 2 (frontend demo):

```bash
pnpm --filter @vstars/client demo
```

Open:

- `http://localhost:4173/demo.html`

## Optional: run SWIM Java consumers

If you are ingesting live TAIS/ITWS data:

```bash
cd src/server
source ./src/java/.env
mvn -q -DskipTests package
```

Run each consumer in its own terminal:

```bash
cd src/server
source ./src/java/.env
java -jar target/tais-json-consumer-0.1.0.jar
```

```bash
cd src/server
source ./src/java/.env
java -jar target/itws-json-consumer-0.1.0.jar
```

## API endpoints

- `GET /health`
- `GET /api/aircraft`
- `GET /api/qnh?icao=KJFK&icao=KLAX` (or `?ids=KJFK,KLAX`)
- `GET /api/flightRules` (SSE)
- `POST /api/flightRules` (token-protected ingest)
- `GET /api/wx/radar`
- `POST /api/wx/radar` (token-protected ingest)

Notes:

- `GET /api/wx/radar` returns ingested ITWS payload if present.
- If no ingest payload exists, it falls back to NOAA sampling and requires:
  - `lat`
  - `lon`
  - `radiusNm` (capped at 150 NM)

## Quick checks

```bash
curl http://localhost:8080/health
curl http://localhost:8080/api/aircraft
curl "http://localhost:8080/api/qnh?icao=KJFK"
curl "http://localhost:8080/api/wx/radar?lat=40.64&lon=-73.78&radiusNm=80"
```

