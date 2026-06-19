/** @type {import('next').NextConfig} */
const nextConfig = {
  // Only use static export for Azure Static Web Apps production build (STATIC_EXPORT=1).
  // Local dev needs API routes enabled (no output: "export").
  ...(process.env.STATIC_EXPORT === "1" ? { output: "export" } : {}),
};
export default nextConfig;
