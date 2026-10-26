import { EventEmitter } from "node:events";
import type { StreamSummary } from "@/lib/memory";

export type ChatEvent = {
  broadcasterUserId: string;
  chatterUserId: string;
  chatterLogin: string;
  messageId: string;
  text: string;
};

export type RaidEvent = {
  fromBroadcasterUserId: string;
  fromBroadcasterLogin: string;
  toBroadcasterUserId: string;
  viewers: number;
};

type Events = {
  chat: ChatEvent;
  raid: RaidEvent;
  summary: StreamSummary;
  recap: { text: string };
  briefing: { text: string };
};

class TypedBus {
  private readonly emitter = new EventEmitter();

  on<K extends keyof Events>(name: K, listener: (event: Events[K]) => void): () => void {
    this.emitter.on(name, listener);
    return () => this.emitter.off(name, listener);
  }

  emit<K extends keyof Events>(name: K, event: Events[K]): void {
    this.emitter.emit(name, event);
  }
}

type BusGlobal = typeof globalThis & { __previouslyOnBus?: TypedBus };
const busGlobal = globalThis as BusGlobal;
export const bus = (busGlobal.__previouslyOnBus ??= new TypedBus());
