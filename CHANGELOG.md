# Changelog

## 0.0.1 — buyer repository preparation (2026-09-16)

- Synchronized the current starter source, including three-credential hosted bootstrap and account onboarding.
- Added buyer setup instructions, an actual architecture map, safe coding-agent instructions and installation-specific acceptance tracking.
- Added the Ship & Scale commercial source license and third-party notices.
- Excluded seller planning records, credentials, setup receipts, screenshots and local work folders from the current buyer tree.
- Added a provider-secret-free verification workflow example and a source ZIP export boundary. CI activation requires workflow-write permission; the example is not an active workflow.

Verification on the clean buyer copy: `npm ci` installed 915 packages; all 122 local tests, lint, production build, TypeScript and `check:release` passed without provider credentials. No fresh hosted resources were provisioned.

This is a prepared starter candidate, not certification of every hosted integration. Separate-buyer provisioning, complete payment/webhook lifecycle and the provider acceptance items in [docs/PLAN.md](docs/PLAN.md) remain open. See that file before launching your product. The external starter manual URL is https://shipandscale.dev/docs; publication is managed separately from this repository.
