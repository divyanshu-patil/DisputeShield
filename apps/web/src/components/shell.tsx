"use client";
import type { Health, QueueRow } from "@ds/api-client";
import { ModeBanner, ToastProvider, timeLeft, useNow } from "@ds/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, createContext, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useData } from "../lib/use-data";

const NAV = [
  ["/disputes", "Disputes"],
  ["/risk", "Risk"],
  ["/health", "Health"],
  ["/fulfilment", "Fulfilment"],
  ["/audit", "Audit"],
  ["/setup", "Setup"],
] as const;

const OPEN = new Set(["NEW", "COLLECTING", "READY", "NEEDS_INFO", "APPROVED", "ERROR"]);

const HealthCtx = createContext<{ health: Health | null; reloadQueue: () => void }>({ health: null, reloadQueue: () => {} });
export const useShell = () => useContext(HealthCtx);

function ThemeToggle() {
  // Rendered only after the session check, so it never runs on the server.
  const [theme, setTheme] = useState<string>(() => document.documentElement.dataset.theme ?? "system");
  const next = theme === "system" ? "dark" : theme === "dark" ? "light" : "system";
  return (
    <button
      type="button"
      className="rounded px-2 py-1 text-xs text-[var(--ds-muted)] hover:bg-[var(--ds-surface-2)]"
      aria-label={`Theme: ${theme}. Switch to ${next}`}
      onClick={() => {
        if (next === "system") delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = next;
        try {
          if (next === "system") localStorage.removeItem("ds-theme");
          else localStorage.setItem("ds-theme", next);
        } catch {
          /* storage unavailable */
        }
        setTheme(next);
      }}
    >
      Theme: {theme}
    </button>
  );
}

function DeadlineTicker({ rows }: { rows: QueueRow[] }) {
  const now = useNow();
  const next = rows
    .filter((r) => OPEN.has(r.caseState) && r.sellerResponseDue && Date.parse(r.sellerResponseDue) > now)
    .sort((a, b) => Date.parse(a.sellerResponseDue ?? "") - Date.parse(b.sellerResponseDue ?? ""))[0];
  if (!next) return <span className="text-xs text-[var(--ds-muted)]">No open deadlines</span>;
  const urgent = Date.parse(next.sellerResponseDue ?? "") - now < 24 * 3_600_000;
  return (
    <Link href={`/disputes/${encodeURIComponent(next.id)}`} className={`text-xs tabular-nums no-underline ${urgent ? "font-semibold text-[var(--ds-danger)]" : "text-[var(--ds-muted)]"}`}>
      Next deadline: {next.id} in {timeLeft(next.sellerResponseDue, now)}
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    api.session().then(() => setOk(true), () => undefined);
  }, []);
  const health = useData(() => api.health(), [], 30_000);
  const queue = useData(() => api.disputes(), [], 60_000);
  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

  if (!ok) return <div className="p-8 text-sm text-[var(--ds-muted)]">Checking your session…</div>;
  return (
    <ToastProvider>
      <HealthCtx.Provider value={{ health: health.data, reloadQueue: () => void queue.reload() }}>
        <div className="min-h-screen">
          <header className="sticky top-0 z-30 border-b border-[var(--ds-line)] bg-[var(--ds-surface)]">
            <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
              <Link href="/disputes" className="font-semibold text-[var(--ds-text)] no-underline">
                Dispute Shield
              </Link>
              <nav aria-label="Main" className="flex flex-wrap gap-1">
                {NAV.map(([href, label]) => {
                  const active = path === href || path.startsWith(`${href}/`);
                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`rounded px-2.5 py-1 text-sm no-underline ${active ? "bg-[var(--ds-accent-soft)] font-medium text-[var(--ds-accent)]" : "text-[var(--ds-muted)] hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-text)]"}`}
                    >
                      {label}
                    </Link>
                  );
                })}
              </nav>
              <div className="ml-auto flex flex-wrap items-center gap-3">
                <DeadlineTicker rows={queue.data?.items ?? []} />
                {health.data ? <ModeBanner dataMode={health.data.mode} submitMode={health.data.submitMode} /> : null}
                <span className="rounded border border-[var(--ds-line)] px-1.5 py-0.5 text-[11px] text-[var(--ds-muted)]" title="Times are shown in this time zone">
                  {tz}
                </span>
                <ThemeToggle />
                <button
                  type="button"
                  className="text-xs text-[var(--ds-muted)] hover:underline"
                  onClick={() => void api.logout().finally(() => window.location.assign("/login"))}
                >
                  Sign out
                </button>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-[1400px] px-4 py-5">{children}</main>
        </div>
      </HealthCtx.Provider>
    </ToastProvider>
  );
}
