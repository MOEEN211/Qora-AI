import "server-only"
import { asMarkdown } from "fumadocs-core/server"
import type { MDXComponents } from "mdx/types"
import type { ComponentProps, ReactNode } from "react"
import type { TypeTable } from "fumadocs-ui/components/type-table"
import type { Endpoint } from "./overview"

function Block({ children }: { children?: ReactNode }) {
  asMarkdown()
  return <div>{children}</div>
}

function TitledBlock({
  title,
  children,
}: {
  title?: ReactNode
  children?: ReactNode
}) {
  asMarkdown()
  return (
    <div>
      {title && (
        <p>
          <strong>{title}</strong>
        </p>
      )}
      {children}
    </div>
  )
}

function MarkdownCard({
  title,
  href,
  children,
}: {
  title?: ReactNode
  href?: string
  children?: ReactNode
}) {
  asMarkdown()
  return (
    <div>
      <p>
        <a href={href}>{title}</a>
      </p>
      {children}
    </div>
  )
}

// Use server renderers so Markdown exports retain the content of interactive UI.
export const markdownComponents: MDXComponents = {
  Cards: Block,
  Steps: Block,
  Step: Block,
  Tabs: Block,
  Accordions: Block,
  Files: Block,
  Callout: TitledBlock,
  Accordion: TitledBlock,
  Card: MarkdownCard,
  IconCard: MarkdownCard,
  Tab({ value, children }) {
    asMarkdown()
    return (
      <div>
        <p>
          <strong>{value}</strong>
        </p>
        {children}
      </div>
    )
  },
  Folder({ name, children }) {
    asMarkdown()
    return (
      <div>
        <p>
          <strong>{name}/</strong>
        </p>
        {children}
      </div>
    )
  },
  File({ name }) {
    asMarkdown()
    return (
      <p>
        <code>{name}</code>
      </p>
    )
  },
  TypeTable({ type }: ComponentProps<typeof TypeTable>) {
    asMarkdown()
    return (
      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>Type</th>
            <th>Required</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(type).map(([name, field]) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{field.type}</td>
              <td>{field.required ? "Yes" : "No"}</td>
              <td>{field.default ?? "—"}</td>
              <td>{field.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  },
  Endpoint({
    method,
    path,
    permission = "Read",
  }: ComponentProps<typeof Endpoint>) {
    asMarkdown()
    return (
      <p>
        <code>
          {method} {path}
        </code>{" "}
        — {permission} permission.
      </p>
    )
  },
  WorkspaceFlow() {
    asMarkdown()
    return (
      <p>
        REST and MCP share workspace read and rename operations. Every
        connection is scoped to one workspace with explicit permissions.
      </p>
    )
  },
}
