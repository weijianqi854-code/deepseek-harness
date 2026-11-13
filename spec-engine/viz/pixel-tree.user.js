// ==UserScript==
// @name         spec-engine 像素生长树
// @namespace    spec-engine
// @version      0.2.0
// @description  DSH Web UI 聊天区旁的像素 mini 生长树：随 spec-engine 六阶段进度生长（elicit→align→analyze→embody→test→build→done，aborted=休眠）；逐帧摇摆 + 粒子层（雨滴/花瓣/落叶/星芒/休眠Z）
// @match        http://127.0.0.1:3080/*
// @match        http://localhost:3080/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
//
// 数据接入契约（优先级从高到低）：
//   1. window.__specEngineState = { stage, checkpoint_seq, history:[...] }
//      状态变化时派发 CustomEvent('spec-engine-state', { detail: state })
//      —— @spec-engine/contract-tools（M1 后半）将实现这一侧。
//   2. 以上不存在时进入 demo 模式（点击树推进阶段），标签带 demo 角标。
//
// v0.2 动画：650ms 两帧树冠摇摆 + 130ms 粒子层；prefers-reduced-motion 冻结为静态帧。
// 根系随阶段加深（=检查点沉淀）；aborted 根系保留（=可回退恢复）。
// 重注入安全：再次执行本脚本会先 dispose 旧实例（window.__specEngineTree.dispose）。
(function () {
  'use strict';
  if (window.top !== window.self) return;
  try { if (window.__specEngineTree && window.__specEngineTree.dispose) window.__specEngineTree.dispose(); } catch (e0) {}
  var oldBox = document.getElementById('spec-engine-tree'); if (oldBox) oldBox.remove();
  if (localStorage.getItem('spec-engine-tree-off') === '1') return;

  var RM = false;
  try { RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  // ---- 调色板 ----
  var PAL = {
    S: '#8a5a3b', D: '#4e3320', p: '#a8825f', g: '#6aa84f',        // 土/草
    r: '#d8c8a8',                                                  // 根
    G: '#7a5230', d: '#5e3b1e',                                    // 干/枯枝
    n: '#bfe089',                                                  // 新芽
    L: '#8fd06a', B: '#5ea34a', k: '#3f7d2f', h: '#c9f29b',        // 叶四阶
    F: '#f2a7c3',                                                  // 花
    R: '#d9534f', q: '#ffe9c9',                                    // 果 / 高光闪
    W: '#7fc4e8', w: '#b9e2f4', E: '#c99b6f',                      // 水 / 种
    c: '#8f9c8f', o: '#c9d4e0',                                    // 云 / 月
    m: '#9aa08a',                                                  // 休眠残叶
    x: '#f0f7d8', z: '#c9d4c0'                                     // 星芒 / 睡Z
  };

  // ---- 每阶段天空底色（深色微调，勿抢戏） ----
  var SKY = {
    elicit: '#2a333c', align: '#2b3428', analyze: '#2a3328', embody: '#293021',
    test: '#2b3222', build: '#2d3222', done: '#313422', aborted: '#282b30'
  };

  // ---- 场景帧：19 行天空区（行0-18），土壤区(行19-23)由 SOIL+ROOTS 合成 ----
  var FR = {
    elicit: [
      '................',
      '................',
      '.....ccccc......',
      '....ccccccc.....',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................'
    ],
    align: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '.....L...L......',
      '.....nL.Ln......',
      '.......n........',
      '.......n........',
      '.......n........',
      '.......n........'
    ],
    analyze: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '....L.....L.....',
      '.....L...L......',
      '......L.L.......',
      '.......n........',
      '.......n........',
      '.......n........',
      '.......n........',
      '.......n........',
      '.......n........',
      '.......n........'
    ],
    embody: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '......LLL.......',
      '....LLLLLLL.....',
      '...LLBkLLLLLL...',
      '...LBLLLLkLLL...',
      '...LLkLLLBLLL...',
      '....LkLLLkLL....',
      '.....LLLL.......',
      '.......G........',
      '.......G........',
      '.......G........',
      '.......G........',
      '.......G........',
      '.......G........'
    ],
    test: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '......FLF.......',
      '....LLFLLLL.....',
      '...FLLBkLLLLL...',
      '...LBLLLLkLLF...',
      '...LLkLLLBLLL...',
      '....LkFLkLL.....',
      '.....LLLL.......',
      '.......G........',
      '.......G........',
      '.......G........',
      '.......G........',
      '.......G........',
      '.......G........'
    ],
    build: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '......LLL.......',
      '....LLRLLLRLL...',
      '...LRBkLLLLRL...',
      '...LBLLLLkRLL...',
      '...LkLLRLLLkL...',
      '....LkLLLkLL....',
      '.....LLLL.......',
      '.......G........',
      '.......G........',
      '.......G........',
      '.......G........',
      '.......G........',
      '.......G........'
    ],
    done: [
      '................',
      '................',
      '................',
      '.....LkLL.......',
      '....LLRLLLL.....',
      '...LLLkLLLLLL...',
      '..LLLLLLLLLLL...',
      '..LLkRLLLRLLkL..',
      '..LRLLLLLLkLRL..',
      '..LLLkLLRLLLLk..',
      '..LLkLLLLLLLRL..',
      '...LkLLLLRLLL...',
      '....LLkLLLkLL...',
      '.....LLLL.......',
      '......LL........',
      '.......G........',
      '.......G........',
      '.......G........',
      '.......G........'
    ],
    aborted: [
      '................',
      '................',
      '...oo...........',
      '...oo...........',
      '................',
      '................',
      '................',
      '................',
      '................',
      '....m....d......',
      '.....d..m.......',
      '......dd........',
      '.......d........',
      '.......d........',
      '.......d........',
      '.......d........',
      '.......d........',
      '.......d........',
      '.......d........'
    ]
  };

  // ---- 土壤（行19-23）：表土草籽 → 深土 ----
  var SOIL = [
    'gSgSSSSgSSSpSSgS',
    'SSSpSSSSSSSSpSSS',
    'DDDpDDDDDDDpDDDD',
    'DDDDDDDDDDDDDDDD',
    'DDDDDDDDDDDDDDDD'
  ];

  // ---- 根系覆盖层 [x,y,ch]：随阶段加深；aborted 保留（可回退） ----
  var ROOTS = {
    elicit: [[7, 20, 'E'], [8, 20, 'E'], [8, 21, 'E']],
    align: [[7, 20, 'r'], [6, 21, 'r'], [8, 21, 'r']],
    analyze: [[6, 20, 'r'], [7, 20, 'r'], [8, 20, 'r'], [5, 21, 'r'], [9, 21, 'r'], [6, 22, 'r'], [10, 22, 'r']],
    embody: [[5, 20, 'r'], [6, 20, 'r'], [7, 20, 'r'], [8, 20, 'r'], [9, 20, 'r'], [4, 21, 'r'], [10, 21, 'r'], [5, 22, 'r'], [11, 22, 'r'], [7, 23, 'r']],
    test: [[4, 20, 'r'], [5, 20, 'r'], [6, 20, 'r'], [7, 20, 'r'], [8, 20, 'r'], [9, 20, 'r'], [10, 20, 'r'], [3, 21, 'r'], [11, 21, 'r'], [4, 22, 'r'], [12, 22, 'r'], [7, 23, 'r'], [8, 23, 'r']],
    build: [[4, 20, 'r'], [5, 20, 'r'], [6, 20, 'r'], [7, 20, 'r'], [8, 20, 'r'], [9, 20, 'r'], [10, 20, 'r'], [3, 21, 'r'], [11, 21, 'r'], [4, 22, 'r'], [12, 22, 'r'], [7, 23, 'r'], [8, 23, 'r']],
    done: [[3, 20, 'r'], [4, 20, 'r'], [5, 20, 'r'], [6, 20, 'r'], [7, 20, 'r'], [8, 20, 'r'], [9, 20, 'r'], [10, 20, 'r'], [11, 20, 'r'], [2, 21, 'r'], [12, 21, 'r'], [3, 22, 'r'], [13, 22, 'r'], [5, 23, 'r'], [10, 23, 'r']],
    aborted: [[3, 20, 'r'], [4, 20, 'r'], [5, 20, 'r'], [6, 20, 'r'], [7, 20, 'r'], [8, 20, 'r'], [9, 20, 'r'], [10, 20, 'r'], [11, 20, 'r'], [2, 21, 'r'], [12, 21, 'r'], [3, 22, 'r'], [13, 22, 'r'], [5, 23, 'r'], [10, 23, 'r']]
  };

  // ---- 摇摆区（帧B整体右移1px）：只摇树冠，树干扎根 ----
  var SWAY = { align: [13, 14], analyze: [9, 11], embody: [6, 12], test: [6, 12], build: [6, 12], done: [3, 14] };

  // ---- 果子高光位（帧B闪烁） ----
  var GLINT = { build: [[6, 7], [11, 8]] };

  var ORDER = ['elicit', 'align', 'analyze', 'embody', 'test', 'build', 'done', 'aborted'];
  var GATE = { elicit: 'G1', align: 'G2', analyze: 'G3', embody: 'G4', test: 'G5', build: 'G6' };
  var CN = {
    elicit: '苏格拉底提问', align: 'round-trip 对齐', analyze: '分析',
    embody: '体现', test: '测试', build: '施工', done: '大树已成', aborted: '休眠'
  };
  var HINT = {
    elicit: '提问即浇水：高成本槽位填满、默认值告知后，才破土',
    align: '六类漂移清零才扎稳根；含用户审批确认',
    analyze: '每根枝条一个备选；证据验证过才留',
    embody: '原型即树冠形状；「不做」清单非空',
    test: '测试集先绽放，找准方向再动手',
    build: '果实挂枝：计划全关、回归干净',
    done: '六道门禁全过，根系已是整片年轮',
    aborted: '落叶≠死亡：根系与检查点全保留，回退即恢复'
  };

  function px(x, y, ch) { ctx.fillStyle = PAL[ch] || '#000'; ctx.fillRect(x, y, 1, 1); }
  function ri(n) { return Math.floor(Math.random() * n); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function shiftRow(row, dx) {
    if (!dx) return row;
    var out = new Array(16).fill('.');
    for (var x = 0; x < 16; x++) {
      var ch = row[x];
      if (ch && ch !== '.') { var nx = x + dx; if (nx >= 0 && nx < 16) out[nx] = ch; }
    }
    return out.join('');
  }

  // ---- DOM ----
  var box = document.createElement('div');
  box.id = 'spec-engine-tree';
  box.style.cssText = [
    'position:fixed', 'z-index:2147483000', 'right:16px', 'bottom:110px',
    'background:#20261acc', 'border:2px solid #3a4a2f', 'border-radius:4px',
    'padding:5px 5px 3px', 'font:10px/1.4 Consolas,monospace', 'color:#d8e3c8',
    'user-select:none', 'cursor:grab', 'touch-action:none',
    'box-shadow:0 2px 0 #00000055'
  ].join(';');

  var canvas = document.createElement('canvas');
  canvas.width = 16; canvas.height = 24;
  canvas.style.cssText = 'width:64px;height:96px;display:block;image-rendering:pixelated;border-radius:2px';
  var ctx = canvas.getContext('2d');

  var bar = document.createElement('div');
  bar.style.cssText = 'display:flex;align-items:center;gap:4px;margin-top:3px;white-space:nowrap';

  var dot = document.createElement('span');
  dot.style.cssText = 'width:6px;height:6px;border-radius:1px;background:#b97f24;flex:none';

  var label = document.createElement('span');
  label.style.cssText = 'flex:none;overflow:hidden;max-width:72px';

  var close = document.createElement('span');
  close.textContent = '\u00d7';
  close.title = '隐藏像素树（清 localStorage 的 spec-engine-tree-off 可找回）';
  close.style.cssText = 'flex:none;margin-left:auto;cursor:pointer;opacity:.6;padding:0 2px';

  var toast = document.createElement('div');
  toast.style.cssText = 'display:none;position:absolute;left:50%;transform:translateX(-50%);bottom:100%;' +
    'margin-bottom:6px;background:#20261af2;border:1px solid #3a4a2f;border-radius:3px;' +
    'padding:4px 7px;max-width:200px;white-space:normal;font-size:10px;color:#d8e3c8';

  bar.appendChild(dot); bar.appendChild(label); bar.appendChild(close);
  box.appendChild(toast); box.appendChild(canvas); box.appendChild(bar);

  var style = document.createElement('style');
  style.textContent = [
    '#spec-engine-tree .dormant{filter:grayscale(.85) opacity(.85)}',
    '#spec-engine-tree .pop{animation:se-pop .35s steps(3,end)}',
    '@keyframes se-pop{0%{transform:scale(.55)}100%{transform:scale(1)}}',
    '@media (prefers-reduced-motion:reduce){#spec-engine-tree .pop{animation:none}}'
  ].join('\n');
  document.head.appendChild(style);

  // ---- 状态 ----
  var live = null;
  var demoIdx = 0;
  var t = 0;                 // tick 计数
  var frameIdx = 0;          // 摇摆帧 0/1
  var lastStage = null;
  var parts = [];            // 粒子
  var timer = null;

  function readLive() {
    var s = window.__specEngineState;
    if (s && s.stage && FR[s.stage]) return s;
    return null;
  }
  function currentStage() { return live ? live.stage : ORDER[demoIdx]; }

  // ---- 粒子 ----
  function seedParticles(stage) {
    parts = [];
    if (stage === 'elicit') {
      parts.push({ k: 'rain', x: 4 + ri(8), y: 4 + ri(10) }, { k: 'rain', x: 4 + ri(8), y: 4 + ri(10) });
    } else if (stage === 'test') {
      parts.push({ k: 'petal', x: 4 + ri(8), y: 6 + ri(4), top: 6 }, { k: 'petal', x: 4 + ri(8), y: 6 + ri(4), top: 6 });
    } else if (stage === 'build') {
      parts.push({ k: 'leaf', x: 4 + ri(8), y: 6 + ri(4), top: 6 });
    } else if (stage === 'done') {
      parts.push({ k: 'petal', x: 3 + ri(9), y: 3 + ri(4), top: 3 }, { k: 'petal', x: 3 + ri(9), y: 3 + ri(4), top: 3 });
    } else if (stage === 'aborted') {
      parts.push({ k: 'leaf', x: 4 + ri(6), y: 9 + ri(3), top: 9 });
    }
  }

  function stepParticles() {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.k === 'rain') {
        p.y += 1;
        if (p.y >= 19) { p.x = 4 + ri(8); p.y = 4 + ri(4); }
      } else {
        if (t % 2 === 0) p.y += 1;
        if (t % 4 === 0) p.x = clamp(p.x + ri(3) - 1, 3, 12);
        if (p.y >= 19) { p.y = p.top; p.x = 3 + ri(9); }
      }
    }
  }

  function drawZ(x, y) {
    for (var i = 0; i < 3; i++) px(x + i, y, 'z');
    px(x + 1, y + 1, 'z');
    for (var j = 0; j < 3; j++) px(x + j, y + 2, 'z');
  }

  function drawFx(stage) {
    if (stage === 'elicit' && t % 10 < 3) px(8, 20, 'q');
    if (stage === 'analyze') { if (t % 8 < 4) px(3, 8, 'x'); else px(12, 8, 'x'); }
    if (stage === 'embody') { if (t % 8 < 4) px(5, 7, 'h'); else px(11, 10, 'h'); }
    if (stage === 'done') { if (t % 8 < 4) px(13, 2, 'x'); else px(12, 3, 'x'); }
    if (stage === 'aborted') { if (t % 12 < 6) drawZ(10, 7); else drawZ(12, 3); }
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.k === 'rain') { px(p.x, p.y, 'W'); if (p.y - 1 >= 3) px(p.x, p.y - 1, 'w'); }
      else if (p.k === 'petal') px(p.x, p.y, 'F');
      else px(p.x, p.y, stage === 'aborted' ? 'm' : 'h');
    }
  }

  // ---- 渲染 ----
  function drawAll() {
    var stage = currentStage();
    ctx.fillStyle = SKY[stage] || '#20261a';
    ctx.fillRect(0, 0, 16, 24);

    var rows = FR[stage] || FR.elicit;
    var sw = (!RM && frameIdx === 1 && SWAY[stage]) ? SWAY[stage] : null;
    for (var y = 0; y < 19; y++) {
      var row = rows[y] || '................';
      if (sw && y >= sw[0] && y <= sw[1]) row = shiftRow(row, 1);
      for (var x = 0; x < 16; x++) { var ch = row[x]; if (ch && ch !== '.') px(x, y, ch); }
    }
    for (var sy = 0; sy < 5; sy++) {
      var srow = SOIL[sy];
      for (var sx = 0; sx < 16; sx++) { var sch = srow[sx]; if (sch && sch !== '.') px(sx, 19 + sy, sch); }
    }
    var roots = ROOTS[stage] || [];
    for (var ri2 = 0; ri2 < roots.length; ri2++) px(roots[ri2][0], roots[ri2][1], roots[ri2][2]);

    if (!RM && frameIdx === 1 && GLINT[stage]) {
      var gl = GLINT[stage];
      for (var gi = 0; gi < gl.length; gi++) px(gl[gi][0], gl[gi][1], 'q');
    }
    if (!RM) drawFx(stage);

    canvas.classList.toggle('dormant', stage === 'aborted');

    if (stage !== lastStage) {
      lastStage = stage;
      seedParticles(stage);
      canvas.classList.remove('pop');
      void canvas.offsetWidth;
      canvas.classList.add('pop');
      var gate = GATE[stage];
      label.textContent = live ? (stage + (gate ? ' \u00b7 ' + gate : '')) : ('demo \u00b7 ' + stage);
      dot.style.background = live ? '#6aa84f' : '#b97f24';
      box.title = (live ? '[live] ' : '[demo \u00b7 点击推进] ') +
        (CN[stage] || stage) + (gate ? '\uff08' + gate + '\uff09' : '') + '\n' + (HINT[stage] || '');
    }
    toast.style.display = 'none';
  }

  function tick() {
    t++;
    frameIdx = Math.floor(t / 5) % 2;
    stepParticles();
    drawAll();
  }

  // ---- 交互 ----
  box.addEventListener('click', function (ev) {
    if (ev.target === close) return;
    if (box.dataset.drag === '1') { box.dataset.drag = '0'; return; }
    if (live) {
      toast.textContent = live.stage + ' \u00b7 checkpoint_seq=' +
        (live.checkpoint_seq != null ? live.checkpoint_seq : '?') +
        ' \u00b7 history ' + (Array.isArray(live.history) ? live.history.length : '?') + ' \u884c';
      toast.style.display = 'block';
      setTimeout(function () { toast.style.display = 'none'; }, 2600);
    } else {
      demoIdx = (demoIdx + 1) % ORDER.length;
      lastStage = null;       // 强制重置标签/粒子/弹跳
      if (RM) drawAll();
    }
  });

  close.addEventListener('click', function () {
    try { localStorage.setItem('spec-engine-tree-off', '1'); } catch (e) {}
    dispose();
  });

  box.addEventListener('pointerdown', function (ev) {
    if (ev.target === close) return;
    var startX = ev.clientX, startY = ev.clientY, moved = false;
    var rect = box.getBoundingClientRect();
    var dx = ev.clientX - rect.left, dy = ev.clientY - rect.top;
    box.setPointerCapture(ev.pointerId);
    function move(e) {
      if (!moved && Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 4) moved = true;
      if (!moved) return;
      box.style.right = 'auto'; box.style.bottom = 'auto';
      var x = Math.max(4, Math.min(window.innerWidth - rect.width - 4, e.clientX - dx));
      var y = Math.max(4, Math.min(window.innerHeight - rect.height - 4, e.clientY - dy));
      box.style.left = x + 'px'; box.style.top = y + 'px';
    }
    function up() {
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerup', up);
      box.removeEventListener('pointercancel', up);
      if (moved) {
        box.dataset.drag = '1';
        try { localStorage.setItem('spec-engine-tree-pos', box.style.left + ',' + box.style.top); } catch (er) {}
      }
    }
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
  });

  // ---- 数据源 ----
  window.addEventListener('spec-engine-state', function (e) {
    if (e && e.detail && e.detail.stage && FR[e.detail.stage]) {
      live = e.detail; lastStage = null;
      if (RM) drawAll();
    }
  });
  setInterval(function () {
    var s = readLive();
    if (s && s !== live) { live = s; lastStage = null; if (RM) drawAll(); }
  }, 2000);

  // ---- 位置恢复 ----
  try {
    var pos = localStorage.getItem('spec-engine-tree-pos');
    if (pos) {
      var pp = pos.split(',');
      if (pp.length === 2 && !isNaN(+pp[0]) && !isNaN(+pp[1])) {
        box.style.right = 'auto'; box.style.bottom = 'auto';
        box.style.left = pp[0]; box.style.top = pp[1];
      }
    }
  } catch (e) {}

  function dispose() {
    if (timer) { clearInterval(timer); timer = null; }
    box.remove(); style.remove();
    delete window.__specEngineTree;
  }

  document.body.appendChild(box);
  drawAll();
  if (!RM) timer = setInterval(tick, 130);

  window.__specEngineTree = { dispose: dispose };
})();
