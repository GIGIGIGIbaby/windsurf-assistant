// v10.0.3 · 道兄代发之器 · 孙子 "兵无常势水无常形 因敌能变化者谓之神"
// 用捕真 chat 之 auth 头与 upstream route, 代兄发任意 body 至上游, 收真响应.
//
// 暴露二端 (经 source.js _mainHandler 调):
//   /origin/send_raw          POST {body_b64, path?, host?, headers_override?, apply_sp_transform?}
//   /origin/replay_user_text  POST {user_text}  · 取 _lastChatRawBody, 替最末用户消息文 → 上游
//
// 道义: 五十六章 "知者不言, 言者不知 · 是谓玄同"; 二十一章 "其精甚真, 其中有信".

"use strict";

const H1_CONN = new Set([
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "proxy-connection",
  "content-length",
]);

function _buildH2Headers(method, path, host, captured, override) {
  const merged = { ...(captured || {}), ...(override || {}) };
  const h2 = {
    ":method": method || "POST",
    ":path": path,
    ":authority": host,
    ":scheme": "https",
  };
  for (const [k, v] of Object.entries(merged)) {
    if (!k.startsWith(":") && !H1_CONN.has(k.toLowerCase())) h2[k] = v;
  }
  return h2;
}

function _decodeGrpcFrames(buf) {
  // gRPC frame: [1B flag][4B BE len][body...]
  // flag bit0=1 → trailers (text/proto)
  const out = { frames: 0, payloads_text: [], trailer_text: null, trailer_status: null };
  let off = 0;
  while (off + 5 <= buf.length) {
    const flag = buf[off];
    const len =
      (buf[off + 1] << 24) |
      (buf[off + 2] << 16) |
      (buf[off + 3] << 8) |
      buf[off + 4];
    if (len < 0 || off + 5 + len > buf.length) break;
    const body = buf.slice(off + 5, off + 5 + len);
    off += 5 + len;
    out.frames++;
    if (flag & 1) {
      // trailer (HTTP/2 trailer-frame in body)
      try {
        out.trailer_text = body.toString("utf8");
      } catch {}
    } else {
      // try utf8 / proto leaf string extraction (heuristic)
      try {
        const t = body.toString("utf8");
        // collect leaf-text appearance for human eye
        out.payloads_text.push(t);
      } catch {}
    }
  }
  return out;
}

function _extractAssistantTextFromFrames(buf, parseProto) {
  // 启发: 上游 chat 流式响应, 每一 data frame 内 protobuf 含模型增量文.
  // 试: 为每 frame 之 body proto 解, 取 utf8 leaf string 之最长者作答增量 (粗启发).
  const out = [];
  let off = 0;
  while (off + 5 <= buf.length) {
    const flag = buf[off];
    const len =
      (buf[off + 1] << 24) |
      (buf[off + 2] << 16) |
      (buf[off + 3] << 8) |
      buf[off + 4];
    if (len < 0 || off + 5 + len > buf.length) break;
    const body = buf.slice(off + 5, off + 5 + len);
    off += 5 + len;
    if (flag & 1) continue;
    try {
      const fields = parseProto(body);
      // 收集所有 wire=2 之 utf8 leaf · 串
      const collected = [];
      const walk = (f, depth) => {
        if (depth > 6) return;
        for (const fn of Object.keys(f)) {
          const arr = f[fn];
          for (const e of arr) {
            if (e.w !== 2) continue;
            const b = Buffer.isBuffer(e.b) ? e.b : Buffer.from(e.b);
            // try parse nested
            let parsedNested = false;
            if (b.length > 4) {
              try {
                const nested = parseProto(b);
                if (Object.keys(nested).length > 0) {
                  walk(nested, depth + 1);
                  parsedNested = true;
                }
              } catch {}
            }
            if (!parsedNested && b.length > 0) {
              try {
                const t = b.toString("utf8");
                // 启发: 仅留可显文 (filter out binary)
                if (/^[\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]*$/.test(t) && t.length > 0) {
                  collected.push(t);
                }
              } catch {}
            }
          }
        }
      };
      walk(fields, 0);
      if (collected.length) out.push(...collected);
    } catch {}
  }
  return out.join("");
}

