import { MarketingShell } from "./shell"
import "@/app/journal.css"
export function PublicShell({ children }: { children: React.ReactNode }) {
  return <MarketingShell>{children}</MarketingShell>
}
