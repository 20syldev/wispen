import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: process.env.NODE_ENV === "production" ? "export" : undefined,
    basePath: process.env.BASE_PATH,
    env: { BASE_PATH: process.env.BASE_PATH ?? "" },
    trailingSlash: true,
    images: { unoptimized: true },
    turbopack: { root: process.cwd() },
    agentRules: false,
    devIndicators: false,
};

export default nextConfig;
