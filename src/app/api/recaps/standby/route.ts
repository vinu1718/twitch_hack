import { getStandbyRecap } from "@/lib/recap";
import { getSummary } from "@/lib/memory";
import { textRecap } from "@/lib/recap-fallback";
import { readAuth } from "@/lib/twitch/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  try {
    const standby = getStandbyRecap();
    if (standby) return Response.json(standby, { headers });
    const [summary, auth] = await Promise.all([
      getSummary(),
      readAuth().catch(() => null),
    ]);
    return Response.json(textRecap(summary, auth?.login ?? "this channel"), {
      headers,
    });
  } catch {
    return Response.json(
      { error: "Could not load the overlay preview. Try again." },
      { status: 503, headers },
    );
  }
}
