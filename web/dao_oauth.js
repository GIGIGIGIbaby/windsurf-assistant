// dao_oauth.js · 印 130 · GitHub OAuth Device-Flow · 一键登 · 去中心化
//
// 帛书·四十八: 「为道者日损 · 损之又损 · 以至于无为 · 无为而无不为」
// 帛书·廿二: 「圣人执一 · 以为天下牧」
// 帛书·廿五: 「道法自然」
//
// 主公诏 (2026-05-17):
//   「从用户公网登录 github 账号后 后端连接操作同步一切底层 · 去中心化」
//
// 印 130 之核:
//   损 PAT 之繁 (用户必懂去 settings/tokens · 选 scope · 拷贝) ·
//   立 Device-Flow 之朴 (一钮 → 跳 GH 页 · 输 8 位 user-code · 授权回)
//
// Device-Flow (RFC 8628 · GitHub OAuth) 流:
//   1. POST https://github.com/login/device/code (client_id + scope)
//      → { device_code, user_code (类 ABCD-1234), verification_uri,
//          interval (秒), expires_in (15 min) }
//   2. 显 user_code 给用户 · 自动 window.open verification_uri
//      用户在 GH 页输 8 位 user-code · 选授权范围 · 确认
//   3. App 端 poll POST /login/oauth/access_token (device_code, grant_type)
//      → { access_token, token_type, scope } 即成
//      或 { error: 'authorization_pending' | 'slow_down' | 'expired_token' }
//
// 关键: GH /login/oauth/access_token 自 2022-05-10 起支持浏览器 CORS
//        (blog: 「Supporting CORS preflight requests on github.com」)
//        故浏览器可直调 · 无需后端 · **真去中心化**
//
// 兼容: OAuth access_token 与 PAT API 等价 (Authorization: token <X>)
//       故拿到 token 后 daoSync.setPat(token) 即 · 复用 oneShot 全链路
//       一处加 OAuth · 万处自然受益 · 帛书廿二「圣人执一」
//
// 守隐: token 仅入 localStorage · 与 PAT 等同 · 不外发 · 主公 zhouyoukang
//        不见任一字节 (OAuth App 仅颁发器 · token 由 GH 直返用户浏览器)
//
// 暴 (依赖 window.daoSync 之 setPat / clearPat · 共用 localStorage):
//   window.daoOAuth = {
//     CLIENT_ID: <主公 OAuth App 之 client_id>,
//     start({ scope?, onCode, onPoll, onSuccess, onError }) -> { cancel() }
//     isConfigured() -> bool (CLIENT_ID 已设)
//     setupHint() -> { hint, url, steps[] }
//   };

