"use client"

import { useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleCheck,
  Fingerprint,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  PanelLeft,
  Plug,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const members = [
  {
    initials: "JD",
    name: "Jamie Davis",
    email: "jamie@example.com",
    role: "Owner",
  },
  {
    initials: "AL",
    name: "Alex Lee",
    email: "alex@example.com",
    role: "Admin",
  },
  { initials: "SK", name: "Sam Kim", email: "sam@example.com", role: "Member" },
]

export function ProductExplorer({ brand }: { brand: string }) {
  const [workspace, setWorkspace] = useState("Acme Studio")
  const [draft, setDraft] = useState(workspace)
  const [saved, setSaved] = useState(false)
  return (
    <div id="demo" className="product-explorer">
      <Tabs defaultValue="overview">
        <div className="explorer-toolbar">
          <span className="explorer-label">
            <span className="status-dot" /> Explore the SaaS dashboard
          </span>
          <TabsList aria-label="Product preview" className="explorer-tabs">
            <TabsTrigger value="overview">
              <LayoutDashboard /> Overview
            </TabsTrigger>
            <TabsTrigger value="chat">
              <MessageSquare /> AI chatbot
            </TabsTrigger>
            <TabsTrigger value="workspace">
              <Users /> Workspace
            </TabsTrigger>
            <TabsTrigger value="integrations">
              <Plug /> Integrations
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings2 /> Settings
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="demo-window">
          <aside
            className="demo-sidebar"
            aria-label="Preview workspace summary"
          >
            <div className="demo-brand">
              <span className="brand-mark" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              {brand}
            </div>
            <div className="demo-workspace">
              <span className="demo-workspace-icon">
                {workspace.charAt(0).toUpperCase()}
              </span>
              <span>
                {workspace}
                <small>Personal workspace</small>
              </span>
              <ChevronDown size={13} />
            </div>
            <p className="demo-nav-caption">WORKSPACE</p>
            <div className="demo-nav-item">
              <LayoutDashboard size={15} /> Overview
            </div>
            <div className="demo-nav-item">
              <MessageSquare size={15} /> AI chatbot
            </div>
            <div className="demo-nav-item">
              <Users size={15} /> Workspace
            </div>
            <div className="demo-nav-item">
              <Plug size={15} /> Integrations
            </div>
            <div className="demo-nav-item">
              <Settings2 size={15} /> Settings
            </div>
            <div className="demo-sidebar-bottom">
              <span className="sample-avatar">JD</span>
              <span>
                Jamie Davis<small>Personal account</small>
              </span>
            </div>
          </aside>
          <div className="demo-main">
            <div className="demo-topbar">
              <span>
                <PanelLeft size={15} />
                <span className="demo-topbar-divider" />
                {workspace}
              </span>
              <span className="demo-sample-badge">Sample workspace</span>
            </div>
            <TabsContent value="overview" className="demo-content">
              <div className="demo-title-row">
                <div>
                  <span className="demo-eyebrow">YOUR OVERVIEW</span>
                  <h3>Workspace overview</h3>
                  <p>Manage your workspace, team, and account.</p>
                </div>
                <span className="demo-verified">
                  <ShieldCheck size={12} /> Email verified
                </span>
              </div>
              <div className="demo-workspace-card">
                <div>
                  <Settings2 size={20} />
                  <small>Your workspace</small>
                  <h4>{workspace}</h4>
                  <p>
                    Manage your team and workspace settings.
                    <br />
                    Switch between organizations from the sidebar.
                  </p>
                  <Link href="/signup">
                    Create your workspace <ArrowUpRight size={13} />
                  </Link>
                </div>
                <div className="demo-sculpture" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="demo-summary">
                <div>
                  <Users size={16} />
                  <span>
                    Team members<strong>3 people</strong>
                  </span>
                </div>
                <div>
                  <Fingerprint size={16} />
                  <span>
                    Your role<strong>Workspace owner</strong>
                  </span>
                </div>
                <div>
                  <CircleCheck size={16} />
                  <span>
                    Account status<strong>All set</strong>
                  </span>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="chat" className="demo-content">
              <div className="demo-title-row">
                <div>
                  <span className="demo-eyebrow">YOUR AI ASSISTANT</span>
                  <h3>AI chatbot</h3>
                  <p>Brainstorm ideas and build your next SaaS.</p>
                </div>
                <span className="role-pill">100 credits</span>
              </div>
              <div
                className="demo-chat-messages"
                aria-label="Sample conversation"
              >
                <p className="demo-chat-user">
                  Help me plan a client portal for my studio.
                </p>
                <div className="demo-chat-answer">
                  <MessageSquare size={17} />
                  <div>
                    <strong>
                      Start with one shared place for every project.
                    </strong>
                    <p>
                      Give each client a workspace for their projects, feedback,
                      and approvals. Start with a project overview and a simple
                      way to request feedback.
                    </p>
                    <p>
                      Then add file sharing and deadline reminders as your
                      studio grows.
                    </p>
                  </div>
                </div>
              </div>
              <div className="demo-chat-composer">
                <span>What would you like to build?</span>
                <Link href="/dashboard/chat" aria-label="Open the AI chatbot">
                  <ArrowUpRight size={16} />
                </Link>
              </div>
              <p className="demo-preview-caption">
                Sample conversation · open the application to start chatting.
              </p>
            </TabsContent>
            <TabsContent value="workspace" className="demo-content">
              <div className="demo-title-row">
                <div>
                  <span className="demo-eyebrow">TEAM MANAGEMENT</span>
                  <h3>Team members and roles</h3>
                  <p>View members and their workspace permissions.</p>
                </div>
              </div>
              <div className="demo-team-table">
                <div className="demo-table-heading">
                  <span>Team member</span>
                  <span>Role</span>
                </div>
                {members.map((member) => (
                  <div className="demo-member" key={member.initials}>
                    <span className="sample-avatar">{member.initials}</span>
                    <span>
                      {member.name}
                      <small>{member.email}</small>
                    </span>
                    <span className="role-pill">{member.role}</span>
                  </div>
                ))}
              </div>
              <div className="demo-note">
                <ShieldCheck size={16} />
                <p>
                  Owners, admins, and members have distinct permissions.
                  Workspace access is checked on the server.
                </p>
              </div>
              <Link className="demo-text-link" href="/docs">
                See how workspaces work <ArrowRight size={14} />
              </Link>
            </TabsContent>
            <TabsContent value="integrations" className="demo-content">
              <div className="demo-title-row">
                <div>
                  <span className="demo-eyebrow">
                    CONNECTED TO YOUR WORKSPACE
                  </span>
                  <h3>Integrations</h3>
                  <p>Connect your tools and AI assistants to {workspace}.</p>
                </div>
              </div>
              <Tabs defaultValue="api">
                <TabsList aria-label="Integration preview">
                  <TabsTrigger value="api">API keys</TabsTrigger>
                  <TabsTrigger value="mcp">MCP</TabsTrigger>
                </TabsList>
                <TabsContent value="api" className="demo-integration-panel">
                  <div className="demo-integration-heading">
                    <KeyRound size={19} />
                    <div>
                      <h4>Workspace API keys</h4>
                      <p>
                        Give your applications scoped access to your workspace.
                      </p>
                    </div>
                  </div>
                  <div className="demo-key-row">
                    <div>
                      <strong>Studio automation</strong>
                      <small>Created by Jamie Davis</small>
                    </div>
                    <code>•••• •••• •••• demo</code>
                    <span className="role-pill">Active</span>
                  </div>
                  <div className="demo-note">
                    <ShieldCheck size={16} />
                    <p>
                      Create and revoke keys with workspace permissions and
                      access scopes.
                    </p>
                  </div>
                  <Link className="demo-text-link" href="/docs/api">
                    Explore the API <ArrowRight size={14} />
                  </Link>
                </TabsContent>
                <TabsContent value="mcp" className="demo-integration-panel">
                  <div className="demo-integration-heading">
                    <Plug size={19} />
                    <div>
                      <h4>Connect your AI assistant</h4>
                      <p>
                        Use MCP to work with your workspace from your assistant.
                      </p>
                    </div>
                  </div>
                  <div className="demo-key-row">
                    <div>
                      <strong>AI assistant</strong>
                      <small>Example authorized connection</small>
                    </div>
                    <span className="role-pill">Workspace access</span>
                  </div>
                  <div className="demo-note">
                    <ShieldCheck size={16} />
                    <p>
                      Authorize a workspace, review access, and revoke
                      connections when you need to.
                    </p>
                  </div>
                  <Link className="demo-text-link" href="/docs/mcp">
                    Explore MCP connections <ArrowRight size={14} />
                  </Link>
                </TabsContent>
              </Tabs>
            </TabsContent>
            <TabsContent value="settings" className="demo-content">
              <div className="demo-title-row">
                <div>
                  <span className="demo-eyebrow">WORKSPACE SETTINGS</span>
                  <h3>Edit workspace details</h3>
                  <p>Try changing the workspace name in this preview.</p>
                </div>
              </div>
              <form
                className="demo-settings-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  const name = draft.trim()
                  if (name) {
                    setWorkspace(name)
                    setDraft(name)
                    setSaved(true)
                  }
                }}
              >
                <label htmlFor="preview-workspace-name">Workspace name</label>
                <input
                  id="preview-workspace-name"
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value)
                    setSaved(false)
                  }}
                  maxLength={40}
                  required
                />
                <p>
                  This changes the sample only. Nothing is saved to an account.
                </p>
                <button
                  type="submit"
                  className="marketing-button marketing-button-dark"
                  disabled={!draft.trim()}
                >
                  Save preview <Check size={14} />
                </button>
                <span className="demo-save-status" role="status">
                  {saved ? "Updated. See your new name in Overview." : ""}
                </span>
              </form>
              <div className="demo-note">
                <KeyRound size={16} />
                <p>
                  The application also includes profile, password, notification,
                  and billing settings.
                </p>
              </div>
            </TabsContent>
          </div>
        </div>
      </Tabs>
      <div className="explorer-footnote">
        <span>Interactive preview · sample data</span>
        <Link href="/signup">
          Try the application <ArrowUpRight size={13} />
        </Link>
      </div>
    </div>
  )
}
