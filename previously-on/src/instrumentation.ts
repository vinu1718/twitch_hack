export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startMemory } = await import("./lib/memory");
  try {
    await startMemory();
  } catch {
    console.error("Stream memory startup failed");
  }

  const { startEventSub } = await import("./lib/twitch/eventsub");
  try {
    await startEventSub();
  } catch {
    console.error("EventSub startup failed");
  }
}
