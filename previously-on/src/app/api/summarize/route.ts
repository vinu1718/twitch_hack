import { summarizeNow } from "@/lib/memory";
import { prepareStandby } from "@/lib/recap";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  try {
    const result = await summarizeNow();
    prepareStandby(result.summary);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Manual stream summary failed");
    return Response.json({ error: "Could not summarize stream" }, { status: 502 });
  }
}
