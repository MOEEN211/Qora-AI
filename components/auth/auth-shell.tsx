import { ArrowUpRight, Layers2 } from "lucide-react"
import { Brand } from "@/components/brand"
import { ThemeToggle } from "@/components/theme-toggle"
import { site } from "@/config/site"
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh lg:grid lg:grid-cols-2">
      <section className="flex min-h-svh flex-col px-6 py-7 sm:px-12 lg:px-16 xl:px-24">
        <header className="flex items-center justify-between">
          <Brand href="/" />
          <ThemeToggle />
        </header>
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-14">
          {children}
        </main>
        <footer className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            © {new Date().getFullYear()} {site.name}
          </span>
          <span>Your space. Your pace.</span>
        </footer>
      </section>
      <aside className="auth-story relative m-3 ml-0 hidden overflow-hidden rounded-2xl bg-primary p-12 text-primary-foreground lg:flex lg:flex-col xl:p-16">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Layers2 className="size-4" /> Made for your next chapter
          </span>
          <ArrowUpRight className="size-5" />
        </div>
        <div className="flex flex-1 flex-col justify-center py-16">
          <div className="auth-sculpture" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <p className="mt-16 max-w-lg text-4xl leading-[1.15] font-medium tracking-[-.045em] xl:text-5xl">
            A space for
            <br />
            what&apos;s next.
          </p>
          <p className="mt-5 max-w-xs text-sm leading-6 opacity-65">
            Bring your ideas, find your focus, and make yourself at home.
          </p>
        </div>
        <div className="flex justify-between border-t border-current/20 pt-6 text-xs opacity-60">
          <span>A fresh start, all yours.</span>
          <span className="font-mono">
            {site.name.toUpperCase()} / WORKSPACE
          </span>
        </div>
      </aside>
    </div>
  )
}