// 公: 发任意 body
function handleSendRaw(rawReqBody, res, ctx) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  let reqJson;
  try {
    reqJson = JSON.parse(rawReqBody.toString("utf8") || "{}");
  } catch (e) {
    res.statusCode = 400;
    res.end(JSON.stringify({ ok: false, error: "bad_json", message: e.message }));
    return;
  }
  const captured = ctx.getCapturedHeaders();
  const route = ctx.getCapturedRoute();
  if (!captured || !route) {
    res.statusCode = 400;
    res.end(
      JSON.stringify({
        ok: false,
        error: "no_captured_auth",
        hint: "等兄经 Windsurf 发一 chat, proxy 自捕 auth + route 后方可代发. /origin/captured_auth_status 察.",
      }),
    );
    return;
  }
  let bodyBuf = Buffer.from(reqJson.body_b64 || "", "base64");
  if (reqJson.apply_sp_transform !== false && bodyBuf.length > 0) {
    try {
      bodyBuf = ctx.modifySPProto(bodyBuf);
    } catch (e) {
      ctx.log("[send_raw] modifySPProto err: " + e.message);
    }
  }
  const path = reqJson.path || route.path;
  const host = reqJson.host || route.host;
  const overrideHeaders = reqJson.headers_override || {};
  // identity content encoding (避上游 gzip 解压错)
  if (bodyBuf.length > 0) {
    overrideHeaders["connect-content-encoding"] = "identity";
    overrideHeaders["content-encoding"] = undefined;
  }
  // 清 undefined 项
  const cleanOverride = {};
  for (const [k, v] of Object.entries(overrideHeaders)) {
    if (v !== undefined) cleanOverride[k] = v;
  }
  const h2req = _buildH2Headers("POST", path, host, captured, cleanOverride);
  if (bodyBuf.length) h2req["content-length"] = String(bodyBuf.length);

  let session;
  try {
    session = ctx.getH2Session(host);
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ ok: false, error: "h2_session", message: e.message }));
    return;
  }
  const started = Date.now();
  let stream;
  try {
    stream = session.request(h2req);
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ ok: false, error: "h2_request", message: e.message }));
    return;
  }
  let resStatus = 0;
  const resHeaders = {};
  const resChunks = [];
  let totalBytes = 0;
  const MAX_COLLECT = 256 * 1024;
  let truncated = false;
  let done = false;
  const finish = (errMsg) => {
    if (done) return;
    done = true;
    const buf = Buffer.concat(resChunks);
    const decoded = _decodeGrpcFrames(buf);
    const out = {
      ok: !errMsg,
      status: resStatus,
      duration_ms: Date.now() - started,
      total_bytes: totalBytes,
      truncated,
      res_headers: resHeaders,
      grpc_frames: decoded.frames,
      trailer_text: decoded.trailer_text,
      body_b64: buf.toString("base64"),
      sent_path: path,
      sent_host: host,
      sent_body_size: bodyBuf.length,
      sp_transform_applied: reqJson.apply_sp_transform !== false,
      error: errMsg || null,
    };
    res.end(JSON.stringify(out));
  };
  stream.on("response", (h) => {
    resStatus = h[":status"] || 0;
    for (const [k, v] of Object.entries(h)) {
      if (!k.startsWith(":")) resHeaders[k] = v;
    }
  });
  stream.on("data", (c) => {
    if (totalBytes < MAX_COLLECT) {
      const remain = MAX_COLLECT - totalBytes;
      if (c.length <= remain) {
        resChunks.push(c);
        totalBytes += c.length;
      } else {
        resChunks.push(c.slice(0, remain));
        totalBytes = MAX_COLLECT;
        truncated = true;
      }
    } else {
      truncated = true;
    }
  });
  stream.on("end", () => finish(null));
  stream.on("error", (e) => finish(e.message));
  stream.on("trailers", (tr) => {
    // 留 trailer JSON 输 (grpc-status / grpc-message)
    try {
      for (const [k, v] of Object.entries(tr)) {
        resHeaders["trailer:" + k] = v;
      }
    } catch {}
  });
  if (bodyBuf.length) stream.end(bodyBuf);
  else stream.end();
}

