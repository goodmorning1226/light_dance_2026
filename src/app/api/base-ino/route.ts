import { promises as fs } from "node:fs";
import * as path from "node:path";

// Returns the project's light_dance_2026.ino as plain text. The Arrangement
// page's Export Panel fetches this on mount so the user doesn't have to paste
// the base template by hand. If the file isn't present (e.g., the Web build
// is deployed without the .ino), the route returns 404 and the UI falls back
// to a manual upload.

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const inoPath = path.join(process.cwd(), "light_dance_2026.ino");
  try {
    const content = await fs.readFile(inoPath, "utf8");
    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ error: `light_dance_2026.ino not readable: ${reason}` }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
