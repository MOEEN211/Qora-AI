import type { MetadataRoute } from "next"
import { seo } from "@/config/seo"
import { absoluteUrl } from "@/lib/seo/metadata"

export default function robots(): MetadataRoute.Robots {
  return seo.indexable
    ? {
        rules: { userAgent: "*", allow: "/" },
        sitemap: absoluteUrl("/sitemap.xml"),
      }
    : { rules: { userAgent: "*", disallow: "/" } }
}
