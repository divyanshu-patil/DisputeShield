import type { NextConfig } from "next";

// The only process.env reads in apps/web (AGENTS.md rule 7): where the /api/* rewrite points, and the
// build folder (e2e builds into its own, so a running `next dev` keeps its .next).
const apiOrigin = process.env["API_ORIGIN"] ?? "http://localhost:4000";
const distDir = process.env["NEXT_DIST_DIR"] ?? ".next";

const nextConfig: NextConfig = {
  distDir,
  // Internal packages ship TypeScript source (ADR-002). The web app imports nothing else.
  transpilePackages: ["@ds/schemas", "@ds/ui", "@ds/api-client"],
  // Same-origin rewrite keeps the session cookie first-party (ADR-015).
  rewrites: () =>
    Promise.resolve([
      { source: "/api/:path*", destination: `${apiOrigin}/api/:path*` },
    ]),
};

export default nextConfig;
