import Link from "next/link"
import { BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"

export function DocumentationButton({ surface }: { surface: "api" | "mcp" }) {
  return (
    <Button
      nativeButton={false}
      variant="outline"
      className="shrink-0 sm:w-56"
      aria-label={`Open ${surface === "api" ? "API" : "MCP"} documentation`}
      render={<Link href={`/docs/${surface}`} />}
    >
      <BookOpen aria-hidden="true" />
      <span className="hidden sm:inline">
        Open {surface === "api" ? "API" : "MCP"} documentation
      </span>
      <span className="sm:hidden">
        {surface === "api" ? "API" : "MCP"} docs
      </span>
    </Button>
  )
}
