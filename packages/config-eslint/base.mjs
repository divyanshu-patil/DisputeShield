import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

// recommendedTypeChecked includes no-floating-promises and no-explicit-any.
export const base = defineConfig(
  { ignores: ["dist/**", ".next/**", "coverage/**", "next-env.d.ts"] },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      "@typescript-eslint/no-non-null-assertion": "error",
      // Async methods that implement Promise-returning ports often have nothing to await.
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    // Test bodies come from untyped helpers such as Fastify's inject().json().
    files: ["test/**"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
);
