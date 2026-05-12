# Windsurf Assistant

> 反者道之动 · 弱者道之用 · 天下之物生于有 · 有生于无

A fully decentralized Windsurf reverse-proxy.
**One GitHub fork. One web page. One VM. Zero npm dependencies.**

Each user runs their own VM with their own account, their own IP, their own
fingerprint. The web UI lives on the user's own GitHub Pages. Browsers talk
directly to the VM &mdash; no relay server, no middleman, no central authority.

```
   ┌─────────────────────────────────────────────────────────────┐
   │  github.com/<your-user>/windsurf-assistant   (your fork)    │
   │   ├─ Pages    →  https://<your-user>.github.io/<repo>/      │
   │   ├─ Actions  →  auto-deploy on push                        │
   │   └─ Repo     →  source                                     │
   └────────────────────────┬────────────────────────────────────┘
                            │ visit
                            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  Browser (your device · all config in localStorage)         │
   │  └─ direct HTTPS, with Authorization: Bearer sk-ws-proxy-*  │
   └────────────────────────┬────────────────────────────────────┘
                            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  fleet_vm_unit.js (Devin Cloud / VPS / EC2 / Pi / anywhere) │
   │  ├─ Node.js zero-dep proxy (5 .js files, builtins only)     │
   │  ├─ OpenAI /v1 compatible · SSE streaming                   │
   │  └─ cloudflared tunnel → public HTTPS URL                   │
   └────────────────────────┬────────────────────────────────────┘
                            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  Windsurf Cloud · inference.codeium.com                     │
   └─────────────────────────────────────────────────────────────┘
```

---

## Three Steps to Self-Host

### 1. Fork & enable Pages

1. **Fork** this repo to your GitHub account.
2. Go to your fork → **Settings → Pages → Source: GitHub Actions**.
   The included `deploy-pages.yml` workflow auto-deploys on every push to `web/`.
3. Push any change (or just wait — initial fork triggers the action).
4. Visit **`https://<your-username>.github.io/windsurf-assistant/`**.

The web UI auto-detects your fork's owner/repo from `location.hostname` and
`location.pathname`. No hardcoded names anywhere &mdash; soft-coded, "适配一切".

### 2. Provision a VM & deploy the unit

On any machine with `curl` + `git` + `node >= 18` (Devin Cloud workspace,
EC2, RPi, your laptop, anywhere):

```bash
curl -sL https://raw.githubusercontent.com/<your-user>/windsurf-assistant/main/scripts/devin-bootstrap.sh | \
  DAO_API_KEY="sk-ws-01-YOUR_WINDSURF_KEY" \
  DAO_AUTH_KEY="sk-ws-proxy-RANDOM_LONG_SECRET" \
  DAO_TUNNEL=yes \
  bash
```

The script installs Node.js if missing, clones your fork, writes
`~/.dao/accounts.json`, starts a `cloudflared` tunnel, and launches
`fleet_vm_unit.js` with your auth-key.

The last lines of the bootstrap log will look like:

```
══════════════════════════════════════════════════════════════
  REVERSE-PROXY READY · 反者道之动
══════════════════════════════════════════════════════════════
  Public URL : https://hippopotamus-XXXX.trycloudflare.com
  Local URL  : http://localhost:7862
  Auth Key   : sk-ws-proxy-RANDOM_LONG_SECRET
  OpenAI cli : base_url=https://hippopotamus-XXXX.trycloudflare.com/v1  api_key=sk-ws-proxy-RANDOM_LONG_SECRET
══════════════════════════════════════════════════════════════
```

> **Even simpler &mdash; let the web UI do it for you**:
> Open the Deploy tab in your hosted page. It generates a Devin task with
> your account + a freshly-generated `sk-ws-proxy-*` already embedded.
> Paste the task into Devin Chat and Devin executes & reports the URL back.

### 3. Plug the credentials into anything OpenAI-compatible

Open the **API tab** in your web page. It shows:

