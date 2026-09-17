import type { ApiKeyRow } from "@/components/settings/shared"
import type { Connection } from "./connections"

export type IntegrationsProps = {
  workspace: string
  workspaceId: string
  canManageKeys: boolean
  keys: ApiKeyRow[]
  keysUnavailable: boolean
  connections: Connection[]
  connectionsUnavailable: boolean
  now: number
  apiUrl: string
  initialTab?: string
}
