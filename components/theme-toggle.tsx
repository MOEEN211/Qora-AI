"use client"

import { useSyncExternalStore } from "react"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"

const subscribe = () => () => {}
const getSnapshot = () => true
const getServerSnapshot = () => false

export function ThemeToggle() {
  const { resolvedTheme, forcedTheme, setTheme } = useTheme()
  // Keep the server and first client render identical for saved/system themes.
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const selectedTheme = mounted ? forcedTheme || resolvedTheme : undefined

  return (
    <div
      role="group"
      aria-label="Color theme"
      dir="ltr"
      className="relative inline-flex shrink-0 rounded-lg border bg-muted p-0.5"
    >
      <span
        aria-hidden="true"
        data-slot="theme-indicator"
        className="theme-toggle-indicator pointer-events-none absolute top-0.5 left-0.5 size-9 rounded-md border bg-background shadow-xs dark:translate-x-full"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Light mode"
        aria-pressed={selectedTheme === "light"}
        disabled={!mounted || !!forcedTheme}
        onClick={() => setTheme("light")}
        className="relative text-foreground hover:bg-transparent dark:text-muted-foreground dark:hover:bg-transparent"
      >
        <Sun aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Dark mode"
        aria-pressed={selectedTheme === "dark"}
        disabled={!mounted || !!forcedTheme}
        onClick={() => setTheme("dark")}
        className="relative text-muted-foreground hover:bg-transparent dark:text-foreground dark:hover:bg-transparent"
      >
        <Moon aria-hidden="true" />
      </Button>
    </div>
  )
}
