# @verlon-ai/mcp

[![npm version](https://img.shields.io/npm/v/%40verlon-ai%2Fmcp)](https://www.npmjs.com/package/@verlon-ai/mcp)
[![license](https://img.shields.io/npm/l/%40verlon-ai%2Fmcp)](./LICENSE)
[![CI](https://github.com/verlon-ai/mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/verlon-ai/mcp/actions/workflows/ci.yml)

Model Context Protocol server for [Verlon AI](https://verlon.ai). Exposes your Verlon resources (gates, logs, recommendations, experiments) as MCP tools so coding agents — Claude Code, Cursor, Cline, any MCP-compatible client — can inspect and manage your AI infrastructure natively.

**Status:** 0.3.2 — listed in the [MCP Registry](https://registry.modelcontextprotocol.io/) as `ai.verlon/mcp`. Ships 5 read-only tools (`list_gates`, `get_gate`, `list_logs`, `get_recommendations`, `list_experiments`). Write tools (`create_gate`, `update_gate`, `run_chat`, `start_experiment`) gated behind `--enable-writes` land in a future release.

## Install

You don't install it directly. Your MCP client (Claude Code, Cursor, etc.) spawns it as a subprocess via `npx`. Add the snippet below to your client's MCP config.

### Claude Code

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the equivalent on your OS:

```json
{
  "mcpServers": {
    "verlon": {
      "command": "npx",
      "args": ["-y", "@verlon-ai/mcp"],
      "env": {
        "VERLON_API_KEY": "sk-vrln-..."
      }
    }
  }
}
```

Then restart Claude Code. The `verlon` server should appear in the tools list, and Claude can call `verlon:list_gates` against your account.

### Cursor

Add to your Cursor MCP config (Settings → Features → MCP Servers):

```json
{
  "mcpServers": {
    "verlon": {
      "command": "npx",
      "args": ["-y", "@verlon-ai/mcp"],
      "env": {
        "VERLON_API_KEY": "sk-vrln-..."
      }
    }
  }
}
```

### Any other MCP-compatible client

The server speaks MCP over stdio. Spawn `npx -y @verlon-ai/mcp` with `VERLON_API_KEY` in the subprocess environment.

## Tools

All v0.3.x tools are **read-only** — see [Security note](#security-note) for the rationale and the planned write-tool opt-in.

| Tool | Inputs | What it returns |
|---|---|---|
| `list_gates` | _none_ | Every gate in the account — id, name, description, model, taskType, taskSubtype, createdAt |
| `get_gate` | `gateId` (UUID) | Full gate config — model, fallback chain, task type, spending limits, sub-gates, orchestration |
| `list_logs` | `gate?`, `since?` (ISO 8601), `success?`, `limit?` (1-100, default 20) | Recent request logs — timestamp, gate, model, cost, latency, success/failure |
| `get_recommendations` | `gateId` (UUID) | Cortex intelligence report — themes, drift detection, optimization recommendations. `{ report: null }` when no run has been produced yet |
| `list_experiments` | `gateId?`, `status?`, `projectId?` | Experiments (shadow + split) — id, name, status, test type, variants, goal metric, configuration |

## Configuration

| Env var | Required | Default | Notes |
|---|---|---|---|
| `VERLON_API_KEY` | Yes | — | Your Verlon API key (`sk-vrln-...`). |
| `VERLON_BASE_URL` | No | `https://api.verlon.ai` | Override for self-hosted Verlon. |

## CLI flags

| Flag | Purpose |
|---|---|
| `--enable-writes` | Register write-capable tools. **Phase 3+ feature.** In 0.1.x this flag is accepted but no write tools exist yet. Default is read-only — a misaligned agent can't accidentally destroy resources. |
| `--help`, `-h` | Print usage. |

## Security note

Read-only by default is a deliberate choice. The MCP client (Claude Code, Cursor, etc.) sees this server's tools and may invoke them autonomously when a user's request makes them seem relevant. A read-only default means even a misaligned agent can only inspect your account, not modify it. Opt in to write tools (`--enable-writes`, Phase 3+) only after you understand the implications.

## Development

```bash
npm install
npm test          # vitest
npm run build     # tsc → dist/
```

## Publishing (maintainers)

The package is dual-published: to npm as `@verlon-ai/mcp` (automated, with provenance), and to the MCP Registry as `ai.verlon/mcp` (manual). The registry validates that the npm version exists before accepting a publish, so **npm always goes first**.

### Per-release flow

Bump versions in **lockstep** across three files — CI fails on drift:

| File | Field |
|---|---|
| `package.json` | `version` |
| `server.json` | `version` AND `packages[0].version` |
| `src/server.ts` | `VERLON_MCP_VERSION` constant |

Then:

```bash
# 1. Merge the bump to main (CI enforces the lockstep), then tag:
git tag v0.3.1 && git push origin v0.3.1
# The publish workflow runs `npm publish --provenance` automatically.

# Wait ~30s for npm CDN; verify:
npm view @verlon-ai/mcp version   # should print the new version

# 2. MCP Registry publish (manual — needs mcp-publisher + DNS-verified ai.verlon namespace)
npm run publish:mcp
```

### One-time setup (registry publishing)

```bash
# Install the MCP Registry publisher (NOT npm — it's a prebuilt binary)
brew install mcp-publisher

# DNS-verify the verlon.ai domain (required to publish under the ai.verlon namespace)
mcp-publisher login --help   # follow the DNS verification flow it prints
# Add the TXT record on verlon.ai; verify with `dig TXT verlon.ai +short`
```

### Verification

```bash
# All three versions match?
npm view @verlon-ai/mcp version
jq -r .packages[0].version server.json
grep VERLON_MCP_VERSION src/server.ts

# Registry listing live?
curl 'https://registry.modelcontextprotocol.io/v0/servers?search=verlon' | jq

# End-to-end smoke against the published artifact
VERLON_API_KEY=sk-vrln-... npx @modelcontextprotocol/inspector npx -y @verlon-ai/mcp
```

## License

MIT — see [LICENSE](./LICENSE).
