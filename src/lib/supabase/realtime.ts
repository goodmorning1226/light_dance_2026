"use client";

import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";

// Tables we mirror via postgres_changes for the active program.
export type RealtimeTable =
  | "dances"
  | "program_items"
  | "custom_animations"
  | "export_settings"
  | "program_members";

export type RealtimeEventType = "INSERT" | "UPDATE" | "DELETE";

export interface RealtimeRowEvent {
  table: RealtimeTable;
  type: RealtimeEventType;
  // The new row (INSERT/UPDATE) or the old row (DELETE). Cast at the call
  // site to the specific row interface — this helper is intentionally
  // table-agnostic so it can be reused by every consumer.
  row: Record<string, unknown>;
  // The previous row state when type is UPDATE; null otherwise. Requires
  // REPLICA IDENTITY FULL on the table (see schema.sql).
  oldRow: Record<string, unknown> | null;
}

export interface RealtimeSubscriptionStatus {
  // Mirrors the underlying channel.subscribe() callback states. UI uses this
  // to flip the badge between connecting/connected/error.
  state:
    | "subscribing"
    | "subscribed"
    | "channel_error"
    | "timed_out"
    | "closed";
  reason?: string;
}

export interface RealtimeSubscriptionOptions {
  programId: string;
  onEvent: (event: RealtimeRowEvent) => void;
  onStatus?: (status: RealtimeSubscriptionStatus) => void;
}

export interface RealtimeSubscription {
  unsubscribe: () => Promise<void>;
}

// One channel per program covers ALL tables — we filter by program_id on
// every postgres_changes binding so the user only receives events for rows
// in the program they're currently in.
//
// Returns an unsubscribe handle the caller should invoke on cleanup.
export function subscribeToProgramRealtime(
  options: RealtimeSubscriptionOptions,
): RealtimeSubscription {
  const { programId, onEvent, onStatus } = options;
  const supabase = getSupabaseClient();
  const channel = supabase.channel(`program:${programId}`, {
    config: { broadcast: { self: false }, presence: { key: "" } },
  });

  const tables: RealtimeTable[] = [
    "dances",
    "program_items",
    "custom_animations",
    "export_settings",
    "program_members",
  ];

  for (const table of tables) {
    channel.on(
      "postgres_changes" as never,
      {
        event: "*",
        schema: "public",
        table,
        filter: `program_id=eq.${programId}`,
      } as never,
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        const type = payload.eventType as RealtimeEventType;
        // For DELETE, payload.new is empty {} — use payload.old (which is
        // populated because we set REPLICA IDENTITY FULL).
        const row = type === "DELETE"
          ? (payload.old as Record<string, unknown>)
          : (payload.new as Record<string, unknown>);
        const oldRow = type === "UPDATE"
          ? (payload.old as Record<string, unknown>)
          : null;
        if (!row) return;
        onEvent({ table, type, row, oldRow });
      },
    );
  }

  channel.subscribe((status, err) => {
    if (!onStatus) return;
    if (status === "SUBSCRIBED") {
      onStatus({ state: "subscribed" });
    } else if (status === "CHANNEL_ERROR") {
      onStatus({ state: "channel_error", reason: err?.message ?? "channel error" });
    } else if (status === "TIMED_OUT") {
      onStatus({ state: "timed_out", reason: "timed out" });
    } else if (status === "CLOSED") {
      onStatus({ state: "closed" });
    } else {
      onStatus({ state: "subscribing" });
    }
  });

  return {
    unsubscribe: async () => {
      await supabase.removeChannel(channel);
    },
  };
}

// Re-export RealtimeChannel so consumers in our codebase don't need to
// import directly from @supabase/supabase-js (keeps the surface area small).
export type { RealtimeChannel };
