// Per-foreground ad session ID for anti-fatigue tracking.
//
// Backend uses this with the user_id to remember which feed_native
// campaigns the user has already seen in this session and avoid
// repeating them until the eligible pool is exhausted.
//
// Lifecycle: a fresh UUID is generated on module load (first page
// open / reload) and again every time the page transitions from
// hidden → visible (tab switch back, app foreground on mobile web).
// Backgrounding ends the session implicitly — when the user returns,
// a new ID is minted and the seen-set starts empty.

let sessionId: string = crypto.randomUUID();

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      sessionId = crypto.randomUUID();
    }
  });
}

export function getAdSessionId(): string {
  return sessionId;
}
