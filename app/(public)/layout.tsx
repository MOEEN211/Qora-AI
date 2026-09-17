import { PublicShell } from "@/components/marketing/public-shell"
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <PublicShell>{children}</PublicShell>
}
