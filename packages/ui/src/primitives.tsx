"use client";
import {
  type ButtonHTMLAttributes,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

// Basic building blocks. Colours come only from tokens.css (06 section 10).

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "danger" | "ghost";
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[var(--ds-accent)] text-[var(--ds-accent-text)] border-transparent hover:opacity-90",
  secondary:
    "bg-[var(--ds-surface)] text-[var(--ds-text)] border-[var(--ds-line)] hover:bg-[var(--ds-surface-2)]",
  danger:
    "bg-[var(--ds-danger)] text-white border-transparent hover:opacity-90",
  ghost:
    "bg-transparent text-[var(--ds-text)] border-transparent hover:bg-[var(--ds-surface-2)]",
};

export function Button({
  variant = "secondary",
  size = "md",
  busy,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md";
  busy?: boolean;
}) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-[var(--ds-radius)] border font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-accent)] disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm",
        VARIANTS[variant],
        className,
      )}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}

export type Tone = "neutral" | "ok" | "warn" | "danger" | "info" | "accent";
const TONES: Record<Tone, string> = {
  neutral:
    "bg-[var(--ds-surface-2)] text-[var(--ds-muted)] border-[var(--ds-line)]",
  ok: "bg-[var(--ds-ok-soft)] text-[var(--ds-ok)] border-transparent",
  warn: "bg-[var(--ds-warn-soft)] text-[var(--ds-warn)] border-transparent",
  danger:
    "bg-[var(--ds-danger-soft)] text-[var(--ds-danger)] border-transparent",
  info: "bg-[var(--ds-info-soft)] text-[var(--ds-info)] border-transparent",
  accent:
    "bg-[var(--ds-accent-soft)] text-[var(--ds-accent)] border-transparent",
};

export function Badge({
  tone = "neutral",
  children,
  title,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "rounded-[var(--ds-radius)] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-4",
        className,
      )}
    >
      {title || actions ? (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title ? (
            <h2 className="text-sm font-semibold">{title}</h2>
          ) : (
            <span />
          )}
          {actions}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-[var(--ds-radius)] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-4">
      <div className="text-xs text-[var(--ds-muted)]">{label}</div>
      <div
        className={cx(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "danger" && "text-[var(--ds-danger)]",
          tone === "warn" && "text-[var(--ds-warn)]",
        )}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-xs text-[var(--ds-muted)]">{hint}</div>
      ) : null}
    </div>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--ds-radius)] border border-dashed border-[var(--ds-line)] p-10 text-center">
      <p className="font-medium">{title}</p>
      {children ? (
        <div className="max-w-md text-sm text-[var(--ds-muted)]">
          {children}
        </div>
      ) : null}
      {action}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-[var(--ds-radius)] border border-transparent bg-[var(--ds-danger-soft)] px-3 py-2 text-sm text-[var(--ds-danger)]"
    >
      {children}
    </div>
  );
}

export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-9 animate-pulse rounded bg-[var(--ds-surface-2)]"
        />
      ))}
    </div>
  );
}

/** Native <dialog>: focus is trapped by the browser and returned on close (06 section 12). */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={title}
      className={cx(
        "m-auto w-[calc(100%-2rem)] rounded-[var(--ds-radius)] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-0 text-[var(--ds-text)] backdrop:bg-black/50",
        wide ? "max-w-3xl" : "max-w-lg",
      )}
    >
      {open ? (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-center justify-between border-b border-[var(--ds-line)] px-4 py-3">
            <h2 className="font-semibold">{title}</h2>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Close"
              onClick={onClose}
            >
              ✕
            </Button>
          </header>
          <div className="overflow-y-auto px-4 py-3">{children}</div>
          {footer ? (
            <footer className="flex justify-end gap-2 border-t border-[var(--ds-line)] px-4 py-3">
              {footer}
            </footer>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={title}
      className="ml-auto mr-0 mt-0 mb-0 h-full max-h-none w-full max-w-xl border-l border-[var(--ds-line)] bg-[var(--ds-surface)] p-0 text-[var(--ds-text)] backdrop:bg-black/40"
    >
      {open ? (
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between border-b border-[var(--ds-line)] px-4 py-3">
            <h2 className="font-semibold">{title}</h2>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Close"
              onClick={onClose}
            >
              ✕
            </Button>
          </header>
          <div className="flex-1 overflow-y-auto p-4">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}

type ToastItem = { id: number; text: string; tone: Tone };
const ToastCtx = createContext<(text: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, tone: Tone = "info") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100%-2rem)] flex-col gap-2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto rounded-[var(--ds-radius)] border px-3 py-2 text-sm shadow-lg",
              TONES[t.tone],
              "border-[var(--ds-line)]",
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
