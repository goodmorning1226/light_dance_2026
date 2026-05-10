"use client";

import { CloudAuthError, getSupabaseClient } from "./client";

export interface AuthSession {
  userId: string;
  displayName: string;
}

const DISPLAY_NAME_KEY = "ld26:cloud.displayName";

function readSavedDisplayName(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(DISPLAY_NAME_KEY);
  } catch {
    return null;
  }
}

function writeSavedDisplayName(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISPLAY_NAME_KEY, name);
  } catch {
    // localStorage may be disabled (private mode etc.) — non-fatal.
  }
}

// Returns the current Supabase session (anon or otherwise) without forcing
// a sign-in. Used on app boot to decide whether the user is already in a
// cloud session.
export async function getCurrentAuthSession(): Promise<AuthSession | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) return null;
  const displayName =
    (data.session.user.user_metadata?.["display_name"] as string | undefined) ??
    readSavedDisplayName() ??
    "Guest";
  return { userId: data.session.user.id, displayName };
}

// Signs the user in anonymously, attaching `display_name` to user_metadata
// so the auth.users → profiles trigger can pick it up. If anon auth is
// disabled in the project, the error message guides the operator to either
// enable it or fall back to magic-link auth.
export async function signInAnonymously(displayName: string): Promise<AuthSession> {
  const trimmed = displayName.trim();
  if (!trimmed) {
    throw new CloudAuthError("displayName is required");
  }
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInAnonymously({
    options: { data: { display_name: trimmed } },
  });
  if (error || !data.user) {
    const reason = error?.message ?? "no user returned";
    throw new CloudAuthError(
      `Anonymous sign-in failed: ${reason}. ` +
        "Open the Supabase dashboard → Authentication → Providers and enable " +
        "'Anonymous sign-ins'. If your deployment cannot allow anonymous users, " +
        "fall back to magic-link auth (Sign in with email link) instead.",
    );
  }
  writeSavedDisplayName(trimmed);
  return { userId: data.user.id, displayName: trimmed };
}

// Reuses the existing session if one exists, otherwise signs in anonymously
// with the supplied displayName. The most common entry point for the
// Create / Join flows.
export async function ensureSignedIn(displayName: string): Promise<AuthSession> {
  const existing = await getCurrentAuthSession();
  if (existing) {
    if (displayName.trim() && existing.displayName !== displayName.trim()) {
      writeSavedDisplayName(displayName.trim());
      return { ...existing, displayName: displayName.trim() };
    }
    return existing;
  }
  return signInAnonymously(displayName);
}

export async function signOut(): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase.auth.signOut();
}

export function getStoredDisplayName(): string {
  return readSavedDisplayName() ?? "";
}
