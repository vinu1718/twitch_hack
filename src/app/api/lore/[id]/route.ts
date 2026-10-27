import { deleteLore, getLore, loreKey, updateLore, validClipId } from "@/lib/lore";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid lore entry" }, { status: 400 });
  const fields = body as Record<string, unknown>;
  const term = typeof fields.term === "string" ? fields.term.trim() : "";
  const explanation = typeof fields.explanation === "string" ? fields.explanation.trim() : "";
  const firstSeen = typeof fields.firstSeen === "string" ? fields.firstSeen.trim() : "";
  const clipId = typeof fields.clipId === "string" ? fields.clipId.trim() : "";
  if (!loreKey(term) || term.length > 100 || !explanation || explanation.length > 1_000 ||
      !Number.isFinite(Date.parse(firstSeen)) || !validClipId(clipId)) {
    return Response.json({ error: "Check the term, explanation, date, and clip ID" }, { status: 400 });
  }
  try {
    const { id } = await context.params;
    await updateLore(id, { term, explanation, firstSeen: new Date(firstSeen).toISOString(), clipId });
    return Response.json({ entries: await getLore() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Lore entry not found") return Response.json({ error: message }, { status: 404 });
    if (message === "A lore entry with that term already exists") {
      return Response.json({ error: message }, { status: 409 });
    }
    console.error("Updating lore failed");
    return Response.json({ error: "Could not update lore" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const { id } = await context.params;
    await deleteLore(id);
    return Response.json({ entries: await getLore() });
  } catch (error) {
    if (error instanceof Error && error.message === "Lore entry not found") {
      return Response.json({ error: error.message }, { status: 404 });
    }
    console.error("Deleting lore failed");
    return Response.json({ error: "Could not delete lore" }, { status: 500 });
  }
}
