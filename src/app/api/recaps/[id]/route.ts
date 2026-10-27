import { readRecapAudio } from "@/lib/recap-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const bytes = await readRecapAudio(id);
  if (!bytes) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes", "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  const range = request.headers.get("range");
  let start = 0, end = bytes.length - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
    if (match[1]) { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    else start = Math.max(0, bytes.length - Number(match[2]));
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= bytes.length) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${bytes.length}`);
  }
  headers.set("Content-Length", String(end - start + 1));
  return new Response(new Uint8Array(bytes.subarray(start, end + 1)), { status: range ? 206 : 200, headers });
}
