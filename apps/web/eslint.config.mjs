import { noProcessEnv, web } from "@ds/config-eslint/boundaries";
import { next } from "@ds/config-eslint/next";

export default [...next, web, noProcessEnv(["next.config.ts", "playwright.config.ts"])];
