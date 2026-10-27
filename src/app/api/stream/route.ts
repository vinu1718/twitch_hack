import { bus } from "@/lib/bus";
import { getSummary } from "@/lib/memory";
import { getLore } from "@/lib/lore";
import { getRecapStatus } from "@/lib/recap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

export async function GET(request: Request): Promise<Response> {
  const summary = await getSummary();
  const lore = await getLore();
  let cleanup: () => void = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (name: string, data: unknown) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`)); }
        catch { cleanup(); }
      };
      const off = [
        bus.on("summary", (event) => send("summary", event)),
        bus.on("raid", (event) => send("raid", event)),
        bus.on("recap", (event) => send("recap", event)),
        bus.on("recap-welcome", (event) => send("recap-welcome", event)),
        bus.on("recap-status", (event) => send("recap-status", event)),
        bus.on("briefing", (event) => send("briefing", event)),
        bus.on("lore", (event) => send("lore", event)),
      ];
      send("summary", summary);
      send("lore", lore);
      send("recap-status", getRecapStatus());
      const heartbeat = setInterval(() => {
        if (!closed) {
          try { controller.enqueue(encoder.encode(": keepalive\n\n")); } catch { cleanup(); }
        }
      }, 15_000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        off.forEach((remove) => remove());
        request.signal.removeEventListener("abort", cleanup);
        try { controller.close(); } catch { /* stream already closed */ }
      };
      request.signal.addEventListener("abort", cleanup, { once: true });
      if (request.signal.aborted) cleanup();
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
