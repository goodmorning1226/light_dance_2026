"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";

// Broadcast is for ephemeral, non-persistent messages between editors —
// "Sigma is dragging this event right now", live cursors, ping/typing
// indicators. Anything you'd lose if the page reloaded belongs here, not
// in postgres.
//
// We intentionally keep the schema loose at this layer: each consumer (the
// editing-indicator hook, future cursor support, etc.) defines its own
// payload shape and registers a typed listener. The shared channel just
// fans the events out so we don't open one socket per feature.

export type BroadcastEventName =
  | "editing"           // user actively touching an event/dance section
  | "cursor"            // mouse position (reserved for future)
  | "ping";             // generic keep-alive / ack

export interface BroadcastMessage<T = unknown> {
  event: BroadcastEventName;
  payload: T;
}

export interface BroadcastSubscriptionOptions {
  programId: string;
  onMessage: (message: BroadcastMessage) => void;
}

export interface BroadcastHandle {
  send: <T>(event: BroadcastEventName, payload: T) => Promise<void>;
  unsubscribe: () => Promise<void>;
}

export function joinProgramBroadcast(
  options: BroadcastSubscriptionOptions,
): BroadcastHandle {
  const { programId, onMessage } = options;
  const supabase = getSupabaseClient();
  const channel: RealtimeChannel = supabase.channel(
    `broadcast:${programId}`,
    // self:false so a user doesn't echo their own broadcasts back as if
    // someone else sent them. Acks aren't needed — broadcast is best-effort.
    { config: { broadcast: { self: false, ack: false } } },
  );

  const events: BroadcastEventName[] = ["editing", "cursor", "ping"];
  for (const ev of events) {
    channel.on("broadcast", { event: ev }, (raw: { payload: unknown }) => {
      onMessage({ event: ev, payload: raw.payload });
    });
  }

  channel.subscribe();

  return {
    send: async (event, payload) => {
      // channel.send returns a promise that resolves to "ok" / "timed out"
      // / "rate limited"; we don't care which because broadcast is fire-
      // and-forget. Catch + swallow so callers never see an unhandled rej.
      try {
        await channel.send({ type: "broadcast", event, payload });
      } catch {
        // ignore — best-effort
      }
    },
    unsubscribe: async () => {
      await supabase.removeChannel(channel);
    },
  };
}