// 公: 取 _lastChatRawBody · 替最末用户消息文 · 发上游 · 解模型回文
function handleReplayUserText(rawReqBody, res, ctx) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  let reqJson;
  try {
    reqJson = JSON.parse(rawReqBody.toString("utf8") || "{}");
  } catch (e) {
    res.statusCode = 400;
    res.end(JSON.stringify({ ok: false, error: "bad_json", message: e.message }));
    return;
  }
  const userText = reqJson.user_text || reqJson.text || "";
  if (!userText) {
    res.statusCode = 400;
    res.end(JSON.stringify({ ok: false, error: "missing_user_text" }));
    return;
  }
  const captured = ctx.getCapturedHeaders();
  const route = ctx.getCapturedRoute();
  const rawBody = ctx.getCapturedBody();
  if (!captured || !route || !rawBody) {
    res.statusCode = 400;
    res.end(
      JSON.stringify({
        ok: false,
        error: "no_template",
        hint: "等兄经 Windsurf 发一 chat, proxy 捕 template 后方可 replay.",
      }),
    );
    return;
  }
  // 解 captured body, 寻最末 role=1 (user) 之消息, 替之
  let newBody;
  try {
    const buf = Buffer.from(rawBody.body_b64, "base64");
    const frames = ctx.parseFrames(buf);
    if (!frames.length) throw new Error("no_frames");
    const f0 = frames[0];
    const top = ctx.parseProto(f0.payload);
    // findMsgsField 启发: 最大 array 之 wire=2 字段
    let msgsField = null;
    let bestCount = 0;
    for (const fn of Object.keys(top)) {
      const arr = top[fn];
      if (arr && arr.length > bestCount && arr.every((e) => e.w === 2)) {
        bestCount = arr.length;
        msgsField = fn;
      }
    }
    if (!msgsField) throw new Error("no_msgs_field");
    const msgs = top[msgsField];
    // 寻最末 role=1 (USER)
    let userIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const me = msgs[i];
      if (me.w !== 2) continue;
      try {
        const mf = ctx.parseProto(Buffer.from(me.b));
        const role = mf[1] && mf[1][0] && mf[1][0].v;
        if (role === 1) {
          userIdx = i;
          // 替 content (field 2)
          mf[2] = [{ w: 2, b: Buffer.from(userText, "utf8") }];
          msgs[i] = { w: 2, b: ctx.serializeProto(mf) };
          break;
        }
      } catch {}
    }
    if (userIdx === -1) {
      // fallback: 加新 USER 消息 (role=1)
      const newUser = ctx.serializeProto({
        1: [{ w: 0, v: 1 }],
        2: [{ w: 2, b: Buffer.from(userText, "utf8") }],
      });
      msgs.push({ w: 2, b: newUser });
      ctx.log(`[replay] no role=1 found, appending new user msg`);
    } else {
      ctx.log(
        `[replay] replaced user msg at idx=${userIdx} new_text_chars=${userText.length}`,
      );
    }
    top[msgsField] = msgs;
    const newPayload = ctx.serializeProto(top);
    const rest = frames.slice(1).map((f) => ctx.buildFrame(f.flags, f.payload));
    newBody = Buffer.concat([ctx.buildFrame(f0.flags, newPayload), ...rest]);
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: "body_rewrite_fail", message: e.message }));
    return;
  }
  // SP 也走 invertSP 转换
  let finalBody;
  try {
    finalBody = ctx.modifySPProto(newBody);
  } catch (e) {
    ctx.log("[replay] modifySPProto err: " + e.message);
    finalBody = newBody;
  }
  // 发上游 (复用 send_raw 内嵌逻辑)
  const overrideHeaders = {
    "connect-content-encoding": "identity",
  };
  const cleanOverride = {};
  for (const [k, v] of Object.entries(overrideHeaders)) {
    if (v !== undefined) cleanOverride[k] = v;
  }
  const h2req = _buildH2Headers("POST", route.path, route.host, captured, cleanOverride);
  delete h2req["content-encoding"];
  h2req["content-length"] = String(finalBody.length);

  let session;
  try {
    session = ctx.getH2Session(route.host);
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ ok: false, error: "h2_session", message: e.message }));
    return;
  }
  const started = Date.now();
  let stream;
  try {
    stream = session.request(h2req);
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ ok: false, error: "h2_request", message: e.message }));
    return;
  }
  let resStatus = 0;
  const resHeaders = {};
  const resChunks = [];
  let totalBytes = 0;
  const MAX_COLLECT = 512 * 1024;
  let truncated = false;
  let done = false;
  const finish = (errMsg) => {
    if (done) return;
    done = true;
    const buf = Buffer.concat(resChunks);
    const decoded = _decodeGrpcFrames(buf);
    const assistantText = _extractAssistantTextFromFrames(buf, ctx.parseProto);
    res.end(
      JSON.stringify({
        ok: !errMsg,
        status: resStatus,
        duration_ms: Date.now() - started,
        total_bytes: totalBytes,
        truncated,
        grpc_frames: decoded.frames,
        trailer_text: decoded.trailer_text,
        res_headers: resHeaders,
        sent_path: route.path,
        sent_host: route.host,
        sent_body_size: finalBody.length,
        user_text_chars: userText.length,
        assistant_text_extracted: assistantText,
        assistant_text_chars: assistantText.length,
        body_b64_preview: buf.slice(0, 4096).toString("base64"),
        error: errMsg || null,
      }),
    );
  };
  stream.on("response", (h) => {
    resStatus = h[":status"] || 0;
    for (const [k, v] of Object.entries(h)) {
      if (!k.startsWith(":")) resHeaders[k] = v;
    }
  });
  stream.on("data", (c) => {
    if (totalBytes < MAX_COLLECT) {
      const remain = MAX_COLLECT - totalBytes;
      if (c.length <= remain) {
        resChunks.push(c);
        totalBytes += c.length;
      } else {
        resChunks.push(c.slice(0, remain));
        totalBytes = MAX_COLLECT;
        truncated = true;
      }
    } else {
      truncated = true;
    }
  });
  stream.on("end", () => finish(null));
  stream.on("error", (e) => finish(e.message));
  stream.on("trailers", (tr) => {
    try {
      for (const [k, v] of Object.entries(tr)) {
        resHeaders["trailer:" + k] = v;
      }
    } catch {}
  });
  stream.end(finalBody);
}

module.exports = { handleSendRaw, handleReplayUserText };
