### vstars

View ADS-B and MLAT flight traffic data in real-time on a STARS-like radar scope.

#### Installation

```bash
pnpm install
pnpm -r build
```

#### Server feed

`src/server` now provides a polling feed service that:

- polls ADSB.lol every 5 seconds (configurable),
- enriches each aircraft with RECAT wake category (A-I, NOWGT, UNKNOWN),
- resolves destination IATA once per flight id via FR24 and caches it,
- tracks last 5 previous positions per flight id,
- interpolates position when ADS-B returns the same coordinates on consecutive polls.

Expose endpoint:

- `GET /api/aircraft`
- `GET /api/qnh?icao=KJFK&icao=KLAX` (also supports `?ids=KJFK,KLAX`)
- `GET /api/wx/radar?lat=40.64&lon=-73.78&radiusNm=80` (radius is capped at `150` NM)

Required env vars for `@vstars/server`:

- `CENTER_LAT`
- `CENTER_LON`
- `RADIUS_NM`

See `src/server/.env.example` for a ready-to-copy template.

Optional env vars:

- `PORT` (default `8080`)
- `POLL_INTERVAL_MS` (default `5000`)
- `ADSBLOL_BASE_URL` (default `https://api.adsb.lol`)
- `ADSBLOL_SEARCH_PATH_TEMPLATE` (default `/v2/lat/{lat}/lon/{lon}/dist/{radius}`)
- `FR24_BASE_URL` (default `https://fr24api.flightradar24.com`)
- `FR24_LIVE_FULL_PATH` (default `/api/live/flight-positions/full`)
- `FR24_API_TOKEN` (Bearer token for FR24)
- `FR24_ACCEPT_VERSION` (default `v1`)
- `FR24_BOUNDS` (`north,south,west,east`; default derived from center/radius)
- `AWX_BASE_URL` (default `https://aviationweather.gov`)
- `AWX_METAR_PATH` (default `/api/data/metar`)
- `AWX_CACHE_TTL_MS` (default `60000`)
- `WX_REFLECTIVITY_SAMPLES_URL` (default NOAA MRMS reflectivity `getSamples` endpoint)
- `WX_REFLECTIVITY_MAX_CELLS` (default `40000`, set to `0` or `null` to disable)
- `WX_REFLECTIVITY_REQUEST_CHUNK_SIZE` (default `1000`)
