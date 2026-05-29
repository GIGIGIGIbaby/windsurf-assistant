/* 道·外接api 控制面板 · app.js
 * ═════════════════════════════════════════════
 * 无为而无不为: 所有动作在一个面板内可达.
 *
 * 架构:
 *   Webview → gateway (127.0.0.1)  直接 fetch, 不走 extension host
 *   Webview → extension host      postMessage, 用于 openOutput/openFile/toast
 *
 * 所有 apiKey 永不回显 (GET /__dao/config 默认屏蔽; 保存时空字符串 = 保留旧值)
 */
"use strict";

(function () {
  const vscode = acquireVsCodeApi();

  // ── 状态 ─────────────────────────────────────────
  const S = {
    gwUrl: "http://127.0.0.1:11713", // v1.0.6 · 默与新 hashPort 同 (主公 zhouyoukang 算 11635+78=11713 · 兜底值)
    authKey: "",
    connected: false,
    config: null, // 完整 config 对象 (masked, apiKey === "")
    providers: [], // 从 /__dao/providers 来的实时 provider 状态
    models: [], // 实时模型列表
    injectModels: [], // 工作副本 (编辑后不立即写盘)
    aliases: {}, // 工作副本
    probeRunning: false,
    probeAbort: null,
    logs: { items: [], lastTs: 0 },
    logsPollTimer: null,
    healthTimer: null,
    coreApiTimer: null, // v1.0.6 · 核心 API 主 tab 定时拉
    proxyByokStatus: null, // v1.0.6 · 反代核 BYOK 态缓存 (来自 extension host)
    tab: "coreapi", // v1.0.6 · 默主 tab
  };

  // ── 小工具 ───────────────────────────────────────
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) =>
    Array.from((root || document).querySelectorAll(sel));

  function h(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on") && typeof v === "function")
        el.addEventListener(k.slice(2), v);
      else if (k === "checked" || k === "disabled" || k === "readOnly") {
        if (v) el.setAttribute(k, "");
      } else if (v !== undefined && v !== null) el.setAttribute(k, v);
    }
    const add = (c) => {
      if (c == null) return;
      if (typeof c === "string" || typeof c === "number")
        el.appendChild(document.createTextNode(String(c)));
      else el.appendChild(c);
    };
    if (Array.isArray(children)) children.forEach(add);
    else add(children);
    return el;
  }

  function escHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toast(msg, kind = "info", ms = 3000) {
    const host = $("#toastHost");
    const t = h("div", { class: `toast ${kind}`, text: msg });
    host.appendChild(t);
    setTimeout(() => {
      t.style.opacity = "0";
      setTimeout(() => t.remove(), 250);
    }, ms);
  }

  function modal(title, body, actions = []) {
    const host = $("#modalHost");
    const close = () => host.classList.add("hidden");
    const btnRow = h(
      "div",
      {
        style: "display:flex;gap:8px;justify-content:flex-end;margin-top:14px;",
      },
      actions.map((a) =>
        h(
          "button",
          {
            class: `btn ${a.primary ? "primary" : ""}`,
            onclick: () => {
              const r = a.onClick ? a.onClick() : null;
              if (r !== false) close();
            },
          },
          a.label,
        ),
      ),
    );
    host.innerHTML = "";
    host.appendChild(
      h("div", { class: "modal-box" }, [
        h("div", { class: "modal-title", text: title }),
        typeof body === "string" ? h("div", { text: body }) : body,
        btnRow,
      ]),
    );
    host.classList.remove("hidden");
    host.addEventListener(
      "click",
      (e) => {
        if (e.target === host) close();
      },
      { once: true },
    );
  }

  async function api(method, path, body, opts = {}) {
    const url = S.gwUrl + path;
    const headers = {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    };
    if (S.authKey && !opts.noAuth)
      headers["Authorization"] = "Bearer " + S.authKey;
    const ac = opts.abort ? opts.abort : new AbortController();
    const init = { method, headers, signal: ac.signal };
    if (body !== undefined)
      init.body = typeof body === "string" ? body : JSON.stringify(body);
    let res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      throw new Error(`网络: ${e.message || e}`);
    }
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        /* 保留原文 */
      }
    }
    if (!res.ok) {
      const msg =
        (data && (data.error?.message || data.error)) ||
        text ||
        `HTTP ${res.status}`;
      const err = new Error(
        typeof msg === "string" ? msg : JSON.stringify(msg),
      );
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data ?? {};
  }

  function vscodeMsg(type, payload) {
    try {
      vscode.postMessage({ type, ...payload });
    } catch {}
  }

  // ── 标签切换 ─────────────────────────────────────
  function setTab(name) {
    S.tab = name;
    $$(".tab").forEach((b) =>
      b.classList.toggle("active", b.dataset.tab === name),
    );
    $$(".panel").forEach((p) =>
      p.classList.toggle("active", p.id === "tab-" + name),
    );
    // 切到对应面板时懒加载
    if (name === "coreapi") renderCoreApi(); // v1.0.6 · 主 tab
    if (name === "providers") renderProviders();
    if (name === "probe") renderProbe();
    if (name === "cascade") renderInject();
    if (name === "officialByok") renderOfficialByok();
    if (name === "aliases") renderAliases();
    if (name === "logs") refreshLogsOnce(true);
    if (name === "diag")
      $("#diagResult").textContent = "未运行. 点击上方按钮开始.";
    vscode.setState({ tab: name });
  }

  // ── 连通性 / 顶部状态芯片 ────────────────────────
  async function pingHealth() {
    const chip = $("#gwChip");
    const dot = $("#gwDot");
    const text = $("#gwText");
    try {
      const r = await fetch(S.gwUrl + "/health", { cache: "no-cache" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      S.connected = true;
      chip.className = "gw-chip ok";
      text.textContent = `${data.providers?.length || 0}p · ${data.modelCount || 0}m`;
      chip.title = `网关在跑 · ${S.gwUrl}\nProviders: ${data.providers?.length || 0}\nModels: ${data.modelCount || 0}`;
      return data;
    } catch (e) {
      S.connected = false;
      chip.className = "gw-chip err";
      text.textContent = "网关失联";
      chip.title = `${S.gwUrl} · ${e.message}`;
      return null;
    }
  }

  // ── ★ 核心 API 主 tab · v1.0.6 ─────────────────
  // 三泉全拉: ① 反代核 /origin/byok/status (经 extension host)
  //          ② 网关 /__dao/diag (直 fetch)
  //          ③ 网关 /__dao/providers (直 fetch)
  // 合并渲染: 4 大态卡 + 官方 4 BYOK mini 映 + 38 BYOK_DAO 名册 + Provider 活态
  async function renderCoreApi() {
    // 异步发请 (并行)
    const pHealth = pingHealth();
    const pDiag = api("GET", "/__dao/diag").catch(() => null);
    const pProvs = api("GET", "/__dao/providers").catch(() => null);
    // 反代核态走 extension host postMessage (异步 · 由 onMessage 派回)
    vscodeMsg("queryByokStatus");

    const [health, diag, provsData] = await Promise.all([
      pHealth,
      pDiag,
      pProvs,
    ]);

    // ─── 4 大态卡 ───
    // ① 反代核 (此刻 S.proxyByokStatus 可能尚未到 · 先用上一次, 后由 byokStatus 消息再刷)
    _renderCoreProxyCard(S.proxyByokStatus);
    // ② 070 网关
    _renderCoreGwCard(health, diag);
    // ③ 38 BYOK_DAO
    _renderCoreByokCountCard(S.proxyByokStatus);
    // ④ 官方 4 BYOK
    _renderCoreOfficialCard(S.proxyByokStatus, S.config);

    // ─── 官方 4 BYOK mini 映 ───
    _renderCoreOfficialMini();
    // ─── 38 BYOK_DAO 注入名册 ───
    _renderCoreByokList(S.proxyByokStatus);
    // ─── Provider 活态 ───
    _renderCoreProviders(provsData ? provsData.providers : null);
  }

  function _renderCoreProxyCard(st) {
    const v = $("#core-proxy-value");
    const n = $("#core-proxy-note");
    if (!v || !n) return;
    if (!st) {
      v.textContent = "—";
      n.textContent = "等待反代核响应…";
      return;
    }
    if (st.ready === true) {
      v.textContent = "✓";
      v.style.color = "var(--dao-ok)";
      n.textContent = `就绪 · ${st.count || 0} 模注入 · wire=${st.wire ? "✓" : "·"}`;
      n.title = st.config || "";
    } else {
      v.textContent = "✗";
      v.style.color = "var(--dao-err)";
      n.textContent = st.error || st.reason || "反代核未启";
    }
  }

  function _renderCoreGwCard(health, diag) {
    const v = $("#core-gw-value");
    const n = $("#core-gw-note");
    if (!v || !n) return;
    if (!health && !diag) {
      v.textContent = "✗";
      v.style.color = "var(--dao-err)";
      n.textContent = `网关失联 · ${S.gwUrl}`;
      return;
    }
    v.textContent = "✓";
    v.style.color = "var(--dao-ok)";
    const total = (health && health.modelCount) || 0;
    const provCount =
      (health && health.providers && health.providers.length) || 0;
    n.textContent = `${provCount} provider 活 · ${total} 模可用`;
    n.title = `${S.gwUrl}\nNode ${(diag && diag.nodeVersion) || "?"} pid=${(diag && diag.pid) || "?"}`;
  }

  function _renderCoreByokCountCard(st) {
    const v = $("#core-byok-value");
    const n = $("#core-byok-note");
    if (!v || !n) return;
    if (!st) {
      v.textContent = "—";
      n.textContent = "等待反代核…";
      return;
    }
    const count = st.count || 0;
    v.textContent = String(count);
    v.style.color =
      count >= 30
        ? "var(--dao-ok)"
        : count > 0
          ? "var(--dao-warn)"
          : "var(--dao-err)";
    n.textContent =
      count >= 30
        ? "Cascade 注入态 ✓"
        : count > 0
          ? "部分注入 (检查 provider)"
          : "无注入";
  }

  function _renderCoreOfficialCard(st, cfg) {
    const v = $("#core-official-value");
    const n = $("#core-official-note");
    if (!v || !n) return;
    const off = st && st.official;
    const ovEnabled =
      cfg &&
      cfg.officialByokOverrides &&
      cfg.officialByokOverrides.enabled === true;
    if (!st && !cfg) {
      v.textContent = "—";
      n.textContent = "等待数据…";
      return;
    }
    if (off && off.enabled === true) {
      v.textContent = `${off.count || 0}/4`;
      v.style.color =
        (off.count || 0) === 4 ? "var(--dao-ok)" : "var(--dao-warn)";
      n.textContent = "劫已活 (无感切)";
    } else if (ovEnabled) {
      v.textContent = "·";
      v.style.color = "var(--dao-warn)";
      n.textContent = "配存但反代核未识 · 试热刷";
    } else {
      v.textContent = "✗";
      v.style.color = "var(--dao-muted)";
      n.textContent = "未启用 · 去官方 4 BYOK 劫 tab 配";
    }
  }

  function _renderCoreOfficialMini() {
    const host = $("#core-official-mini");
    if (!host) return;
    // ★ v1.0.8 反者道之动 · 源辨更正 ──────────────────────────────
    //   真识 official 4 BYOK 之 source-of-truth 在反代核 (byok_handler.js):
    //     /origin/byok/status -> { official: { enabled, count, map: {uid: {provider,model,enabled,supportsThinking}} } }
    //   配置 .codeium/dao-byok/配置.json 由 inject_010_bridge 之 routeForOfficial 读, 形为
    //   officialByokOverrides 字段, 但网关 server.js 不识此字段 (设计上反代核拦截即转 model uid).
    //   故 webview 显示之"当下映"应优先取反代核 (真活) · 回退 S.config (静态意).
    //   「为之于其未有也, 治之于其未乱也」(《六十四》)
    // ──────────────────────────────────────────────────
    const stOff = S.proxyByokStatus && S.proxyByokStatus.official;
    const cfgOv = S.config && S.config.officialByokOverrides;
    let map = {};
    let enabled = false;
    let srcTag = "";
    if (stOff && stOff.map && Object.keys(stOff.map).length) {
      map = stOff.map;
      enabled = stOff.enabled === true;
      srcTag = "反代核 :10967 (真活)";
    } else if (cfgOv && cfgOv.map && Object.keys(cfgOv.map).length) {
      map = cfgOv.map;
      enabled = cfgOv.enabled === true;
      srcTag = "配置.json (静态)";
    }
    if (!srcTag) {
      host.textContent =
        "无 officialByokOverrides 配 (去官方 4 BYOK 劫 tab 添加 · 反代核未启亦致此)";
      return;
    }
    host.innerHTML = "";
    const slots = [
      {
        uid: "MODEL_CLAUDE_4_OPUS_BYOK",
        label: "Claude Opus 4 BYOK",
        hint: "官方旗舰槽",
      },
      {
        uid: "MODEL_CLAUDE_4_OPUS_THINKING_BYOK",
        label: "Claude Opus 4 Thinking",
        hint: "旗舰推理槽",
      },
      {
        uid: "MODEL_CLAUDE_4_SONNET_BYOK",
        label: "Claude Sonnet 4 BYOK",
        hint: "日常槽",
      },
      {
        uid: "MODEL_CLAUDE_4_SONNET_THINKING_BYOK",
        label: "Claude Sonnet 4 Thinking",
        hint: "日常推理槽",
      },
    ];
    // 源标签 + enabled chip
    const srcHdr = h("div", { class: "byok-mini-src" }, [
      h("span", { class: "muted", text: "源: " }),
      h("code", { text: srcTag }),
      h("span", {
        class: enabled ? "dot ok" : "dot muted",
        title: enabled ? "已启用" : "未启用",
      }),
      h("span", {
        class: "muted",
        text: enabled ? " 已启用" : " 未启用",
      }),
    ]);
    host.appendChild(srcHdr);
    const ulist = h("ul", { class: "byok-mini-list" });
    for (const s of slots) {
      const m = map[s.uid] || {};
      const ok = !!(m.provider && m.model && m.enabled !== false);
      const dotCls = ok ? "ok" : "muted";
      const tgt = ok ? `${m.provider}/${m.model}` : "(未配)";
      const li = h("li", { class: "byok-mini-row" }, [
        h("span", { class: `dot ${dotCls}` }),
        h("div", { class: "byok-mini-main" }, [
          h("div", { class: "byok-mini-label" }, [
            s.label,
            h("span", { class: "muted", text: " · " + s.hint }),
          ]),
          h("code", {
            class: "byok-mini-target",
            text: tgt + (m.supportsThinking ? "  [reason]" : ""),
          }),
        ]),
      ]);
      ulist.appendChild(li);
    }
    host.appendChild(ulist);
  }

  function _renderCoreByokList(st) {
    const host = $("#core-byok-list");
    const sum = $("#core-byok-summary");
    if (!host) return;
    if (!st) {
      host.textContent = "反代核未启或未应答 (10967 探针失)";
      if (sum) sum.textContent = "";
      return;
    }
    const uids = Array.isArray(st.uids) ? st.uids : [];
    if (sum)
      sum.textContent = ` · 共 ${uids.length} 注 · wire=${st.wire ? "✓" : "·"}`;
    host.innerHTML = "";
    if (!uids.length) {
      host.textContent = "未识 BYOK_DAO 模 (查 .codeium/dao-byok/配置.json)";
      return;
    }
    // 解析 UID → 友好显示 (e.g. MODEL_GPT_4_1_GITHUB_BYOK_DAO → gpt-4.1 [github])
    const grid = h("div", { class: "byok-grid" });
    for (const uid of uids) {
      // 提取 model + provider
      const m = /^MODEL_(.+?)_([A-Z_]+)_BYOK_DAO$/.exec(uid);
      let modelTxt = uid,
        provTxt = "";
      if (m) {
        modelTxt = m[1]
          .toLowerCase()
          .replace(/_/g, "-")
          .replace(/-(\d)/g, ".$1");
        provTxt = m[2].toLowerCase();
      }
      const chip = h("div", { class: "byok-chip", title: uid }, [
        h("span", { class: "dot ok" }),
        h("span", { class: "byok-chip-model", text: modelTxt }),
        h("span", { class: "byok-chip-prov", text: provTxt }),
      ]);
      grid.appendChild(chip);
    }
    host.appendChild(grid);
  }

  function _renderCoreProviders(provs) {
    const host = $("#core-providers");
    if (!host) return;
    if (!provs || !provs.length) {
      host.textContent =
        "无 provider 活 (去 Provider 管理 tab 启用 + 填 apiKey)";
      return;
    }
    host.innerHTML = "";
    const grid = h("div", { class: "prov-grid" });
    for (const p of provs) {
      const ready =
        p.hasKey ||
        p.driver === "ollama" ||
        p.driver === "lmstudio" ||
        p.driver === "vllm";
      const card = h(
        "div",
        { class: "prov-card " + (ready ? "ok" : "warn"), title: p.baseUrl },
        [
          h("div", { class: "prov-head" }, [
            h("span", { class: `dot ${ready ? "ok" : "warn"}` }),
            h("span", { class: "prov-name", text: p.label || p.name }),
            h("span", { class: `prov-driver ${p.driver}`, text: p.driver }),
          ]),
          h("div", { class: "prov-stats" }, [
            h("span", { text: `${p.models || 0} 模` }),
            h("span", {
              class: "muted",
              text: ready ? "· 就绪" : "· 缺 apiKey",
            }),
          ]),
        ],
      );
      grid.appendChild(card);
    }
    host.appendChild(grid);
  }

  // ── 概览 ─────────────────────────────────────────
  async function refreshOverview() {
    const health = await pingHealth();
    const diag = await api("GET", "/__dao/diag").catch(() => null);
    $("#stat-gw").textContent = S.connected ? "✓" : "✗";
    $("#stat-gw-url").textContent = S.gwUrl;
    $("#stat-gw-url").title = S.gwUrl;
    const pTotal =
      Object.keys(S.config?.providers || {}).length ||
      health?.providers?.length ||
      0;
    const pEnabled = health?.providers?.length || 0;
    $("#stat-providers").textContent = `${pEnabled} / ${pTotal}`;
    $("#stat-models").textContent = String(health?.modelCount ?? "—");
    const injN = (S.config?.cascadeInjection?.injectModels || []).length;
    const injE = !!S.config?.cascadeInjection?.enabled;
    $("#stat-inject").textContent = injE ? `✓ ${injN}` : `⦿ ${injN}`;
    $("#stat-inject-note").textContent = injE ? "已启用" : "未启用";
    if (diag) {
      $("#q-listen").textContent =
        `${diag.listening?.host}:${diag.listening?.port}`;
      $("#q-auth").textContent = diag.auth;
      $("#q-node").textContent = diag.nodeVersion;
      $("#q-pid").textContent = diag.pid;
      $("#q-cfg").textContent = diag.configPath;
      $("#q-cfg").title = diag.configPath;
      $("#q-logring").textContent =
        `${diag.logs?.ringSize ?? 0} / ${diag.logs?.max ?? 600}`;
    }
    // provider mini
    const pm = $("#providerMini");
    pm.innerHTML = "";
    if (!health || !health.providers?.length) {
      pm.appendChild(
        h("span", {
          class: "muted",
          text: "无已启用 provider — 去 Provider 管理页启用",
        }),
      );
    } else {
      for (const p of health.providers) {
        const chip = h(
          "span",
          {
            class: `pm-chip ${p.hasKey || p.driver === "ollama" ? "ok" : ""}`,
            title: `${p.name} [${p.driver}] · baseUrl=${p.baseUrl}`,
          },
          [
            p.label || p.name,
            h("span", { class: "count", text: "·" + p.models }),
          ],
        );
        pm.appendChild(chip);
      }
    }
  }

  // ── 配置加载 ─────────────────────────────────────
  async function loadConfig() {
    try {
      const r = await api("GET", "/__dao/config");
      S.config = r.config || {};
      S.injectModels = JSON.parse(
        JSON.stringify(S.config.cascadeInjection?.injectModels || []),
      );
      S.aliases = JSON.parse(JSON.stringify(S.config.aliases || {}));
      return r;
    } catch (e) {
      toast("配置读取失败: " + e.message, "err");
      return null;
    }
  }

  async function saveConfig(showToast = true) {
    if (!S.config) return;
    // 在保存前把当前 UI 里 injectModels/aliases 同步回 config
    S.config.cascadeInjection = S.config.cascadeInjection || {};
    S.config.cascadeInjection.injectModels = S.injectModels;
    S.config.aliases = S.aliases;
    try {
      const r = await api("POST", "/__dao/config", { config: S.config });
      if (showToast) toast(`保存成功 · ${r.providers}p · ${r.models}m`, "ok");
      // 保存后让 VSIX 刷新 registerProviders
      vscodeMsg("refreshProviders");
      await refreshOverview();
      return true;
    } catch (e) {
      toast("保存失败: " + e.message, "err", 6000);
      return false;
    }
  }

  // ── Provider 管理 ────────────────────────────────
  const DEFAULT_BASE_URLS = {
    anthropic: "https://api.anthropic.com",
    anthropicCompat: "https://rsxermu666.cn",
    openai: "https://api.openai.com/v1",
    openaiCompat: "",
    deepseek: "https://api.deepseek.com/v1",
    moonshot: "https://api.moonshot.cn/v1",
    qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    zhipu: "https://open.bigmodel.cn/api/paas/v4",
    gemini: "https://generativelanguage.googleapis.com/v1beta",
    openrouter: "https://openrouter.ai/api/v1",
    siliconflow: "https://api.siliconflow.cn/v1",
    groq: "https://api.groq.com/openai/v1",
    mistral: "https://api.mistral.ai/v1",
    ollama: "http://127.0.0.1:11434",
    lmstudio: "http://127.0.0.1:1234/v1",
    vllm: "http://127.0.0.1:8000/v1",
    github: "https://models.github.ai/inference",
    claudeRelayLocal: "http://127.0.0.1:8878",
  };
  const DRIVER_OF = {
    anthropic: "anthropic",
    anthropicCompat: "anthropic",
    claudeRelayLocal: "anthropic",
    openai: "openai",
    openaiCompat: "openai",
    deepseek: "openai",
    moonshot: "openai",
    qwen: "openai",
    zhipu: "openai",
    openrouter: "openai",
    siliconflow: "openai",
    groq: "openai",
    mistral: "openai",
    lmstudio: "openai",
    vllm: "openai",
    github: "openai",
    gemini: "gemini",
    ollama: "ollama",
  };
  const REQ_KEY = {
    // 哪些 provider 需要 apiKey (除此均本地或无需)
    anthropic: 1,
    anthropicCompat: 1,
    openai: 1,
    openaiCompat: 1,
    deepseek: 1,
    moonshot: 1,
    qwen: 1,
    zhipu: 1,
    gemini: 1,
    openrouter: 1,
    siliconflow: 1,
    groq: 1,
    mistral: 1,
    github: 1,
  };

  function renderProviders() {
    const host = $("#providerList");
    if (!S.config) {
      host.textContent = "等待配置…";
      return;
    }
    const filter = ($("#providerSearch").value || "").toLowerCase();
    host.innerHTML = "";
    const providers = S.config.providers || {};
    const names = Object.keys(providers).sort();
    let shown = 0;
    for (const name of names) {
      if (filter && !name.toLowerCase().includes(filter)) continue;
      const p = providers[name];
      if (!p || typeof p !== "object") continue;
      host.appendChild(makeProviderCard(name, p));
      shown++;
    }
    if (!shown)
      host.appendChild(h("div", { class: "muted", text: "无匹配 provider." }));
  }

  function makeProviderCard(name, p) {
    const driver = p.driver || DRIVER_OF[name] || "openai";
    const baseUrl = p.baseUrl || DEFAULT_BASE_URLS[name] || "";
    const needsKey = !!REQ_KEY[name] && !p._isLocal;
    const enabled = p.enabled !== false;
    const modelsStr = Array.isArray(p.models) ? p.models.join("\n") : "";
    const keyHint = p._apiKeyMasked
      ? `${p._apiKeyMasked} (已保存 · 留空保留)`
      : needsKey
        ? "在此粘贴 apiKey"
        : "本地服务 · 无需 key";

    const card = h("div", {
      class: `p-card ${enabled ? "" : "disabled"}`,
      "data-p": name,
    });

    // 头部
    const toggle = h("label", { class: "toggle" }, [
      h("input", {
        type: "checkbox",
        checked: enabled ? true : undefined,
        onchange: (e) => {
          p.enabled = e.target.checked;
          card.classList.toggle("disabled", !p.enabled);
        },
      }),
      h("span", { class: "slider" }),
    ]);
    const head = h("div", { class: "p-head" }, [
      h("div", { class: "p-title-group" }, [
        h("div", { class: "p-title", text: p.label || name }),
        h("span", { class: `p-driver ${driver}`, text: driver }),
      ]),
      toggle,
    ]);
    card.appendChild(head);

    // body
    const body = h("div", { class: "p-body" });

    // apiKey
    body.appendChild(
      h("div", { class: "p-row" }, [
        h("label", { text: "apiKey" }),
        h("input", {
          type: "password",
          placeholder: keyHint,
          value: "",
          oninput: (e) => {
            p.apiKey = e.target.value;
          },
        }),
      ]),
    );

    // baseUrl
    body.appendChild(
      h("div", { class: "p-row" }, [
        h("label", { text: "baseUrl" }),
        h("input", {
          type: "text",
          value: baseUrl,
          placeholder: DEFAULT_BASE_URLS[name] || "https://…",
          oninput: (e) => {
            p.baseUrl = e.target.value;
          },
        }),
      ]),
    );

    // models
    body.appendChild(
      h("div", { class: "p-row", style: "align-items:start;" }, [
        h("label", { text: "models" }),
        h(
          "textarea",
          {
            class: "p-models",
            rows: "4",
            placeholder: "每行一个模型名 · 空留表示无或 auto",
            oninput: (e) => {
              p.models = e.target.value
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter(Boolean);
            },
          },
          modelsStr,
        ),
      ]),
    );

    // 可选 driver 覆盖
    body.appendChild(
      h("div", { class: "p-row" }, [
        h("label", { text: "driver" }),
        h(
          "select",
          {
            onchange: (e) => {
              const v = e.target.value;
              if (v === "auto") delete p.driver;
              else p.driver = v;
            },
          },
          [
            h("option", {
              value: "auto",
              selected: !p.driver ? true : undefined,
              text: `自动 (${DRIVER_OF[name] || "openai"})`,
            }),
            h("option", {
              value: "openai",
              selected: p.driver === "openai" ? true : undefined,
              text: "openai",
            }),
            h("option", {
              value: "anthropic",
              selected: p.driver === "anthropic" ? true : undefined,
              text: "anthropic",
            }),
            h("option", {
              value: "gemini",
              selected: p.driver === "gemini" ? true : undefined,
              text: "gemini",
            }),
            h("option", {
              value: "ollama",
              selected: p.driver === "ollama" ? true : undefined,
              text: "ollama",
            }),
          ],
        ),
      ]),
    );

    // meta
    const meta = h("div", { class: "p-meta" }, [
      h("span", { class: "mk", text: `provider=${name}` }),
      h("span", { text: needsKey ? "需要 apiKey" : "无需 key" }),
    ]);
    body.appendChild(meta);

    card.appendChild(body);
    return card;
  }

  // ── 模型探针 ─────────────────────────────────────
  let probeCache = []; // 当前探针可用模型列表

  async function loadProbeModels() {
    try {
      const r = await api("GET", "/__dao/providers");
      probeCache = (r.models || []).filter(
        (m) => !m.model || m.model !== "auto",
      );
      S.providers = r.providers || [];
      S.models = probeCache;
    } catch (e) {
      probeCache = [];
      toast("读取模型列表失败: " + e.message, "err");
    }
  }

  async function renderProbe() {
    if (!probeCache.length) await loadProbeModels();
    const tbody = $("#probeTbody");
    tbody.innerHTML = "";
    const filter = ($("#probeSearch").value || "").toLowerCase();
    let shown = 0;
    for (const m of probeCache) {
      if (filter && !m.id.toLowerCase().includes(filter)) continue;
      const tr = h("tr", { "data-model": m.id });
      // model 单元 · 附上能力 chip (tools=none / single / full)
      const modelCell = h("td", { class: "probe-model" });
      modelCell.appendChild(h("span", { text: m.model }));
      const caps = m.capabilities || { toolSupport: "full" };
      if (caps.toolSupport === "none") {
        const chip = h("span", {
          class: "chip warn",
          title: caps.note || "This model does not support tool calling",
          style: "margin-left:6px;font-size:10px;",
          text: "no-tools",
        });
        modelCell.appendChild(chip);
      } else if (caps.toolSupport === "single") {
        const chip = h("span", {
          class: "chip warn",
          title: caps.note || "Max 1 tool per request",
          style: "margin-left:6px;font-size:10px;",
          text: "1-tool",
        });
        modelCell.appendChild(chip);
      }
      tr.appendChild(modelCell);
      tr.appendChild(h("td", { text: m.provider }));
      tr.appendChild(h("td", { text: m.driver }));
      tr.appendChild(h("td", { class: "right", "data-col": "ms", text: "—" }));
      tr.appendChild(
        h(
          "td",
          { class: "probe-status", "data-col": "st" },
          h("span", { class: "chip idle", text: "idle" }),
        ),
      );
      tr.appendChild(
        h("td", { class: "probe-resp", "data-col": "resp", text: "—" }),
      );
      tr.appendChild(
        h(
          "td",
          { class: "right" },
          h(
            "button",
            { class: "btn small", onclick: () => probeOne(m.id) },
            "测一下",
          ),
        ),
      );
      tbody.appendChild(tr);
      shown++;
    }
    if (!shown) {
      tbody.appendChild(
        h(
          "tr",
          {},
          h("td", {
            colspan: "7",
            class: "muted",
            style: "text-align:center;padding:20px;",
            text: probeCache.length
              ? "无匹配模型"
              : "未启用任何 provider · 先去 Provider 管理页",
          }),
        ),
      );
    }
    $("#probeSummary").textContent = probeCache.length
      ? `共 ${probeCache.length} 模型 · 展示 ${shown}`
      : "";
  }

  function setProbeRow(modelId, patch) {
    const tr = $(`#probeTbody tr[data-model="${CSS.escape(modelId)}"]`);
    if (!tr) return;
    if (patch.status !== undefined) {
      const st = tr.querySelector('[data-col="st"]');
      const cls =
        patch.status === "running"
          ? "run"
          : patch.status === "ok"
            ? "ok"
            : patch.status === "warn"
              ? "warn"
              : "err";
      st.innerHTML = "";
      st.appendChild(
        h("span", {
          class: `chip ${cls}`,
          text: patch.statusText || patch.status,
        }),
      );
    }
    if (patch.ms !== undefined)
      tr.querySelector('[data-col="ms"]').textContent = patch.ms + " ms";
    if (patch.text !== undefined) {
      const td = tr.querySelector('[data-col="resp"]');
      td.title = patch.text || "";
      td.textContent = (patch.text || "").slice(0, 120).replace(/\s+/g, " ");
    }
  }

  async function probeOne(modelId) {
    setProbeRow(modelId, {
      status: "running",
      statusText: "请求中…",
      ms: 0,
      text: "",
    });
    const prompt = $("#probePrompt").value || "回一字: 道";
    try {
      const r = await api(
        "POST",
        "/__dao/probe",
        { model: modelId, prompt, max_tokens: 16 },
        { abort: S.probeAbort || undefined },
      );
      if (r.ok) {
        setProbeRow(modelId, {
          status: "ok",
          statusText: "✓",
          ms: r.ms,
          text: r.text || "(无输出)",
        });
      } else if (r.status === 429 || (r.status >= 500 && r.status <= 599)) {
        setProbeRow(modelId, {
          status: "warn",
          statusText: "上游 " + r.status,
          ms: r.ms,
          text: (r.error || "").slice(0, 180),
        });
      } else {
        setProbeRow(modelId, {
          status: "err",
          statusText: "✗ " + (r.status || "err"),
          ms: r.ms,
          text: (r.error || "").slice(0, 180),
        });
      }
      return r;
    } catch (e) {
      if (e.name === "AbortError") {
        setProbeRow(modelId, {
          status: "warn",
          statusText: "已取消",
          ms: 0,
          text: "",
        });
      } else {
        setProbeRow(modelId, {
          status: "err",
          statusText: "err",
          ms: 0,
          text: e.message,
        });
      }
      return null;
    }
  }

  async function probeAll() {
    if (S.probeRunning) return;
    S.probeRunning = true;
    S.probeAbort = new AbortController();
    $("#btnProbeAll").style.display = "none";
    $("#btnProbeStop").style.display = "";
    let ok = 0,
      warn = 0,
      err = 0,
      n = 0;
    for (const m of probeCache) {
      if (!S.probeRunning) break;
      n++;
      $("#probeSummary").textContent =
        `进行中 · ${n} / ${probeCache.length} · ok=${ok} warn=${warn} err=${err}`;
      const r = await probeOne(m.id);
      if (!S.probeRunning) break;
      if (r?.ok) ok++;
      else if (r?.status === 429 || (r?.status >= 500 && r?.status <= 599))
        warn++;
      else err++;
      // 小间隔防上游限速
      await new Promise((res) => setTimeout(res, 250));
    }
    S.probeRunning = false;
    $("#btnProbeAll").style.display = "";
    $("#btnProbeStop").style.display = "none";
    $("#probeSummary").textContent =
      `完成 · ${ok}/${probeCache.length} 通过 · warn=${warn} · err=${err}`;
    toast(
      `探针完成 · ${ok}/${probeCache.length} 通过`,
      err === 0 && warn === 0 ? "ok" : err === 0 ? "warn" : "err",
    );
  }

  function probeStop() {
    S.probeRunning = false;
    if (S.probeAbort)
      try {
        S.probeAbort.abort();
      } catch {}
    $("#btnProbeAll").style.display = "";
    $("#btnProbeStop").style.display = "none";
  }

  // ── Cascade 注入管理 ─────────────────────────────
  function renderInject() {
    $("#cascadeEnabled").checked = !!S.config?.cascadeInjection?.enabled;
    const host = $("#injectList");
    host.innerHTML = "";
    if (!S.injectModels.length) {
      host.appendChild(
        h("div", { class: "muted", text: "无注入条目. 点 ＋新增 添加第一条." }),
      );
      return;
    }
    S.injectModels.forEach((item, idx) =>
      host.appendChild(makeInjectRow(item, idx)),
    );
  }

  function makeInjectRow(item, idx) {
    const row = h("div", { class: "inject-item" });
    // label
    row.appendChild(
      h("input", {
        class: "label-input",
        type: "text",
        placeholder: "显示名 (如: GPT-4.1 mini free)",
        value: item.label || "",
        oninput: (e) => {
          item.label = e.target.value;
        },
      }),
    );
    // provider
    row.appendChild(
      h("input", {
        type: "text",
        placeholder: "provider (如: github / deepseek)",
        value: item.provider || "",
        oninput: (e) => {
          item.provider = e.target.value.trim();
        },
      }),
    );
    // model
    row.appendChild(
      h("input", {
        type: "text",
        placeholder: "model (如: openai/gpt-4.1-mini)",
        value: item.model || "",
        oninput: (e) => {
          item.model = e.target.value.trim();
        },
      }),
    );
    // toggles (images / tools / thinking)
    row.appendChild(
      h("div", { class: "toggles" }, [
        h("label", { title: "supports_images" }, [
          h("input", {
            type: "checkbox",
            checked: item.supportsImages ? true : undefined,
            onchange: (e) => {
              item.supportsImages = e.target.checked;
            },
          }),
          "图",
        ]),
        h("label", { title: "supports_tool_calls" }, [
          h("input", {
            type: "checkbox",
            checked: item.supportsToolCalls !== false ? true : undefined,
            onchange: (e) => {
              item.supportsToolCalls = e.target.checked;
            },
          }),
          "工具",
        ]),
        h("label", { title: "supports_thinking" }, [
          h("input", {
            type: "checkbox",
            checked: item.supportsThinking ? true : undefined,
            onchange: (e) => {
              item.supportsThinking = e.target.checked;
            },
          }),
          "推理",
        ]),
        h("input", {
          type: "number",
          min: "1024",
          max: "2000000",
          step: "1024",
          value: item.maxTokens || 128000,
          title: "maxTokens",
          style: "width:76px;",
          oninput: (e) => {
            item.maxTokens = parseInt(e.target.value) || 128000;
          },
        }),
      ]),
    );
    // actions
    row.appendChild(
      h(
        "button",
        {
          class: "btn small danger",
          onclick: () => {
            S.injectModels.splice(idx, 1);
            renderInject();
          },
        },
        "删除",
      ),
    );
    return row;
  }

  // ── ★ 官方 4 BYOK 透明劫 · dao-proxy-max v1.0.0 ───
  // 不动 Windsurf UI 一字 · 劫官方 _BYOK 后缀槽位 → 070 网关 → 用户配的任意 provider/model
  const OFFICIAL_BYOK_SLOTS = [
    {
      uid: "MODEL_CLAUDE_4_OPUS_BYOK",
      label: "Claude Opus 4 BYOK",
      hint: "官方旗舰 · 推荐配 GitHub openai/gpt-4.1 或 LG-Code Anthropic",
    },
    {
      uid: "MODEL_CLAUDE_4_OPUS_THINKING_BYOK",
      label: "Claude Opus 4 Thinking BYOK",
      hint: "推理槽 · 推荐配 deepseek-reasoner 或 openai/o3",
    },
    {
      uid: "MODEL_CLAUDE_4_SONNET_BYOK",
      label: "Claude Sonnet 4 BYOK",
      hint: "日常槽 · 推荐配 deepseek-chat 或 github/openai/gpt-4.1-mini",
    },
    {
      uid: "MODEL_CLAUDE_4_SONNET_THINKING_BYOK",
      label: "Claude Sonnet 4 Thinking BYOK",
      hint: "推理槽 · 推荐配 deepseek-reasoner",
    },
  ];

  function _allModelsFromConfig() {
    // 从 config.providers 中归集所有可用模型 (provider/model 对)
    const out = [];
    const provs = (S.config && S.config.providers) || {};
    for (const [pname, p] of Object.entries(provs)) {
      if (!p || typeof p !== "object") continue;
      if (pname.startsWith("_")) continue;
      const models = Array.isArray(p.models) ? p.models : [];
      for (const m of models) {
        if (typeof m === "string" && m && m !== "auto") {
          out.push({ provider: pname, model: m, enabled: p.enabled !== false });
        }
      }
    }
    return out;
  }

  function renderOfficialByok() {
    S.config = S.config || {};
    S.config.officialByokOverrides = S.config.officialByokOverrides || {
      enabled: false,
      map: {},
    };
    const ov = S.config.officialByokOverrides;
    ov.map = ov.map || {};
    $("#officialByokEnabled").checked = ov.enabled === true;

    const tbody = $("#officialByokTbody");
    tbody.innerHTML = "";
    const allModels = _allModelsFromConfig();
    const provSet = new Set(allModels.map((m) => m.provider));
    const provList = Array.from(provSet);

    for (const slot of OFFICIAL_BYOK_SLOTS) {
      // 若 map[slot.uid] 不存在则建空
      if (!ov.map[slot.uid]) {
        ov.map[slot.uid] = {
          enabled: true,
          provider: "",
          model: "",
        };
      }
      const m = ov.map[slot.uid];
      const tr = h("tr");

      // 槽位 (label + hint)
      tr.appendChild(
        h("td", {}, [
          h("div", { class: "slot-label", text: slot.label }),
          h("span", { class: "slot-hint", text: slot.hint }),
        ]),
      );
      // UID (只读 · mono)
      tr.appendChild(h("td", { class: "mono", text: slot.uid }));
      // provider select
      const providerSel = h("select", {
        onchange: (e) => {
          m.provider = e.target.value;
          // provider 切了 · model 清空让用户重选
          m.model = "";
          renderOfficialByok();
        },
      });
      providerSel.appendChild(h("option", { value: "" }, "— 未配 —"));
      for (const p of provList) {
        const opt = h("option", { value: p }, p);
        if (m.provider === p) opt.selected = true;
        providerSel.appendChild(opt);
      }
      tr.appendChild(h("td", {}, providerSel));
      // model select (依 provider 过滤)
      const modelSel = h("select", {
        onchange: (e) => {
          m.model = e.target.value;
        },
      });
      modelSel.appendChild(h("option", { value: "" }, "— 未配 —"));
      const modelsOfProv = allModels.filter((x) => x.provider === m.provider);
      for (const mm of modelsOfProv) {
        const opt = h("option", { value: mm.model }, mm.model);
        if (m.model === mm.model) opt.selected = true;
        modelSel.appendChild(opt);
      }
      // 若 m.model 不在 list (例如手动配的)·补一条
      if (m.model && !modelsOfProv.some((x) => x.model === m.model)) {
        const opt = h("option", { value: m.model }, m.model + " (custom)");
        opt.selected = true;
        modelSel.appendChild(opt);
      }
      tr.appendChild(h("td", {}, modelSel));
      // enable checkbox
      tr.appendChild(
        h(
          "td",
          { style: "text-align:center;" },
          h("input", {
            type: "checkbox",
            checked: m.enabled !== false ? true : undefined,
            onchange: (e) => {
              m.enabled = e.target.checked;
            },
          }),
        ),
      );
      tbody.appendChild(tr);
    }
    // 更新态报
    refreshOfficialByokStatus();
  }

  async function refreshOfficialByokStatus() {
    const ov = S.config && S.config.officialByokOverrides;
    const en = ov && ov.enabled === true;
    const map = (ov && ov.map) || {};
    const cnt = Object.keys(map).filter((k) => {
      const t = map[k];
      return t && t.provider && t.model && t.enabled !== false;
    }).length;
    $("#ob-enabled").textContent = en ? "✓ 启用" : "✗ 未启";
    $("#ob-count").textContent = String(cnt);
    $("#ob-gw").textContent = S.gwUrl;
    // 配置路径 / 反代核 BYOK 态 (透传 extension host)
    vscodeMsg("queryByokStatus");
  }

  async function saveOfficialByok() {
    if (!S.config) return false;
    S.config.officialByokOverrides = S.config.officialByokOverrides || {
      enabled: false,
      map: {},
    };
    S.config.officialByokOverrides.enabled = $("#officialByokEnabled").checked;
    // 校验: 启用项必须有 provider + model
    if (S.config.officialByokOverrides.enabled) {
      const bad = [];
      for (const slot of OFFICIAL_BYOK_SLOTS) {
        const m = S.config.officialByokOverrides.map[slot.uid] || {};
        if (m.enabled !== false && (!m.provider || !m.model)) {
          bad.push(slot.label);
        }
      }
      if (bad.length) {
        toast(
          `下列槽位未配 provider/model: ${bad.join(", ")} (可改 enabled=false 跳过)`,
          "warn",
          5000,
        );
        // 不阻止 · 警告即可
      }
    }
    // 1. 走标准 saveConfig 流 · 写盘
    const ok = await saveConfig(false);
    if (!ok) return false;
    // 2. 命 extension host 通知反代核热更
    vscodeMsg("refreshByok");
    toast("官方 4 BYOK 劫已保存 + 反代核热更", "ok");
    return true;
  }

  // ── 别名 ─────────────────────────────────────────
  function renderAliases() {
    const tbody = $("#aliasTbody");
    tbody.innerHTML = "";
    const keys = Object.keys(S.aliases || {}).filter((k) => !k.startsWith("_"));
    if (!keys.length) {
      tbody.appendChild(
        h(
          "tr",
          {},
          h("td", {
            colspan: 3,
            class: "muted",
            style: "text-align:center;padding:14px;",
            text: "无别名. 点 ＋新增 添加.",
          }),
        ),
      );
      return;
    }
    for (const k of keys) {
      const row = h("tr");
      row.appendChild(
        h(
          "td",
          {},
          h("input", {
            type: "text",
            value: k,
            oninput: (e) => {
              const nk = e.target.value.trim();
              if (!nk || nk === k) return;
              S.aliases[nk] = S.aliases[k];
              delete S.aliases[k];
            },
          }),
        ),
      );
      row.appendChild(
        h(
          "td",
          {},
          h("input", {
            type: "text",
            value: S.aliases[k],
            oninput: (e) => {
              S.aliases[k] = e.target.value.trim();
            },
          }),
        ),
      );
      row.appendChild(
        h(
          "td",
          { class: "right" },
          h(
            "button",
            {
              class: "btn small danger",
              onclick: () => {
                delete S.aliases[k];
                renderAliases();
              },
            },
            "删",
          ),
        ),
      );
      tbody.appendChild(row);
    }
  }

  // ── 诊断 ─────────────────────────────────────────
  async function runDiag() {
    const host = $("#diagResult");
    host.innerHTML = "";
    const add = (title, ok, detail) => {
      const cls = ok === true ? "ok" : ok === "warn" ? "warn" : "err";
      const sec = h("div", { class: "diag-sec" }, [
        h("div", { class: "title" }, [
          h("span", { text: title }),
          h("span", {
            class: `chip ${cls}`,
            text: ok === true ? "✓" : ok === "warn" ? "!" : "✗",
          }),
        ]),
        h("pre", {
          text:
            typeof detail === "string"
              ? detail
              : JSON.stringify(detail, null, 2),
        }),
      ]);
      host.appendChild(sec);
    };

    // 1. health
    try {
      const r = await fetch(S.gwUrl + "/health").then((x) => x.json());
      add("网关 /health", true, r);
    } catch (e) {
      add("网关 /health", false, e.message);
      return;
    }
    // 2. diag
    try {
      const r = await api("GET", "/__dao/diag");
      add("网关 /__dao/diag", true, r);
    } catch (e) {
      add("网关 /__dao/diag", false, e.message);
    }
    // 3. providers
    try {
      const r = await api("GET", "/__dao/providers");
      const ok = r.providers?.length > 0;
      add(
        `已启用 Provider (${r.providers?.length || 0})`,
        ok || "warn",
        (r.providers || [])
          .map(
            (p) =>
              `${p.hasKey || p.driver === "ollama" ? "✓" : "!"} ${p.name.padEnd(18)} [${p.driver}]  ${p.models.length} models`,
          )
          .join("\n") || "(空)",
      );
    } catch (e) {
      add("已启用 Provider", false, e.message);
    }
    // 4. models
    try {
      const r = await api("GET", "/v1/models");
      add(
        `模型目录 /v1/models (${r.data?.length || 0})`,
        true,
        (r.data || [])
          .slice(0, 20)
          .map((m) => `- ${m.id}`)
          .join("\n") +
          ((r.data?.length || 0) > 20 ? `\n...(+${r.data.length - 20})` : ""),
      );
    } catch (e) {
      add("模型目录 /v1/models", false, e.message);
    }
    // 5. 自测核心翻译 (跳过 --test 只查自举状态)
    add(
      "注意",
      "warn",
      "协议翻译单元测试请在终端运行: node gateway/server.js --test\nCascade 原生注入: settings.json 加 codeium.apiServerUrl + 启 010 反代 + 070 桥自接 (无需手动注入)\n四问体检: .\\_doctor.ps1",
    );
  }

  // ── 日志 ─────────────────────────────────────────
  function appendLogRow(x) {
    const view = $("#logView");
    const row = h("span", { class: `log-row ${x.level}` }, [
      h("span", {
        class: "ts",
        text: new Date(x.ts).toISOString().slice(11, 19),
      }),
      h("span", { class: "lvl", text: x.level.toUpperCase() }),
      h("span", { class: "msg", text: x.line }),
      "\n",
    ]);
    view.appendChild(row);
  }

  async function refreshLogsOnce(reset = false) {
    const lvl = $("#logLevelFilter").value || "";
    try {
      const q = new URLSearchParams();
      q.set("n", "300");
      if (lvl) q.set("level", lvl);
      if (!reset && S.logs.lastTs) q.set("since", String(S.logs.lastTs));
      const r = await api("GET", "/__dao/logs?" + q.toString());
      if (reset) {
        $("#logView").innerHTML = "";
        S.logs.items = [];
        S.logs.lastTs = 0;
      }
      for (const it of r.items || []) {
        if (it.ts > S.logs.lastTs) S.logs.lastTs = it.ts;
        S.logs.items.push(it);
        appendLogRow(it);
      }
      if ((r.items || []).length && $("#logsAutoscroll").checked) {
        const v = $("#logView");
        v.scrollTop = v.scrollHeight;
      }
      if (reset && (r.items || []).length === 0) {
        $("#logView").textContent = "无日志.";
      }
    } catch (e) {
      $("#logView").textContent = "读取日志失败: " + e.message;
    }
  }

  function startLogsPoll() {
    if (S.logsPollTimer) return;
    S.logsPollTimer = setInterval(() => {
      if (S.tab !== "logs") return;
      if (!$("#logsLive").checked) return;
      refreshLogsOnce(false);
    }, 1500);
  }

  // ── 总指挥 ───────────────────────────────────────
  async function init() {
    // 从 window.__DAO_INIT__ 读取 VSIX 注入的初始参数
    const init = window.__DAO_INIT__ || {};
    S.gwUrl = (init.gatewayUrl || S.gwUrl).replace(/\/+$/, "");
    S.authKey = init.gatewayAuthKey || "";

    // 标签点击 / 快捷跳转
    $$(".tab").forEach((b) =>
      b.addEventListener("click", () => setTab(b.dataset.tab)),
    );
    $$("[data-tab-goto]").forEach((b) =>
      b.addEventListener("click", () => setTab(b.dataset.tabGoto)),
    );

    // 顶部按钮
    document.body.addEventListener("click", async (ev) => {
      const t = ev.target.closest("[data-cmd]");
      if (!t) return;
      const cmd = t.dataset.cmd;
      if (cmd === "startGateway") {
        vscodeMsg("startGateway");
        toast("已请求启动网关…", "info");
      }
      if (cmd === "reload") {
        await reloadAll();
        toast("已重载", "ok");
      }
      if (cmd === "openConfigFile") {
        vscodeMsg("openConfigFile");
      }
      if (cmd === "openOutput") {
        vscodeMsg("openOutput");
      }
      if (cmd === "saveConfig") {
        await saveConfig();
      }
      if (cmd === "probeAll") {
        probeAll();
      }
      if (cmd === "probeStop") {
        probeStop();
      }
      if (cmd === "saveCascade") {
        S.config.cascadeInjection = S.config.cascadeInjection || {};
        S.config.cascadeInjection.enabled = $("#cascadeEnabled").checked;
        S.config.cascadeInjection.injectModels = S.injectModels;
        if (await saveConfig(false)) toast("Cascade 注入配置已保存", "ok");
      }
      if (cmd === "saveAliases") {
        S.config.aliases = S.aliases;
        if (await saveConfig(false)) toast("别名已保存", "ok");
      }
      if (cmd === "saveOfficialByok") {
        await saveOfficialByok();
      }
      if (cmd === "runDiag") {
        await runDiag();
      }
      if (cmd === "refreshLogs") {
        await refreshLogsOnce(true);
      }
    });

    // 搜索
    $("#providerSearch").addEventListener("input", () => renderProviders());
    $("#probeSearch").addEventListener("input", () => renderProbe());

    // 添加注入
    $("#btnAddInject").addEventListener("click", () => {
      S.injectModels.push({
        provider: "github",
        model: "openai/gpt-4.1-mini",
        label: "新条目",
        supportsImages: false,
        supportsToolCalls: true,
        maxTokens: 128000,
      });
      renderInject();
    });
    // 添加别名
    $("#btnAddAlias").addEventListener("click", () => {
      let i = 1;
      let name = "new-alias";
      while (S.aliases[name]) name = "new-alias-" + ++i;
      S.aliases[name] = "";
      renderAliases();
    });
    // 清屏日志
    $("#btnClearLogs").addEventListener("click", () => {
      $("#logView").innerHTML = "";
      S.logs.items = [];
      S.logs.lastTs = 0;
    });
    $("#logLevelFilter").addEventListener("change", () =>
      refreshLogsOnce(true),
    );

    // 接收来自 extension host 的消息
    window.addEventListener("message", (ev) => {
      const m = ev.data || {};
      if (m.type === "configChanged") {
        reloadAll();
      }
      if (m.type === "toast") {
        toast(m.message || "", m.kind || "info");
      }
      // dao-proxy-max v1.0.0 · 反代核 BYOK 态推送
      if (m.type === "byokStatus") {
        const st = m.status || {};
        S.proxyByokStatus = st; // v1.0.6 · 缓存供"核心 API"主 tab 用
        const el1 = $("#ob-proxy");
        if (el1) {
          if (st.ready === true) {
            el1.textContent = `✓ ${st.count || 0} 模 (注入) · 官方劫 ${st.official?.count || 0}`;
          } else {
            el1.textContent = "✗ " + (st.reason || "未就绪");
          }
        }
        const el2 = $("#ob-cfg");
        if (el2 && st.config) {
          el2.textContent = st.config;
          el2.title = st.config;
        }
        // v1.0.6 · 若当前在核心 API tab, 刷四大态卡 + BYOK 名册 + 官方 mini
        if (S.tab === "coreapi") {
          _renderCoreProxyCard(S.proxyByokStatus);
          _renderCoreByokCountCard(S.proxyByokStatus);
          _renderCoreOfficialCard(S.proxyByokStatus, S.config);
          _renderCoreByokList(S.proxyByokStatus);
        }
      }
    });

    await reloadAll();

    // 健康探测 & 日志轮询
    S.healthTimer = setInterval(refreshOverview, 15000);
    startLogsPoll();

    // 恢复上次 tab
    try {
      const prev = vscode.getState?.();
      if (prev?.tab) setTab(prev.tab);
    } catch {}
  }

  async function reloadAll() {
    await loadConfig();
    await loadProbeModels();
    await refreshOverview();
    if (S.tab === "providers") renderProviders();
    if (S.tab === "probe") renderProbe();
    if (S.tab === "cascade") renderInject();
    if (S.tab === "officialByok") renderOfficialByok();
    if (S.tab === "aliases") renderAliases();
  }

  // Go!
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
