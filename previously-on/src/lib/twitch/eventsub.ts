import { bus, type ChatEvent, type RaidEvent } from "@/lib/bus";
import { getAccessToken, helix, readAuth } from "./auth";
import { sendChat } from "./chat";

type Session = {
  id?: string;
  keepalive_timeout_seconds?: number | null;
  reconnect_url?: string | null;
};

type EventSubMessage = {
  metadata?: {
    message_id?: string;
    message_type?: string;
    subscription_type?: string;
  };
  payload?: {
    session?: Session;
    subscription?: { type?: string; status?: string };
    event?: Record<string, unknown>;
  };
};

type SocketKind = "fresh" | "replacement";
const KEEPALIVE_GRACE_MS = 5_000;
const HANDSHAKE_TIMEOUT_MS = 15_000;
const MAX_RETRY_MS = 30_000;
const DEDUPE_TTL_MS = 10 * 60_000;
const DEDUPE_LIMIT = 2_000;

class EventSubClient {
  private userId?: string;
  private active?: WebSocket;
  private replacement?: WebSocket;
  private connecting?: Promise<void>;
  private reconnectUrl?: string;
  private reconnectDeadline = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private watchdogTimer?: ReturnType<typeof setTimeout>;
  private readonly handshakeTimers = new WeakMap<WebSocket, ReturnType<typeof setTimeout>>();
  private lastMessageAt = 0;
  private keepaliveMs = 10_000;
  private retryMs = 1_000;
  private readonly seen = new Map<string, number>();

  constructor() {
    bus.on("chat", (event) => {
      if (event.text.trim().toLowerCase() !== "!ping") return;
      void sendChat("pong").catch(() => console.error("Twitch !ping reply failed"));
    });
    bus.on("raid", (event) => {
      console.info(`Raid from ${event.fromBroadcasterLogin} with ${event.viewers} viewers`);
    });
  }

  async start(userId: string): Promise<void> {
    if (this.userId && this.userId !== userId) this.reset();
    this.userId = userId;
    if (this.active || this.replacement || this.retryTimer) return;
    await this.ensureConnected();
  }

  private async ensureConnected(): Promise<void> {
    if (this.active || this.replacement) return;
    if (this.connecting) return this.connecting;
    const pending = this.connectFresh();
    this.connecting = pending;
    try {
      await pending;
    } finally {
      if (this.connecting === pending) this.connecting = undefined;
    }
  }

  private reset(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    this.retryTimer = undefined;
    this.watchdogTimer = undefined;
    const old = this.active;
    const replacement = this.replacement;
    this.active = undefined;
    this.replacement = undefined;
    this.reconnectUrl = undefined;
    old?.close();
    replacement?.close();
  }

  private async connectFresh(): Promise<void> {
    try {
      // Refresh before opening the socket so subscriptions can start immediately on welcome.
      await getAccessToken();
      if (!this.userId || this.active || this.replacement) return;
      this.openSocket(process.env.EVENTSUB_WS_URL || "wss://eventsub.wss.twitch.tv/ws", "fresh");
    } catch {
      console.error("EventSub connection setup failed");
      this.scheduleFreshRetry();
    }
  }

  private openSocket(url: string, kind: SocketKind): void {
    const socket = new WebSocket(url);
    if (kind === "fresh") this.active = socket;
    else this.replacement = socket;

    const handshake = setTimeout(() => {
      console.warn("EventSub welcome timed out");
      socket.close();
    }, HANDSHAKE_TIMEOUT_MS);
    this.handshakeTimers.set(socket, handshake);

    socket.addEventListener("message", (message) => {
      void this.handleMessage(socket, kind, message.data).catch(() => {
        console.error("EventSub message handling failed");
      });
    });
    socket.addEventListener("close", () => this.handleClose(socket, kind));
    socket.addEventListener("error", () => console.error("EventSub WebSocket error"));
  }

