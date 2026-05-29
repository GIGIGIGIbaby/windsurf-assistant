"use strict";
/**
 * runtime.js · 外接api 运行时 · 道法自然
 * ════════════════════════════════════════════════════════════════
 *
 *   《帛书·四十八章》: "为道者日损 · 损之又损 · 以至于无为 · 无为而无不为"
 *   《阴符经》: "天生天杀 · 道之理也"
 *
 *   职能:
 *     1. 初始化 dao_router.js (模型路由核心)
 *     2. 初始化 cascade_wire.js (protobuf 编解码)
 *     3. 为 extension.js tryStartExternalApi 提供 ExternalApiRuntime 类
 *     4. 为 source.js 提供路由判断 + 路由执行
 *
 *   接口 (对 extension.js):
 *     new ExternalApiRuntime({ vscodeModule, logger, configKey, vendorPrefix })
 *     .start()   → { gatewayUrl, providers, models }
 *     .stop()    → void
 *     .isRunning() → bool
 *     .getStatus() → { gatewayUrl, providers, models, routerReady, routerCount }
 *
 *   接口 (对 source.js):
 *     getRouter()  → dao_router 实例 (null if not ready)
 *     shouldRoute(modelUid) → bool
 *     route(req, res, rawBody, isJSON, modelUid) → Promise<bool>
 */

const path = require("path");
const fs = require("fs");

// ── 核心模块路径 ──
const CORE_DIR = path.join(__dirname, "core");
const ROUTER_PATH = path.join(CORE_DIR, "dao_router.js");
const WIRE_PATH = path.join(CORE_DIR, "cascade_wire.js");

// ── 配置路径查找 ──
//   1. 用户级: ~/.codeium/dao-byok/配置.json (跨 VSIX install 持久)
//   2. 同目录: core/配置.json (VSIX 内自包含)
//   3. 环境变量: DAO_BYOK_CONFIG
function _resolveConfigPath() {
  if (
    process.env.DAO_BYOK_CONFIG &&
    fs.existsSync(process.env.DAO_BYOK_CONFIG)
  ) {
    return path.resolve(process.env.DAO_BYOK_CONFIG);
  }
  const home = process.env.USERPROFILE || process.env.HOME || "";
  if (home) {
    const userCfg = path.join(home, ".codeium", "dao-byok", "配置.json");
    if (fs.existsSync(userCfg)) return userCfg;
  }
  const bundledCfg = path.join(CORE_DIR, "配置.json");
  if (fs.existsSync(bundledCfg)) return bundledCfg;
  return bundledCfg; // 默认 (dao_router init 会报错但安全)
}

// ════════════════════════════════════════════════════════════════
// ExternalApiRuntime · extension.js 用
// ════════════════════════════════════════════════════════════════

class ExternalApiRuntime {
  constructor(opts = {}) {
    this._vscode = opts.vscodeModule || null;
    this._log = opts.logger || {
      info: console.log,
      warn: console.warn,
      error: console.error,
    };
    this._configKey = opts.configKey || "dao.外接api";
    this._vendorPrefix = opts.vendorPrefix || "dao-";
    this._router = null;
    this._wire = null;
    this._running = false;
    this._gatewayUrl = "";
    this._configPath = "";
  }

  async start() {
    if (this._running) return this.getStatus();

    // 加载 dao_router
    try {
      const Router = require(ROUTER_PATH);
      this._configPath = _resolveConfigPath();
      const result = Router.init({
        log: (msg) => {
          try {
            this._log.info("外接api", msg);
          } catch {}
        },
        configPath: this._configPath,
      });
      if (result.ready) {
        this._router = Router;
        this._gatewayUrl = result.gateway || "";
        this._running = true;
        this._log.info(
          "外接api",
          `路由就绪 · ${result.count}条 · gw=${this._gatewayUrl}`,
        );
      } else {
        this._log.warn(
          "外接api",
          `路由未就绪: ${result.error || result.reason || "unknown"}`,
        );
      }
    } catch (e) {
      this._log.warn("外接api", `dao_router load fail: ${e.message}`);
    }

    // 加载 cascade_wire
    try {
      this._wire = require(WIRE_PATH);
    } catch (e) {
      this._log.warn("外接api", `cascade_wire load fail: ${e.message}`);
      this._wire = null;
    }

    return this.getStatus();
  }

