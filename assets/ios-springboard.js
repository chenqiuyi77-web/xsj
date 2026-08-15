/* iOS 主屏（Springboard）注入脚本 —— 黑白灰低饱和（ins 风），独立运行 */
(function () {
  'use strict';

  /* ---------- 网格规格 ---------- */
  var GRID_COLS = 4;
  var GRID_ROWS = 4;
  var SLOTS = GRID_COLS * GRID_ROWS;   /* 每页 16 格，可留空 */
  var DOCK_SLOTS = 3;                  /* 底部应用栏：3 个槽位 */

  /* ---------- 应用清单 ---------- */
  var DEFAULT_DOCK_APPS = [
    { icon: 'ri-chat-1-line',     label: '消息',   route: '/messages', gray: 162 },
    { icon: 'ri-camera-line',     label: '朋友圈', route: '/moments', gray: 186 },
    { icon: 'ri-calendar-2-line', label: '日程',   route: '/planner', gray: 202 }
  ];

  var DEFAULT_PAGE_APPS = [
    [
      { icon: 'ri-gallery-line',    label: '相册',   route: '/album',   gray: 168 },
      { icon: 'ri-star-line',       label: '收藏',   route: '/favorites', gray: 190 },
      { icon: 'ri-user-heart-line', label: '人格',   route: '/persona',  gray: 160 },
      { icon: 'ri-book-open-line',  label: '世界观', route: '/lorebook', gray: 174 },
      { icon: 'ri-palette-line',    label: '主题',   route: '/theme',    gray: 208 },
      { icon: 'ri-team-line',       label: '见面',   route: '/meet',     gray: 184 },
      { icon: 'ri-settings-4-line', label: '设置',   route: '/settings', gray: 212 }
    ],
    [
      { icon: 'ri-clapperboard-line', label: 'VN剧场', route: '/vn',               gray: 158 },
      { icon: 'ri-database-2-line',   label: '存储',   route: '/settings/storage', gray: 176 },
      { icon: 'ri-bug-line',          label: '日志',   route: '/debug-logs',       gray: 204 }
    ]
  ];

  /* 工作数据：DOCK = 4 格；PAGES = 每页 SLOTS 格（元素为 app 或 null 空位） */
  function packToSlots(apps) {
    var slots = [];
    for (var i = 0; i < SLOTS; i++) slots.push(apps[i] || null);
    return slots;
  }
  var DOCK = DEFAULT_DOCK_APPS.slice();
  var PAGES = DEFAULT_PAGE_APPS.map(packToSlots);

  var LAYOUT_KEY = 'ios_springboard_layout_v3';

  function routeMap() {
    var m = {};
    DEFAULT_DOCK_APPS.forEach(function (a) { m[a.route] = a; });
    DEFAULT_PAGE_APPS.forEach(function (p) { p.forEach(function (a) { m[a.route] = a; }); });
    return m;
  }

  function saveLayout() {
    try {
      var data = {
        dock: DOCK.map(function (a) { return a ? a.route : null; }),
        pages: PAGES.map(function (slots) { return slots.map(function (a) { return a ? a.route : null; }); })
      };
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(data));
    } catch (e) { /* 忽略 */ }
  }

  function loadLayout() {
    try {
      var raw = localStorage.getItem(LAYOUT_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.dock) || !Array.isArray(data.pages)) return;
      var byRoute = routeMap();

      var dock = data.dock.slice(0, DOCK_SLOTS).map(function (r) { return r ? byRoute[r] || null : null; });
      while (dock.length < DOCK_SLOTS) dock.push(null);

      var pages = data.pages.map(function (list) {
        var slots = (list || []).slice(0, SLOTS).map(function (r) { return r ? byRoute[r] || null : null; });
        while (slots.length < SLOTS) slots.push(null);
        return slots;
      });

      /* 校验：应用总数正确且无重复 */
      var count = 0, seen = {};
      dock.forEach(function (a) { if (a) { count++; seen[a.route] = (seen[a.route] || 0) + 1; } });
      pages.forEach(function (slots) { slots.forEach(function (a) { if (a) { count++; seen[a.route] = (seen[a.route] || 0) + 1; } }); });
      if (count !== Object.keys(byRoute).length) return;
      var ok = true;
      Object.keys(seen).forEach(function (k) { if (seen[k] !== 1) ok = false; });
      if (!ok) return;

      DOCK = dock;
      PAGES = pages;
    } catch (e) { /* 忽略 */ }
  }

  /* ---------- 全局状态 ---------- */
  var root, track, dotsEl, statusTime, dockEl, doneBtn;
  var widgetTime = null, widgetDate = null, widgetGreet = null;
  var currentPage = 0;
  var frameReady = false;
  var editing = false;

  var lpTimer = null, lpTarget = null;
  var swipe = null;
  var drag = null;             /* {kind,page,cell,app,ghost,sourceEl} */
  var dropTarget = null;       /* {kind,page,cell,cellEl} */
  var edgeTimer = null, edgeDir = 0;
  var activePointerId = null;
  var hideTimer = null;

  /* ---------- 工具 ---------- */
  function isHome() {
    var h = window.location.hash || '';
    return h === '' || h === '#' || h === '#/' || h === '#/';
  }
  function go(route) {
    var p = String(route || '/');
    if (p.charAt(0) !== '/') p = '/' + p;
    var target = '#' + p;
    if (window.location.hash === target) { sync(); }
    else { window.location.hash = target; }
  }
  function iconColor(app) {
    return '#3f3f44';   /* 图标图案颜色保持不变（柔和深灰） */
  }
  function loadRemixicon() {
    if (document.querySelector('link[href*="remixicon"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/remixicon@4.6.0/fonts/remixicon.css';
    document.head.appendChild(link);
  }

  /* ---------- 构建 DOM ---------- */
  function makeApp(app, withLabel) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sb-app';
    btn.setAttribute('aria-label', app.label);

    var tile = document.createElement('div');
    tile.className = 'sb-tile';
    tile.style.color = iconColor(app);
    var ic = document.createElement('i');
    ic.className = app.icon;
    ic.setAttribute('aria-hidden', 'true');
    tile.appendChild(ic);
    btn.appendChild(tile);

    if (withLabel) {
      var lab = document.createElement('span');
      lab.className = 'sb-label';
      lab.textContent = app.label;
      btn.appendChild(lab);
    }
    return btn;
  }

  /* 小组件：时钟 + 日期 + 问候（磨砂玻璃，放在首页顶部） */
  function greeting(h) {
    if (h < 5) return '凌晨好';
    if (h < 9) return '早上好';
    if (h < 12) return '上午好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  }
  function formatDate(d) {
    var week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + week;
  }
  function makeClockWidget() {
    var w = document.createElement('div');
    w.className = 'sb-widget';
    w.innerHTML =
      '<div class="sb-widget-row">' +
        '<div class="sb-widget-time" data-role="wtime">9:41</div>' +
        '<div class="sb-widget-right">' +
          '<div class="sb-widget-date" data-role="wdate"></div>' +
          '<div class="sb-widget-greet" data-role="wgreet"></div>' +
        '</div>' +
      '</div>';
    return w;
  }

  /* 照片 / 便签小组件（数据存本机 localStorage） */
  function getPhotos() {
    try {
      var p = JSON.parse(localStorage.getItem('__sb_photos') || '[]');
      return Array.isArray(p) ? p : [];
    } catch (e) { return []; }
  }
  function getNote() {
    try { return localStorage.getItem('__sb_note') || ''; } catch (e) { return ''; }
  }

  function makePhotosWidget() {
    var w = document.createElement('div');
    w.className = 'sb-widget-half';
    w.innerHTML =
      '<div class="sb-widget-label">照片</div>' +
      '<div class="sb-photos"></div>';
    var grid = w.querySelector('.sb-photos');
    var photos = getPhotos();

    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    w.appendChild(input);
    var targetIndex = 0;
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var arr = [photos[0] || null, photos[1] || null];
        arr[targetIndex] = reader.result;
        try { localStorage.setItem('__sb_photos', JSON.stringify(arr)); } catch (e) {}
        renderGrids();
      };
      reader.readAsDataURL(f);
    });

    for (var i = 0; i < 2; i++) {
      (function (idx) {
        var slot = document.createElement('div');
        slot.className = 'sb-photo-slot';
        slot.setAttribute('role', 'button');
        if (photos[idx]) {
          var img = document.createElement('img');
          img.src = photos[idx];
          slot.appendChild(img);
        } else {
          slot.innerHTML = '<i class="ri-image-add-line"></i>';
        }
        slot.addEventListener('click', function () {
          targetIndex = idx;
          input.click();
        });
        grid.appendChild(slot);
      })(i);
    }
    return w;
  }

  function makeNotesWidget() {
    var w = document.createElement('div');
    w.className = 'sb-widget-half sb-note-widget';
    w.innerHTML =
      '<div class="sb-widget-label">便签</div>' +
      '<textarea class="sb-note-input" placeholder="写点什么…"></textarea>';
    var ta = w.querySelector('.sb-note-input');
    ta.value = getNote();
    var saveTimer = null;
    ta.addEventListener('input', function () {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        try { localStorage.setItem('__sb_note', ta.value); } catch (e) {}
      }, 200);
    });
    return w;
  }

  function renderGrids() {
    track.innerHTML = '';
    PAGES.forEach(function (slots, pi) {
      var page = document.createElement('div');
      page.className = 'sb-page';
      if (pi === 0) {
        page.appendChild(makeClockWidget());
        var wrow = document.createElement('div');
        wrow.className = 'sb-widget-row2';
        wrow.appendChild(makePhotosWidget());
        wrow.appendChild(makeNotesWidget());
        page.appendChild(wrow);
      }
      var grid = document.createElement('div');
      grid.className = 'sb-grid';
      slots.forEach(function (app, si) {
        var cell = document.createElement('div');
        cell.className = 'sb-cell';
        cell.setAttribute('data-kind', 'page');
        cell.setAttribute('data-page', pi);
        cell.setAttribute('data-cell', si);
        if (app) cell.appendChild(makeApp(app, true));
        grid.appendChild(cell);
      });
      page.appendChild(grid);
      track.appendChild(page);
    });

    dotsEl.innerHTML = '';
    PAGES.forEach(function () {
      var d = document.createElement('span');
      d.className = 'sb-dot';
      dotsEl.appendChild(d);
    });

    dockEl.innerHTML = '';
    DOCK.forEach(function (app, i) {
      var cell = document.createElement('div');
      cell.className = 'sb-cell sb-dock-cell';
      cell.setAttribute('data-kind', 'dock');
      cell.setAttribute('data-cell', i);
      if (app) cell.appendChild(makeApp(app, false));
      dockEl.appendChild(cell);
    });

    updateDots();
    setPage(currentPage, false);

    widgetTime = root.querySelector('[data-role="wtime"]');
    widgetDate = root.querySelector('[data-role="wdate"]');
    widgetGreet = root.querySelector('[data-role="wgreet"]');
    updateClock();
  }

  function build() {
    root = document.createElement('div');
    root.id = 'ios-springboard';

    var status = document.createElement('div');
    status.className = 'sb-status';
    status.innerHTML =
      '<span class="sb-time" data-role="time">9:41</span>' +
      '<span class="sb-status-right">' +
        '<svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor" aria-hidden="true">' +
          '<rect x="0" y="8" width="3" height="4" rx="0.9"/><rect x="5" y="5.5" width="3" height="6.5" rx="0.9"/>' +
          '<rect x="10" y="3" width="3" height="9" rx="0.9"/><rect x="15" y="0" width="3" height="12" rx="0.9"/>' +
        '</svg>' +
        '<svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor" aria-hidden="true">' +
          '<path d="M8.5 1C4.6 1 1.3 2.7 0 5.4L1.5 6.9C2.6 4.7 5.4 3.2 8.5 3.2 11.6 3.2 14.4 4.7 15.5 6.9L17 5.4C15.7 2.7 12.4 1 8.5 1Z"/>' +
          '<path d="M8.5 5C6.3 5 4.3 6 3 7.6L4.5 9.1C5.5 7.8 6.9 7 8.5 7 10.1 7 11.5 7.8 12.5 9.1L14 7.6C12.7 6 10.7 5 8.5 5Z"/>' +
          '<circle cx="8.5" cy="10.6" r="1.4"/>' +
        '</svg>' +
        '<svg width="25" height="12" viewBox="0 0 25 12" aria-hidden="true">' +
          '<rect x="0.5" y="0.5" width="21" height="11" rx="3" fill="none" stroke="currentColor" stroke-opacity="0.4"/>' +
          '<rect x="2" y="2" width="16" height="8" rx="1.5" fill="currentColor"/>' +
          '<path d="M23 4v4c1.2-.5 1.2-3.5 0-4Z" fill="currentColor" fill-opacity="0.4"/>' +
        '</svg>' +
      '</span>';
    root.appendChild(status);
    statusTime = status.querySelector('[data-role="time"]');

    var pagesWrap = document.createElement('div');
    pagesWrap.className = 'sb-pages';
    track = document.createElement('div');
    track.className = 'sb-track';
    pagesWrap.appendChild(track);

    dotsEl = document.createElement('div');
    dotsEl.className = 'sb-dots';
    pagesWrap.appendChild(dotsEl);
    root.appendChild(pagesWrap);

    dockEl = document.createElement('div');
    dockEl.className = 'sb-dock';
    root.appendChild(dockEl);

    doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'sb-done-btn';
    doneBtn.textContent = '完成';
    root.appendChild(doneBtn);

    document.body.appendChild(root);
    renderGrids();
  }

  /* ---------- 翻页 ---------- */
  function updateDots() {
    if (!dotsEl) return;
    var dots = dotsEl.children;
    for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('sb-active', i === currentPage);
  }
  function setPage(i, animate) {
    currentPage = Math.max(0, Math.min(PAGES.length - 1, i));
    if (track) {
      track.style.transition = animate === false ? 'none' : '';
      track.style.transform = 'translate3d(' + (-currentPage * 100) + '%,0,0)';
    }
    updateDots();
  }

  /* ---------- 格子 / 应用查找 ---------- */
  function cellDataFromEl(el) {
    if (!el || !el.closest) return null;
    var cell = el.closest('.sb-cell');
    if (!cell || !root.contains(cell)) return null;
    var kind = cell.getAttribute('data-kind');
    var page = kind === 'page' ? parseInt(cell.getAttribute('data-page'), 10) : -1;
    var idx = parseInt(cell.getAttribute('data-cell'), 10);
    return { kind: kind, page: page, cell: idx, cellEl: cell };
  }
  function appDataFromEl(el) {
    if (!el || !el.closest) return null;
    var appEl = el.closest('.sb-app');
    if (!appEl || !root.contains(appEl)) return null;
    return cellDataFromEl(appEl);
  }
  function getAppAt(kind, page, cell) {
    return kind === 'page' ? PAGES[page][cell] : DOCK[cell];
  }
  function setAppAt(kind, page, cell, app) {
    if (kind === 'page') PAGES[page][cell] = app;
    else DOCK[cell] = app;
  }

  /* ---------- 编辑模式 ---------- */
  function enterEdit() {
    editing = true;
    root.classList.add('sb-editing');
  }
  function exitEdit() {
    editing = false;
    endDrag();
    root.classList.remove('sb-editing');
  }

  function createGhost(app) {
    var g = document.createElement('div');
    g.className = 'sb-drag-ghost';
    g.style.color = iconColor(app);
    var ic = document.createElement('i');
    ic.className = app.icon;
    g.appendChild(ic);
    return g;
  }

  function startDrag(data, cx, cy) {
    if (!data) return;
    var app = getAppAt(data.kind, data.page, data.cell);
    if (!app) return;
    if (swipe) swipe.active = false;
    drag = { kind: data.kind, page: data.page, cell: data.cell, app: app, ghost: null, sourceEl: data.cellEl };
    drag.ghost = createGhost(app);
    root.appendChild(drag.ghost);
    moveGhost(cx, cy);
    if (drag.sourceEl) drag.sourceEl.classList.add('sb-dragging');
  }

  function moveGhost(cx, cy) {
    if (drag && drag.ghost) {
      drag.ghost.style.left = (cx - 30) + 'px';
      drag.ghost.style.top = (cy - 30) + 'px';
    }
  }

  function setDropTarget(cd) {
    if (dropTarget && dropTarget.cellEl) dropTarget.cellEl.classList.remove('sb-drop-target');
    dropTarget = cd;
    if (cd && cd.cellEl) cd.cellEl.classList.add('sb-drop-target');
  }

  function clearDragMarks() {
    var els = root.querySelectorAll('.sb-dragging, .sb-drop-target');
    for (var i = 0; i < els.length; i++) {
      els[i].classList.remove('sb-dragging');
      els[i].classList.remove('sb-drop-target');
    }
  }

  function endDrag() {
    if (drag && drag.ghost) drag.ghost.remove();
    clearDragMarks();
    if (drag && dropTarget) {
      var t = dropTarget;
      var same = (t.kind === drag.kind && t.page === drag.page && t.cell === drag.cell);
      if (!same) {
        var occupant = getAppAt(t.kind, t.page, t.cell);
        setAppAt(drag.kind, drag.page, drag.cell, occupant);
        setAppAt(t.kind, t.page, t.cell, drag.app);
        renderGrids();
        saveLayout();
      }
    }
    drag = null;
    dropTarget = null;
    clearEdge();
  }

  function scheduleEdge(dir) {
    if (edgeDir === dir && edgeTimer) return;
    clearEdge();
    edgeDir = dir;
    edgeTimer = setTimeout(function () {
      edgeTimer = null;
      setPage(currentPage + edgeDir);
    }, 350);
  }
  function clearEdge() {
    if (edgeTimer) { clearTimeout(edgeTimer); edgeTimer = null; }
    edgeDir = 0;
  }

  function moveDrag(cx, cy) {
    if (!drag) return;
    moveGhost(cx, cy);

    /* 网格图标拖到页面左右边缘时自动翻页 */
    if (drag.kind === 'page' && PAGES.length > 1) {
      var rect = track.parentNode.getBoundingClientRect();
      var edge = 48;
      if (cx < rect.left + edge && currentPage > 0) scheduleEdge(-1);
      else if (cx > rect.right - edge && currentPage < PAGES.length - 1) scheduleEdge(1);
      else clearEdge();
    }

    var el = document.elementFromPoint(cx, cy);
    var cd = cellDataFromEl(el);
    setDropTarget(cd);
  }

  /* ---------- 手势（pointer 事件统一处理触摸/鼠标） ---------- */
  function bindGestures() {
    root.addEventListener('pointerdown', function (e) {
      if (activePointerId !== null && activePointerId !== e.pointerId) return;
      activePointerId = e.pointerId;
      var data = appDataFromEl(e.target);

      if (editing) {
        if (data) startDrag(data, e.clientX, e.clientY);
        return;
      }

      swipe = { startX: e.clientX, startY: e.clientY, active: true, moved: false };
      if (data) {
        lpTarget = data;
        lpTimer = setTimeout(function () {
          lpTimer = null;
          enterEdit();
          if (lpTarget) { startDrag(lpTarget, e.clientX, e.clientY); lpTarget = null; }
        }, 500);
      }
    });

    window.addEventListener('pointermove', function (e) {
      if (activePointerId !== null && activePointerId !== e.pointerId) return;
      if (drag) { moveDrag(e.clientX, e.clientY); return; }
      if (swipe && swipe.active) {
        var dx = e.clientX - swipe.startX, dy = e.clientY - swipe.startY;
        if (!swipe.moved && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
          if (Math.abs(dx) > Math.abs(dy)) {
            swipe.moved = true;
            if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; lpTarget = null; }
          } else {
            swipe.active = false;
            if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; lpTarget = null; }
          }
        }
        if (swipe.moved) {
          var w = track.clientWidth || 1;
          var edge = (currentPage === 0 && dx > 0) || (currentPage === PAGES.length - 1 && dx < 0);
          var resistance = edge ? 0.35 : 1;
          track.style.transition = 'none';
          track.style.transform = 'translate3d(' + (-currentPage * w + dx * resistance) + 'px,0,0)';
        }
      }
    });

    function finish() {
      if (activePointerId === null) return;
      activePointerId = null;
      if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; lpTarget = null; }
      if (drag) { endDrag(); return; }
      if (swipe && swipe.active) { endSwipe(); return; }
      clearEdge();
    }
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }

  function endSwipe() {
    if (!swipe) return;
    var s = swipe;
    swipe = null;
    if (!s.moved) { track.style.transition = ''; setPage(currentPage); return; }
    var dx = 0;
    var m = /translate3d\(([-0-9.]+)px/.exec(track.style.transform);
    if (m) { dx = parseFloat(m[1]) - (-currentPage * (track.clientWidth || 1)); }
    var threshold = (track.clientWidth || 1) * 0.2;
    if (dx < -threshold) setPage(currentPage + 1);
    else if (dx > threshold) setPage(currentPage - 1);
    else setPage(currentPage);
  }

  /* ---------- 点击导航（编辑模式下不导航） ---------- */
  function bindClick() {
    root.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('.sb-done-btn')) { exitEdit(); return; }
      if (editing) {
        if (!e.target.closest('.sb-app')) exitEdit();
        return;
      }
      var data = appDataFromEl(e.target);
      if (!data) return;
      var app = getAppAt(data.kind, data.page, data.cell);
      if (app) go(app.route);
    });
  }

  /* ---------- 显示/隐藏 ---------- */
  function sync() {
    if (!root) return;
    var home = isHome();
    var show = home && frameReady;
    var willShow = show && !root.classList.contains('sb-visible');

    if (show) {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      root.classList.remove('sb-leaving');
      if (willShow) matchFrame();
      root.classList.add('sb-visible');
      if (willShow) { updateClock(); setPage(currentPage, false); }
    } else {
      /* 离开桌面：先淡出，再真正隐藏，和页面切换平滑衔接 */
      if (!hideTimer) {
        root.classList.add('sb-leaving');
        hideTimer = setTimeout(function () {
          hideTimer = null;
          if (!isHome()) {
            root.classList.remove('sb-visible');
            root.classList.remove('sb-leaving');
          }
        }, 420);
      }
    }
  }
  function updateClock() {
    var d = new Date();
    var h = d.getHours(), m = d.getMinutes();
    var t = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    if (statusTime) statusTime.textContent = t;
    if (widgetTime) widgetTime.textContent = t;
    if (widgetDate) widgetDate.textContent = formatDate(d);
    if (widgetGreet) widgetGreet.textContent = greeting(h);
  }
  function applyDark() {
    if (!root) return;
    var dark = document.documentElement.classList.contains('dark');
    root.classList.toggle('sb-dark', dark);
  }

  /* 读取应用设置的壁纸，作为桌面背景（换壁纸后桌面跟着变） */
  function applyWallpaper() {
    if (!root) return;
    var w = '';
    try {
      w = localStorage.getItem('ai_wallpaper') || '';
      if (!w) {
        var keys = ['settings', 'settings-theme', 'theme'];
        for (var i = 0; i < keys.length && !w; i++) {
          var raw = localStorage.getItem(keys[i]);
          if (!raw) continue;
          try {
            var o = JSON.parse(raw);
            w = o.wallpaper || o.wallpaperRef || o.lockScreenWallpaper || o.lockScreenWallpaperRef || '';
          } catch (e) {}
        }
      }
    } catch (e) {}
    if (w && (w.indexOf('http') === 0 || w.indexOf('data:') === 0 || w.indexOf('blob:') === 0)) {
      root.style.backgroundImage = 'url("' + w.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '")';
      root.style.backgroundSize = 'cover';
      root.style.backgroundPosition = 'center';
    } else {
      root.style.backgroundImage = '';
      root.style.backgroundSize = '';
      root.style.backgroundPosition = '';
    }
  }

  /* 让桌面精确套进 .phone-frame（手机框） */
  function matchFrame() {
    if (!root) return;
    var frame = document.querySelector('.phone-frame');
    if (!frame) {
      root.style.left = '0px'; root.style.top = '0px';
      root.style.width = '100vw'; root.style.height = '100vh';
      root.style.borderRadius = '0px';
      return;
    }
    frameReady = true;
    var r = frame.getBoundingClientRect();
    root.style.left = r.left + 'px'; root.style.top = r.top + 'px';
    root.style.width = r.width + 'px'; root.style.height = r.height + 'px';
    try { root.style.borderRadius = window.getComputedStyle(frame).borderRadius; }
    catch (e) { root.style.borderRadius = '0px'; }
  }
  function startFrameSync() {
    var findTimer = setInterval(function () {
      var frame = document.querySelector('.phone-frame');
      if (!frame) return;
      clearInterval(findTimer);
      matchFrame();
      sync();
      if (window.ResizeObserver) {
        var ro = new ResizeObserver(function () { matchFrame(); });
        ro.observe(frame);
      }
      window.addEventListener('resize', matchFrame);
      window.addEventListener('orientationchange', matchFrame);
      if (window.visualViewport) window.visualViewport.addEventListener('resize', matchFrame);
    }, 100);
  }

  function patchHistory() {
    try {
      var pushState = window.history.pushState;
      var replaceState = window.history.replaceState;
      window.history.pushState = function () { var r = pushState.apply(this, arguments); sync(); return r; };
      window.history.replaceState = function () { var r = replaceState.apply(this, arguments); sync(); return r; };
    } catch (e) { /* 忽略 */ }
  }

  /* ---------- 启动 ---------- */
  function init() {
    loadRemixicon();
    loadLayout();
    build();
    bindGestures();
    bindClick();
    patchHistory();
    applyDark();
    applyWallpaper();
    setPage(0, false);
    startFrameSync();
    sync();

    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    setInterval(updateClock, 30000);
    setInterval(sync, 500);
    setInterval(applyWallpaper, 800);

    if (window.MutationObserver) {
      var mo = new MutationObserver(applyDark);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && editing) exitEdit();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
