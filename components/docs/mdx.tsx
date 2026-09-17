import defaultMdxComponents from "fumadocs-ui/mdx"
import { Tab, Tabs } from "fumadocs-ui/components/tabs"
import { Step, Steps } from "fumadocs-ui/components/steps"
import { Accordion, Accordions } from "fumadocs-ui/components/accordion"
import { File, Files, Folder } from "fumadocs-ui/components/files"
import { TypeTable } from "fumadocs-ui/components/type-table"
import type { MDXComponents } from "mdx/types"
import { Endpoint, IconCard, WorkspaceFlow } from "./overview"

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Tab,
    Tabs,
    Step,
    Steps,
    Accordion,
    Accordions,
    File,
    Files,
    Folder,
    TypeTable,
    IconCard,
    Endpoint,
    WorkspaceFlow,
    ...components,
  }
}