(function () {
  "use strict";

  // ═══════════════════════════════════════════════════════════════════
  // § 配置 · CLIENT_ID
  // ═══════════════════════════════════════════════════════════════════
  // 主公 OAuth App client_id · 公开值 · 嵌入即可 · 用户无须自建
  //   建步骤 (主公一次"为" · 5 min):
  //     ① https://github.com/settings/developers → New OAuth App
  //     ② App name: "Windsurf Assistant (道独立体)"
  //     ③ Homepage URL: https://zhouyoukang.github.io/windsurf-assistant/
  //     ④ Authorization callback URL: 同 Homepage (device-flow 不用)
  //     ⑤ 勾选 ☑ "Enable Device Flow" (关键 · 不勾则 device-flow 不通)
  //     ⑥ 建之 · 拿到 Client ID (Ov23li... 或 Iv1...) · 填入下行
  //
  // window.__DAO_OAUTH_CLIENT_ID__ override (印 130.1 · 印 138 治 fork 子 OAuth 路径):
  //   用户 fork 后 fork 即继承主公值 · 但若主公未建 / 用户自建 OAuth App ·
  //   可于 index.html <head> 加: <script>window.__DAO_OAUTH_CLIENT_ID__='Ov23li...'</script>
  const DEFAULT_CLIENT_ID = "Ov23liYINDAO130PLACEHLDR"; // 主公 OAuth App 未建之 placeholder
  // let (非 const) · 守门 mock 时可经 __setUrlsForTest 注 (生产路径不动)
  let CLIENT_ID =
    (typeof window !== "undefined" && window.__DAO_OAUTH_CLIENT_ID__) ||
    DEFAULT_CLIENT_ID;

  // let (非 const) · 守门 mock 时可经 __setUrlsForTest 注 (生产路径不动)
  let GH_DEVICE_CODE_URL = "https://github.com/login/device/code";
  let GH_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";

  // OAuth scope · 与 PAT 等价 (daoSync · daoBootstrap 全链路所需)
  //   repo     · fork + write + actions dispatch
  //   gist     · 私有 Gist 读写 (dao.json + dao-pool.json)
  //   workflow · oneShot ⑤ dispatch dao-fleet-cloud workflow
  const DEFAULT_SCOPE = "repo gist workflow";

  // poll 控
  const DEFAULT_POLL_INTERVAL_S = 5; // GH 默 · server 实际 interval 字段优先
  const MAX_EXPIRES_S = 900; // 15 min 兜底 (GH 默)
  const SLOW_DOWN_INC_S = 5; // slow_down 时加 5s

  // 验 client_id 已配 (排 placeholder)
  function isConfigured() {
    return (
      typeof CLIENT_ID === "string" &&
      CLIENT_ID.length > 0 &&
      CLIENT_ID !== DEFAULT_CLIENT_ID &&
      !/PLACEHLDR/i.test(CLIENT_ID)
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // § HTTP 助手 (复用 daoSync.fetch 模式 · 不引外库)
  // ═══════════════════════════════════════════════════════════════════
  async function postJson(url, body) {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json", // 关键 · 不加则 GH 返 url-encoded
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    let json = null;
    try {
      json = await r.json();
    } catch {}
    return { status: r.status, json: json, ok: r.ok };
  }

  // ═══════════════════════════════════════════════════════════════════
  // § Device-Flow 起始 · POST /login/device/code
  // ═══════════════════════════════════════════════════════════════════
  async function requestDeviceCode(scope) {
    const r = await postJson(GH_DEVICE_CODE_URL, {
      client_id: CLIENT_ID,
      scope: scope || DEFAULT_SCOPE,
    });
    if (!r.ok || !r.json || !r.json.device_code) {
      // 印 130 修 · GH 之 error 字段标 (RFC 6749) · error_description 是人语 hint
      // GH 实测返 { error: "client_id_invalid", error_description: "client_id is invalid" }
      // 真本源拓宽: 检 error 标 (优先) + error_description (兜底) · 正则容下划线/空格两体
      const errCode = (r.json && r.json.error) || "";
      const errDesc = (r.json && r.json.error_description) || "";
      const errAny =
        errCode || errDesc || "device_code_request_failed_" + r.status;
      const isClientIdInvalid =
        errCode === "client_id_invalid" ||
        /client[_\s]?id[_\s]+(is[_\s]+)?invalid|invalid[_\s]+client[_\s]?id?/i.test(
          errCode + " " + errDesc,
        );
      if (isClientIdInvalid) {
        throw new Error(
          "client_id_invalid · 主公 OAuth App 未建 · 见 docs/印130 (5 min 一次)" +
            (errDesc ? " · 详: " + errDesc : ""),
        );
      }
      throw new Error(errAny);
    }
    return {
      device_code: r.json.device_code,
      user_code: r.json.user_code, // 如 "ABCD-1234"
      verification_uri:
        r.json.verification_uri || "https://github.com/login/device",
      verification_uri_complete: r.json.verification_uri_complete || null,
      expires_in: Math.min(
        r.json.expires_in || MAX_EXPIRES_S,
        MAX_EXPIRES_S * 2,
      ),
      interval: r.json.interval || DEFAULT_POLL_INTERVAL_S,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // § Poll access_token · POST /login/oauth/access_token
  // ═══════════════════════════════════════════════════════════════════
  async function pollAccessToken(deviceCode) {
    const r = await postJson(GH_ACCESS_TOKEN_URL, {
      client_id: CLIENT_ID,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    // GH 三种正常错: authorization_pending / slow_down / expired_token / access_denied
    if (r.json && r.json.error) {
      return { status: "pending", error: r.json.error };
    }
    if (r.json && r.json.access_token) {
      return {
        status: "success",
        access_token: r.json.access_token,
        token_type: r.json.token_type || "bearer",
        scope: r.json.scope || "",
      };
    }
    return {
      status: "unknown",
      error: "unexpected_response_" + r.status,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // § 主接口 · start({ scope, onCode, onPoll, onSuccess, onError })
  // ═══════════════════════════════════════════════════════════════════
  // 返 { cancel() } · 用户/UI 可取消之
  function start(opts) {
    opts = opts || {};
    const onCode = opts.onCode || function () {};
    const onPoll = opts.onPoll || function () {};
    const onSuccess = opts.onSuccess || function () {};
    const onError = opts.onError || function () {};
    const scope = opts.scope || DEFAULT_SCOPE;

    let cancelled = false;
    let pollTimer = null;

    const ctx = { cancelled: false };
    function cancel() {
      cancelled = true;
      ctx.cancelled = true;
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    }

    (async () => {
      // 一 · 取 device_code
      let dc;
      try {
        dc = await requestDeviceCode(scope);
      } catch (e) {
        return onError({
          stage: "device_code",
          message: e.message,
        });
      }
      if (cancelled) return;

      onCode({
        user_code: dc.user_code,
        verification_uri: dc.verification_uri,
        verification_uri_complete: dc.verification_uri_complete,
        expires_in: dc.expires_in,
        interval: dc.interval,
      });

      // 二 · 轮询 access_token
      const startedAt = Date.now();
      const expiresAtMs = startedAt + dc.expires_in * 1000;
      let interval = dc.interval;
      let polls = 0;

      const poll = async () => {
        if (cancelled) return;
        if (Date.now() > expiresAtMs) {
          return onError({
            stage: "poll",
            message: "expired_token · user_code 过期 · 请重启",
            elapsed: Math.round((Date.now() - startedAt) / 1000),
          });
        }
        polls += 1;
        let result;
        try {
          result = await pollAccessToken(dc.device_code);
        } catch (e) {
          return onError({ stage: "poll", message: e.message });
        }
        if (cancelled) return;

        if (result.status === "success") {
          // 三 · 入 localStorage (与 PAT 同槽 · 复用 oneShot 全链)
          if (window.daoSync && typeof window.daoSync.setPat === "function") {
            try {
              window.daoSync.setPat(result.access_token);
            } catch (e) {
              return onError({
                stage: "store",
                message: "setPat fail: " + e.message,
              });
            }
          }
          return onSuccess({
            access_token: result.access_token,
            token_type: result.token_type,
            scope: result.scope,
            polls: polls,
            elapsed: Math.round((Date.now() - startedAt) / 1000),
          });
        }

        // pending 类
        if (result.error === "slow_down") {
          interval += SLOW_DOWN_INC_S; // GH 要求加 5s
        }
        if (result.error === "expired_token") {
          return onError({
            stage: "poll",
            message: "expired_token · user_code 过期 · 请重启",
            elapsed: Math.round((Date.now() - startedAt) / 1000),
          });
        }
        if (result.error === "access_denied") {
          return onError({
            stage: "poll",
            message: "access_denied · 用户拒授权",
            elapsed: Math.round((Date.now() - startedAt) / 1000),
          });
        }
        // authorization_pending 之类 · 继续
        onPoll({
          polls: polls,
          interval: interval,
          state: result.error || "pending",
          remaining_s: Math.max(
            0,
            Math.round((expiresAtMs - Date.now()) / 1000),
          ),
        });
        pollTimer = setTimeout(poll, interval * 1000);
      };

      // 始 poll · 初次延 interval (按 RFC 8628)
      pollTimer = setTimeout(poll, interval * 1000);
    })();

    return { cancel };
  }

  // ═══════════════════════════════════════════════════════════════════
  // § 主公 OAuth App 配置 hint (UI 可显)
  // ═══════════════════════════════════════════════════════════════════
  function setupHint() {
    return {
      configured: isConfigured(),
      client_id: CLIENT_ID,
      url: "https://github.com/settings/developers",
      hint: isConfigured()
        ? "OAuth App 已配 · 一钮即登"
        : "主公 OAuth App 未建 · 详见 docs/印130 · 5 min 一次为",
      steps: [
        "① https://github.com/settings/developers → New OAuth App",
        "② App name: Windsurf Assistant (道独立体)",
        "③ Homepage URL: <your-pages-url>",
        "④ Callback URL: 同 Homepage (device-flow 不用)",
        "⑤ ☑ Enable Device Flow (关键)",
        "⑥ 拿 Client ID → 填 dao_oauth.js DEFAULT_CLIENT_ID 或 window.__DAO_OAUTH_CLIENT_ID__",
      ],
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // § 暴 · 公开 API
  // ═══════════════════════════════════════════════════════════════════
  window.daoOAuth = {
    get CLIENT_ID() {
      return CLIENT_ID;
    },
    DEFAULT_SCOPE: DEFAULT_SCOPE,
    get GH_DEVICE_CODE_URL() {
      return GH_DEVICE_CODE_URL;
    },
    get GH_ACCESS_TOKEN_URL() {
      return GH_ACCESS_TOKEN_URL;
    },
    isConfigured: isConfigured,
    start: start,
    setupHint: setupHint,
    // 印 130 · 守门 hook · mock 时可覆 GH endpoint URLs + client_id (生产不调)
    //   _seal130_oauth_device_flow_smoke.cjs 起 mock server 后调此注 URL
    //   不外发 · 不污染生产 (生产时 URLs 默 github.com)
    __setUrlsForTest: function (urls) {
      if (urls && urls.deviceCode) GH_DEVICE_CODE_URL = String(urls.deviceCode);
      if (urls && urls.accessToken)
        GH_ACCESS_TOKEN_URL = String(urls.accessToken);
      if (urls && urls.clientId) CLIENT_ID = String(urls.clientId);
      return {
        deviceCode: GH_DEVICE_CODE_URL,
        accessToken: GH_ACCESS_TOKEN_URL,
        clientId: CLIENT_ID,
      };
    },
  };
})();
