import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The recipe library is the start page. Runs before the proxy, so "/" without a
  // session ends up at /logga-in?next=%2Frecept.
  async redirects() {
    return [{ source: "/", destination: "/recept", permanent: false }];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
