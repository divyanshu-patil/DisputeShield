import { Linter } from "eslint";
import { describe, expect, it } from "vitest";
import { jobs, noProcessEnv, pure, ui, web } from "../boundaries.mjs";

const errors = (code: string, config: Linter.Config, filename = "src/x.js") =>
  new Linter().verify(code, [config], filename).map((m) => m.ruleId);

describe("boundaries", () => {
  it.each([
    "@ds/paypal",
    "@ds/db",
    "@ds/agent",
    "@ds/ui",
    "next",
    "next/server",
    "react",
    "react-dom/client",
    "drizzle-orm",
    "drizzle-orm/pg-core",
    "ai",
    "@ai-sdk/anthropic",
    "fastify",
    "@renderinc/sdk/workflows",
  ])("pure_rejects_%s", (mod) => {
    expect(errors(`import x from "${mod}";`, pure)).toEqual([
      "no-restricted-imports",
    ]);
  });

  it.each(["@ds/schemas", "zod", "./ai", "../react/x"])(
    "pure_allows_%s",
    (mod) => {
      expect(errors(`import x from "${mod}";`, pure)).toEqual([]);
    },
  );

  it("ui_rejects_server_packages_and_allows_react", () => {
    expect(errors(`import x from "@ds/paypal";`, ui)).toEqual([
      "no-restricted-imports",
    ]);
    expect(errors(`import x from "@ds/jobs";`, ui)).toEqual([
      "no-restricted-imports",
    ]);
    expect(errors(`import x from "react";`, ui)).toEqual([]);
  });

  it.each([
    "@ds/db",
    "@ds/paypal",
    "@ds/agent",
    "@ds/core",
    "@ds/jobs",
    "fastify",
    "@renderinc/sdk",
  ])("web_rejects_%s", (mod) => {
    expect(errors(`import x from "${mod}";`, web)).toEqual([
      "no-restricted-imports",
    ]);
  });

  it.each(["@ds/ui", "@ds/schemas", "@ds/api-client", "next/link"])(
    "web_allows_%s",
    (mod) => {
      expect(errors(`import x from "${mod}";`, web)).toEqual([]);
    },
  );

  it.each(["zod", "zod/v4", "./kinds.js", "../x.js"])(
    "jobs_allows_%s",
    (mod) => {
      expect(errors(`import x from "${mod}";`, jobs, "src/runner.js")).toEqual(
        [],
      );
    },
  );

  it.each(["@ds/schemas", "node:crypto", "fastify", "zodiac"])(
    "jobs_rejects_%s",
    (mod) => {
      expect(errors(`import x from "${mod}";`, jobs, "src/runner.js")).toEqual([
        "no-restricted-imports",
      ]);
    },
  );

  it("process_env_only_in_env_loader", () => {
    const code = "const a = process.env.X;";
    expect(errors(code, noProcessEnv(["src/env.js"]))).toEqual([
      "no-restricted-properties",
    ]);
    expect(errors(code, noProcessEnv(["src/env.js"]), "src/env.js")).toEqual(
      [],
    );
  });
});
