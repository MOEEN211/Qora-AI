import { defineDocs, defineConfig } from "fumadocs-mdx/config"
export const docs = defineDocs({
  dir: "content/docs",
  docs: { postprocess: { includeProcessedMarkdown: { output: "function" } } },
})
export default defineConfig()