  private clearHandshake(socket: WebSocket): void {
    const timer = this.handshakeTimers.get(socket);
    if (timer) clearTimeout(timer);
    this.handshakeTimers.delete(socket);
  }

  private async handleMessage(socket: WebSocket, kind: SocketKind, raw: unknown): Promise<void> {
    if (typeof raw !== "string") return;
    let message: EventSubMessage;
    try {
      message = JSON.parse(raw) as EventSubMessage;
    } catch {
      console.warn("EventSub sent invalid JSON");
      return;
    }
    const type = message.metadata?.message_type;
    if (!type) return;

    if (socket === this.active) {
      this.lastMessageAt = Date.now();
      this.armWatchdog(socket);
    }

    if (type === "session_welcome") {
      this.clearHandshake(socket);
      const session = message.payload?.session;
      if (!session?.id) {
        socket.close();
        throw new Error("EventSub welcome omitted its session ID");
      }
      this.keepaliveMs = Math.max(10, session.keepalive_timeout_seconds ?? 10) * 1000;
      this.lastMessageAt = Date.now();

      if (kind === "replacement" && socket === this.replacement) {
        const old = this.active;
        this.active = socket;
        this.replacement = undefined;
        this.reconnectUrl = undefined;
        this.retryMs = 1_000;
        this.armWatchdog(socket);
        old?.close();
        console.info("EventSub reconnected; subscriptions carried over");
      } else if (kind === "fresh" && socket === this.active) {
        this.armWatchdog(socket);
        try {
          await this.subscribe(session.id);
          this.retryMs = 1_000;
        } catch {
          console.error("EventSub subscription failed");
          socket.close();
        }
      }
      return;
    }

    if (type === "session_keepalive") return;
    if (type === "session_reconnect" && socket === this.active) {
      const url = message.payload?.session?.reconnect_url;
      if (!url || this.replacement) return;
      this.reconnectUrl = url;
      this.reconnectDeadline = Date.now() + 25_000;
      try {
        this.openSocket(url, "replacement");
      } catch {
        console.error("EventSub reconnect failed");
        this.reset();
        this.scheduleFreshRetry();
      }
      return;
    }
    if (type === "revocation") {
      const subscription = message.payload?.subscription;
      console.warn(`EventSub ${subscription?.type ?? "subscription"} revoked: ${subscription?.status ?? "unknown"}`);
      return;
    }
    if (type === "notification") this.handleNotification(message);
  }

