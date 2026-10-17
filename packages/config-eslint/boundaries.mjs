// Import boundaries from AGENTS.md rule 9 and docs/02-monorepo-structure.md section 3.
// Do not disable these rules; fix the import instead.

const MESSAGE = "Boundary violation (AGENTS.md rule 9).";

/**
 * Forbids each module and every subpath of it (`name` and `name/*`).
 * @param {string[]} names
 * @returns {import("eslint").Linter.RulesRecord}
 */
const forbid = (names) => ({
  "no-restricted-imports": [
    "error",
    {
      paths: names.map((name) => ({ name, message: MESSAGE })),
      patterns: [{ group: names.map((name) => `${name}/*`), message: MESSAGE }],
    },
  ],
});

/** packages/core and packages/schemas: no I/O packages, no frameworks. */
/** @type {import("eslint").Linter.Config} */
export const pure = {
  rules: forbid([
    "@ds/paypal",
    "@ds/db",
    "@ds/agent",
    "@ds/ui",
    "next",
    "react",
    "react-dom",
    "drizzle-orm",
    "ai",
    "@ai-sdk",
    "fastify",
    "@renderinc/sdk",
  ]),
};

/** packages/ui: no server-only packages. */
/** @type {import("eslint").Linter.Config} */
export const ui = {
  rules: forbid(["@ds/db", "@ds/paypal", "@ds/agent", "@ds/jobs"]),
};

/** apps/web is UI only: it reaches server packages through HTTP to apps/api. */
/** @type {import("eslint").Linter.Config} */
export const web = {
  rules: forbid([
    "@ds/db",
    "@ds/paypal",
    "@ds/agent",
    "@ds/core",
    "@ds/jobs",
    "fastify",
    "@renderinc/sdk",
  ]),
};

/** packages/jobs source: zod and its own relative modules only. */
/** @type {import("eslint").Linter.Config} */
export const jobs = {
  files: ["src/**"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            regex: "^(?!(zod(/.*)?|\\.{1,2}/.*)$)",
            message: "@ds/jobs may import only zod (AGENTS.md rule 9).",
          },
        ],
      },
    ],
  },
};

/**
 * Forbids `process.env` everywhere except the given env loader files (AGENTS.md rule 7).
 * @param {string[]} allowed paths relative to the package
 * @returns {import("eslint").Linter.Config}
 */
export const noProcessEnv = (allowed = []) => ({
  ignores: allowed,
  rules: {
    "no-restricted-properties": [
      "error",
      {
        object: "process",
        property: "env",
        message: "Read process.env only in the env loader (AGENTS.md rule 7).",
      },
    ],
  },
});
