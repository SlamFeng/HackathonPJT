import type { NextConfig } from "next";

// 后端静态图片地址随部署环境变化，从 NEXT_PUBLIC_API_BASE_URL 推导出 next/image 白名单。
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

function deriveRemotePattern() {
  try {
    const u = new URL(apiBase);
    return {
      protocol: (u.protocol.replace(":", "") as "http" | "https"),
      hostname: u.hostname,
      port: u.port || "",
      pathname: "/static/**",
    };
  } catch {
    return { protocol: "http" as const, hostname: "localhost", port: "8000", pathname: "/static/**" };
  }
}

const nextConfig: NextConfig = {
  // Docker 镜像精简：仅打包运行所需文件（web/Dockerfile 依赖此项）
  output: "standalone",
  images: {
    remotePatterns: [deriveRemotePattern()],
  },
};

export default nextConfig;
