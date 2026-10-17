"use client";
import { createApiClient } from "@ds/api-client";

// Same-origin calls through the Next.js /api rewrite (ADR-015). A 401 sends the user to login and
// remembers where they were (06 section 2).
export const api = createApiClient({
  onUnauthorized: () => {
    if (typeof window === "undefined" || window.location.pathname === "/login") return;
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/login?next=${next}`);
  },
});
