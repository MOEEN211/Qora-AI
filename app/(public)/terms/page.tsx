import type { Metadata } from "next"
import { LegalPage } from "@/components/marketing/legal-page"
export const metadata: Metadata = {
  title: "Terms and conditions",
  description: "Sample terms and conditions. Customize before publishing.",
  robots: { index: false, follow: true },
}
export default function TermsPage() {
  return <LegalPage kind="terms" />
}
