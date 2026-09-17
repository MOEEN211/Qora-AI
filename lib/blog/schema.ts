import { z } from "zod"

export const blogSectionSchema = z.object({
  heading: z.string().min(1).max(180),
  paragraphs: z.array(z.string().min(1).max(6000)).min(1).max(20),
})
export const blogPostSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1).max(180),
  excerpt: z.string().min(1).max(500),
  category: z.string().min(1).max(60),
  author: z.string().min(1).max(100),
  thumbnail_path: z.string().regex(/^\/blog\/[a-z0-9-]+\.(webp|png|jpg)$/),
  published_at: z.string(),
  reading_minutes: z.number().int().positive(),
  content: z.array(blogSectionSchema).min(1).max(40),
})
export const blogSummarySchema = blogPostSchema.omit({ content: true })
export type BlogPost = z.infer<typeof blogPostSchema>
export type BlogSummary = z.infer<typeof blogSummarySchema>

export function formatBlogDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date))
}
