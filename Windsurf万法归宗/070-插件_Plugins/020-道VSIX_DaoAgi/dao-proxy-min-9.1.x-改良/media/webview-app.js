// dao-proxy-min · webview app · v9.4.5
// 道义: 三十二章 "道恒无名 · 侯王若能守之 · 万物将自宾"
// 本文为 external script · 由 ext host webview.asWebviewUri 加载
// 端口从 body[data-port] 读 · 不依赖 inline script (VSCode webview 阻 inline)
(function() {
  'use strict';
  var _PORT = parseInt(document.body.getAttribute('data-port'), 10) || 0;
  var _BASE = 'http://127.0.0.1:' + _PORT;

  // ═══════ 道 · 视诊 · 直写 #source · 不依赖任何 ═══════
  function _src(t) { try { var s = document.getElementById('source'); if (s) s.textContent = String(t).substring(0,140); } catch(_){} }
  _src('\u9053\u00b7IIFE start\u00b7port=' + _PORT);

  // 错时显错
  window.addEventListener('error', function(e){ _src('\u9519: ' + ((e&&e.message)||'?').substring(0,80)); });
  window.addEventListener('unhandledrejection', function(e){ var m = (e&&e.reason&&e.reason.message)||(e&&e.reason)||'?'; _src('rej: ' + String(m).substring(0,80)); });

  // vsc API · 仅净卸 best-effort
  var vsc;
  try { vsc = acquireVsCodeApi(); } catch(e) { vsc = { postMessage: function(){return false;}, _ghost: true, _err: (e && e.message)||'?' }; }
  if (vsc._ghost) _src('\u9053\u00b7IIFE\u00b7vsc-ghost\u00b7' + (vsc._err||'?').substring(0,40));

  // 元素
  var $sp = document.getElementById('sp');
  var $meta = document.getElementById('meta');
  var $source = document.getElementById('source');
  var $dots = document.getElementById('dots');
  var $btnDao = document.getElementById('btnDao');
  var $btnOff = document.getElementById('btnOff');
  var $modeHint = document.getElementById('modeHint');
  var $editToggle = document.getElementById('editToggle');
  var $editArea = document.getElementById('editArea');
  var $editText = document.getElementById('editText');
  var $editSave = document.getElementById('editSave');
  var $editReset = document.getElementById('editReset');
  var $editStatus = document.getElementById('editStatus');
  var $customBadge = document.getElementById('customBadge');
  var $btnPurge = document.getElementById('btnPurge');
  var $refresh = document.getElementById('refresh');
  var $copy = document.getElementById('copy');
  var $ageTick = document.getElementById('ageTick');
  var $tapePrev = document.getElementById('tapePrev');
  var $tapeNext = document.getElementById('tapeNext');
  var $tapeIdxEl = document.getElementById('tapeIdx');
  var $tapeViewBefore = document.getElementById('tapeViewBefore');
  var $tapeViewAfter = document.getElementById('tapeViewAfter');
  var $tapeViewFields = document.getElementById('tapeViewFields');

  var lastText = '';
  var curMode = '';
  var lastSig = '';
  var ageBase = null, ageTimer = null;

  // ═══════ HTTP ═══════
  function fJson(p) { return fetch(_BASE + p, { cache: 'no-store' }).then(function(r){ if (!r.ok) throw new Error('http ' + r.status); return r.json(); }); }
  function fPost(p, body) { return fetch(_BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' }).then(function(r){ return r.json(); }); }
  function fDelete(p) { return fetch(_BASE + p, { method: 'DELETE', cache: 'no-store' }).then(function(r){ return r.json(); }); }
  // v9.4.5 · webview 诊 · 定位 pull 卡在哪
  function _wdbg(msg, tag, data) {
    try {
      fetch(_BASE + '/origin/_wdbg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg: msg || '', tag: tag || '', data: data }),
        cache: 'no-store'
      }).catch(function(){});
    } catch(_) {}
  }
  _wdbg('iife-start', 'boot', { port: _PORT, href: location.href, ua: navigator.userAgent.substring(0,80) });
  // v9.4.5 · 收 ext host msg · 报 _wdbg · 反诊 webview 是否活
  try {
    window.addEventListener('message', function(e){
      try {
        var d = e.data || {};
        _wdbg('msg-recv', String(d.command||'?'), { keys: Object.keys(d).slice(0,10) });
      } catch(_) {}
    });
    _wdbg('msg-listener-installed', 'boot');
  } catch(e) { _wdbg('msg-listener-err', 'boot', e.message); }

  // ═══════ 渲 ═══════
  function setModeUI(mode) {
    curMode = mode || 'passthrough';
    $btnDao.classList.remove('active', 'active-dao');
    $btnOff.classList.remove('active');
    if (curMode === 'invert') { $btnDao.classList.add('active', 'active-dao'); $modeHint.textContent = '\u9053'; }
    else { $btnOff.classList.add('active'); $modeHint.textContent = '\u5b98'; }
  }

  function setDots(dg) {
    $dots.innerHTML = '';
    if (!dg) return;
    var items = [{k:'proxy_up',label:'P'},{k:'proxy_capturing',label:'C'}];
    var tipBits = [];
    for (var i = 0; i < items.length; i++) {
      var on = !!dg[items[i].k];
      var d = document.createElement('span');
      d.className = 'dot ' + (on ? 'ok' : (items[i].k === 'proxy_capturing' ? 'warn' : 'err'));
      $dots.appendChild(d);
      tipBits.push(items[i].label + ':' + (on ? '\u2713' : '\u2717'));
    }
    if (dg.mode) tipBits.push('M:'+dg.mode);
    if (dg.uptime_s != null) tipBits.push(dg.uptime_s+'s');
    if (dg.req_total != null) tipBits.push('req:'+dg.req_total);
    if (dg.capture_count != null) tipBits.push('cap:'+dg.capture_count);
    $dots.title = tipBits.join(' \u00b7 ');
  }

  function startAgeTick(s) {
    if (ageTimer) { clearInterval(ageTimer); ageTimer = null; }
    if (!$ageTick) return;
    if (s == null) { $ageTick.textContent = ''; return; }
    ageBase = { s: s, at: Date.now() };
    var tick = function(){ if (!ageBase) return; var c = ageBase.s + Math.round((Date.now()-ageBase.at)/1000); $ageTick.textContent = c+'s\u524d'; };
    tick(); ageTimer = setInterval(tick, 1000);
  }

  function showText(text, ts) {
    var changed = text !== lastText;
    lastText = text;
    $sp.classList.remove('quiet');
    $sp.innerHTML = '';
    $sp.textContent = text;
    $meta.textContent = text.length + '\u5b57 \u00b7 ' + ts;
    if (changed) try { $sp.scrollTop = 0; } catch(_) {}
  }

  // 全槽叠卷 · agent 实接全文字
  var KIND_TITLES = {
    chat: 'Cascade \u4e3b SP',
    summary: '\u6458\u8981 SP',
    memory: '\u8bb0\u5fc6 SP',
    ephemeral: '\u77ed\u4efb\u52a1 SP',
    unknown_long: '\u672a\u5206\u7c7b\u957f SP',
    raw_text: '\u539f\u751f\u6587\u672c'
  };
  var KIND_ORDER = ['chat','summary','memory','ephemeral','unknown_long','raw_text'];

  function renderAllStacked(allInj, ts) {
    if (!allInj || !allInj.full) return false;
    var lines = [];
    var totalChars = 0, totalFields = 0, slotCount = 0;
    for (var i = 0; i < KIND_ORDER.length; i++) {
      var k = KIND_ORDER[i];
      var slot = allInj.full[k];
      if (!slot) continue;
      slotCount++;
      var af = slot.all_fields || [];
      var slotChars = 0;
      for (var j = 0; j < af.length; j++) slotChars += (af[j].chars || 0);
      var slotAge = slot.at ? Math.round((Date.now() - slot.at) / 1000) : null;
      lines.push('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
      lines.push('\u3010\u69fd ' + k + '\u3011 ' + (KIND_TITLES[k]||k) + ' \u00b7 ' + af.length + ' field/' + slotChars + '\u5b57' + (slotAge!=null?' \u00b7 '+slotAge+'s\u524d':''));
      lines.push('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
      if (af.length === 0) lines.push('(\u8be5\u69fd\u65e0 all_fields \u00b7 \u5f85 RPC \u8fc7\u5373\u8865)');
      else for (var n = 0; n < af.length; n++) {
        var f = af[n];
        lines.push('');
        lines.push('\u2500\u2500 #' + (n+1) + ' [' + f.kind + '] ' + f.path + ' \u00b7 ' + f.chars + '\u5b57 \u2500\u2500');
        lines.push(f.text || '');
        totalFields++; totalChars += (f.chars || 0);
      }
      lines.push('');
    }
    if (slotCount === 0) return false;
    showText(lines.join('\n'), ts);
    if ($source) $source.textContent = '\u5168\u8c8c\u00b7' + slotCount + '\u69fd/' + totalFields + 'field/' + totalChars + '\u5b57\u00b7agent\u5b9e\u63a5';
    var newest = null;
    for (var i2 = 0; i2 < KIND_ORDER.length; i2++) {
      var s2 = allInj.full[KIND_ORDER[i2]];
      if (s2 && s2.at && (newest == null || s2.at > newest)) newest = s2.at;
    }
    startAgeTick(newest != null ? Math.round((Date.now()-newest)/1000) : null);
    return true;
  }

  function updateCustomBadge(isCustom, chars) {
    if (isCustom) $customBadge.innerHTML = '<span class="custom-badge">\u81ea\u5b9a\u4e49' + (chars?' '+chars+'\u5b57':'') + '</span>';
    else $customBadge.innerHTML = '';
  }

  // v9.4.5 · tape 状态 · 底层之底 · 时序一切
  var _tapeIdx = 0;
  var _tapeTotal = 0;
  var _tapeView = 'after'; // 'before' | 'after' | 'fields'
  var _tapeCurr = null;
  function renderTape(entry, ts) {
    if (!entry) return false;
    _tapeCurr = entry;
    var text = '';
    var label = '';
    var chars = 0;
    if (_tapeView === 'before') {
      text = entry.before || '(\u65e0 before \u00b7 \u672a\u89c1 SP \u5b57\u6bb5)';
      label = '\u539f\u53d1';
      chars = entry.before_chars || (entry.before ? entry.before.length : 0);
    } else if (_tapeView === 'fields') {
      if (entry.all_fields && entry.all_fields.length > 0) {
        var parts = [];
        for (var i = 0; i < entry.all_fields.length; i++) {
          var f = entry.all_fields[i];
          parts.push(
            '\u2501\u2501\u2501 [' + (i + 1) + '/' + entry.all_fields.length + '] ' +
            (f.path || '?') + ' \u00b7 ' + (f.kind || '?') + ' \u00b7 ' +
            (f.chars || 0) + '\u5b57 \u2501\u2501\u2501\n' + (f.text || '')
          );
        }
        text = parts.join('\n\n');
        chars = entry.all_fields_chars || 0;
        label = '\u5168\u5b57\u6bb5';
      } else { text = '(\u65e0\u5b57\u6bb5)'; }
    } else {
      text = entry.after || entry.before || '(\u65e0 after \u4e5f\u65e0 before)';
      label = '\u5b9e\u53d1';
      chars = entry.after_chars || (entry.after ? entry.after.length : 0);
    }
    showText(text, ts);
    var rpcShort = (entry.rpc || '?').replace(/^\/[^.]+\./, '').replace(/Service\//, '/');
    var idx = _tapeIdx + 1;
    var tot = _tapeTotal || 1;
    var flag = entry.transformed ? '\u53d8' : '\u540c';
    var modeShort = entry.mode_at === 'invert' ? '\u9053' : '\u5b98';
    $source.textContent =
      '[' + idx + '/' + tot + '] ' + rpcShort + ' \u00b7 ' + modeShort + ' \u00b7 ' +
      flag + ' \u00b7 ' + (entry.before_chars || 0) + '\u2192' + (entry.after_chars || 0) +
      '\u5b57 \u00b7 ' + label + '(' + chars + ')';
    startAgeTick(entry.t ? Math.round((Date.now() - entry.t) / 1000) : 0);
    if ($tapeIdxEl) $tapeIdxEl.textContent = (_tapeIdx + 1) + '/' + (_tapeTotal || 1);
    return true;
  }

  function _updateTapeViewBtns() {
    if ($tapeViewBefore) $tapeViewBefore.classList.toggle('active', _tapeView === 'before');
    if ($tapeViewAfter) $tapeViewAfter.classList.toggle('active', _tapeView === 'after');
    if ($tapeViewFields) $tapeViewFields.classList.toggle('active', _tapeView === 'fields');
  }

  // ═══════ 主拉 · 直 HTTP · 底层之底 · 时序一切 ═══════
  function pull(tag) {
    if (!_PORT) { _src('\u9053\u00b7\u65e0\u7aef\u53e3\u00b7'+tag); return; }
    _wdbg('pull-start', tag);
    Promise.all([
      fJson('/origin/ping').catch(function(e){ _wdbg('fetch-ping-err', tag, e.message); return {_err:e.message}; }),
      fJson('/origin/tape?limit=16&fields=1').catch(function(e){ _wdbg('fetch-tape-err', tag, e.message); return {_err:e.message}; }),
      fJson('/origin/preview').catch(function(e){ _wdbg('fetch-preview-err', tag, e.message); return {_err:e.message}; }),
      fJson('/origin/allinjects').catch(function(e){ _wdbg('fetch-allinj-err', tag, e.message); return {_err:e.message}; })
    ]).then(function(arr) {
      _wdbg('promise-all-resolved', tag, { len: arr.length, tape_ok: !!(arr[1] && arr[1].ok), tape_total: arr[1] && arr[1].total });
      var ping = arr[0], tapeResp = arr[1], preview = arr[2], allInj = arr[3];
      if (!ping || !ping.ok) {
        var em = (ping && ping._err) ? ping._err : '?';
        _src('\u9053\u00b7ping fail\u00b7' + String(em).substring(0,40) + ' (' + tag + ')');
        return;
      }
      setDots({ proxy_up: true, proxy_capturing: !!(preview && preview.has_captured_before), mode: ping.mode, uptime_s: ping.uptime_s, req_total: ping.req_total, capture_count: ping.capture_count });
      setModeUI(ping.mode === 'invert' ? 'invert' : 'passthrough');
      var ts = new Date().toLocaleTimeString();
      // v9.4.5 · 首选 /origin/tape · 底层之底 · 无 mode 分支
      if (tapeResp && tapeResp.ok && tapeResp.tape && tapeResp.tape.length > 0) {
        _tapeTotal = tapeResp.total;
        if (_tapeIdx >= tapeResp.tape.length) _tapeIdx = 0;
        renderTape(tapeResp.tape[_tapeIdx], ts);
      } else if (allInj && allInj.kinds && allInj.kinds.length > 0) {
        renderAllStacked(allInj, ts);
      } else if (preview && (preview.after || preview.before)) {
        var t = preview.after || preview.before;
        showText(t, ts);
        $source.textContent = (preview.synthesized?'\u9053\u9b42\u5408\u6210':'\u9884\u89c8') + '\u00b7' + t.length + '\u5b57\u00b7\u7b49 chat \u89e6 tape\u00b7' + tag;
        startAgeTick(preview.age_s);
      } else {
        _src('\u9053\u00b7\u65e0 tape \u65e0 preview\u00b7' + tag);
      }
      if (preview && preview.custom_sp != null) updateCustomBadge(!!preview.custom_sp, preview.custom_sp_chars);
    }).catch(function(err){
      _src('\u9053\u00b7\u62c9\u9519\u00b7' + ((err&&err.message)||'?').substring(0,60));
    });
  }
  // ═══════ 按钮 ═══════
  $btnDao.addEventListener('click', function(){
    if (curMode === 'invert') { _src('\u9053\u00b7\u5df2\u9053\u00b7\u65e0\u9700\u5207'); return; }
    setModeUI('invert');
    _src('\u5207\u2192\u9053Agent\u2026');
    fPost('/origin/mode', { mode: 'invert' }).then(function(r){
      _src(r && r.ok ? '\u5df2\u5207\u9053\u00b7' + (r.mode||'?') : '\u5207\u5931\u00b7' + (r&&r.error||'?'));
      setTimeout(function(){ pull('btn-dao'); }, 300);
    }).catch(function(e){ _src('\u5207\u9519\u00b7' + ((e&&e.message)||'?').substring(0,40)); });
  });
  $btnOff.addEventListener('click', function(){
    if (curMode === 'passthrough') { _src('\u5b98\u00b7\u5df2\u5b98\u00b7\u65e0\u9700\u5207'); return; }
    setModeUI('passthrough');
    _src('\u5207\u2192\u5b98\u65b9Agent\u2026');
    fPost('/origin/mode', { mode: 'passthrough' }).then(function(r){
      _src(r && r.ok ? '\u5df2\u5207\u5b98\u00b7' + (r.mode||'?') : '\u5207\u5931\u00b7' + (r&&r.error||'?'));
      setTimeout(function(){ pull('btn-off'); }, 300);
    }).catch(function(e){ _src('\u5207\u9519\u00b7' + ((e&&e.message)||'?').substring(0,40)); });
  });
  $refresh.addEventListener('click', function(){ _src('\u5237\u65b0\u4e2d\u2026'); pull('btn-refresh'); });

  // v9.4.5 · tape 浏控 · 底层之底 · 时序一切
  $tapePrev && $tapePrev.addEventListener('click', function(){
    // 向更早回 · _tapeIdx +1 (倒序, 0=最新)
    _tapeIdx = Math.min(_tapeIdx + 1, Math.max(0, _tapeTotal - 1));
    _src('\u2190 \u66f4\u65e9 ' + (_tapeIdx + 1) + '/' + _tapeTotal);
    pull('tape-prev');
  });
  $tapeNext && $tapeNext.addEventListener('click', function(){
    _tapeIdx = Math.max(0, _tapeIdx - 1);
    _src('\u2192 \u66f4\u65b0 ' + (_tapeIdx + 1) + '/' + _tapeTotal);
    pull('tape-next');
  });
  $tapeViewBefore && $tapeViewBefore.addEventListener('click', function(){
    _tapeView = 'before'; _updateTapeViewBtns();
    if (_tapeCurr) renderTape(_tapeCurr, new Date().toLocaleTimeString());
  });
  $tapeViewAfter && $tapeViewAfter.addEventListener('click', function(){
    _tapeView = 'after'; _updateTapeViewBtns();
    if (_tapeCurr) renderTape(_tapeCurr, new Date().toLocaleTimeString());
  });
  $tapeViewFields && $tapeViewFields.addEventListener('click', function(){
    _tapeView = 'fields'; _updateTapeViewBtns();
    if (_tapeCurr) renderTape(_tapeCurr, new Date().toLocaleTimeString());
  });
  $copy.addEventListener('click', function(){
    var t = lastText || ($sp ? $sp.textContent : '');
    if (!t) { _src('\u590d\u5236\u00b7\u65e0\u6587'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function(){ _src('\u590d\u5236\u00b7'+t.length+'\u5b57\u00b7\u6210'); }).catch(function(e){ _src('\u590d\u5236\u00b7\u9519\u00b7'+((e&&e.message)||'?').substring(0,40)); });
    } else {
      var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch(e) {}
      document.body.removeChild(ta);
      _src('\u590d\u5236\u00b7'+t.length+'\u5b57\u00b7'+(ok?'\u6210':'fail'));
    }
  });

  // ═══════ 编辑 ═══════
  var editMode = false, editClosing = null;
  function closeEdit() {
    editMode = false;
    $editArea.classList.remove('show');
    $editToggle.classList.remove('edit-active');
    $sp.style.display = '';
    if (editClosing) { clearTimeout(editClosing); editClosing = null; }
  }
  $editToggle.addEventListener('click', function(){
    editMode = !editMode;
    if (editMode) {
      $editArea.classList.add('show');
      $editToggle.classList.add('edit-active');
      $sp.style.display = 'none';
      $editText.value = lastText || '';
      $editStatus.textContent = '';
      $editText.focus();
      fJson('/origin/custom_sp').then(function(r){
        if (r && r.has_custom && r.sp) {
          $editText.value = r.sp;
          updateCustomBadge(true, r.chars);
          $editStatus.textContent = '\u81ea\u5b9a\u4e49\u00b7' + (r.chars||0) + '\u5b57';
        } else {
          $editStatus.textContent = '\u672a\u8bbe\u00b7\u53ef\u7f16\u5f53\u524d\u5b9e\u6536';
        }
      }).catch(function(e){ $editStatus.textContent = '\u62c9\u9519\u00b7' + ((e&&e.message)||'?').substring(0,30); });
    } else closeEdit();
  });
  $editSave.addEventListener('click', function(){
    var sp = $editText.value;
    if (!sp || !sp.trim()) { $editStatus.textContent = '\u2716 \u5185\u5bb9\u4e0d\u53ef\u7a7a'; return; }
    $editStatus.textContent = '\u4fdd\u5b58\u4e2d\u2026';
    fPost('/origin/custom_sp', { sp: sp.trim(), keep_blocks: false, source: 'webview' }).then(function(r){
      if (r && r.ok) {
        $editStatus.textContent = '\u2714 \u5df2\u6ce8\u5165 ' + (r.chars||0) + '\u5b57 \u00b7 1.5s\u540e\u5173';
        updateCustomBadge(true, r.chars);
        if (editClosing) clearTimeout(editClosing);
        editClosing = setTimeout(closeEdit, 1500);
        setTimeout(function(){ pull('edit-saved'); }, 400);
      } else $editStatus.textContent = '\u2716 \u5931\u00b7' + (r && r.error || '?');
    }).catch(function(e){ $editStatus.textContent = '\u2716 \u9519\u00b7' + ((e&&e.message)||'?').substring(0,30); });
  });
  $editReset.addEventListener('click', function(){
    $editStatus.textContent = '\u6e05\u9664\u4e2d\u2026';
    fDelete('/origin/custom_sp').then(function(r){
      if (r && r.ok) {
        $editStatus.textContent = '\u2714 \u5df2\u6e05\u00b7\u56de\u9ed8\u9053\u5fb7\u7ecf';
        $editText.value = '';
        updateCustomBadge(false);
        setTimeout(function(){ pull('edit-reset'); }, 400);
      } else $editStatus.textContent = '\u2716 \u6e05\u5931';
    }).catch(function(e){ $editStatus.textContent = '\u2716 \u9519\u00b7' + ((e&&e.message)||'?').substring(0,30); });
  });
  $editText.addEventListener('keydown', function(e){
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); $editSave.click(); }
  });

  // ═══════ 净卸 (vsc 必需) ═══════
  $btnPurge.addEventListener('click', function(){
    if (vsc._ghost) { _src('\u51c0\u5378\u00b7\u9700 ext host\u00b7\u91cd\u542f Windsurf \u540e'); return; }
    _src('\u51c6\u5907\u51c0\u5378\u2026');
    vsc.postMessage({ command: 'purge' });
  });

  // ═══════ sig 轮询 · 1.5s 检变 ═══════
  function sigTick() {
    fJson('/origin/sig').then(function(r){
      if (!r || !r.ok) return;
      var cur = r.mode + '|' + r.sp_sig + '|' + (r.custom_sig||'0') + '|' + (r.custom_sp_at||0) + '|' + (r.injects_last_at||0) + '|' + (r.spc_last_at||0) + '|' + (r.injects_count||0);
      if (cur === lastSig) return;
      lastSig = cur;
      pull('sig-tick');
    }).catch(function(){});
  }

  // 启
  pull('boot');
  setTimeout(function(){ pull('boot1'); }, 800);
  setTimeout(function(){ pull('boot2'); }, 2500);
  setInterval(sigTick, 1500);
  setInterval(function(){ pull('tick'); }, 12000);

  _src('\u9053\u00b7IIFE end\u00b7HTTP \u5168\u00b7\u81ea\u5316 (port=' + _PORT + ')');
})();
