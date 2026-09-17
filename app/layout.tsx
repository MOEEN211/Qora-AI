import type { Metadata } from "next"
import { Inter, Geist_Mono } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { site } from "@/config/site"
import { seo } from "@/config/seo"
import "./globals.css"
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })
export const metadata: Metadata = {
  metadataBase: new URL(seo.origin),
  title: { default: site.name, template: `%s · ${site.name}` },
  description: site.description,
  robots: { index: false, follow: false },
}
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang={seo.language}
      suppressHydrationWarning
      className={`${inter.variable} ${mono.variable} antialiased`}
    >
      <head><link rel="describedby" href="/llms.txt" type="text/plain" /></head>
      <body>
        <ThemeProvider defaultTheme="light">
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
