// The only place in apps/workflows that reads process.env (AGENTS.md rule 7).

export function workflowSlug(
  source: Record<string, string | undefined> = process.env,
): string {
  const slug = source["RENDER_WORKFLOW_SLUG"];
  if (!slug) throw new Error("RENDER_WORKFLOW_SLUG is not set");
  return slug;
}
