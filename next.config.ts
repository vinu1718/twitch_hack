import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  logging: { incomingRequests: { ignore: [/\/api\/auth\/callback/, /\/api\/health/, /\/api\/mic/] } },
};

export default nextConfig;
