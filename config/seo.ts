import "server-only"
import { seoEnvironment } from "@/lib/seo/policy.mjs"

// Buyer customization. APP_URL is the active origin; APP_URL_LIVE stays reference-only.
export const seo = {
  ...seoEnvironment(),
  language: "en",
  locale: "en_US",
  socialImage: "/social-image",
  // Only list real public HTML pages. Docs and published blog posts are added automatically.
  pages: [
    { path: "/" },
    { path: "/pricing" },
    { path: "/faq" },
    { path: "/contact" },
    { path: "/blog" },
  ],
}
