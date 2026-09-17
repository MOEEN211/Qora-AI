"use client"
import { PanelsTopLeft } from "lucide-react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"

export function WorkspaceLogo({
  name,
  url,
  large = false,
}: {
  name: string
  url?: string | null
  large?: boolean
}) {
  return (
    <Avatar
      className={`${large ? "size-20" : "size-8"} rounded-md after:rounded-md`}
    >
      <AvatarImage
        src={url || undefined}
        alt={`${name} logo`}
        className="rounded-md"
      />
      <AvatarFallback className="rounded-md">
        <PanelsTopLeft className={large ? "size-7" : "size-4"} />
      </AvatarFallback>
    </Avatar>
  )
}
