export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN = process.env.TAIS_INGEST_TOKEN ?? "";
const encoder = new TextEncoder();

// Persist across hot reloads in dev
const g = globalThis as any;
const clients: Map<number, ReadableStreamDefaultController<Uint8Array>> =
  g.__flightRulesClients ?? (g.__flightRulesClients = new Map<number, ReadableStreamDefaultController<Uint8Array>>());
g.__flightRulesNextId ??= 1;

function broadcast(jsonText: string) {
  const msg = encoder.encode(`event: flightRules\ndata: ${jsonText}\n\n`);

  for (const [id, controller] of clients) {
    try {
      controller.enqueue(msg);
    } catch {
      clients.delete(id);
    }
  }
}

export async function POST(req: Request) {
  const token = req.headers.get("x-tais-token") ?? "";
  if (!TOKEN || token !== TOKEN) {
    return new Response("unauthorized", { status: 401 });
  }

  // Read raw body and validate it is JSON (prevents garbage)
  const bodyText = await req.text();
  try {
    JSON.parse(bodyText);
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  broadcast(bodyText);
  return new Response(null, { status: 204 });
}

export async function GET() {
  let id = 0;
  let ping: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      id = g.__flightRulesNextId++;
      clients.set(id, controller);

      // SSE headers/handshake
      controller.enqueue(encoder.encode("retry: 1000\n"));
      controller.enqueue(encoder.encode(": connected\n\n"));

      // Keep-alive ping (some proxies/timeouts)
      ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(":\n\n"));
        } catch {
          clients.delete(id);
          if (ping) clearInterval(ping);
        }
      }, 15000);
    },
    cancel() {
      clients.delete(id);
      if (ping) clearInterval(ping);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