  async stop() {
    this._router = null;
    this._wire = null;
    this._running = false;
  }

  isRunning() {
    return this._running && this._router && this._router.isReady();
  }

  getStatus() {
    const routerStatus = this._router ? this._router.status() : null;
    return {
      gatewayUrl: this._gatewayUrl,
      providers: routerStatus ? routerStatus.providers : [],
      models: routerStatus ? routerStatus.count : 0,
      routerReady: routerStatus ? routerStatus.ready : false,
      routerCount: routerStatus ? routerStatus.count : 0,
      configPath: this._configPath,
      wire: !!this._wire,
    };
  }

  /** 对 source.js 暴露路由器 */
  getRouter() {
    return this._running ? this._router : null;
  }

  getWire() {
    return this._wire;
  }
}

// ════════════════════════════════════════════════════════════════
// 模块级单例 · source.js 直接 require 本文件即可用
// ════════════════════════════════════════════════════════════════

let _singleton = null;

/**
 * 获取/创建模块级单例
 * source.js 在模块顶层调一次: const ea = require("../外接api/runtime.js").ensure({log});
 * 之后在 _mainHandler 中用 ea.shouldRoute() / ea.route()
 */
function ensure(opts = {}) {
  if (!_singleton) {
    _singleton = new ExternalApiRuntime(opts);
    // 自动初始化 (不 await — source.js 模块顶层不能 await)
    // 真正的 init 在 start() 被调时完成
    // 但我们可以同步做 init (dao_router.init 是同步的)
    try {
      const Router = require(ROUTER_PATH);
      const configPath = _resolveConfigPath();
      const result = Router.init({
        log:
          opts.log ||
          ((msg) => {
            try {
              console.log(msg);
            } catch {}
          }),
        configPath,
      });
      if (result.ready) {
        _singleton._router = Router;
        _singleton._gatewayUrl = result.gateway || "";
        _singleton._running = true;
        _singleton._configPath = configPath;
      }
    } catch (e) {
      try {
        (opts.log || console.log)(`[外接api] ensure init fail: ${e.message}`);
      } catch {}
    }
    try {
      _singleton._wire = require(WIRE_PATH);
    } catch {}
  }
  return _singleton;
}

/**
 * 快速路由判断 (source.js 用)
 * @param {string} modelUid
 * @returns {boolean}
 */
function shouldRoute(modelUid) {
  if (!_singleton || !_singleton._router) return false;
  return _singleton._router.shouldRoute(modelUid);
}

/**
 * 从 rawBody 提取 modelUid (source.js 用)
 * @param {Buffer} rawBody
 * @param {boolean} isJSON
 * @returns {string|null}
 */
function extractModelUid(rawBody, isJSON) {
  if (!_singleton || !_singleton._router) return null;
  return _singleton._router.extractModelUid(rawBody, isJSON);
}

/**
 * 执行路由 (source.js 用)
 * @returns {Promise<boolean>} true=已路由并响应 / false=应走原路
 */
async function route(req, res, rawBody, isJSON, modelUid) {
  if (!_singleton || !_singleton._router) return false;
  return _singleton._router.route(req, res, rawBody, isJSON, modelUid);
}

/** 路由器状态 (source.js /origin/ping 用) */
function routerStatus() {
  if (!_singleton || !_singleton._router) return { ready: false, count: 0 };
  return _singleton._router.status();
}

/** substitute模式: 获取替代目标UID (source.js 用) */
function getSubstitution(modelUid) {
  if (!_singleton || !_singleton._router) return null;
  return _singleton._router.getSubstitution(modelUid);
}

/** substitute模式: patch protobuf field 21 (source.js 用) */
function patchModelUid(rawBody, isJSON, oldUid, newUid) {
  if (!_singleton || !_singleton._router) return null;
  return _singleton._router.patchModelUid(rawBody, isJSON, oldUid, newUid);
}

module.exports = {
  ExternalApiRuntime,
  ensure,
  shouldRoute,
  extractModelUid,
  route,
  routerStatus,
  getSubstitution,
  patchModelUid,
};
