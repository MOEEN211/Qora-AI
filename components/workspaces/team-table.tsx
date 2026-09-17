"use client"

import { useState } from "react"
import { MoreHorizontal, Search, UserPlus } from "lucide-react"
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"

export type Member = {
  id: string
  name: string
  email: string
  role: string
  active: boolean
}
export type Invitation = {
  id: string
  email: string
  role: string
  expires_at: string
  send_status: string
  revoked_at: string | null
}

export function TeamTable({
  members,
  invitations,
  userId,
  role,
  now,
  pending,
  onInvite,
  onMember,
  onTransfer,
  onResend,
  onRevoke,
}: {
  members: Member[]
  invitations: Invitation[]
  userId: string
  role: string
  now: number
  pending: boolean
  onInvite: () => void
  onMember: (member: Member, role: string) => void
  onTransfer: (member: Member) => void
  onResend: (invitation: Invitation) => void
  onRevoke: (invitation: Invitation) => void
}) {
  const [filter, setFilter] = useState("all"),
    [search, setSearch] = useState("")
  const manage = role === "owner" || role === "admin"
  const rows = [
    ...members.map((member) => ({
      key: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      status: member.active ? "active" : "pending",
      member,
      invitation: undefined as Invitation | undefined,
    })),
    ...invitations.map((invitation) => ({
      key: invitation.id,
      name: "",
      email: invitation.email,
      role: invitation.role,
      status: invitation.revoked_at
        ? "revoked"
        : Date.parse(invitation.expires_at) <= now
          ? "expired"
          : "pending",
      member: undefined as Member | undefined,
      invitation,
    })),
  ]
  const query = search.trim().toLowerCase()
  const filtered = rows.filter(
    (row) =>
      (filter === "all" || row.status === filter) &&
      `${row.name} ${row.email}`.toLowerCase().includes(query)
  )
  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <CardTitle>
            Team{" "}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {members.length} {members.length === 1 ? "member" : "members"}
            </span>
          </CardTitle>
          <CardDescription>
            Manage access and track invitations in one place.
          </CardDescription>
        </div>
        {manage && (
          <Button onClick={onInvite}>
            <UserPlus />
            Invite member
          </Button>
        )}
      </CardHeader>
      <CardContent className="min-w-0 space-y-5">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-0 flex-1 basis-52">
            <Label htmlFor="team-search" className="sr-only">
              Search team
            </Label>
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              id="team-search"
              placeholder="Search name or email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
          <div>
            <Label htmlFor="team-status" className="sr-only">
              Filter team status
            </Label>
            <NativeSelect
              id="team-status"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              {["all", "active", "pending", "expired", "revoked"].map(
                (value) => (
                  <NativeSelectOption key={value} value={value}>
                    {value === "all"
                      ? "All statuses"
                      : value[0].toUpperCase() + value.slice(1)}
                  </NativeSelectOption>
                )
              )}
            </NativeSelect>
          </div>
        </div>
        <div className="rounded-lg border">
          <Table aria-label="Workspace team">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Person</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Role</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!filtered.length && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-28 text-center text-muted-foreground"
                  >
                    {query
                      ? "No people match your search."
                      : `No ${filter === "all" ? "team entries" : filter + " people"} to show.`}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="max-w-32 py-4 pl-4 sm:max-w-56">
                    <p
                      className="truncate font-medium"
                      title={row.name || row.email}
                    >
                      {row.name || row.email}
                      {row.member?.id === userId && (
                        <span className="ml-2 hidden text-xs font-normal text-muted-foreground sm:inline">
                          You
                        </span>
                      )}
                    </p>
                    {row.name && (
                      <p
                        className="truncate text-sm text-muted-foreground"
                        title={row.email}
                      >
                        {row.email}
                      </p>
                    )}
                    <p className="mt-1 text-xs capitalize sm:hidden">
                      {row.role}
                      {row.member?.id === userId ? " · You" : ""}
                    </p>
                    {row.invitation && !row.invitation.revoked_at && (
                      <p className="mt-1 text-xs whitespace-normal text-muted-foreground">
                        {row.status === "expired"
                          ? "Link expired"
                          : `Expires ${new Date(row.invitation.expires_at).toLocaleDateString("en-US", { timeZone: "UTC" })}`}{" "}
                        ·{" "}
                        {row.invitation.send_status === "accepted"
                          ? "Sent"
                          : ["failed", "suppressed"].includes(
                                row.invitation.send_status
                              )
                            ? "Not sent"
                            : "Send status unknown"}
                      </p>
                    )}
                    {row.member && !row.member.active && (
                      <p className="mt-1 text-xs whitespace-normal text-muted-foreground">
                        Awaiting email verification
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.status === "active" ? "secondary" : "outline"
                      }
                      className="capitalize"
                    >
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden capitalize sm:table-cell">
                    {row.role}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    {manage && row.invitation && !row.invitation.revoked_at ? (
                      <>
                        <div className="hidden justify-end gap-1 sm:flex">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => onResend(row.invitation!)}
                          >
                            Resend
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => onRevoke(row.invitation!)}
                          >
                            Revoke
                          </Button>
                        </div>
                        <div className="sm:hidden">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  disabled={pending}
                                  aria-label={`Invitation actions for ${row.email}`}
                                />
                              }
                            >
                              <MoreHorizontal />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => onResend(row.invitation!)}
                              >
                                Resend
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onRevoke(row.invitation!)}
                              >
                                Revoke invitation
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </>
                    ) : manage &&
                      row.member &&
                      row.member.role !== "owner" &&
                      row.member.id !== userId ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              disabled={pending}
                              aria-label={`Manage ${row.name || row.email}`}
                            />
                          }
                        >
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {row.member.active && (
                            <DropdownMenuItem
                              onClick={() =>
                                onMember(
                                  row.member!,
                                  row.role === "admin" ? "member" : "admin"
                                )
                              }
                            >
                              Make {row.role === "admin" ? "member" : "admin"}
                            </DropdownMenuItem>
                          )}
                          {row.member.active && role === "owner" && (
                            <DropdownMenuItem
                              onClick={() => onTransfer(row.member!)}
                            >
                              Transfer ownership
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => onMember(row.member!, "remove")}
                          >
                            Revoke access
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <span
                        className="text-muted-foreground"
                        aria-label="No actions available"
                      >
                        —
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {manage
            ? "Invitations start as Members and expire after seven days. Role changes and ownership transfer are available after acceptance and email verification. Resending replaces the previous link."
            : "Only the workspace owner and admins can manage invitations and access."}
        </p>
      </CardContent>
    </Card>
  )
}
