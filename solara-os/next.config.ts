import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Garante que os arquivos de prompts/ sejam empacotados nas rotas de API
  // (lib/agente.ts os le em runtime com fs).
  outputFileTracingIncludes: {
    "/api/**/*": ["./prompts/**/*"],
  },
};

export default nextConfig;
