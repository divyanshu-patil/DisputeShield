"use client";
import { Button, ErrorNote } from "@ds/ui";
import { type FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "../../lib/api";

function LoginForm() {
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(code);
      const next = params.get("next");
      window.location.assign(next && next.startsWith("/") && !next.startsWith("//") ? next : "/disputes");
    } catch {
      setError("That access code was not accepted. Check it and try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="w-full max-w-sm space-y-4 rounded-[var(--ds-radius)] border border-[var(--ds-line)] bg-[var(--ds-surface)] p-6">
      <div>
        <h1 className="text-xl font-semibold">Dispute Shield</h1>
        <p className="mt-1 text-sm text-[var(--ds-muted)]">PayPal dispute evidence, checked against your records before anything is sent.</p>
      </div>
      <div className="space-y-1">
        <label htmlFor="code" className="text-sm font-medium">
          Access code
        </label>
        <input
          id="code"
          type="password"
          autoComplete="current-password"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-describedby={error ? "login-error" : undefined}
          className="w-full rounded-[var(--ds-radius)] border border-[var(--ds-line)] bg-[var(--ds-bg)] px-3 py-2 text-sm"
        />
      </div>
      {error ? (
        <div id="login-error">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}
      <Button type="submit" variant="primary" busy={busy} className="w-full">
        Sign in
      </Button>
      <p className="text-xs text-[var(--ds-muted)]">Demo data only. PayPal sandbox, never production.</p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
