import nextVitals from "eslint-config-next/core-web-vitals";
import { defineConfig } from "eslint/config";
import { base } from "./base.mjs";

export const next = defineConfig(nextVitals, base);
