export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startMemory, getSummary } = await import("./lib/memory");
  try {
    await startMemory();
    const { mergeJokes } = await import("./lib/lore");
    await mergeJokes((await getSummary()).jokes);
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
