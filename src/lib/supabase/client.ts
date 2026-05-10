"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Singleton browser client. Returns the SAME instance for every call so
// auth state, realtime sockets, and request queues stay consistent.
let cachedClient: SupabaseClient | null = null;

export function isCloudConfigured(): boolean {
  return Boolean(
    process.env["NEXT_PUBLIC_SUPABASE_URL"] &&
      process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  );
}

export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  if (!url || !key) {
    throw new CloudNotConfiguredError(
      "Cloud Mode is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (see .env.local.example).",
    );
  }
  cachedClient = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Anon sessions live in localStorage with this key namespace so we
      // don't collide with anything else the page might store.
      storageKey: "ld26:supabase.auth",
    },
  });
  return cachedClient;
}

export class CloudNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudNotConfiguredError";
  }
}

export class CloudAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudAuthError";
  }
}