  private async subscribe(sessionId: string): Promise<void> {
    const userId = this.userId;
    if (!userId) throw new Error("Twitch user ID is missing");
    const endpoint =
      process.env.EVENTSUB_SUBSCRIPTIONS_URL ||
      "https://api.twitch.tv/helix/eventsub/subscriptions";
    const subscriptions = [
      {
        type: "channel.chat.message",
        condition: { broadcaster_user_id: userId, user_id: userId },
      },
      { type: "channel.raid", condition: { to_broadcaster_user_id: userId } },
    ];

    const results = await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          const response = await helix(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...subscription,
              version: "1",
              transport: { method: "websocket", session_id: sessionId },
            }),
            signal: AbortSignal.timeout(8_000),
          });
          if (!response.ok) {
            console.warn(`EventSub ${subscription.type} rejected (HTTP ${response.status})`);
            return false;
          }
          return true;
        } catch {
          console.error(`EventSub ${subscription.type} request failed`);
          return false;
        }
      }),
    );
    if (!results.some(Boolean)) throw new Error("No EventSub subscriptions were accepted");
    console.info(
      `EventSub subscriptions active: ${subscriptions
        .filter((_, index) => results[index])
        .map((subscription) => subscription.type)
        .join(", ")}`,
    );
  }

  private isDuplicate(id: string): boolean {
    const now = Date.now();
    const previous = this.seen.get(id);
    if (previous && now - previous < DEDUPE_TTL_MS) return true;
    this.seen.set(id, now);
    if (this.seen.size > DEDUPE_LIMIT) {
      for (const [key, timestamp] of this.seen) {
        if (now - timestamp >= DEDUPE_TTL_MS || this.seen.size > DEDUPE_LIMIT) {
          this.seen.delete(key);
        }
      }
    }
    return false;
  }

  private handleNotification(message: EventSubMessage): void {
    const id = message.metadata?.message_id;
    const event = message.payload?.event;
    if (!id || !event || this.isDuplicate(id)) return;

    const subscriptionType =
      message.payload?.subscription?.type ?? message.metadata?.subscription_type;
    if (subscriptionType === "channel.chat.message") {
      const chat: ChatEvent = {
        broadcasterUserId: String(event.broadcaster_user_id ?? ""),
        chatterUserId: String(event.chatter_user_id ?? ""),
        chatterLogin: String(event.chatter_user_login ?? ""),
        messageId: String(event.message_id ?? ""),
        text: String((event.message as { text?: unknown } | undefined)?.text ?? ""),
      };
      if (chat.broadcasterUserId && chat.chatterUserId && chat.text) bus.emit("chat", chat);
    } else if (subscriptionType === "channel.raid") {
      const raid: RaidEvent = {
        fromBroadcasterUserId: String(event.from_broadcaster_user_id ?? ""),
        fromBroadcasterLogin: String(event.from_broadcaster_user_login ?? ""),
        toBroadcasterUserId: String(event.to_broadcaster_user_id ?? ""),
        viewers: Number(event.viewers),
      };
      if (raid.fromBroadcasterUserId && raid.toBroadcasterUserId && Number.isFinite(raid.viewers)) {
        bus.emit("raid", raid);
      }
    }
  }

  private armWatchdog(socket: WebSocket): void {
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    if (socket !== this.active) return;
    this.watchdogTimer = setTimeout(() => {
      if (socket !== this.active) return;
      if (Date.now() - this.lastMessageAt >= this.keepaliveMs + KEEPALIVE_GRACE_MS) {
        console.warn("EventSub keepalive timed out; reconnecting");
        socket.close();
      } else {
        this.armWatchdog(socket);
      }
    }, this.keepaliveMs + KEEPALIVE_GRACE_MS);
  }

  private handleClose(socket: WebSocket, kind: SocketKind): void {
    this.clearHandshake(socket);
    if (kind === "replacement" && socket === this.replacement) {
      this.replacement = undefined;
      if (this.reconnectUrl && Date.now() < this.reconnectDeadline) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = undefined;
          if (!this.replacement && this.reconnectUrl) {
            if (Date.now() >= this.reconnectDeadline) {
              this.reset();
              this.scheduleFreshRetry();
              return;
            }
            try {
              this.openSocket(this.reconnectUrl, "replacement");
            } catch {
              console.error("EventSub reconnect failed");
              this.reset();
              this.scheduleFreshRetry();
            }
          }
        }, 1_000);
      } else {
        this.reset();
        this.scheduleFreshRetry();
      }
    } else if (kind === "fresh" && socket === this.active) {
      this.active = undefined;
      if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
      this.watchdogTimer = undefined;
      if (!this.replacement && !this.retryTimer) this.scheduleFreshRetry();
    } else if (kind === "replacement" && socket === this.active) {
      this.active = undefined;
      if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
      this.watchdogTimer = undefined;
      this.scheduleFreshRetry();
    }
  }

  private scheduleFreshRetry(): void {
    if (this.retryTimer || this.active || this.replacement || !this.userId) return;
    this.reconnectUrl = undefined;
    const delay = this.retryMs;
    this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.ensureConnected();
    }, delay);
  }
}

type EventSubGlobal = typeof globalThis & { __previouslyOnEventSub?: EventSubClient };
const eventSubGlobal = globalThis as EventSubGlobal;

export async function startEventSub(): Promise<boolean> {
  const auth = await readAuth();
  if (!auth) return false;
  const client = (eventSubGlobal.__previouslyOnEventSub ??= new EventSubClient());
  await client.start(auth.user_id);
  return true;
}