```
Base URL : https://hippopotamus-XXXX.trycloudflare.com/v1
API Key  : sk-ws-proxy-RANDOM_LONG_SECRET
Models   : 54 models
```

Drop those into ChatGPT clients (LobeChat, OpenWebUI, NextChat, Cherry Studio,
…), `openai` Python/JS SDK, Continue.dev, Aider, Cursor's "OpenAI override",
anything that speaks OpenAI &mdash; instant Windsurf access.

### 3.5. Even simpler &mdash; one-click API key from email + password (印 64)

No Windsurf API key on hand? The Setup tab has a **"Windsurf 账号底层 · 一键取 sk-*"**
card. Enter your Windsurf email + password &mdash; the VM walks the four-step
auth chain (`login → postauth → register → status`) on your behalf and the
web page auto-fills `cfg-apikey` with a fresh `sk-ws-*`.

Requires the VM to be started with `--allow-auth` (or `DAO_ALLOW_AUTH=1`),
off by default for safety. The password leaves your browser only to your
own VM; it is **never persisted** unless you explicitly tick "Remember password".

---

## Repository Layout

| Path | Purpose |
|------|---------|
| [`web/index.html`](web/index.html) | The single-page web UI &mdash; 5 tabs (Setup · Chat · API · Deploy · Docs). No build, no npm, no CDN. |
| [`packages/dao-core/`](packages/dao-core/) | The cloud reverse-proxy &mdash; 5 `.js` files, Node.js builtins only, no `package-lock.json`. |
| [`scripts/devin-bootstrap.sh`](scripts/devin-bootstrap.sh) | One-line VM bootstrap &mdash; installs Node, clones, writes config, launches unit + tunnel. |
| [`tests/`](tests/) | Self-contained Node test suite &mdash; 145 assertions, 0 deps, runs in ~3s. |
| [`.github/workflows/`](.github/workflows/) | `deploy-pages.yml` (Pages on `web/**`) + `test-core.yml` (test on every PR). |
| [`packages/wam/`](packages/wam/) | *Optional* Windsurf extension for in-IDE account rotation. Not required for the cloud-proxy flow. |
| [`packages/dao-proxy-min/`](packages/dao-proxy-min/) | *Optional* Cascade Connect-RPC extension. Not required for the cloud-proxy flow. |

The cloud-proxy flow needs only `web/`, `packages/dao-core/`, and
`scripts/devin-bootstrap.sh`. The two extensions are kept for users who
prefer an in-editor experience.

---

## API Endpoints (`fleet_vm_unit.js`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/v1/chat/completions` | gated | OpenAI-compatible chat &middot; SSE streaming with 15s heartbeat (印 64) |
| `GET`  | `/v1/models`           | gated | Model list (54+ models) |
| `GET`  | `/quota`               | gated | Real-time daily/weekly quota |
| `GET`  | `/stats`               | gated | Latency p50/p95/p99 over 1m/10m/1h windows (印 64) |
| `GET`  | `/health`              | public | Health, uptime, `authRequired`, `authAllowed`, `sseActive`, `draining` |
| `GET`  | `/fleet/info`          | public | Unit metadata for fleet discovery |
| `POST` | `/auth/login`          | gated + `--allow-auth` | Step 1 &middot; email + password → auth1 token (印 64) |
| `POST` | `/auth/postauth`       | gated + `--allow-auth` | Step 2 &middot; auth1 → sessionToken (印 64) |
| `POST` | `/auth/register`       | gated + `--allow-auth` | Step 3 &middot; sessionToken → `sk-ws-*` (印 64) |
| `POST` | `/auth/status`         | gated + `--allow-auth` | Step 4 &middot; `sk-ws-*` → quota (印 64) |
| `POST` | `/auth/auto`           | gated + `--allow-auth` | All four steps in one call (印 64) |

