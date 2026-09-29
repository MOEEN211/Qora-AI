import Link from "next/link"
import {
  ArrowRight,
  Check,
  CircleCheck,
  Fingerprint,
  Settings2,
  ShieldCheck,
  Users,
  UserRound,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { QuickSpark } from "@/components/dashboard/quick-spark"

export type OverviewData = {
  name: string
  email: string
  workspace: string
  slug: string
  role: string
  memberCount: number
  createdAt: string
  preview?: boolean
}
export function Overview({
  name,
  email,
  workspace,
  slug,
  role,
  memberCount,
  createdAt,
  preview = false,
}: OverviewData) {
  const accountHref = preview ? "/setup" : "/dashboard/account"
  const workspaceHref = preview ? "/setup" : "/dashboard/workspace"
  const date = new Date(createdAt).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
  return (
    <div className="space-y-8">
      {preview && (
        <div
          role="status"
          className="rounded-lg border border-dashed bg-background px-4 py-3 text-sm"
        >
          <strong>Design preview.</strong> This is a sample workspace.
          Authentication and database operations stay disabled until you connect
          a new project.
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="mb-3 text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Your overview
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Welcome home, {name.split(" ")[0]}.
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            A little space to make something yours.
          </p>
        </div>
        <Badge
          variant="outline"
          className="mt-1 gap-1.5 px-3 py-1.5 font-normal"
        >
          <ShieldCheck className="size-3.5" /> Email verified
        </Badge>
      </div>
      <Card className="overflow-hidden">
        <div className="grid sm:grid-cols-[1fr_220px]">
          <div className="px-6 py-3 sm:px-8">
            <div className="mb-6 inline-flex size-10 items-center justify-center rounded-lg bg-muted">
              <Settings2 className="size-5" />
            </div>
            <p className="text-xs text-muted-foreground">Your workspace</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight break-words">
              {workspace}
            </h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              This is your starting point. Give your workspace a name that feels
              like you.
            </p>
            <Link
              href={workspaceHref}
              className={`${buttonVariants({ variant: "outline" })} mt-6`}
            >
              Manage workspace <ArrowRight />
            </Link>
          </div>
          <div
            className="workspace-art hidden items-center justify-center sm:flex"
            aria-hidden="true"
          >
            <div>
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            icon: Users,
            label: "Workspace members",
            value: String(memberCount),
            note:
              memberCount === 1
                ? "A space of your own"
                : "People in this workspace",
          },
          {
            icon: Fingerprint,
            label: "Your role",
            value: role.charAt(0).toUpperCase() + role.slice(1),
            note: "Your workspace permissions",
          },
          {
            icon: CircleCheck,
            label: "Account status",
            value: "Verified",
            note: "Your email is confirmed",
          },
        ].map(({ icon: Icon, label, value, note }) => (
          <Card key={label} size="sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardDescription>{label}</CardDescription>
              <Icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tracking-tight">{value}</p>
              <p className="text-xs text-muted-foreground">{note}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <QuickSpark />
      <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Make it yours</CardTitle>
            <CardDescription>
              A couple of small things to settle in.
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-0">
            <div className="flex items-center gap-4 border-b py-4">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <Check className="size-4" />
              </div>
              <div>
                <p className="text-sm font-medium">Confirm your email</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your account is ready to go.
                </p>
              </div>
              <Badge variant="secondary" className="ml-auto">
                Done
              </Badge>
            </div>
            <Link
              href={accountHref}
              className="group flex items-center gap-4 border-b py-4"
            >
              <UserRound className="mx-2 size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Update your profile</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose how your name appears.
                </p>
              </div>
              <ArrowRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href={workspaceHref}
              className="group flex items-center gap-4 pt-4"
            >
              <Settings2 className="mx-2 size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Name your workspace</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Give your next chapter a name.
                </p>
              </div>
              <ArrowRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Workspace details</CardTitle>
            <CardDescription>The essentials, in one place.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              {[
                ["Created", date],
                ["Signed in as", email],
                ["Workspace address", slug],
              ].map(([key, value]) => (
                <div
                  key={key}
                  className="flex flex-wrap justify-between gap-2 py-4 first:pt-1"
                >
                  <dt className="text-muted-foreground">{key}</dt>
                  <dd
                    className={`max-w-full text-right break-all ${key === "Workspace address" ? "font-mono text-xs" : ""}`}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
