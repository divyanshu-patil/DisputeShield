// The only place in apps/workflows that reads process.env (AGENTS.md rule 7).

export function workflowSlug(
  source: Record<string, string | undefined> = process.env,
): string {
  const slug = source["RENDER_WORKFLOW_SLUG"];
  if (!slug) throw new Error("RENDER_WORKFLOW_SLUG is not set");
  return slug;
}

export type WorkerEnv = {
  databaseUrl: string;
  mode: "live" | "replay";
  submitMode: "dry-run" | "live";
  paypal: { clientId: string; clientSecret: string } | null;
  ollama: { apiKey: string; host: string; model: string } | null;
  render: { apiKey: string; slug: string } | null;
};

/** Settings for the job handlers. Returns null without DATABASE_URL (tasks then fail as not implemented). */
export function workerEnv(source: Record<string, string | undefined> = process.env): WorkerEnv | null {
  const s = (k: string) => source[k] || undefined;
  const databaseUrl = s("DATABASE_URL");
  if (!databaseUrl) return null;
  const mode = s("DS_MODE") === "live" ? "live" : "replay";
  const id = s("PAYPAL_CLIENT_ID");
  const secret = s("PAYPAL_CLIENT_SECRET");
  const key = s("OLLAMA_API_KEY");
  const model = s("LLM_MODEL");
  const renderKey = s("RENDER_API_KEY");
  const slug = s("RENDER_WORKFLOW_SLUG");
  return {
    databaseUrl,
    mode,
    // Live submit needs live mode, as in apps/api/src/env.ts.
    submitMode: s("DS_SUBMIT_MODE") === "live" && mode === "live" ? "live" : "dry-run",
    paypal: id && secret ? { clientId: id, clientSecret: secret } : null,
    ollama: key && model ? { apiKey: key, host: s("OLLAMA_HOST") ?? "https://ollama.com", model } : null,
    render: renderKey && slug ? { apiKey: renderKey, slug } : null,
  };
}
