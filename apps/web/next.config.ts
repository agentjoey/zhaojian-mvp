import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 排盘核心 + 解读层以 TS 源码形式发布（workspace），交由 Next 转译
  transpilePackages: ["@eamvp/core", "@eamvp/llm"],
  // 局域网访问：放行 LAN 主机加载 /_next/* dev 资源（否则非 localhost 主机表单不水合）
  // DHCP 换 IP 时改这里；glob 兜底整个 /24 网段
  allowedDevOrigins: ["192.168.0.14", "192.168.0.*"],
};

export default nextConfig;
