# TraceMemo WeChat Connector

This repository-local service provides the minimal WeChat bridge required by TraceMemo:

- QR-code login with a single persisted credential
- account discovery
- inbound long polling and authenticated webhook delivery
- local HTTP health and send endpoints
- text and local/remote media sending

The executable is managed by the Electron main process. It is not a general-purpose agent runtime and does not load external AI command-line tools.

## Commands

`POST /api/send` requires `Authorization: Bearer <WECHAT_CONNECTOR_API_TOKEN>`.
Electron generates and supplies a process-scoped token automatically. For standalone
use, set `WECHAT_CONNECTOR_API_TOKEN` explicitly; an unset token disables sending.
Text is sent as text only: Markdown image URLs are no longer downloaded or sent
implicitly. Explicit `media_url` is a separate caller-authorized attachment.
`GET /api/capabilities` reports `native_forward: false`; merged chat records are
not supported. A successful API response confirms submission, not recipient delivery.

```bash
go run . login --json
go run . accounts --json
go run . start --foreground --api-addr 127.0.0.1:18011 --account-id <account-id>
```

Credential and synchronization state is stored under `~/.wechatexplorer/wechat-connector/accounts`. This legacy directory name is intentionally retained so upgrades can reuse existing accounts. A successful login is written before the older credential and synchronization state are removed, so an incomplete login cannot destroy the last working credential.

## Attribution

Low-level protocol and media transport portions are distributed under the MIT license in [LICENSE](LICENSE). TraceMemo-specific process management, webhook contract, product UI, and Agent Hub behavior live in the surrounding TraceMemo project.
