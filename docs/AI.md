# Workspace AI chat

Each workspace receives **100 credits once when created**, shared by its current members. Existing workspaces receive the same one-time grant when AI is first installed. There is no subscription requirement, billing renewal, expiration, mode-specific balance, plan-based allowance, top-up or automatic refill. Joining a workspace does not grant credits. Workspace subscriptions remain separate and do not affect this balance.

## Configuration

Supply `OPENROUTER_API_KEY` and optionally `AI_MODEL` in `.env`. The default model remains `openai/gpt-4.1-mini`. Its system prompt focuses on SaaS applications, product ideas and project-related questions, requesting short plain-text paragraphs or numbered lists without asterisks, Markdown headings or code fences. This is a model instruction, not a text filter; existing saved responses are preserved. On an existing kickstart-managed application, run `npm run kickstart:ai -- --check`, then `npm run kickstart:ai`. This checks the configured hosted project, matching receipt, migration checksums, Supabase application keys and OpenRouter key/model before any writes. It installs only AI migrations, verifies permissions/recovery, and saves `AI_ENABLED=true` after successful installation. Reruns preserve balances and history. Restart the app if the server has not reloaded its environment.

Full application kickstart also installs AI when `AI_ENABLED=true`; its other enabled services still require their own credentials. AI-only installation does not provision Stripe or alter billing settings. Initial core installation still uses normal kickstart.

The OpenRouter key stays on the Next.js server. Never use a `NEXT_PUBLIC_` variable or copy it into email functions. Read-only preflight sends no generation; actual provider availability, routing and costs require a real request. OpenRouter account funding is separate from workspace credits.

## Chat interface

The chatbot fills the available viewport without a containing card. New chat and History sit together in the page header. History opens a centered, keyboard-accessible popup on desktop and mobile. It shows compact, icon-free dated conversation rows, the current chat, loading/error/empty states and Load more conversations. Search matches conversation titles across all of the workspace's saved chats, including older pages. Search is case-insensitive and literal, limited to 120 characters; responses are cursor-paginated, debounced and canceled when superseded. Messages scroll independently and the input stays at the bottom. The loading skeleton has the same padding as other dashboard pages. User and assistant messages have distinct stable UI IDs so the user message remains visible during streaming.

New chat opens a blank conversation without creating an empty database record. Typing a message or selecting Brainstorm, SaaS ideas, Write something or Make a plan creates the saved chat and streams a real response. Prompt buttons use the same credit, failure and persistence rules as typed messages. Enter sends; Shift+Enter adds a line; composing input is respected.

## Credit and generation policy

- One completed response costs one credit. Provider failure, Stop, timeout and abandoned requests release their reservation. Provider costs may still occur and are recorded separately when returned.
- `private.ai_credit_accounts.allowance` has the sole initial-grant default (100), defined in the versioned AI SQL migration. The organization insertion trigger covers ordinary signup, explicit workspace creation and fallback creation. The installation backfill uses the same default and does not overwrite existing rows. Released migrations are immutable; future changes require an additive migration.
- No generation starts at zero available credits. Reading history, changing members, switching billing modes, renewing a subscription or rerunning setup cannot replenish credits.
- Messages are limited to 4,000 characters, server-loaded context to 16,000 characters and ten completed turns, and generation to 1,024 output tokens / 90 seconds. Character limits do not imply token counts.
- At most one response streams per conversation, three per workspace and ten attempts per member/workspace/minute. Cancellation does not erase an attempt from rate-limit history.

## Storage and failure recovery

Private RLS-enabled `ai_chats`, `ai_generations` and `ai_credit_accounts` tables have no direct browser privileges. History RPCs verify identity and current membership. Reservation/settlement RPCs are service-only; schema usage lets the invoker resolve its narrowly granted private function without granting table access. The organization row serializes reservation, recovery and completion.

Each generation has a request UUID and server-only lease. Replaying a request cannot reserve again or start another provider call. Successful output and its charge commit together. Terminal requests cannot be charged twice. Explicit Stop releases its reservation immediately; late provider accounting can fill missing usage but cannot change status or charge.

Streaming text is checkpointed at most once per second. Refresh loads saved progress and polls unfinished responses; it does not reconnect to the token stream. A crash can lose text since the last checkpoint. PostgreSQL Cron recovers reservations older than 150 seconds every minute; history and reservation calls also recover expired records. Late completion cannot charge a released reservation.

Provider ID, model, tokens and USD costs are saved when reported. Missing usage remains null, not zero. Provider charges cannot always be reconstructed after a process crash. `credits_charged` records the independent workspace credit charge. Retrying is an explicit new request with a new UUID.

Conversation and turn history use `(created_at,id)` cursors, with 20 visible rows per page. Workspace deletion cascades to AI history and balance. User deletion preserves conversations in surviving shared workspaces and clears author references. Existing subscription deletion guards remain applicable to workspace deletion.

## Customization and removal

Edit the prompt/context policy in `lib/ai/config.mjs`, provider integration in `app/api/ai/chat/route.ts` and UI in `components/ai/chat.tsx`. The model has no tools or workspace database credentials.

Setting `AI_ENABLED=false` hides navigation and stops new provider requests after the server reloads. History and balances remain stored; re-enabling does not grant credits again. To remove the example:

1. Remove AI navigation, the chat-route layout condition in `components/dashboard/app-shell.tsx`, and the AI flag wiring from the dashboard layout.
2. Remove `app/dashboard/chat`, `app/api/ai`, `app/preview/chat`, `components/ai`, `lib/ai`, and AI-specific tests/scripts.
3. Remove the OpenRouter probe, `checkAI`/`verifyAI` imports and AI verification step from kickstart. Remove `scripts/kickstart/ai.mjs`, `scripts/kickstart/install-ai.mjs`, the `kickstart:ai` package script and AI environment/deployment variables. Billing has no AI fields or function dependencies.
4. Uninstall `ai`, `@ai-sdk/react` and `@openrouter/ai-sdk-provider`; update the lockfile.
5. Preserve released migrations and checksums. For an installed database, use an additive cleanup migration: unschedule only `forma-ai-recovery`, drop `on_workspace_created_ai` on `public.organizations`, drop the optional `private.operator_ai_usage(jsonb)` reporting adapter if present, then remove the AI public/private functions (including ai_search_chats) and AI tables. Remove the grant trigger before its table so signup/workspace creation continues working. Keep shared extensions and schema permissions used by other modules. Core admin dynamically checks for the adapter and shows AI usage unavailable when absent; no other admin section depends on AI tables. The scoped admin installer skips AI reporting when AI is disabled.
6. Run static/build checks, hosted isolation tests, signup, workspace creation/switching and actual Checkout/Portal verification. A successful build alone does not prove billing acceptance.

## Verification

Run `node scripts/test-ai-hosted.mjs`, `node scripts/test-ai-concurrency.mjs` and, with `RUN_HOSTED_AI=true`, `npm run test:ui -- tests/e2e/ai.live.spec.ts`. The target must explicitly match `HOSTED_TEST_PROJECT_REF` and `SUPABASE_PROJECT_REF`; use a dedicated hosted test project. Fixtures are scoped and cleaned up.

Verify streaming/history, concurrent quota use, failures, Stop/Retry and core auth/workspace/Checkout/Portal flows after removal. Static builds and mocked provider tests do not establish those real-provider acceptance results; record them in [PLAN.md](PLAN.md).
