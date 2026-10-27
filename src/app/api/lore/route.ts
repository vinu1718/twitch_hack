import { getLore } from "@/lib/lore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return Response.json({ entries: await getLore() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Reading lore failed");
    return Response.json({ error: "Could not load lore" }, { status: 500 });
  }
}
