import type { NextConfig } from "next";

// The only process.env read in apps/web (AGENTS.md rule 7): where the /api/* rewrite points.
const apiOrigin = process.env["API_ORIGIN"] ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // Internal packages ship TypeScript source (ADR-002). The web app imports nothing else.
  transpilePackages: ["@ds/schemas", "@ds/ui", "@ds/api-client"],
  // Same-origin rewrite keeps the session cookie first-party (ADR-015).
  rewrites: () =>
    Promise.resolve([
      { source: "/api/:path*", destination: `${apiOrigin}/api/:path*` },
    ]),
};

export default nextConfig;
