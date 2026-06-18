import type { NextConfig } from "next";

// 后端地址来源：
// - 同站/单机部署：NEXT_PUBLIC_API_BASE_URL 直接指向后端（构建期内联）。
// - 前端在 Vercel + 后端在别的域名：把 NEXT_PUBLIC_API_BASE_URL 设为空串，
//   并设置 API_PROXY_TARGET=https://你的后端，让前端经「同源」代理访问后端，
//   这样会话 Cookie 变成「第一方 Cookie」，规避移动端浏览器对第三方 Cookie 的拦截。
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const proxyTarget = process.env.API_PROXY_TARGET || "";

// next/image 远程白名单（本项目图片多用普通 <img>，此项为兜底）。
// 只接受「绝对 http(s) 地址」作为来源：apiBase 可能是 "/" 或 ""（同源代理场景），需跳过，
// 回退到 proxyTarget 或 localhost，避免把非法值喂给 remotePatterns 导致构建失败。
function deriveRemotePattern() {
  const src =
    [apiBase, proxyTarget, "http://localhost:8000"].find((s) => /^https?:\/\//.test(s)) ??
    "http://localhost:8000";
  const u = new URL(src);
  return {
    protocol: (u.protocol.replace(":", "") as "http" | "https"),
    hostname: u.hostname,
    port: u.port || "",
    pathname: "/static/**",
  };
}

const nextConfig: NextConfig = {
  // Docker 镜像精简：仅打包运行所需文件（web/Dockerfile 依赖此项）
  output: "standalone",
  images: {
    remotePatterns: [deriveRemotePattern()],
  },
  // 仅当设置了 API_PROXY_TARGET 时启用同源代理（Vercel 拆分部署场景）。
  // 把同源的 /v1/* 与 /health 透明转发到后端，前端因此可用相对地址、Cookie 第一方。
  async rewrites() {
    if (!proxyTarget) return [];
    return [
      { source: "/v1/:path*", destination: `${proxyTarget}/v1/:path*` },
      { source: "/health", destination: `${proxyTarget}/health` },
    ];
  },
};

export default nextConfig;
