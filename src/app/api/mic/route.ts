import { microphoneLease } from "@/lib/health";
export const runtime = "nodejs";
export async function POST(request: Request): Promise<Response> {
  try {
    const { id, recording } = await request.json() as { id?: unknown; recording?: unknown };
    if (typeof id !== "string" || !/^[\w-]{1,80}$/.test(id) || typeof recording !== "boolean") {
      return Response.json({ error: "Invalid microphone state" }, { status: 400 });
    }
    microphoneLease(id, recording);
    return new Response(null, { status: 204 });
  } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
}
