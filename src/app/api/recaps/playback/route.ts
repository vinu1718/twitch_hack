import { finishRecap } from "@/lib/recap";
export const runtime = "nodejs";
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { raidId?: unknown };
    if (typeof body.raidId !== "string" || !/^[a-f0-9-]{36}$/.test(body.raidId)) return Response.json({ error: "Invalid raid" }, { status: 400 });
    finishRecap(body.raidId);
    return new Response(null, { status: 204 });
  } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
}
