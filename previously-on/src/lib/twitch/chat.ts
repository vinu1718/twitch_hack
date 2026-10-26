import { readAuth, helix } from "./auth";

export async function sendChat(message: string): Promise<void> {
  const text = Array.from(message.trim()).slice(0, 500).join("").trimEnd();
  if (!text) throw new Error("Cannot send an empty chat message");

  const auth = await readAuth();
  if (!auth) throw new Error("Twitch is not connected");
  const response = await helix("chat/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      broadcaster_id: auth.user_id,
      sender_id: auth.user_id,
      message: text,
    }),
  });
  if (!response.ok) throw new Error(`Twitch chat send failed (HTTP ${response.status})`);

  const body: unknown = await response.json();
  const result = (body as { data?: Array<{ is_sent?: boolean; drop_reason?: { code?: string } }> })
    ?.data?.[0];
  if (!result?.is_sent) {
    throw new Error(`Twitch did not send the message (${result?.drop_reason?.code ?? "unknown"})`);
  }
}
