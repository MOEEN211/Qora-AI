import Link from "next/link"
import {
  ArrowRight,
  Braces,
  Cable,
  Layers,
  LockKeyhole,
  KeyRound,
} from "lucide-react"
import { Card, type CardProps } from "fumadocs-ui/components/card"

const cardIcons = { api: Braces, mcp: Cable, key: KeyRound }

export function IconCard({
  icon,
  ...props
}: Omit<CardProps, "icon"> & { icon: keyof typeof cardIcons }) {
  const Icon = cardIcons[icon]
  return <Card {...props} icon={<Icon aria-hidden="true" />} />
}

export function Endpoint({
  method,
  path,
  permission = "Read",
}: {
  method: "GET" | "PATCH"
  path: string
  permission?: string
}) {
  return (
    <div className="docs-endpoint not-prose">
      <span className="docs-method" data-method={method}>
        {method}
      </span>
      <code>{path}</code>
      <span className="docs-permission">
        <LockKeyhole size={12} aria-hidden="true" />
        {permission}
      </span>
    </div>
  )
}

export function WorkspaceFlow() {
  return (
    <div
      className="docs-flow not-prose"
      aria-label="REST and MCP share the same workspace operations and permissions"
    >
      <div className="docs-flow-caption">
        <span>ONE WORKSPACE. TWO INTERFACES.</span>
        <span>Built to extend</span>
      </div>
      <div className="docs-flow-grid">
        <Link href="/docs/api" className="docs-flow-interface">
          <span className="docs-flow-label">
            <Braces size={17} aria-hidden="true" /> REST API{" "}
            <ArrowRight size={15} aria-hidden="true" />
          </span>
          <code>
            <span>GET</span> /workspace
          </code>
          <code>
            <span>PATCH</span> /workspace
          </code>
        </Link>
        <div className="docs-flow-workspace">
          <Layers size={23} strokeWidth={1.5} aria-hidden="true" />
          <strong>Your workspace</strong>
          <span>ID · Name · Details</span>
          <div>
            <LockKeyhole size={11} aria-hidden="true" /> Scoped access
          </div>
        </div>
        <Link href="/docs/mcp" className="docs-flow-interface">
          <span className="docs-flow-label">
            <Cable size={17} aria-hidden="true" /> MCP server{" "}
            <ArrowRight size={15} aria-hidden="true" />
          </span>
          <code>get_workspace</code>
          <code>rename_workspace</code>
        </Link>
      </div>
      <div className="docs-flow-footer">
        The same operations and permissions, wherever you connect.
      </div>
    </div>
  )
}
