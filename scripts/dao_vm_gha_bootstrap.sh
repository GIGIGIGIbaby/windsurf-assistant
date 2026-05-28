#!/usr/bin/env bash
# dao_vm_gha_bootstrap.sh · 万源VM通用引导脚本 · 印273
# Usage: bash scripts/dao_vm_gha_bootstrap.sh <SLOT> [DURATION_MIN]
# 支持: GitHub Actions / Cirrus CI / Azure Pipelines / GitLab CI / CircleCI
# 「无为而无不为」── 一次配置·永续运行
set -euo pipefail

SLOT="${1:-main}"
DURATION="${2:-300}"
PORT=7862
STATUS_FILE="vm-status-${SLOT}.json"
[ "$SLOT" = "main" ] && STATUS_FILE="vm-status.json"

ts()  { date -u +%H:%M:%S; }
log() { echo "[$(ts)][slot:${SLOT}] $*"; }
ok()  { echo "[$(ts)][slot:${SLOT}] ✓ $*"; }
err() { echo "[$(ts)][slot:${SLOT}] ✗ $*"; }

log "══════════════════════════════════════════"
log "  dao-vm · slot=${SLOT} · ${DURATION}min"
log "  无为而无不为 · 道法自然 · 印273"
log "══════════════════════════════════════════"

# ── 1. Start VM server ────────────────────────
export VM_SLOT="$SLOT"
export VM_PORT="$PORT"
node scripts/dao_vm_runner.js &
SERVER_PID=$!
sleep 3

HEALTH=$(curl -sf --max-time 5 "http://localhost:${PORT}/health" 2>/dev/null || echo "fail")
if echo "$HEALTH" | grep -q '"ok":true'; then
  ok "VM server :${PORT} ready"
else
  err "VM server failed: ${HEALTH}"
  exit 1
fi

# ── 2. Install cloudflared ────────────────────
if ! command -v cloudflared &>/dev/null; then
  log "Installing cloudflared..."
  wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
    -O /usr/local/bin/cloudflared 2>/dev/null || \
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
    -o /usr/local/bin/cloudflared
  chmod +x /usr/local/bin/cloudflared
fi
ok "cloudflared $(cloudflared --version 2>&1 | head -1)"

# ── 3. Start tunnel ───────────────────────────
cloudflared tunnel --url "http://localhost:${PORT}" --no-autoupdate \
  > "/tmp/cf-${SLOT}.log" 2>&1 &
CF_PID=$!
log "Waiting for cloudflare URL (up to 80s)..."

CF_URL=""
for i in $(seq 1 40); do
  sleep 2
  CF_URL=$(grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' \
    "/tmp/cf-${SLOT}.log" 2>/dev/null | head -1 || true)
  [ -n "$CF_URL" ] && break
done

if [ -z "$CF_URL" ]; then
  err "No cloudflare URL after 80s"
  tail -20 "/tmp/cf-${SLOT}.log" || true
  exit 1
fi
ok "Tunnel: ${CF_URL}"

# ── 4. Verify tunnel ──────────────────────────
for i in 1 2 3 4 5; do
  sleep 4
  R=$(curl -sf --max-time 10 "${CF_URL}/health" 2>/dev/null || echo "fail")
  if echo "$R" | grep -q '"ok":true'; then ok "Tunnel verified"; break; fi
  log "  verify attempt $i: ${R:0:60}"
done

# ── 5. Write status to repo ───────────────────
RUN_ID="${GITHUB_RUN_ID:-${CIRRUS_TASK_ID:-${BUILD_BUILDID:-${CI_JOB_ID:-local}}}}"
TS=$(date +%s)
STATUS_JSON="{\"slot\":\"${SLOT}\",\"url\":\"${CF_URL}\",\"provider\":\"gha\",\"version\":\"273\",\"run_id\":\"${RUN_ID}\",\"ts\":${TS},\"started\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"ok\":true}"
echo "$STATUS_JSON" > "${STATUS_FILE}"
log "Status → ${STATUS_FILE}"

# Git push (best-effort)
{
  git config user.email "dao-vm@github.com" 2>/dev/null
  git config user.name "dao-vm" 2>/dev/null
  git pull --rebase origin main 2>/dev/null
  git add "${STATUS_FILE}" 2>/dev/null
  git commit -m "vm-${SLOT}: ${CF_URL} [${RUN_ID}]" 2>/dev/null
  git push 2>/dev/null
  ok "Status pushed"
} || log "Git push skipped (not in writable git env)"

log "════════════════════════════════════════"
log "  VM URL: ${CF_URL}"
log "  Health: ${CF_URL}/health"
log "  Models: ${CF_URL}/v1/models"
log "  Chat:   ${CF_URL}/v1/chat/completions"
log "════════════════════════════════════════"

# ── 6. Keep alive ──────────────────────────────
START_KEEP=$(date +%s)
MAX_SEC=$((DURATION * 60))
TICK=0
log "Keeping alive ${DURATION} min..."

while true; do
  sleep 60
  TICK=$((TICK + 1))
  NOW=$(date +%s)
  EL=$((NOW - START_KEEP))
  [ $EL -ge $MAX_SEC ] && { log "Reached ${DURATION}min limit · exiting"; break; }

  LH=$(curl -sf --max-time 5 "http://localhost:${PORT}/health" 2>/dev/null | head -c 40 || echo "dead")
  PH=$(curl -sf --max-time 10 "${CF_URL}/health" 2>/dev/null | head -c 35 || echo "dead")
  log "tick=${TICK} el=$((EL/60))m | local:${LH:0:30} | pub:${PH:0:25}"

  # Heartbeat push every 30 min
  if [ $((TICK % 30)) -eq 0 ]; then
    TS2=$(date +%s)
    WSDIR="${GITHUB_WORKSPACE:-${CIRRUS_WORKING_DIR:-.}}"
    {
      git -C "$WSDIR" pull --rebase origin main 2>/dev/null
      sed -i "s/\"ts\":[0-9]*/\"ts\":${TS2}/" "${WSDIR}/${STATUS_FILE}" 2>/dev/null
      git -C "$WSDIR" add "${STATUS_FILE}" 2>/dev/null
      git -C "$WSDIR" commit -m "vm-${SLOT}: heartbeat t=${TICK}" 2>/dev/null
      git -C "$WSDIR" push 2>/dev/null
      ok "Heartbeat pushed (tick=${TICK})"
    } || log "Heartbeat push skipped"
  fi
done

# ── 7. Self-trigger next run ──────────────────
WORKFLOW="dao-vm-loop-${SLOT}.yml"
[ "$SLOT" = "main" ] && WORKFLOW="dao-vm-free-loop.yml"

if [ -n "${GITHUB_REPOSITORY:-}" ] && [ -n "${GITHUB_TOKEN:-}" ]; then
  log "Self-triggering: ${WORKFLOW}"
  curl -sf -X POST \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches" \
    -d '{"ref":"main"}' && ok "Next run triggered" || log "Trigger failed (schedule will catch)"
else
  log "Self-trigger skipped (non-GHA env)"
fi

log "Bootstrap complete · 无为而无不为 · 道法自然"
