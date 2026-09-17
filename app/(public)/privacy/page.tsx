import type { Metadata } from "next"
import { LegalPage } from "@/components/marketing/legal-page"
export const metadata: Metadata = {
  title: "Privacy policy",
  description: "Sample privacy policy. Customize before publishing.",
  robots: { index: false, follow: true },
}
export default function PrivacyPage() {
  return <LegalPage kind="privacy" />
}
