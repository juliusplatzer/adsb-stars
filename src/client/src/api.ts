import type { AircraftFeedResponse, QnhResponse, WxReflectivityResponse } from "@vstars/shared";

export interface FetchAircraftFeedOptions {
  baseUrl?: string;
  signal?: AbortSignal;
}

export async function fetchAircraftFeed(
  options: FetchAircraftFeedOptions = {}
): Promise<AircraftFeedResponse> {
  const url = new URL("/api/aircraft", options.baseUrl ?? window.location.origin);
  const response = await fetch(url, {
    signal: options.signal,
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch aircraft feed: ${response.status}`);
  }

  return (await response.json()) as AircraftFeedResponse;
}

export interface FetchQnhOptions {
  baseUrl?: string;
  signal?: AbortSignal;
}

export async function fetchQnhByIcao(
  icaoCodes: string[],
  options: FetchQnhOptions = {}
): Promise<QnhResponse> {
  const uniqueCodes = [...new Set(icaoCodes.map((code) => code.trim().toUpperCase()).filter(Boolean))];
  if (uniqueCodes.length === 0) {
    return { requestedIcaos: [], results: [] };
  }

  const url = new URL("/api/qnh", options.baseUrl ?? window.location.origin);
  for (const icao of uniqueCodes) {
    url.searchParams.append("icao", icao);
  }

  const response = await fetch(url, {
    signal: options.signal,
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch QNH: ${response.status}`);
  }

  return (await response.json()) as QnhResponse;
}

export interface FetchWxReflectivityOptions {
  baseUrl?: string;
  signal?: AbortSignal;
  radiusNm?: number;
}

export async function fetchWxReflectivity(
  center: { lat: number; lon: number },
  options: FetchWxReflectivityOptions = {}
): Promise<WxReflectivityResponse> {
  const url = new URL("/api/wx/radar", options.baseUrl ?? window.location.origin);
  url.searchParams.set("lat", String(center.lat));
  url.searchParams.set("lon", String(center.lon));
  if (options.radiusNm !== undefined) {
    url.searchParams.set("radiusNm", String(options.radiusNm));
  }

  const response = await fetch(url, {
    signal: options.signal,
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch radar data: ${response.status}`);
  }

  return (await response.json()) as WxReflectivityResponse;
}
