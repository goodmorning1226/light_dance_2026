"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";

// What each connected editor publishes about themselves. Kept small —
// presence payloads are gossiped to every other client on every change, so
// we want the smallest stable shape we can get away with.
export interface PresencePayload {
  userId: string;
  displayName: string;
  // Where in the app the user currently is — purely informational, used by
  // the members panel to show "(editing Dance A)" tags. All optional so the
  // payload stays valid even on the very first track() call. The explicit
  // `| undefined` is required so callers compiled with
  // exactOptionalPropertyTypes can pass `currentDanceId: undefined` to
  // clear a previous value.
  currentDanceId?: string | undefined;
  currentEventId?: string | undefined;
  currentView?: string | undefined;       // "editor" | "arrangement" | "library" | "export"
  dancerTab?: number | undefined;
  // Set client-side; useful for "joined N seconds ago" UI in future.
  joinedAt: number;
}

// Supabase presence groups payloads by their string `key`. We use userId so
// the same user opening the editor in two tabs collapses to one entry.
export interface PresenceState {
  // userId → most recent payload from that user.
  [userId: string]: PresencePayload;
}

export interface PresenceSubscriptionOptions {
  programId: string;
  initial: PresencePayload;
  onSync: (state: PresenceState) => void;
}

export interface PresenceHandle {
  // Replace the local presence with a new payload. Triggers a presence sync
  // for every other connected client.
  update: (next: Partial<PresencePayload>) => Promise<void>;
  unsubscribe: () => Promise<void>;
}

// One presence channel per program. The realtime channel from realtime.ts
// is a different channel deliberately — mixing presence with the
// postgres_changes channel makes it harder to reason about reconnection
// state, and there's no per-channel cost worth optimising here.
export function joinProgramPresence(
  options: PresenceSubscriptionOptions,
): PresenceHandle {
  const { programId, initial, onSync } = options;
  const supabase = getSupabaseClient();
  const channel: RealtimeChannel = supabase.channel(
    `presence:${programId}`,
    { config: { presence: { key: initial.userId } } },
  );

  let current: PresencePayload = { ...initial };

  channel.on("presence", { event: "sync" }, () => {
    const raw = channel.presenceState() as Record<string, PresencePayload[]>;
    const flat: PresenceState = {};
    for (const [userId, entries] of Object.entries(raw)) {
      // entries is an array because the same key can appear from multiple
      // sockets; we take the most recent (last in the array).
      const latest = entries[entries.length - 1];
      if (latest) flat[userId] = latest;
    }
    onSync(flat);
  });

  channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await channel.track(current);
    }
  });

  return {
    update: async (next) => {
      current = { ...current, ...next };
      // track() will be a no-op (and warn) if called before SUBSCRIBED, so
      // we wrap it in try/catch and silently swallow — the next sync after
      // SUBSCRIBED will pick up the latest `current`.
      try {
        await channel.track(current);
      } catch {
        // ignore — pre-subscription update; will be sent at SUBSCRIBED time
      }
    },
    unsubscribe: async () => {
      try {
        await channel.untrack();
      } catch {
        // ignore — already gone
      }
      await supabase.removeChannel(channel);
    },
  };
}
