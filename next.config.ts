import type { NextConfig } from "next";

const basePath = process.env.BASE_PATH ?? "";
const isSitesBuild = process.env.SITES_BUILD === "1";

const nextConfig: NextConfig = {
  output: isSitesBuild ? undefined : "export",
  trailingSlash: !isSitesBuild,
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
};

export default nextConfig;

