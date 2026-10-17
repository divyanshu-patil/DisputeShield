import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import pkg from "../package.json" with { type: "json" };

describe("next.config", () => {
  it("transpiles_every_internal_package_the_app_depends_on", () => {
    const internal = Object.keys(pkg.dependencies).filter((name) =>
      name.startsWith("@ds/"),
    );
    expect([...(nextConfig.transpilePackages ?? [])].sort()).toEqual(
      internal.sort(),
    );
  });

  it("rewrites_api_to_the_api_origin", async () => {
    expect(await nextConfig.rewrites?.()).toEqual([
      {
        source: "/api/:path*",
        destination: "http://localhost:4000/api/:path*",
      },
    ]);
  });
});
