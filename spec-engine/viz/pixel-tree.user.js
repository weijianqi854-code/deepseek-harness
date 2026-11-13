// ==UserScript==
// @name         spec-engine 像素生长树
// @namespace    spec-engine
// @version      0.1.0
// @description  DSH Web UI 聊天区旁的像素 mini 生长树：随 spec-engine 六阶段进度生长（elicit→align→analyze→embody→test→build→done，aborted=休眠）
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
// 使用：
//   - Tampermonkey 装上本文件 = 每次打开 DSH Web UI 自动出现；
//   - 或在 DSH 页面控制台粘贴：
//     (function(){var s=document.createElement('script');
//     s.src='http://127.0.0.1:3081/pixel-tree.user.js';
//     document.head.appendChild(s);})()
(function () {
  'use strict';
  if (window.top !== window.self) return;
  if (localStorage.getItem('spec-engine-tree-off') === '1') return;

  // ---- 调色板 ----
  var PAL = {
    S: '#8a5a3b', D: '#5f3f28',          // 土
    G: '#7a5230', d: '#5e3b1e',          // 干
    L: '#6aa84f', l: '#4a7a33', B: '#8fd06a', // 叶
    F: '#f2a7c3', R: '#d9534f',          // 花 / 果
    W: '#7fc4e8', E: '#c99b6f',          // 水 / 种
    m: '#9aa08a'                          // 休眠残叶
  };

  // ---- 像素帧：16 宽 × 20 高，'.'=透明，底 4~6 行是土 ----
  var FRAMES = {
    elicit: [
      '................',
      '................',
      '......W.........',
      '................',
      '........W.......',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '......EEE.......',
      '......E.E.......',
      '................',
      'SSSSSSSSSSSSSSSS',
      'SSSSSSSSSSSSSSSS',
      'SDDSDDSSDDSSDDSS',
      'DDDDDDDDDDDDDDDD',
      'DDDDDDDDDDDDDDDD'
    ],
    align: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '......B.........',
      '.....LBL........',
      '......G.........',
      '......G.........',
      '......G.........',
      '......G.........',
      '.....GGG........',
      '....D.G.D.......',
      'S..D.G.D.....SSS',
      'SSSSSSSSSSSSSSSS',
      'SSSSSSSSSSSSSSSS',
      'SDDSSSSDDSSSSDDS',
      'DDDDDDDDDDDDDDDD',
      'DDDDDDDDDDDDDDDD'
    ],
    analyze: [
      '................',
      '................',
      '................',
      '................',
      '.....L...L......',
      '....LLL.LLL.....',
      '......LGL.......',
      '.......G........',
      '....L..G..L.....',
      '.....L.G.L......',
      '......GGG.......',
      '.......G........',
      '.......G........',
      '......G.G.......',
      '......G..G......',
      'SSSSSDDDDSSSSSSS',
      'SSSS.D..D.SSSSSS',
      'DDDD.D..D.DDDDDD',
      'DDDDDDDDDDDDDDDD',
      'DDDDDDDDDDDDDDDD'
    ],
    embody: [
      '................',
      '................',
      '....LL..LLL.....',
      '...LLLLLLLLL....',
      '...LLBLLLLLL....',
      '..LLLLLLLLLLL...',
      '..LLLLLLBLLLL...',
      '...LLLLLLLLL....',
      '....LL.G.LL.....',
      '......GGG.......',
      '.......G........',
      '.......G........',
      '.......G........',
      '......G.G.......',
      '......G..G......',
      'SSSSSDDDDSSSSSSS',
      'SSSS.D..D.SSSSSS',
      'DDDD.D..D.DDDDDD',
      'DDDDDDDDDDDDDDDD',
      'DDDDDDDDDDDDDDDD'
    ],
    test: [
      '................',
      '....F...LL.F....',
      '...LLFLLLFLL....',
      '..LLLLFLLLLLL...',
      '..FLBLLLLLLFL...',
      '..LLLLLLBLLLL...',
      '..LFLLLLLLLLF...',
      '...LLFLLLLLL....',
      '....LL.G.LL.....',
      '......GGG.......',
      '.......G........',
      '.......G........',
      '.......G........',
      '......G.G.......',
      '......G..G......',
      'SSSSSDDDDSSSSSSS',
      'SSSS.D..D.SSSSSS',
      'DDDD.D..D.DDDDDD',
      'DDDDDDDDDDDDDDDD',
      'DDDDDDDDDDDDDDDD'
    ],
    build: [
      '................',
      '....R...LL.R....',
      '...LLRLLRLRL....',
      '..LLLLRLLLRLL...',
      '..RLBLLLLLLRL...',
      '..LLLLLLBLLRL...',
      '..LRLLLLLLLLR...',
      '...LLRLLLLLL....',
      '....LL.G.LL.....',
      '......GGG.......',
      '.......G........',
      '.......G........',
      '.......G........',
      '......G.G.......',
      '......G..G......',
      'SSSSSDDDDSSSSSSS',
      'SSSS.D..D.SSSSSS',
      'DDDD.D..D.DDDDDD',
      'DDDDDDDDDDDDDDDD',
      'DDDDDDDDDDDDDDDD'
    ],
    done: [
      '....R...LL.R....',
      '..LLRLLLFLLRL...',
      '.LLLLRLLLLLLLL..',
      '.LLRLLLLLLLRLL..',
      'LLLLFLLBLLLRLFL.',
      '.LLRLLLRLLLLLL..',
      '.LLLLLLLRLLLFLL.',
      '..LLLLRLLLLLL...',
      '...LLLGGLLLL....',
      '....L.GG.LL.....',
      '......GGG.......',
      '.......G........',
      '.......G........',
      '.......G........',
      '......G.G.......',
      'SSSSSDDDDSSSSSSS',
      'SSSS.D..D.SSSSSS',
      'DDDD.D..D.DDDDDD',
      'DDDDDDDDDDDDDDDD',
      'DDDDDDDDDDDDDDDD'
    ],
    aborted: [
      '................',
      '................',
      '................',
      '.....m...m......',
      '......m.m.......',
      '.......m........',
      '.......L........',
      '....m.L.m.......',
      '......LLL.......',
      '.......G........',
      '.......G........',
      '.......G........',
      '.......G........',
      '......G.G.......',
      '......G..G......',
      'SSSSSDDDDSSSSSSS',
      'SSSS.D..D.SSSSSS',
      'DDDD.D..D.DDDDDD',
      'DDDDDDDDDDDDDDDD',
      'DDDDDDDDDDDDDDDD'
    ]
  };

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
    done: '六道门禁全过，history 可回放整棵生长',
    aborted: '落叶≠死亡：检查点全保留，回退即恢复'
  };

  function norm(rows) {
    var out = [];
    for (var i = 0; i < rows.length; i++) out.push(String(rows[i]).padEnd(16, '.').slice(0, 16));
    while (out.length < 20) out.unshift('................');
    return out.slice(0, 20);
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
  canvas.width = 16; canvas.height = 20;
  canvas.style.cssText = 'width:64px;height:80px;display:block;image-rendering:pixelated;border-radius:2px';
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
    '#spec-engine-tree .dormant{filter:grayscale(.85) opacity(.8)}',
    '#spec-engine-tree .pop{animation:se-pop .35s steps(3,end)}',
    '@keyframes se-pop{0%{transform:scale(.55)}100%{transform:scale(1)}}',
    '@media (prefers-reduced-motion:reduce){#spec-engine-tree .pop{animation:none}}'
  ].join('\n');
  document.head.appendChild(style);

  // ---- 状态 ----
  var live = null;          // window.__specEngineState 的最近快照
  var demoIdx = 0;           // demo 模式游标

  function readLive() {
    var s = window.__specEngineState;
    if (s && s.stage && FRAMES[s.stage]) return s;
    return null;
  }

  function currentStage() {
    if (live) return live.stage;
    return ORDER[demoIdx];
  }

  function draw() {
    var stage = currentStage();
    var rows = norm(FRAMES[stage] || FRAMES.elicit);
    ctx.clearRect(0, 0, 16, 20);
    for (var y = 0; y < rows.length; y++) {
      var row = rows[y];
      for (var x = 0; x < 16; x++) {
        var ch = row[x];
        if (ch && ch !== '.') { ctx.fillStyle = PAL[ch] || '#000'; ctx.fillRect(x, y, 1, 1); }
      }
    }
    canvas.classList.toggle('dormant', stage === 'aborted');
    canvas.classList.remove('pop');
    void canvas.offsetWidth;           // 重触发动画
    canvas.classList.add('pop');

    var gate = GATE[stage];
    label.textContent = live
      ? (stage + (gate ? ' \u00b7 ' + gate : ''))
      : ('demo \u00b7 ' + stage);
    dot.style.background = live ? '#6aa84f' : '#b97f24';
    box.title = (live ? '[live] ' : '[demo \u00b7 点击推进] ') +
      (CN[stage] || stage) + (gate ? '\uff08' + gate + '\uff09' : '') + '\n' + (HINT[stage] || '');
    toast.style.display = 'none';
  }

  // ---- 交互 ----
  box.addEventListener('click', function (ev) {
    if (ev.target === close) return;
    if (box.dataset.drag === '1') { box.dataset.drag = '0'; return; }  // 拖动后的原生 click 不当点击
    if (live) {
      toast.textContent = live.stage + ' \u00b7 checkpoint_seq=' +
        (live.checkpoint_seq != null ? live.checkpoint_seq : '?') +
        ' \u00b7 history ' + (Array.isArray(live.history) ? live.history.length : '?') + ' \u884c';
      toast.style.display = 'block';
      setTimeout(function () { toast.style.display = 'none'; }, 2600);
    } else {
      demoIdx = (demoIdx + 1) % ORDER.length;
      draw();
    }
  });

  close.addEventListener('click', function () {
    try { localStorage.setItem('spec-engine-tree-off', '1'); } catch (e) {}
    box.remove(); style.remove();
  });

  // 拖动（指针捕获；位置存 localStorage；拖过 4px 视为拖动并吞掉后续 click）
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
    if (e && e.detail && e.detail.stage && FRAMES[e.detail.stage]) {
      live = e.detail; draw();
    }
  });
  setInterval(function () {
    var s = readLive();
    if (s && s !== live) { live = s; draw(); }
  }, 2000);

  // ---- 恢复位置 ----
  try {
    var pos = localStorage.getItem('spec-engine-tree-pos');
    if (pos) {
      var p = pos.split(',');
      if (p.length === 2 && !isNaN(+p[0]) && !isNaN(+p[1])) {
        box.style.right = 'auto'; box.style.bottom = 'auto';
        box.style.left = p[0]; box.style.top = p[1];
      }
    }
  } catch (e) {}

  document.body.appendChild(box);
  draw();
})();