**Auth**: when `--auth-key` (or `DAO_AUTH_KEY`) is set, `/v1/*` and `/quota`
require `Authorization: Bearer <key>`. Multiple keys can be passed
comma-separated. `/health` and `/fleet/info` always stay public so probes /
load-balancers can monitor without secrets. When `DAO_AUTH_KEY` is empty,
the unit runs in *open mode* (local dev only &mdash; never expose to the
public Internet).

Three header forms are accepted:

```
Authorization: Bearer sk-ws-proxy-XXX     # standard
X-Api-Key: sk-ws-proxy-XXX                # for clients that strip Auth
?api_key=sk-ws-proxy-XXX                  # last resort, query string
```

---

## Zero Dependencies

* **`packages/dao-core/`**: no `dependencies` in `package.json`, no
  `node_modules`, no `package-lock.json`. Only Node.js builtins
  (`http`, `https`, `crypto`, `fs`, `path`, `os`, `dns`, `child_process`).
  CI enforces this on every push.
* **`web/index.html`**: single file, no `<script src="…"`, no
  `<link href="…stylesheet"`, no `@import`, no Google Fonts, no
  jsdelivr/unpkg/cdnjs/ajax.googleapis. Static-audit test verifies this.
* **`scripts/devin-bootstrap.sh`**: pure bash + curl. No package manager
  beyond the system one (apt/yum/apk) for installing Node.js if missing.
* **`tunnel`**: `cloudflared` is one optional binary. Free Tier, no signup.

---

## Testing

```bash
node tests/run_all.cjs
```

Runs three independent suites in fresh sub-processes:

| Suite | Asserts | Time | What it checks |
|-------|---------|------|----------------|
| `_web_static_audit.cjs`  | 72  | ~70ms   | 5 tabs, key DOM ids, soft-coded repo, zero CDN, OpenAI examples present |
| `_dao_core_syntax.cjs`   | 47  | ~600ms  | 5 files parse, all expected exports present, fleet_controller logic, zero deps |
| `_auth_smoke.cjs`        | 26  | ~2.3s   | Spawns `fleet_vm_unit`, validates `--auth-key` gate, CORS preflight, multi-header forms, open-mode fallback |
| `_seal64_smoke.cjs`      | 79  | ~2.6s   | `windsurf_auth.js` exports + `parsePlanStatusJson`, `--allow-auth` flag, `/stats` 3-window structure, `/auth/*` 5 routes (incl. live `windsurf.com` step=login round-trip) |
| **Total** | **224** | **~5.5s** | All on Node.js builtins, no real Windsurf account needed (login test uses fake creds and asserts auth_chain_error step=login) |

CI runs the full suite on every PR against `packages/`, `web/`, `tests/`,
or `scripts/`.

---

## Architecture Principles

* **去中心化** &mdash; no central server. Browser ↔ your VM, direct.
* **零依赖** &mdash; everything runs on bare Node.js + bash + curl.
* **软编码** &mdash; URLs, owners, repos, ports, keys all configurable;
  the page auto-detects from `location.*` so a fresh fork "just works".
* **守门有度** &mdash; `/health` and `/fleet/info` are intentionally public
  so probes work without secrets; `/v1/*` `/quota` `/stats` are gated.
  `/auth/*` carries an extra `--allow-auth` flag (default off) on top of
  the auth-key check, because it accepts user passwords.
* **向后兼容** &mdash; running without `--auth-key` is allowed for local dev
  (open mode); production deployments should always set one.
* **道法自然** &mdash; the upstream-default soft-codes default to
  `zhouyoukang/windsurf-assistant`, but every user's fork takes over its
  own identity automatically. *无为而无不为*.

---

## License

MIT (`web/`, `packages/dao-core/`, `scripts/`, `tests/`) &middot;
MIT (`packages/wam/`) &middot; Apache 2.0 (`packages/dao-proxy-min/`).

---

*反者道之动 &middot; 弱者道之用 &middot; 天下之物生于有 &middot; 有生于无*
