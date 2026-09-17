import { createMDX } from "fumadocs-mdx/next"
import { seoEnvironment, privateSeoPaths } from "./lib/seo/policy.mjs"
/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  logging: {
    // Confirmation URLs contain one-use credentials; actions can contain passwords.
    incomingRequests: { ignore: [/\/auth\/(confirm|callback)(?:\?|$)/] },
    serverFunctions: false,
  },
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  headers() {
    const paths = seoEnvironment().indexable ? privateSeoPaths : ["/:path*"]
    return [...paths.map((source) => ({
      source,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    })), { source: '/admin/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] }]
  },
  redirects() {
    return [
      ["/docs/setup", "/docs/getting-started/setup"],
      ["/docs/authentication", "/docs/getting-started/authentication"],
      ["/docs/errors", "/docs/api/errors"],
      ["/docs/extending", "/docs/guides/operations"],
      ["/docs/documentation", "/docs/guides/documentation"],
    ].map(([source, destination]) => ({ source, destination, permanent: true }))
  },
}
export default createMDX()(nextConfig)
