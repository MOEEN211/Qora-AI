import "server-only"
import { llms } from "fumadocs-core/source"
import { source } from "@/lib/docs-source"
import { markdownComponents } from "@/components/docs/markdown"
import { absoluteUrl } from "@/lib/seo/metadata"

export const docsLlms = llms(source, {
  renderPage: async (page) =>
    [
      `# ${page.data.title}`,
      `URL: ${absoluteUrl(page.url)}`,
      page.data.description,
      await page.data.getText("processed", { components: markdownComponents }),
    ]
      .filter(Boolean)
      .join("\n\n"),
})
