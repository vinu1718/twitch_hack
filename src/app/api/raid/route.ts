import { bus } from "@/lib/bus";
import { startRecaps } from "@/lib/recap";
import { helix, readAuth } from "@/lib/twitch/auth";

export const runtime = "nodejs";
let lastSimulation = 0;
export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await readAuth();
    if (!auth) return Response.json({ error: "Connect Twitch first" }, { status: 401 });
    const { login } = await request.json() as { login?: unknown };
    if (typeof login !== "string" || !/^[a-zA-Z0-9_]{1,25}$/.test(login.trim())) {
      return Response.json({ error: "Enter a real Twitch channel login" }, { status: 400 });
    }
    if (Date.now() - lastSimulation < 5_000) return Response.json({ error: "Wait five seconds between simulations" }, { status: 429 });
    lastSimulation = Date.now();
    const response = await helix(`users?login=${encodeURIComponent(login.trim())}`, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error("Twitch lookup failed");
    const result = await response.json() as { data?: Array<{ id: string; login: string }> };
    const user = result.data?.[0];
    if (!user) return Response.json({ error: "Twitch channel not found" }, { status: 404 });
    startRecaps();
    bus.emit("raid", { fromBroadcasterUserId: user.id, fromBroadcasterLogin: user.login,
      toBroadcasterUserId: auth.user_id, viewers: 42 });
    return Response.json({ ok: true });
  } catch { return Response.json({ error: "Could not simulate raid" }, { status: 502 }); }
}
