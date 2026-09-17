import { redirect } from "next/navigation"
import { Brand } from "@/components/brand"
import { ThemeToggle } from "@/components/theme-toggle"
import { OnboardingForm } from "@/components/onboarding/onboarding-form"
import { requireUser } from "@/lib/auth"
import { getOnboarding } from "@/lib/onboarding-server"
import { onboardingDestination } from "@/lib/onboarding"
import { site } from "@/config/site"
import { AppActivity } from "@/components/admin/activity"

export const dynamic = "force-dynamic"
export const metadata = {
  title: "Welcome",
  robots: { index: false, follow: false },
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const [answers, session, params] = await Promise.all([
    getOnboarding(),
    requireUser(),
    searchParams,
  ])
  const next = onboardingDestination(params.next)
  if (answers.status !== "in_progress") redirect(next)
  const { data: profile } = await session.supabase
    .from("profiles")
    .select("full_name")
    .eq("id", session.user.id)
    .single()
  return (
    <div className="flex min-h-svh flex-col bg-background px-6 py-7 sm:px-12">
      <AppActivity />
      <header className="flex items-center justify-between">
        <Brand href="/" />
        <ThemeToggle />
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center py-14">
        <OnboardingForm
          initial={{
            ...answers,
            display_name: answers.display_name || profile?.full_name || "",
          }}
          productName={site.name}
          aiEnabled={process.env.AI_ENABLED === "true"}
          next={next}
        />
      </main>
      <footer className="text-center text-xs text-muted-foreground">
        Your space. Your pace.
      </footer>
    </div>
  )
}
