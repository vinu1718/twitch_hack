import { healthSnapshot } from "@/lib/health";
import { readAuth } from "@/lib/twitch/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(): Promise<Response> {
  const auth = await readAuth().catch(() => null);
  return Response.json(healthSnapshot(auth?.expires_at ?? null), { headers: { "Cache-Control": "no-store" } });
}
