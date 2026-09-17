import "server-only"
import { site } from "@/config/site"
import { marketing } from "@/config/marketing"
import { source } from "@/lib/docs-source"
import { absoluteUrl } from "@/lib/seo/metadata"

// Render only explicit public copy. Never read README, internal docs/, .env, or workspace data.
export function homeMarkdown() {
  return [
    `# ${site.name}`,
    `> ${marketing.description}`,
    `Source: ${absoluteUrl("/")}`,
    "## Frequently asked questions",
    ...marketing.faqs.map((faq) => `### ${faq.question}\n\n${faq.answer}`),
    `## Learn more\n\n- [Documentation](${absoluteUrl("/docs")})\n- [Blog](${absoluteUrl("/blog")})`,
  ].join("\n\n")
}

export function llmsIndex() {
  return [
    `# ${site.name}`,
    `> ${marketing.description}`,
    "Public product information and developer documentation. API and MCP operations require the documented credentials and permissions.",
    `## Product\n\n- [Product overview](${absoluteUrl("/index.md")}): Summary and FAQs from the home page.\n- [Blog index](${absoluteUrl("/blog/index.md")}): Published stories with links to Markdown versions.`,
    "## Documentation\n\n" +
      source
        .getPages()
        .map(
          (page) =>
            `- [${page.data.title}](${absoluteUrl(`/api/docs/markdown/${page.slugs.join("/") || "index"}`)}): ${page.data.description || page.data.title} HTML: ${absoluteUrl(page.url)}`
        )
        .join("\n"),
    `## Optional\n\n- [OpenAPI schema](${absoluteUrl("/api/openapi")}): Public REST contract.\n- [Full documentation](${absoluteUrl("/llms-full.txt")}): Product overview and all public documentation in one response; blog stories are linked separately.\n- [Sitemap](${absoluteUrl("/sitemap.xml")}): Indexable HTML pages after launch.`,
  ].join("\n\n")
}

export function markdownResponse(body: string, canonical: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Robots-Tag": "noindex, follow",
      Link: `<${absoluteUrl(canonical)}>; rel="canonical", <${absoluteUrl("/llms.txt")}>; rel="describedby"`,
    },
  })
}
