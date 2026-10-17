import { createOllamaClient, createStudioTurnHandler } from "@ds/agent";
import { Render } from "@renderinc/sdk";
import { buildDatabaseDeps } from "./adapters/database.js";
import { buildMemoryDeps } from "./adapters/memory.js";
import { RenderJobQueue } from "./adapters/render-queue.js";
import type { Env } from "./env.js";
import type { Deps, StudioLlm } from "./ports.js";

/**
 * Composition root: the one place that decides which adapter implements each port.
 *
 * Already real:  studioLlm -> Ollama Cloud through @ds/agent (when OLLAMA_API_KEY is set).
 * Real when DS_JOB_BACKEND=render: jobs -> Render Workflows (adapters/render-queue.ts).
 * Real when DATABASE_URL is set: events, jobs (postgres backend), disputes, health, case services and the
 *                live webhook verifier (adapters/database.ts). Without it the in-memory adapters run.
 * Keep this file free of business rules.
 */
export function buildContainer(env: Env, log?: (msg: string, extra?: Record<string, unknown>) => void): Deps & { close?: () => Promise<void> } {
  let deps: Deps & { close?: () => Promise<void> } = buildMemoryDeps(env.DS_MODE);
  if (env.OLLAMA_API_KEY && env.LLM_MODEL) {
    deps.studioLlm = buildOllamaStudioLlm(env.OLLAMA_API_KEY, env.OLLAMA_HOST, env.LLM_MODEL);
  }
  if (env.DS_JOB_BACKEND === "render" && env.RENDER_API_KEY && env.RENDER_WORKFLOW_SLUG) {
    const render = new Render({ token: env.RENDER_API_KEY });
    deps.jobs = new RenderJobQueue({
      workflowSlug: env.RENDER_WORKFLOW_SLUG,
      startTask: (slug, args, options) => render.workflows.startTask(slug, args, options),
      clock: deps.clock,
    });
  }
  if (env.DATABASE_URL) {
    const built = buildDatabaseDeps(env, deps, env.DATABASE_URL, log);
    deps = { ...built.deps, close: built.close };
  }
  return deps;
}

export function buildOllamaStudioLlm(apiKey: string, host: string, model: string, now: () => number = Date.now): StudioLlm {
  const client = createOllamaClient({ apiKey, host });
  const handle = createStudioTurnHandler(client, model);
  let cached: { at: number; value: "ok" | "down" } | null = null;
  return {
    turn: (req, opts) => handle(req, opts),
    async status() {
      if (cached && now() - cached.at < 60_000) return cached.value;
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 5000);
      try {
        await client.listModels({ signal: ac.signal });
        cached = { at: now(), value: "ok" };
      } catch {
        cached = { at: now(), value: "down" };
      } finally {
        clearTimeout(timer);
      }
      return cached.value;
    },
  };
}
