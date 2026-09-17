// Shared by Next config and server metadata. Never derive canonical URLs from a request host.
export function seoEnvironment(env = process.env) {
  let url
  try {
    url = new URL(env.APP_URL || "http://localhost:3000")
  } catch {
    throw new Error("SEO: APP_URL must be an absolute HTTP(S) origin.")
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error("SEO: APP_URL must be an HTTP(S) origin without credentials, paths, queries, or fragments.")
  }
  const local = /^(localhost|127\..*|\[::1\])$/.test(url.hostname) || url.hostname.endsWith('.localhost')
  return {
    origin: url.origin,
    indexable: env.SEO_INDEXABLE === 'true' && env.NODE_ENV === 'production' &&
      (!env.VERCEL_ENV || env.VERCEL_ENV === 'production') && url.protocol === 'https:' && !local,
  }
}

// Leave HTML crawlable so engines can read noindex. These headers also cover redirects and JSON.
export const privateSeoPaths = [
  '/dashboard/:path*', '/admin/:path*', '/login', '/signup', '/forgot-password',
  '/reset-password', '/verify-email', '/invite', '/auth/:path*', '/oauth/:path*',
  '/preview/:path*', '/setup/:path*', '/api/:path*', '/.well-known/:path*',
]

export function serializeJsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}
