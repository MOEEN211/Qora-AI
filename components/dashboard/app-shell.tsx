"use client"
import Link from "next/link"
import { useState } from "react"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  MessageSquare,
  Settings2,
  UserRound,
  ArrowUpRight,
  PanelsTopLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Brand } from "@/components/brand"
import { ThemeToggle } from "@/components/theme-toggle"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { AccountMenu } from "@/components/dashboard/account-menu"
import {
  WorkspaceSwitcher,
  type WorkspaceChoice,
} from "@/components/workspaces/workspace-switcher"

const links = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/chat", label: "AI chatbot", icon: MessageSquare },
  { href: "/dashboard/workspace", label: "Workspace", icon: Settings2 },
  { href: "/dashboard/integrations", label: "Integrations", icon: Plug },
  { href: "/dashboard/account", label: "Settings", icon: UserRound },
]
export function AppShell({
  children,
  name,
  email,
  workspace,
  workspaces,
  workspaceId,
  avatarUrl,
  preview = false,
  aiEnabled = false,
  planLabel,
  operator = false,
}: {
  children: React.ReactNode
  name: string
  email: string
  workspace: string
  workspaces?: WorkspaceChoice[]
  workspaceId?: string
  avatarUrl?: string | null
  preview?: boolean
  aiEnabled?: boolean
  planLabel?: string
  operator?: boolean
}) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const chatPage =
    pathname === "/dashboard/chat" ||
    pathname.startsWith("/dashboard/chat/") ||
    pathname === "/preview/chat"
  const activeLink = links.find(
    (l) =>
      l.href === pathname ||
      (l.href !== "/dashboard" && pathname.startsWith(`${l.href}/`))
  )
  return (
    <div
      data-collapsed={collapsed}
      data-chat-page={chatPage}
      className={`app-shell bg-muted/30 lg:grid lg:grid-cols-[248px_minmax(0,1fr)] ${chatPage ? "h-dvh overflow-hidden" : "min-h-svh"}`}
    >
      <aside
        id="app-sidebar"
        className={`${chatPage ? "hidden lg:flex" : "flex"} min-h-0 min-w-0 flex-col border-b bg-sidebar px-5 py-5 lg:sticky lg:top-0 lg:h-dvh lg:border-r lg:border-b-0`}
      >
        <div data-sidebar-brand className="px-2 py-2">
          <Brand href={preview ? "/preview" : "/dashboard"} collapsible />
        </div>
        {workspaces && workspaceId ? (
          <WorkspaceSwitcher workspaces={workspaces} current={workspaceId} />
        ) : (
          <div
            data-sidebar-row="workspace"
            title={workspace}
            className="my-7 flex min-w-0 items-center gap-3 rounded-lg border bg-background px-3 py-3"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
              <PanelsTopLeft className="size-4" />
            </div>
            <div data-sidebar-label className="min-w-0">
              <p className="truncate text-sm font-medium">{workspace}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Your workspace
              </p>
            </div>
          </div>
        )}
        <p
          className="mb-3 hidden px-3 text-[10px] font-medium tracking-[.15em] text-muted-foreground uppercase lg:block"
          data-sidebar-caption
          aria-hidden={collapsed}
        >
          Workspace
        </p>
        <nav
          aria-label="Main navigation"
          className="flex flex-wrap gap-1 lg:flex-col lg:flex-nowrap"
        >
          {links
            .filter((link) => aiEnabled || link.href !== "/dashboard/chat")
            .map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={preview ? "/setup" : href}
                aria-current={activeLink?.href === href ? "page" : undefined}
                aria-label={label}
                title={collapsed ? label : undefined}
                data-sidebar-row="navigation"
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${activeLink?.href === href || (preview && href === "/dashboard") ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <Icon className="size-4 shrink-0" />
                <span data-sidebar-label>{label}</span>
              </Link>
            ))}
        </nav>
        <div className="mt-auto pt-5 lg:pt-8">
          <div className="border-t pt-5">
            <AccountMenu
              operator={operator}
              key={workspaceId}
              workspaceId={workspaceId}
              name={name}
              email={email}
              avatarUrl={avatarUrl}
              preview={preview}
            />
          </div>
        </div>
      </aside>
      <div
        className={
          chatPage ? "flex h-dvh min-w-0 flex-col bg-background" : "min-w-0"
        }
      >
        <header
          className={`flex h-16 shrink-0 items-center justify-between bg-background px-4 lg:px-6 ${chatPage ? "" : "border-b"}`}
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Button
              variant="ghost"
              size="icon-sm"
              className="mr-2 hidden text-muted-foreground aria-expanded:bg-transparent aria-expanded:text-muted-foreground lg:inline-flex"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              aria-controls="app-sidebar"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
            {chatPage && (
              <Link
                href={preview ? "/preview" : "/dashboard"}
                className="mr-2 rounded-md p-2 hover:bg-muted lg:hidden"
                aria-label="Back to workspace"
              >
                <LayoutDashboard className="size-4" />
              </Link>
            )}
            <span className="hidden sm:inline">Workspace</span>
            <span className="hidden sm:inline">/</span>
            <span className="text-foreground">
              {chatPage
                ? "AI chat"
                : pathname === "/dashboard/notifications"
                  ? "Notifications"
                  : activeLink?.label || "Overview"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {planLabel && (
              <Badge
                variant="secondary"
                className="h-6 max-w-32 px-2.5"
                title={`Workspace plan: ${planLabel}`}
                aria-label={`Workspace plan: ${planLabel}`}
              >
                <span className="truncate">{planLabel}</span>
              </Badge>
            )}
            {!preview && <NotificationBell />}
            <ThemeToggle />
            {preview && (
              <Link
                href="/setup"
                className="inline-flex items-center gap-2 text-xs"
              >
                Connect your project <ArrowUpRight className="size-3" />
              </Link>
            )}
          </div>
        </header>
        <main
          className={
            chatPage
              ? "min-h-0 flex-1 [&>div]:h-full"
              : "mx-auto max-w-[1250px] px-6 py-10 lg:px-10 lg:py-12"
          }
        >
          {children}
        </main>
      </div>
    </div>
  )
}
