(function () {
  'use strict';

  var STORAGE_KEY = 'jarvis-state';
  var EXERCISE_COLORS = ['#D97A42', '#4A4A46', '#7A9471', '#7A8B99', '#B08968', '#C1584B', '#9A8C98', '#5C6B73', '#D9A441', '#8C6A5D'];
  var WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  var MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  var WEEKDAY_FULL_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

  var MOVEMENT_TYPES = [
    { id: 'push', label: 'Poussée' },
    { id: 'pull', label: 'Tirage' },
    { id: 'squat', label: 'Jambes / Squat' },
    { id: 'hinge', label: 'Hanche (soulevé)' },
    { id: 'epaules', label: 'Épaules' },
    { id: 'bras', label: 'Bras' },
    { id: 'abdos', label: 'Abdos / Core' },
    { id: 'cardio', label: 'Cardio' },
    { id: 'autre', label: 'Autre' }
  ];

  function emptyState() {
    return { templates: [], scheduled: [], weightLogs: [], bodyMetrics: [], foodLog: [], creatineLog: [], xp: 0, lastMondayWeek: null };
  }

  // ---------- helpers ----------
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }
  function fmtDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parseDate(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function fmtDateReadable(s) { var d = parseDate(s); return d.getDate() + ' ' + MONTHS_FR[d.getMonth()].toLowerCase(); }
  function getWeekKey(d) {
    var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dayNum = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - dayNum + 3);
    var firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    var weekNum = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    return date.getUTCFullYear() + '-W' + weekNum;
  }
  function getWeekRange(d) {
    var dayNum = (d.getDay() + 6) % 7;
    var monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayNum);
    var sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    return [monday, sunday];
  }
  function addDays(dateStr, n) { var d = parseDate(dateStr); d.setDate(d.getDate() + n); return fmtDate(d); }
  function movementLabel(id) { var m = MOVEMENT_TYPES.filter(function (x) { return x.id === id; })[0]; return m ? m.label : 'Autre'; }
  function round1(n) { return Math.round(n * 10) / 10; }

  function el(tag, props, children) {
    props = props || {}; children = children || [];
    var e = document.createElement(tag);
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v === undefined || v === null) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') e[k] = v;
      else if (k === 'disabled') { if (v) e.setAttribute('disabled', 'true'); }
      else e.setAttribute(k, v);
    });
    children.forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function svgEl(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  // ---------- state ----------
  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return Object.assign(emptyState(), JSON.parse(raw));
    } catch (e) { /* première visite */ }
    return emptyState();
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); ui.saveError = false; }
    catch (e) { ui.saveError = true; }
  }

  var state = loadState();
  var scannerInstance = null;
  var now0 = new Date();
  var ui = {
    tab: 'today',
    viewYear: now0.getFullYear(),
    viewMonthIdx: now0.getMonth(),
    dayModalDate: null,
    completingId: null,
    showMonday: false,
    confirmReset: false,
    newTplName: '',
    newTplExercises: [{ name: '', movementType: 'autre' }],
    dayPickTpl: '',
    mondayWeight: '',
    mondayHeight: '',
    compWeights: {},
    compFeeling: null,
    compComment: '',
    nutritionDate: fmtDate(now0),
    showScanner: false,
    scannerStep: 'scanning',
    scanResult: null,
    scanQty: 100,
    scanError: '',
    manualFood: { name: '', cal: '', prot: '', carb: '', fat: '' },
    saveError: false
  };

  function today() { return fmtDate(new Date()); }

  (function checkMonday() {
    var now = new Date();
    if (now.getDay() === 1) {
      var wk = getWeekKey(now);
      if (state.lastMondayWeek !== wk) ui.showMonday = true;
    }
  })();

  // ---------- XP / level ----------
  function addXp(n) { state.xp = Math.max(0, (state.xp || 0) + n); }
  function levelInfo(xp) {
    xp = xp || 0;
    var perLevel = 100;
    var level = Math.floor(xp / perLevel) + 1;
    var into = xp % perLevel;
    return { level: level, into: into, needed: perLevel, pct: into / perLevel };
  }

  // ---------- mutations: templates / scheduling ----------
  function addTemplate() {
    var exs = ui.newTplExercises
      .filter(function (e) { return e.name.trim(); })
      .map(function (e) { return { id: uid(), name: e.name.trim(), movementType: e.movementType || 'autre' }; });
    if (!ui.newTplName.trim() || exs.length === 0) return;
    state.templates.push({ id: uid(), name: ui.newTplName.trim(), exercises: exs });
    ui.newTplName = ''; ui.newTplExercises = [{ name: '', movementType: 'autre' }];
    saveState(); render();
  }
  function deleteTemplate(id) { state.templates = state.templates.filter(function (t) { return t.id !== id; }); saveState(); render(); }
  function addScheduled(templateId, date) {
    var tpl = state.templates.filter(function (t) { return t.id === templateId; })[0];
    if (!tpl) return;
    state.scheduled.push({ id: uid(), templateId: templateId, templateName: tpl.name, date: date, status: 'planned', feeling: null, comment: '', weights: {} });
    saveState(); render();
  }
  function deleteScheduled(id) { state.scheduled = state.scheduled.filter(function (s) { return s.id !== id; }); saveState(); render(); }

  function openCompletion(id) {
    var session = state.scheduled.filter(function (s) { return s.id === id; })[0];
    var tpl = session && state.templates.filter(function (t) { return t.id === session.templateId; })[0];
    var weights = {};
    (tpl ? tpl.exercises : []).forEach(function (ex) {
      var logs = state.weightLogs.filter(function (w) { return w.exerciseId === ex.id; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      var last = logs[0];
      weights[ex.id] = (session.weights && session.weights[ex.id] !== undefined) ? session.weights[ex.id] : (last ? last.weight : '');
    });
    ui.compWeights = weights;
    ui.compFeeling = session ? session.feeling : null;
    ui.compComment = session ? session.comment : '';
    ui.completingId = id;
    render();
  }
  function submitCompletion() {
    var session = state.scheduled.filter(function (s) { return s.id === ui.completingId; })[0];
    if (!session) return;
    var wasDone = session.status === 'done';
    var tpl = state.templates.filter(function (t) { return t.id === session.templateId; })[0];
    var weightsMap = {}, newLogs = [];
    (tpl ? tpl.exercises : []).forEach(function (ex) {
      var w = parseFloat(ui.compWeights[ex.id]);
      if (!isNaN(w)) {
        weightsMap[ex.id] = w;
        newLogs.push({ id: uid(), date: session.date, exerciseId: ex.id, exerciseName: ex.name, weight: w });
      }
    });
    var exIds = (tpl ? tpl.exercises : []).map(function (e) { return e.id; });
    state.weightLogs = state.weightLogs.filter(function (w) { return !(w.date === session.date && exIds.indexOf(w.exerciseId) !== -1); }).concat(newLogs);
    session.status = 'done';
    session.feeling = ui.compFeeling;
    session.comment = ui.compComment;
    session.weights = weightsMap;
    if (!wasDone) addXp(30);
    ui.completingId = null;
    saveState(); render();
  }
  function submitMonday() {
    var w = parseFloat(ui.mondayWeight), h = parseFloat(ui.mondayHeight);
    if (isNaN(w) || isNaN(h)) return;
    state.bodyMetrics.push({ date: today(), weight: w, height: h });
    state.lastMondayWeek = getWeekKey(new Date());
    addXp(15);
    ui.showMonday = false; ui.mondayWeight = ''; ui.mondayHeight = '';
    saveState(); render();
  }
  function resetAll() { state = emptyState(); ui.confirmReset = false; saveState(); render(); }

  function dayStatusColor(dateStr, sessions) {
    if (sessions.length === 0) return null;
    if (sessions.every(function (s) { return s.status === 'done'; })) return 'green';
    if (dateStr < today() && sessions.some(function (s) { return s.status === 'planned'; })) return 'red';
    return 'amber';
  }
  function exerciseColorMap() {
    var names = [], map = {};
    state.templates.forEach(function (t) { t.exercises.forEach(function (e) { if (names.indexOf(e.name) === -1) names.push(e.name); }); });
    names.forEach(function (n, i) { map[n] = EXERCISE_COLORS[i % EXERCISE_COLORS.length]; });
    return map;
  }

  // ---------- creatine ----------
  function toggleCreatine() {
    var t = today();
    var idx = state.creatineLog.indexOf(t);
    if (idx === -1) { state.creatineLog.push(t); addXp(5); }
    else { state.creatineLog.splice(idx, 1); addXp(-5); }
    saveState(); render();
  }

  // ---------- nutrition ----------
  function parseServingGrams(s) {
    if (!s) return null;
    var m = String(s).match(/([\d.,]+)\s*g/i);
    if (m) return parseFloat(m[1].replace(',', '.'));
    return null;
  }
  function foodsForDate(dateStr) { return state.foodLog.filter(function (f) { return f.date === dateStr; }); }
  function deleteFood(id) { state.foodLog = state.foodLog.filter(function (f) { return f.id !== id; }); saveState(); render(); }

  function openScanner() {
    ui.showScanner = true; ui.scannerStep = 'scanning'; ui.scanResult = null; ui.scanError = '';
    render();
    startScanner();
  }
  function startScanner() {
    if (!window.Html5Qrcode) {
      ui.scanError = "Le module de scan n'a pas pu se charger (vérifie ta connexion internet).";
      ui.scannerStep = 'error'; render(); return;
    }
    try {
      scannerInstance = new window.Html5Qrcode('barcode-reader');
      scannerInstance.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 140 } },
        onScanSuccess,
        function () { /* per-frame miss, ignore */ }
      ).catch(function () {
        ui.scanError = "Impossible d'accéder à la caméra (autorise l'accès dans les réglages Safari).";
        ui.scannerStep = 'error'; render();
      });
    } catch (e) {
      ui.scanError = 'Erreur au démarrage du scanner.'; ui.scannerStep = 'error'; render();
    }
  }
  function stopScannerCamera() {
    if (scannerInstance) {
      try { scannerInstance.stop().then(function () { try { scannerInstance.clear(); } catch (e) {} }).catch(function () {}); } catch (e) {}
      scannerInstance = null;
    }
  }
  function onScanSuccess(decodedText) {
    stopScannerCamera();
    lookupBarcode(decodedText);
  }
  function lookupBarcode(code) {
    ui.scannerStep = 'loading'; render();
    fetch('https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(code) + '.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.status === 1 && data.product) {
          var p = data.product;
          var n = p.nutriments || {};
          var servingG = parseServingGrams(p.serving_size) || 100;
          ui.scanResult = {
            barcode: code,
            name: p.product_name || p.generic_name || 'Produit',
            brand: p.brands || '',
            cal100: n['energy-kcal_100g'] || 0,
            prot100: n['proteins_100g'] || 0,
            carb100: n['carbohydrates_100g'] || 0,
            fat100: n['fat_100g'] || 0
          };
          ui.scanQty = servingG;
          ui.scannerStep = 'result';
        } else {
          ui.scanError = 'Produit introuvable dans la base Open Food Facts.';
          ui.scannerStep = 'error';
        }
        render();
      })
      .catch(function () {
        ui.scanError = 'Erreur réseau — réessaie.';
        ui.scannerStep = 'error';
        render();
      });
  }
  function addFoodFromScan() {
    var r = ui.scanResult;
    if (!r) return;
    var factor = (parseFloat(ui.scanQty) || 0) / 100;
    state.foodLog.push({
      id: uid(), date: ui.nutritionDate, name: r.name, brand: r.brand, quantity: parseFloat(ui.scanQty) || 0,
      calories: round1(r.cal100 * factor), protein: round1(r.prot100 * factor), carbs: round1(r.carb100 * factor), fat: round1(r.fat100 * factor),
      barcode: r.barcode
    });
    closeScanner();
    saveState(); render();
  }
  function closeScanner() {
    stopScannerCamera();
    ui.showScanner = false; ui.scanResult = null; ui.scanError = '';
    render();
  }
  function addFoodManual() {
    var f = ui.manualFood;
    var cal = parseFloat(f.cal), prot = parseFloat(f.prot) || 0, carb = parseFloat(f.carb) || 0, fat = parseFloat(f.fat) || 0;
    if (!f.name.trim() || isNaN(cal)) return;
    state.foodLog.push({ id: uid(), date: ui.nutritionDate, name: f.name.trim(), brand: '', quantity: null, calories: cal, protein: prot, carbs: carb, fat: fat, barcode: null });
    ui.manualFood = { name: '', cal: '', prot: '', carb: '', fat: '' };
    saveState(); render();
  }

  // ---------- bracket wrapper ----------
  function bracket(accent, className, children) {
    var wrap = el('div', { class: 'bracket ' + (className || ''), style: '--bk: var(--' + accent + ')' }, [
      el('span', { class: 'bk bk-tl' }), el('span', { class: 'bk bk-tr' }),
      el('span', { class: 'bk bk-bl' }), el('span', { class: 'bk bk-br' })
    ]);
    wrap.appendChild(el('div', { class: 'bracket-inner' }, children));
    return wrap;
  }

  // ---------- movement icons ----------
  function buildMovementIcon(type) {
    type = type || 'autre';
    var svg = svgEl('svg', { viewBox: '0 0 40 40', class: 'mv-icon mv-' + type, style: 'width:22px;height:22px;display:block' });
    var strokeStyle = 'stroke:var(--accent-strong);fill:none;stroke-width:3;stroke-linecap:round;';
    var fillStyle = 'fill:var(--accent-strong);';
    function line(x1, y1, x2, y2, cls) {
      var l = svgEl('line', { x1: x1, y1: y1, x2: x2, y2: y2, style: strokeStyle });
      if (cls) l.setAttribute('class', cls);
      return l;
    }
    function circle(cx, cy, r, cls) {
      var c = svgEl('circle', { cx: cx, cy: cy, r: r, style: fillStyle });
      if (cls) c.setAttribute('class', cls);
      return c;
    }
    if (type === 'push') {
      svg.appendChild(line(10, 12, 10, 28)); svg.appendChild(line(30, 12, 30, 28));
      var bar = svgEl('g', { class: 'moving' }); bar.appendChild(line(6, 16, 34, 16, undefined));
      svg.appendChild(bar);
    } else if (type === 'pull') {
      svg.appendChild(line(20, 4, 20, 14));
      var g = svgEl('g', { class: 'moving' }); g.appendChild(line(10, 16, 30, 16));
      svg.appendChild(g);
      svg.appendChild(line(20, 16, 20, 30));
    } else if (type === 'squat') {
      svg.appendChild(line(20, 22, 13, 34)); svg.appendChild(line(20, 22, 27, 34));
      var g2 = svgEl('g', { class: 'moving' }); g2.appendChild(circle(20, 18, 5));
      svg.appendChild(g2);
    } else if (type === 'hinge') {
      svg.appendChild(circle(20, 28, 2));
      var g3 = svgEl('g', { class: 'moving' }); g3.appendChild(line(20, 28, 20, 10));
      svg.appendChild(g3);
      svg.appendChild(line(20, 28, 12, 34)); svg.appendChild(line(20, 28, 28, 34));
    } else if (type === 'epaules') {
      svg.appendChild(circle(20, 20, 2));
      var g4 = svgEl('g', { class: 'moving' }); g4.appendChild(circle(20, 20, 3));
      svg.appendChild(g4);
    } else if (type === 'bras') {
      svg.appendChild(line(14, 14, 14, 24));
      var g5 = svgEl('g', { class: 'moving' }); g5.appendChild(line(14, 24, 24, 26));
      svg.appendChild(g5);
    } else if (type === 'abdos') {
      var g6 = svgEl('g', { class: 'moving' });
      g6.appendChild(svgEl('path', { d: 'M12 12 Q20 20 12 30', style: strokeStyle }));
      g6.appendChild(svgEl('path', { d: 'M28 12 Q20 20 28 30', style: strokeStyle }));
      svg.appendChild(g6);
    } else if (type === 'cardio') {
      svg.appendChild(line(8, 32, 32, 32));
      var g7 = svgEl('g', { class: 'moving' }); g7.appendChild(circle(20, 20, 4));
      svg.appendChild(g7);
    } else {
      svg.appendChild(svgEl('rect', { x: 6, y: 17, width: 6, height: 6, rx: 1.5, style: fillStyle }));
      svg.appendChild(svgEl('rect', { x: 28, y: 17, width: 6, height: 6, rx: 1.5, style: fillStyle }));
      svg.appendChild(line(12, 20, 28, 20));
    }
    return svg;
  }
  function movementIconWrap(type) { return el('div', { class: 'mv-icon-wrap' }, [buildMovementIcon(type)]); }

  // ---------- SVG line chart ----------
  function buildLineChart(seriesMap, dates, colorFor, unit) {
    var width = 320, height = 220, padL = 34, padR = 10, padT = 12, padB = 24;
    var allValues = [];
    Object.keys(seriesMap).forEach(function (k) { Object.keys(seriesMap[k]).forEach(function (d) { allValues.push(seriesMap[k][d]); }); });
    if (allValues.length === 0) return null;
    var minV = Math.min.apply(null, allValues), maxV = Math.max.apply(null, allValues);
    var span = (maxV - minV) || Math.max(2, maxV * 0.1) || 5;
    var yMin = minV - span * 0.15, yMax = maxV + span * 0.15;
    var innerW = width - padL - padR, innerH = height - padT - padB;
    var xStep = dates.length > 1 ? innerW / (dates.length - 1) : 0;
    function xPos(i) { return padL + (dates.length > 1 ? i * xStep : innerW / 2); }
    function yPos(v) { return padT + (1 - (v - yMin) / (yMax - yMin || 1)) * innerH; }

    var svg = svgEl('svg', { viewBox: '0 0 ' + width + ' ' + height, width: '100%', height: height, preserveAspectRatio: 'xMidYMid meet' });
    var ticks = 4;
    for (var t = 0; t <= ticks; t++) {
      var v = yMin + (t / ticks) * (yMax - yMin);
      var y = yPos(v);
      svg.appendChild(svgEl('line', { x1: padL, x2: width - padR, y1: y, y2: y, stroke: '#E6E0D8', 'stroke-dasharray': '3 3', 'stroke-width': 1 }));
      var lbl = svgEl('text', { x: 2, y: y + 3, fill: '#8C8577', 'font-size': 9, 'font-family': 'JetBrains Mono, monospace' });
      lbl.textContent = Math.round(v) + (unit || '');
      svg.appendChild(lbl);
    }
    var maxLabels = 6;
    var everyN = Math.max(1, Math.ceil(dates.length / maxLabels));
    dates.forEach(function (d, i) {
      if (i % everyN !== 0 && i !== dates.length - 1) return;
      var lbl = svgEl('text', { x: xPos(i), y: height - 6, fill: '#8C8577', 'font-size': 9, 'font-family': 'JetBrains Mono, monospace', 'text-anchor': 'middle' });
      lbl.textContent = fmtDateReadable(d);
      svg.appendChild(lbl);
    });
    Object.keys(seriesMap).forEach(function (name) {
      var series = seriesMap[name];
      var color = colorFor(name);
      var segments = [[]];
      dates.forEach(function (d, i) {
        if (series[d] === undefined) { if (segments[segments.length - 1].length) segments.push([]); return; }
        segments[segments.length - 1].push([xPos(i), yPos(series[d])]);
      });
      segments.forEach(function (seg) {
        if (seg.length === 0) return;
        if (seg.length > 1) {
          var pathD = 'M ' + seg.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' L ');
          svg.appendChild(svgEl('path', { d: pathD, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
        }
        seg.forEach(function (p) { svg.appendChild(svgEl('circle', { cx: p[0], cy: p[1], r: 3, fill: color })); });
      });
    });
    return svg;
  }
  function chartWithLegend(seriesMap, dates, colorFor, unit) {
    var wrap = el('div', { class: 'chart-wrap' });
    var svg = buildLineChart(seriesMap, dates, colorFor, unit);
    if (!svg) return null;
    wrap.appendChild(svg);
    var legend = el('div', { class: 'chart-legend' });
    Object.keys(seriesMap).forEach(function (name) {
      legend.appendChild(el('div', { class: 'chart-legend-item' }, [
        el('span', { class: 'legend-swatch', style: 'background:' + colorFor(name) }),
        el('span', { text: name })
      ]));
    });
    wrap.appendChild(legend);
    return wrap;
  }

  // ---------- macro donut ----------
  function buildMacroDonut(proteinG, carbG, fatG, totalCalories) {
    var size = 132, r = size * 0.34, cx = size / 2, cy = size / 2, sw = size * 0.17;
    var c = 2 * Math.PI * r;
    var segments = [
      { value: proteinG * 4, color: '#D97A42' },
      { value: carbG * 4, color: '#7A8B99' },
      { value: fatG * 9, color: '#D9A441' }
    ];
    var total = segments.reduce(function (s, x) { return s + x.value; }, 0);
    var svg = svgEl('svg', { viewBox: '0 0 ' + size + ' ' + size, width: size, height: size });
    svg.appendChild(svgEl('circle', { cx: cx, cy: cy, r: r, fill: 'none', stroke: '#F3EFEA', 'stroke-width': sw }));
    if (total > 0) {
      var offsetAcc = 0;
      segments.forEach(function (seg) {
        if (seg.value <= 0) return;
        var frac = seg.value / total;
        var len = frac * c;
        var circle = svgEl('circle', { cx: cx, cy: cy, r: r, fill: 'none', stroke: seg.color, 'stroke-width': sw, 'stroke-dasharray': len.toFixed(1) + ' ' + (c - len).toFixed(1), 'stroke-dashoffset': (-offsetAcc).toFixed(1) });
        circle.setAttribute('transform', 'rotate(-90 ' + cx + ' ' + cy + ')');
        svg.appendChild(circle);
        offsetAcc += len;
      });
    }
    var t1 = svgEl('text', { x: cx, y: cy - 3, 'text-anchor': 'middle', 'font-size': 15, 'font-family': 'Fraunces, serif', 'font-weight': 700, fill: '#2B2926' });
    t1.textContent = Math.round(totalCalories || 0);
    svg.appendChild(t1);
    var t2 = svgEl('text', { x: cx, y: cy + 13, 'text-anchor': 'middle', 'font-size': 9, 'font-family': 'JetBrains Mono, monospace', fill: '#8C8577' });
    t2.textContent = 'kcal';
    svg.appendChild(t2);
    return svg;
  }

  // ---------- tab builders ----------
  function buildToday() {
    var panel = el('div', { class: 'tab-panel' });
    var d = new Date();
    panel.appendChild(el('div', { class: 'today-date', text: WEEKDAY_FULL_FR[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS_FR[d.getMonth()] }));

    var range = getWeekRange(new Date());
    var wMon = fmtDate(range[0]), wSun = fmtDate(range[1]);
    var weekSessions = state.scheduled.filter(function (s) { return s.date >= wMon && s.date <= wSun; });
    var weekDone = weekSessions.filter(function (s) { return s.status === 'done'; }).length;
    panel.appendChild(el('div', { class: 'week-stat', text: weekDone + '/' + weekSessions.length + ' séances cette semaine' }));

    var t = today();
    var todaySessions = state.scheduled.filter(function (s) { return s.date === t; });
    var creatineDone = state.creatineLog.indexOf(t) !== -1;

    // checklist card
    var checklistRows = [];
    todaySessions.forEach(function (s) {
      checklistRows.push(el('div', { class: 'checklist-row' }, [
        el('div', {
          class: 'check-box' + (s.status === 'done' ? ' checked' : ''), text: s.status === 'done' ? '✓' : '',
          onclick: function () { if (s.status !== 'done') openCompletion(s.id); }
        }),
        el('div', { class: 'checklist-text' }, [
          document.createTextNode('Séance : ' + s.templateName),
          s.status === 'done'
            ? el('span', { class: 'sub', text: 'Faite — ressenti ' + s.feeling + '/10' })
            : el('span', { class: 'sub', text: "À faire aujourd'hui" })
        ]),
        s.status !== 'done' ? el('span', { class: 'xp-tag', text: '+30 xp' }) : null
      ]));
    });
    checklistRows.push(el('div', { class: 'checklist-row' }, [
      el('div', { class: 'check-box' + (creatineDone ? ' checked' : ''), text: creatineDone ? '✓' : '', onclick: toggleCreatine }),
      el('div', { class: 'checklist-text' }, [document.createTextNode('Prendre la créatine')]),
      el('span', { class: 'xp-tag', text: '+5 xp' })
    ]));
    panel.appendChild(bracket('accent', '', [el('h2', { class: 'section-title', style: 'margin-bottom:2px', text: 'Checklist du jour' })].concat(checklistRows)));

    if (todaySessions.length === 0) {
      var body = [el('p', { class: 'muted', text: "Aucune séance prévue aujourd'hui." })];
      if (state.templates.length > 0) {
        var row = el('div', { class: 'quick-add-row' });
        state.templates.forEach(function (tpl) {
          row.appendChild(el('button', { class: 'chip-btn', text: '+ ' + tpl.name, onclick: function () { addScheduled(tpl.id, t); } }));
        });
        body.push(row);
      } else {
        body.push(el('p', { class: 'muted small', text: "Crée d'abord une séance dans l'onglet « Séances »." }));
      }
      panel.appendChild(bracket('accent', '', body));
    }
    return panel;
  }

  function buildCalendar() {
    var panel = el('div', { class: 'tab-panel' });
    var header = el('div', { class: 'cal-header' }, [
      el('button', { class: 'cal-nav-btn', text: '‹', onclick: function () { ui.viewMonthIdx--; if (ui.viewMonthIdx < 0) { ui.viewMonthIdx = 11; ui.viewYear--; } render(); } }),
      el('span', { class: 'cal-title', text: MONTHS_FR[ui.viewMonthIdx] + ' ' + ui.viewYear }),
      el('button', { class: 'cal-nav-btn', text: '›', onclick: function () { ui.viewMonthIdx++; if (ui.viewMonthIdx > 11) { ui.viewMonthIdx = 0; ui.viewYear++; } render(); } })
    ]);
    panel.appendChild(header);
    var weekdaysRow = el('div', { class: 'cal-grid cal-weekdays' });
    WEEKDAYS_SHORT.forEach(function (w) { weekdaysRow.appendChild(el('div', { class: 'cal-weekday', text: w })); });
    panel.appendChild(weekdaysRow);
    var grid = el('div', { class: 'cal-grid' });
    var firstDay = new Date(ui.viewYear, ui.viewMonthIdx, 1);
    var startOffset = (firstDay.getDay() + 6) % 7;
    var daysInMonth = new Date(ui.viewYear, ui.viewMonthIdx + 1, 0).getDate();
    for (var i = 0; i < startOffset; i++) grid.appendChild(el('div', { class: 'cal-cell empty' }));
    var t = today();
    for (var dnum = 1; dnum <= daysInMonth; dnum++) {
      var d = new Date(ui.viewYear, ui.viewMonthIdx, dnum);
      var dateStr = fmtDate(d);
      var sessions = state.scheduled.filter(function (s) { return s.date === dateStr; });
      var color = dayStatusColor(dateStr, sessions);
      var cellChildren = [el('span', { text: String(dnum) })];
      if (color) cellChildren.push(el('span', { class: 'cal-dot dot-' + color }));
      grid.appendChild(el('div', {
        class: 'cal-cell' + (dateStr === t ? ' is-today' : ''),
        onclick: (function (ds) { return function () { ui.dayModalDate = ds; render(); }; })(dateStr)
      }, cellChildren));
    }
    panel.appendChild(grid);
    panel.appendChild(el('div', { class: 'legend' }, [
      el('span', {}, [el('i', { class: 'dot-amber' }), document.createTextNode('à faire')]),
      el('span', {}, [el('i', { class: 'dot-green' }), document.createTextNode('faite')]),
      el('span', {}, [el('i', { class: 'dot-red' }), document.createTextNode('ratée')])
    ]));
    return panel;
  }

  function movementSelect(value, onChange) {
    var select = el('select', { class: 'text-input', onchange: function (e) { onChange(e.target.value); } });
    MOVEMENT_TYPES.forEach(function (m) {
      var opt = el('option', { value: m.id, text: m.label });
      if (m.id === value) opt.setAttribute('selected', 'selected');
      select.appendChild(opt);
    });
    return select;
  }

  function buildSessions() {
    var panel = el('div', { class: 'tab-panel' });
    var formChildren = [el('h2', { text: 'Créer une séance' })];
    formChildren.push(el('input', { class: 'text-input', placeholder: 'Nom de la séance (ex: Push day)', value: ui.newTplName, oninput: function (e) { ui.newTplName = e.target.value; } }));
    ui.newTplExercises.forEach(function (ex, i) {
      var row = el('div', { class: 'exercise-row' });
      row.appendChild(el('input', { class: 'text-input', placeholder: 'Exercice ' + (i + 1), value: ex.name, oninput: function (e) { ui.newTplExercises[i].name = e.target.value; } }));
      row.appendChild(movementSelect(ex.movementType, function (v) { ui.newTplExercises[i].movementType = v; }));
      if (ui.newTplExercises.length > 1) {
        row.appendChild(el('button', { class: 'icon-btn danger', text: '✕', onclick: function () { ui.newTplExercises.splice(i, 1); render(); } }));
      }
      formChildren.push(row);
    });
    formChildren.push(el('button', { class: 'chip-btn', text: '+ ajouter un exercice', onclick: function () { ui.newTplExercises.push({ name: '', movementType: 'autre' }); render(); } }));
    formChildren.push(el('button', { class: 'btn-primary full', text: 'Enregistrer la séance', onclick: addTemplate }));
    panel.appendChild(bracket('accent', 'form-card', formChildren));

    panel.appendChild(el('h3', { class: 'section-title', text: 'Mes séances' }));
    if (state.templates.length === 0) panel.appendChild(el('p', { class: 'muted', text: 'Aucune séance créée pour le moment.' }));
    state.templates.forEach(function (t) {
      var head = el('div', { class: 'template-head' }, [
        el('span', { class: 'session-name', text: t.name }),
        el('button', { class: 'icon-btn danger', text: '🗑', onclick: function () { deleteTemplate(t.id); } })
      ]);
      var list = el('ul', { class: 'exercise-list' });
      t.exercises.forEach(function (e) {
        list.appendChild(el('li', {}, [movementIconWrap(e.movementType || 'autre'), document.createTextNode(e.name)]));
      });
      var scheduleBtn = el('button', { class: 'btn-ghost full', text: "Planifier aujourd'hui", onclick: function () { addScheduled(t.id, today()); } });
      panel.appendChild(bracket('accent', 'template-card', [head, list, scheduleBtn]));
    });
    return panel;
  }

  function buildProgress() {
    var panel = el('div', { class: 'tab-panel' });
    panel.appendChild(el('h2', { class: 'section-title', text: 'Évolution des poids' }));
    if (state.weightLogs.length === 0) {
      panel.appendChild(el('p', { class: 'muted', text: 'Termine une séance en indiquant tes poids pour voir ton graphique.' }));
      return panel;
    }
    var colorMap = exerciseColorMap();
    var seriesMap = {}, dateSet = {};
    state.weightLogs.forEach(function (w) {
      if (!seriesMap[w.exerciseName]) seriesMap[w.exerciseName] = {};
      seriesMap[w.exerciseName][w.date] = w.weight;
      dateSet[w.date] = true;
    });
    var dates = Object.keys(dateSet).sort();
    var chart = chartWithLegend(seriesMap, dates, function (name) { return colorMap[name] || '#D97A42'; }, 'kg');
    if (chart) panel.appendChild(bracket('accent', 'chart-card', [chart]));
    return panel;
  }

  function buildNutrition() {
    var panel = el('div', { class: 'tab-panel' });
    var header = el('div', { class: 'cal-header' }, [
      el('button', { class: 'cal-nav-btn', text: '‹', onclick: function () { ui.nutritionDate = addDays(ui.nutritionDate, -1); render(); } }),
      el('span', { class: 'cal-title', text: ui.nutritionDate === today() ? "Aujourd'hui" : fmtDateReadable(ui.nutritionDate) }),
      el('button', { class: 'cal-nav-btn', text: '›', onclick: function () { ui.nutritionDate = addDays(ui.nutritionDate, 1); render(); } })
    ]);
    panel.appendChild(header);

    var foods = foodsForDate(ui.nutritionDate);
    var totals = foods.reduce(function (acc, f) { acc.cal += f.calories; acc.prot += f.protein; acc.carb += f.carbs; acc.fat += f.fat; return acc; }, { cal: 0, prot: 0, carb: 0, fat: 0 });

    var donut = buildMacroDonut(totals.prot, totals.carb, totals.fat, totals.cal);
    var legend = el('div', { class: 'macro-legend' }, [
      el('div', { class: 'macro-legend-item' }, [el('span', { class: 'left' }, [el('span', { class: 'macro-swatch', style: 'background:#D97A42' }), document.createTextNode('Protéines')]), el('span', { class: 'macro-val', text: round1(totals.prot) + ' g' })]),
      el('div', { class: 'macro-legend-item' }, [el('span', { class: 'left' }, [el('span', { class: 'macro-swatch', style: 'background:#7A8B99' }), document.createTextNode('Glucides')]), el('span', { class: 'macro-val', text: round1(totals.carb) + ' g' })]),
      el('div', { class: 'macro-legend-item' }, [el('span', { class: 'left' }, [el('span', { class: 'macro-swatch', style: 'background:#D9A441' }), document.createTextNode('Lipides')]), el('span', { class: 'macro-val', text: round1(totals.fat) + ' g' })])
    ]);
    panel.appendChild(bracket('accent', '', [el('div', { class: 'donut-row' }, [donut, legend])]));

    panel.appendChild(el('div', { class: 'nutrition-actions' }, [
      el('button', { class: 'btn-primary', text: '📷 Scanner un code-barres', onclick: openScanner }),
    ]));

    var manualCard = bracket('accent', '', [
      el('h2', { class: 'section-title', text: 'Ajouter manuellement' }),
      el('div', { class: 'manual-food-form' }, [
        el('input', { class: 'text-input full-span', placeholder: 'Nom du repas', value: ui.manualFood.name, oninput: function (e) { ui.manualFood.name = e.target.value; } }),
        el('input', { class: 'text-input', type: 'number', placeholder: 'kcal', value: ui.manualFood.cal, oninput: function (e) { ui.manualFood.cal = e.target.value; } }),
        el('input', { class: 'text-input', type: 'number', placeholder: 'Protéines (g)', value: ui.manualFood.prot, oninput: function (e) { ui.manualFood.prot = e.target.value; } }),
        el('input', { class: 'text-input', type: 'number', placeholder: 'Glucides (g)', value: ui.manualFood.carb, oninput: function (e) { ui.manualFood.carb = e.target.value; } }),
        el('input', { class: 'text-input', type: 'number', placeholder: 'Lipides (g)', value: ui.manualFood.fat, oninput: function (e) { ui.manualFood.fat = e.target.value; } })
      ]),
      el('button', { class: 'btn-ghost full', text: 'Ajouter', onclick: addFoodManual })
    ]);
    panel.appendChild(manualCard);

    if (foods.length > 0) {
      panel.appendChild(el('h3', { class: 'section-title', text: 'Repas du jour' }));
      var list = el('div', { class: 'tab-panel' });
      foods.forEach(function (f) {
        list.appendChild(el('div', { class: 'food-item' }, [
          el('div', {}, [
            el('div', { class: 'fi-name', text: f.name }),
            el('div', { class: 'fi-sub', text: Math.round(f.calories) + ' kcal · P' + round1(f.protein) + ' G' + round1(f.carbs) + ' L' + round1(f.fat) })
          ]),
          el('button', { class: 'icon-btn danger', text: '🗑', onclick: function () { deleteFood(f.id); } })
        ]));
      });
      panel.appendChild(list);
    }
    return panel;
  }

  function buildBody() {
    var panel = el('div', { class: 'tab-panel' });
    panel.appendChild(el('h2', { class: 'section-title', text: 'Suivi corporel' }));
    if (state.bodyMetrics.length === 0) {
      panel.appendChild(el('p', { class: 'muted', text: 'Ton poids et ta taille seront enregistrés chaque lundi.' }));
      return panel;
    }
    var sorted = state.bodyMetrics.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var seriesMap = { 'Poids': {} }, dates = [];
    sorted.forEach(function (b) { seriesMap['Poids'][b.date] = b.weight; dates.push(b.date); });
    var chart = chartWithLegend(seriesMap, dates, function () { return '#D97A42'; }, 'kg');
    if (chart) panel.appendChild(bracket('accent', 'chart-card', [chart]));

    var table = el('div', { class: 'body-table' });
    sorted.slice().reverse().forEach(function (b, i, arr) {
      var prev = arr[i + 1];
      var delta = prev ? (b.weight - prev.weight) : null;
      var imc = (b.weight / Math.pow(b.height / 100, 2)).toFixed(1);
      var rowChildren = [
        el('span', { class: 'mono', text: fmtDateReadable(b.date) }),
        el('span', { class: 'mono', text: b.weight + ' kg' }),
        el('span', { class: 'mono', text: b.height + ' cm' }),
        el('span', { class: 'mono muted', text: 'IMC ' + imc })
      ];
      if (delta !== null) rowChildren.push(el('span', { class: 'mono delta ' + (delta > 0 ? 'up' : delta < 0 ? 'down' : ''), text: (delta > 0 ? '+' : '') + delta.toFixed(1) + ' kg' }));
      table.appendChild(el('div', { class: 'body-row' }, rowChildren));
    });
    panel.appendChild(table);
    return panel;
  }

  // ---------- modals ----------
  function buildDayModal() {
    var date = ui.dayModalDate;
    var sessions = state.scheduled.filter(function (s) { return s.date === date; });
    var content = [
      el('div', { class: 'modal-head' }, [el('h2', { text: fmtDateReadable(date) }), el('button', { class: 'icon-btn', text: '✕', onclick: function () { ui.dayModalDate = null; render(); } })])
    ];
    if (sessions.length === 0) content.push(el('p', { class: 'muted', text: 'Aucune séance ce jour-là.' }));
    sessions.forEach(function (s) {
      var infoChildren = [el('div', { class: 'session-name', text: s.templateName })];
      if (s.status === 'done') infoChildren.push(el('span', { class: 'muted small', text: 'Ressenti ' + s.feeling + '/10' + (s.comment ? ' — "' + s.comment + '"' : '') }));
      var actions = el('div', { class: 'row-actions' });
      if (s.status !== 'done') actions.appendChild(el('button', { class: 'chip-btn', text: 'Terminer', onclick: function () { openCompletion(s.id); } }));
      actions.appendChild(el('button', {
        class: 'icon-btn danger', text: '🗑',
        onclick: function () { deleteScheduled(s.id); if (state.scheduled.filter(function (x) { return x.date === date; }).length === 0) ui.dayModalDate = null; render(); }
      }));
      content.push(el('div', { class: 'day-session-row status-' + s.status }, [el('div', {}, infoChildren), actions]));
    });
    if (state.templates.length > 0) {
      if (!ui.dayPickTpl) ui.dayPickTpl = state.templates[0].id;
      var select = el('select', { class: 'text-input', onchange: function (e) { ui.dayPickTpl = e.target.value; } });
      state.templates.forEach(function (t) {
        var opt = el('option', { value: t.id, text: t.name });
        if (t.id === ui.dayPickTpl) opt.setAttribute('selected', 'selected');
        select.appendChild(opt);
      });
      content.push(el('div', { class: 'add-session-row' }, [select, el('button', { class: 'btn-primary', text: 'Ajouter', onclick: function () { addScheduled(ui.dayPickTpl, date); } })]));
    }
    var overlay = el('div', { class: 'overlay' });
    overlay.onclick = function (e) { if (e.target === overlay) { ui.dayModalDate = null; render(); } };
    overlay.appendChild(bracket('accent', 'modal', content));
    return overlay;
  }

  function buildCompletionModal() {
    var session = state.scheduled.filter(function (s) { return s.id === ui.completingId; })[0];
    var tpl = session && state.templates.filter(function (t) { return t.id === session.templateId; })[0];
    if (!session || !tpl) return null;
    var content = [
      el('div', { class: 'modal-head' }, [el('h2', { text: tpl.name }), el('button', { class: 'icon-btn', text: '✕', onclick: function () { ui.completingId = null; render(); } })]),
      el('p', { class: 'muted small', text: 'Renseigne le poids utilisé pour chaque exercice.' })
    ];
    tpl.exercises.forEach(function (ex) {
      content.push(el('label', { class: 'weight-row' }, [
        el('span', { class: 'wr-left' }, [movementIconWrap(ex.movementType || 'autre'), document.createTextNode(ex.name)]),
        el('input', { type: 'number', inputmode: 'decimal', class: 'text-input small', placeholder: 'kg', value: ui.compWeights[ex.id] !== undefined ? ui.compWeights[ex.id] : '', oninput: function (e) { ui.compWeights[ex.id] = e.target.value; } })
      ]));
    });
    content.push(el('p', { class: 'muted small', style: 'margin-top:14px', text: 'Comment tu te sens ?' }));
    var feelingRow = el('div', { class: 'feeling-row' });
    for (var n = 1; n <= 10; n++) {
      feelingRow.appendChild(el('button', { class: 'feeling-btn' + (ui.compFeeling === n ? ' selected' : ''), text: String(n), onclick: (function (num) { return function () { ui.compFeeling = num; render(); }; })(n) }));
    }
    content.push(feelingRow);
    content.push(el('textarea', { class: 'text-input', placeholder: 'Commentaire (optionnel)', rows: 2, oninput: function (e) { ui.compComment = e.target.value; } }, [document.createTextNode(ui.compComment || '')]));
    content.push(el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn-ghost', text: 'Annuler', onclick: function () { ui.completingId = null; render(); } }),
      el('button', { class: 'btn-primary', text: 'Valider la séance', disabled: ui.compFeeling == null, onclick: submitCompletion })
    ]));
    var overlay = el('div', { class: 'overlay' });
    overlay.appendChild(bracket('done', 'modal', content));
    return overlay;
  }

  function buildMondayModal() {
    var content = [
      el('h2', { text: 'Check-in du lundi' }),
      el('p', { class: 'muted', text: 'Avant de commencer la semaine, indique ton poids et ta taille pour suivre ta progression.' }),
      el('label', { class: 'field' }, [document.createTextNode('Poids (kg)'), el('input', { type: 'number', inputmode: 'decimal', value: ui.mondayWeight, placeholder: 'ex: 72.5', oninput: function (e) { ui.mondayWeight = e.target.value; } })]),
      el('label', { class: 'field' }, [document.createTextNode('Taille (cm)'), el('input', { type: 'number', inputmode: 'decimal', value: ui.mondayHeight, placeholder: 'ex: 178', oninput: function (e) { ui.mondayHeight = e.target.value; } })]),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn-ghost', text: 'Plus tard', onclick: function () { ui.showMonday = false; render(); } }),
        el('button', { class: 'btn-primary', text: 'Valider', onclick: submitMonday })
      ])
    ];
    var overlay = el('div', { class: 'overlay' });
    overlay.appendChild(bracket('accent', 'modal monday-modal', content));
    return overlay;
  }

  function buildResetModal() {
    var content = [
      el('h2', { text: 'Tout réinitialiser ?' }),
      el('p', { class: 'muted', text: 'Toutes tes séances, poids et données seront supprimés définitivement.' }),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn-ghost', text: 'Annuler', onclick: function () { ui.confirmReset = false; render(); } }),
        el('button', { class: 'btn-danger', text: 'Supprimer tout', onclick: resetAll })
      ])
    ];
    var overlay = el('div', { class: 'overlay' });
    overlay.appendChild(bracket('missed', 'modal', content));
    return overlay;
  }

  function buildScannerModal() {
    var content = [
      el('div', { class: 'modal-head' }, [el('h2', { text: 'Scanner un produit' }), el('button', { class: 'icon-btn', text: '✕', onclick: closeScanner })])
    ];
    if (ui.scannerStep === 'scanning') {
      content.push(el('div', { class: 'scanner-video-wrap' }, [el('div', { id: 'barcode-reader' })]));
      content.push(el('p', { class: 'scanner-hint', text: 'Cadre le code-barres du produit dans la zone.' }));
    } else if (ui.scannerStep === 'loading') {
      content.push(el('p', { class: 'muted', text: 'Recherche du produit…' }));
    } else if (ui.scannerStep === 'error') {
      content.push(el('p', { class: 'muted', text: ui.scanError }));
      content.push(el('button', { class: 'btn-ghost full', text: 'Réessayer', onclick: openScanner }));
    } else if (ui.scannerStep === 'result' && ui.scanResult) {
      var r = ui.scanResult;
      var factor = (parseFloat(ui.scanQty) || 0) / 100;
      content.push(el('div', { class: 'scan-result-card' }, [
        el('div', { class: 'scan-result-name', text: r.name }),
        r.brand ? el('div', { class: 'muted small', text: r.brand }) : null,
        el('label', { class: 'field', style: 'margin-top:10px' }, [document.createTextNode('Quantité consommée (g)'), el('input', { type: 'number', inputmode: 'decimal', class: 'text-input', value: ui.scanQty, oninput: function (e) { ui.scanQty = e.target.value; render(); } })]),
        el('div', { class: 'scan-macro-grid' }, [
          el('div', { class: 'scan-macro-cell' }, [el('div', { class: 'v', text: Math.round(r.cal100 * factor) }), el('div', { class: 'l', text: 'kcal' })]),
          el('div', { class: 'scan-macro-cell' }, [el('div', { class: 'v', text: round1(r.prot100 * factor) + 'g' }), el('div', { class: 'l', text: 'Protéines' })]),
          el('div', { class: 'scan-macro-cell' }, [el('div', { class: 'v', text: round1(r.carb100 * factor) + 'g' }), el('div', { class: 'l', text: 'Glucides' })]),
          el('div', { class: 'scan-macro-cell' }, [el('div', { class: 'v', text: round1(r.fat100 * factor) + 'g' }), el('div', { class: 'l', text: 'Lipides' })])
        ])
      ]));
      content.push(el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn-ghost', text: 'Annuler', onclick: closeScanner }),
        el('button', { class: 'btn-primary', text: "Ajouter à la journée", onclick: addFoodFromScan })
      ]));
    }
    var overlay = el('div', { class: 'overlay' });
    overlay.appendChild(bracket('accent', 'modal', content));
    return overlay;
  }

  // ---------- top-level render ----------
  function render() {
    var app = document.getElementById('app');
    app.innerHTML = '';

    var lvl = levelInfo(state.xp);
    var levelBadge = el('div', { class: 'level-badge' }, [
      el('div', { class: 'level-badge-top' }, [el('span', { class: 'level-num', text: 'Niv. ' + lvl.level }), el('span', { class: 'level-label', text: 'jarvis' })]),
      el('div', { class: 'level-bar-track' }, [el('div', { class: 'level-bar-fill', style: 'width:' + Math.round(lvl.pct * 100) + '%' })]),
      el('span', { class: 'level-xp-label', text: lvl.into + '/' + lvl.needed + ' xp' })
    ]);

    var topbar = el('div', { class: 'topbar' }, [
      el('div', { class: 'wordmark' }, [document.createTextNode('Jarvis'), el('span', { class: 'wm-sub', text: 'tracker' })]),
      levelBadge
    ]);
    app.appendChild(topbar);

    var tabs = [['today', "Aujourd'hui"], ['calendar', 'Calendrier'], ['sessions', 'Séances'], ['nutrition', 'Nutrition'], ['progress', 'Progression'], ['body', 'Corps']];
    var tabbar = el('div', { class: 'tabbar' });
    tabs.forEach(function (t) {
      tabbar.appendChild(el('button', { class: 'tab-btn' + (ui.tab === t[0] ? ' active' : ''), text: t[1], onclick: (function (id) { return function () { ui.tab = id; render(); }; })(t[0]) }));
    });
    app.appendChild(tabbar);

    var content = el('div', { class: 'content' });
    if (ui.tab === 'today') content.appendChild(buildToday());
    else if (ui.tab === 'calendar') content.appendChild(buildCalendar());
    else if (ui.tab === 'sessions') content.appendChild(buildSessions());
    else if (ui.tab === 'nutrition') content.appendChild(buildNutrition());
    else if (ui.tab === 'progress') content.appendChild(buildProgress());
    else if (ui.tab === 'body') content.appendChild(buildBody());
    app.appendChild(content);

    var footer = el('div', { class: 'footer-bar' }, [
      el('span', { class: 'save-dot', style: ui.saveError ? 'background:var(--missed)' : '' }),
      el('span', { text: ui.saveError ? 'Non sauvegardé' : 'Sauvegardé sur cet appareil' }),
      el('button', { class: 'reset-link', text: 'réinitialiser', onclick: function () { ui.confirmReset = true; render(); } })
    ]);
    app.appendChild(footer);

    if (ui.dayModalDate) app.appendChild(buildDayModal());
    if (ui.completingId) app.appendChild(buildCompletionModal());
    if (ui.showMonday) app.appendChild(buildMondayModal());
    if (ui.confirmReset) app.appendChild(buildResetModal());
    if (ui.showScanner) app.appendChild(buildScannerModal());
  }

  render();
})();
