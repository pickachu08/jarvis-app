(function () {
  'use strict';

  var STORAGE_KEY = 'jarvis-state';
  var EXERCISE_COLORS = ['#3DDBD9', '#F0A868', '#6EE7A8', '#F0677A', '#B79CFF', '#F6E27A', '#7AAFF6', '#FF9E7A', '#7CF29C', '#F27CC0'];
  var WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  var MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  var WEEKDAY_FULL_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  function emptyState() { return { templates: [], scheduled: [], weightLogs: [], bodyMetrics: [], lastMondayWeek: null }; }

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

  // ---------- state ----------
  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return Object.assign(emptyState(), JSON.parse(raw));
    } catch (e) { /* première visite */ }
    return emptyState();
  }
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      ui.saveError = false;
    } catch (e) { ui.saveError = true; }
  }

  var state = loadState();
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
    newTplExercises: [''],
    quickPickTpl: '',
    dayPickTpl: '',
    mondayWeight: '',
    mondayHeight: '',
    compWeights: {},
    compFeeling: null,
    compComment: '',
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

  // ---------- mutations ----------
  function addTemplate() {
    var exs = ui.newTplExercises.map(function (e) { return e.trim(); }).filter(Boolean).map(function (name) { return { id: uid(), name: name }; });
    if (!ui.newTplName.trim() || exs.length === 0) return;
    state.templates.push({ id: uid(), name: ui.newTplName.trim(), exercises: exs });
    ui.newTplName = ''; ui.newTplExercises = [''];
    saveState(); render();
  }
  function deleteTemplate(id) {
    state.templates = state.templates.filter(function (t) { return t.id !== id; });
    saveState(); render();
  }
  function addScheduled(templateId, date) {
    var tpl = state.templates.filter(function (t) { return t.id === templateId; })[0];
    if (!tpl) return;
    state.scheduled.push({ id: uid(), templateId: templateId, templateName: tpl.name, date: date, status: 'planned', feeling: null, comment: '', weights: {} });
    saveState(); render();
  }
  function deleteScheduled(id) {
    state.scheduled = state.scheduled.filter(function (s) { return s.id !== id; });
    saveState(); render();
  }
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
    var tpl = state.templates.filter(function (t) { return t.id === session.templateId; })[0];
    var weightsMap = {};
    var newLogs = [];
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
    ui.completingId = null;
    saveState(); render();
  }
  function submitMonday() {
    var w = parseFloat(ui.mondayWeight), h = parseFloat(ui.mondayHeight);
    if (isNaN(w) || isNaN(h)) return;
    state.bodyMetrics.push({ date: today(), weight: w, height: h });
    state.lastMondayWeek = getWeekKey(new Date());
    ui.showMonday = false; ui.mondayWeight = ''; ui.mondayHeight = '';
    saveState(); render();
  }
  function resetAll() {
    state = emptyState();
    ui.confirmReset = false;
    saveState(); render();
  }

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

  // ---------- bracket wrapper ----------
  function bracket(accent, className, children) {
    var wrap = el('div', { class: 'bracket ' + (className || ''), style: '--bk: var(--' + accent + ')' }, [
      el('span', { class: 'bk bk-tl' }), el('span', { class: 'bk bk-tr' }),
      el('span', { class: 'bk bk-bl' }), el('span', { class: 'bk bk-br' })
    ]);
    var inner = el('div', { class: 'bracket-inner' }, children);
    wrap.appendChild(inner);
    return wrap;
  }

  // ---------- SVG chart ----------
  function svgEl(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

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
      svg.appendChild(svgEl('line', { x1: padL, x2: width - padR, y1: y, y2: y, stroke: '#253044', 'stroke-dasharray': '3 3', 'stroke-width': 1 }));
      var lbl = svgEl('text', { x: 2, y: y + 3, fill: '#7A8699', 'font-size': 9, 'font-family': 'JetBrains Mono, monospace' });
      lbl.textContent = Math.round(v) + (unit || '');
      svg.appendChild(lbl);
    }
    var maxLabels = 6;
    var everyN = Math.max(1, Math.ceil(dates.length / maxLabels));
    dates.forEach(function (d, i) {
      if (i % everyN !== 0 && i !== dates.length - 1) return;
      var lbl = svgEl('text', { x: xPos(i), y: height - 6, fill: '#7A8699', 'font-size': 9, 'font-family': 'JetBrains Mono, monospace', 'text-anchor': 'middle' });
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
        seg.forEach(function (p) {
          svg.appendChild(svgEl('circle', { cx: p[0], cy: p[1], r: 3, fill: color }));
        });
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

  // ---------- tab builders ----------
  function buildToday() {
    var panel = el('div', { class: 'tab-panel' });
    var d = new Date();
    panel.appendChild(el('div', { class: 'today-date', text: WEEKDAY_FULL_FR[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS_FR[d.getMonth()] }));

    var t = today();
    var todaySessions = state.scheduled.filter(function (s) { return s.date === t; });

    if (todaySessions.length === 0) {
      var body = [el('p', { text: "Aucune séance prévue aujourd'hui." })];
      if (state.templates.length > 0) {
        var row = el('div', { class: 'quick-add-row' });
        state.templates.forEach(function (tpl) {
          row.appendChild(el('button', { class: 'chip-btn', text: '+ ' + tpl.name, onclick: function () { addScheduled(tpl.id, t); } }));
        });
        body.push(row);
      } else {
        body.push(el('p', { class: 'muted small', text: "Crée d'abord une séance dans l'onglet « Séances »." }));
      }
      panel.appendChild(bracket('cyan', '', body));
    }

    todaySessions.forEach(function (s) {
      var head = el('div', { class: 'session-card-head' }, [
        el('span', { class: 'session-name', text: s.templateName }),
        el('span', { class: 'status-pill ' + s.status, text: s.status === 'done' ? 'Faite' : 'À faire' })
      ]);
      var content = [head];
      if (s.status === 'done') {
        var info = el('div', { class: 'session-done-info' }, [el('span', { text: 'Ressenti : ' + s.feeling + '/10' })]);
        if (s.comment) info.appendChild(el('p', { class: 'muted small', text: '"' + s.comment + '"' }));
        content.push(info);
      } else {
        content.push(el('button', { class: 'btn-primary', text: 'Marquer comme faite', onclick: function () { openCompletion(s.id); } }));
      }
      panel.appendChild(bracket(s.status === 'done' ? 'green' : 'amber', '', content));
    });

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

  function buildSessions() {
    var panel = el('div', { class: 'tab-panel' });

    var formChildren = [el('h2', { text: 'Créer une séance' })];
    formChildren.push(el('input', {
      class: 'text-input', placeholder: 'Nom de la séance (ex: Push day)', value: ui.newTplName,
      oninput: function (e) { ui.newTplName = e.target.value; }
    }));
    ui.newTplExercises.forEach(function (ex, i) {
      var row = el('div', { class: 'exercise-row' });
      row.appendChild(el('input', {
        class: 'text-input', placeholder: 'Exercice ' + (i + 1), value: ex,
        oninput: function (e) { ui.newTplExercises[i] = e.target.value; }
      }));
      if (ui.newTplExercises.length > 1) {
        row.appendChild(el('button', {
          class: 'icon-btn danger', text: '✕',
          onclick: function () { ui.newTplExercises.splice(i, 1); render(); }
        }));
      }
      formChildren.push(row);
    });
    formChildren.push(el('button', { class: 'chip-btn', text: '+ ajouter un exercice', onclick: function () { ui.newTplExercises.push(''); render(); } }));
    formChildren.push(el('button', { class: 'btn-primary full', text: 'Enregistrer la séance', onclick: addTemplate }));
    panel.appendChild(bracket('cyan', 'form-card', formChildren));

    panel.appendChild(el('h3', { class: 'section-title', text: 'Mes séances' }));
    if (state.templates.length === 0) panel.appendChild(el('p', { class: 'muted', text: 'Aucune séance créée pour le moment.' }));
    state.templates.forEach(function (t) {
      var head = el('div', { class: 'template-head' }, [
        el('span', { class: 'session-name', text: t.name }),
        el('button', { class: 'icon-btn danger', text: '🗑', onclick: function () { deleteTemplate(t.id); } })
      ]);
      var list = el('ul', { class: 'exercise-list' });
      t.exercises.forEach(function (e) { list.appendChild(el('li', { text: e.name })); });
      var scheduleBtn = el('button', { class: 'btn-ghost full', text: "Planifier aujourd'hui", onclick: function () { addScheduled(t.id, today()); } });
      panel.appendChild(bracket('cyan', 'template-card', [head, list, scheduleBtn]));
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
    var chart = chartWithLegend(seriesMap, dates, function (name) { return colorMap[name] || '#3DDBD9'; }, 'kg');
    if (chart) panel.appendChild(bracket('cyan', 'chart-card', [chart]));
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
    var seriesMap = { 'Poids': {} };
    var dates = [];
    sorted.forEach(function (b) { seriesMap['Poids'][b.date] = b.weight; dates.push(b.date); });
    var chart = chartWithLegend(seriesMap, dates, function () { return '#3DDBD9'; }, 'kg');
    if (chart) panel.appendChild(bracket('cyan', 'chart-card', [chart]));

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
      if (delta !== null) {
        rowChildren.push(el('span', { class: 'mono delta ' + (delta > 0 ? 'up' : delta < 0 ? 'down' : ''), text: (delta > 0 ? '+' : '') + delta.toFixed(1) + ' kg' }));
      }
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
      el('div', { class: 'modal-head' }, [
        el('h2', { text: fmtDateReadable(date) }),
        el('button', { class: 'icon-btn', text: '✕', onclick: function () { ui.dayModalDate = null; render(); } })
      ])
    ];
    if (sessions.length === 0) content.push(el('p', { class: 'muted', text: 'Aucune séance ce jour-là.' }));
    sessions.forEach(function (s) {
      var infoChildren = [el('div', { class: 'session-name', text: s.templateName })];
      if (s.status === 'done') {
        infoChildren.push(el('span', { class: 'muted small', text: 'Ressenti ' + s.feeling + '/10' + (s.comment ? ' — "' + s.comment + '"' : '') }));
      }
      var actions = el('div', { class: 'row-actions' });
      if (s.status !== 'done') actions.appendChild(el('button', { class: 'chip-btn', text: 'Terminer', onclick: function () { openCompletion(s.id); } }));
      actions.appendChild(el('button', {
        class: 'icon-btn danger', text: '🗑',
        onclick: function () {
          deleteScheduled(s.id);
          if (state.scheduled.filter(function (x) { return x.date === date; }).length === 0) ui.dayModalDate = null;
          render();
        }
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
      var addRow = el('div', { class: 'add-session-row' }, [
        select,
        el('button', { class: 'btn-primary', text: 'Ajouter', onclick: function () { addScheduled(ui.dayPickTpl, date); } })
      ]);
      content.push(addRow);
    }
    var overlay = el('div', { class: 'overlay' });
    overlay.onclick = function (e) { if (e.target === overlay) { ui.dayModalDate = null; render(); } };
    overlay.appendChild(bracket('cyan', 'modal', content));
    return overlay;
  }

  function buildCompletionModal() {
    var session = state.scheduled.filter(function (s) { return s.id === ui.completingId; })[0];
    var tpl = session && state.templates.filter(function (t) { return t.id === session.templateId; })[0];
    if (!session || !tpl) return null;
    var content = [
      el('div', { class: 'modal-head' }, [
        el('h2', { text: tpl.name }),
        el('button', { class: 'icon-btn', text: '✕', onclick: function () { ui.completingId = null; render(); } })
      ]),
      el('p', { class: 'muted small', text: 'Renseigne le poids utilisé pour chaque exercice.' })
    ];
    tpl.exercises.forEach(function (ex) {
      content.push(el('label', { class: 'weight-row' }, [
        document.createTextNode(ex.name),
        el('input', {
          type: 'number', inputmode: 'decimal', class: 'text-input small', placeholder: 'kg',
          value: ui.compWeights[ex.id] !== undefined ? ui.compWeights[ex.id] : '',
          oninput: function (e) { ui.compWeights[ex.id] = e.target.value; }
        })
      ]));
    });
    content.push(el('p', { class: 'muted small', style: 'margin-top:14px', text: 'Comment tu te sens ?' }));
    var feelingRow = el('div', { class: 'feeling-row' });
    for (var n = 1; n <= 10; n++) {
      feelingRow.appendChild(el('button', {
        class: 'feeling-btn' + (ui.compFeeling === n ? ' selected' : ''), text: String(n),
        onclick: (function (num) { return function () { ui.compFeeling = num; render(); }; })(n)
      }));
    }
    content.push(feelingRow);
    content.push(el('textarea', {
      class: 'text-input', placeholder: 'Commentaire (optionnel)', rows: 2,
      oninput: function (e) { ui.compComment = e.target.value; }
    }, [document.createTextNode(ui.compComment || '')]));
    content.push(el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn-ghost', text: 'Annuler', onclick: function () { ui.completingId = null; render(); } }),
      el('button', { class: 'btn-primary', text: 'Valider la séance', disabled: ui.compFeeling == null, onclick: submitCompletion })
    ]));
    var overlay = el('div', { class: 'overlay' });
    overlay.appendChild(bracket('green', 'modal', content));
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
    overlay.appendChild(bracket('cyan', 'modal monday-modal', content));
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
    overlay.appendChild(bracket('red', 'modal', content));
    return overlay;
  }

  // ---------- top-level render ----------
  function render() {
    var app = document.getElementById('app');
    app.innerHTML = '';

    var range = getWeekRange(new Date());
    var wMon = fmtDate(range[0]), wSun = fmtDate(range[1]);
    var weekSessions = state.scheduled.filter(function (s) { return s.date >= wMon && s.date <= wSun; });
    var weekDone = weekSessions.filter(function (s) { return s.status === 'done'; }).length;
    var weekTotal = weekSessions.length;
    var weekPct = weekTotal ? (weekDone / weekTotal) : 0;

    var ring = el('div', { class: 'week-ring' });
    var svg = svgEl('svg', { viewBox: '0 0 44 44', width: 40, height: 40 });
    svg.appendChild(svgEl('circle', { cx: 22, cy: 22, r: 18, fill: 'none', stroke: '#26334A', 'stroke-width': 4 }));
    var arc = svgEl('circle', { cx: 22, cy: 22, r: 18, fill: 'none', stroke: '#3DDBD9', 'stroke-width': 4, 'stroke-dasharray': (weekPct * 113) + ' 113', 'stroke-linecap': 'round' });
    arc.setAttribute('transform', 'rotate(-90 22 22)');
    svg.appendChild(arc);
    ring.appendChild(svg);
    ring.appendChild(el('span', { class: 'ring-label', text: weekDone + '/' + weekTotal }));

    var topbar = el('div', { class: 'topbar' }, [
      el('div', { class: 'wordmark' }, [
        el('span', { class: 'wm-dot' }), document.createTextNode('JARVIS'),
        el('span', { class: 'wm-sub', text: 'tracker de salle' })
      ]),
      ring
    ]);
    app.appendChild(topbar);

    var tabs = [['today', "Aujourd'hui"], ['calendar', 'Calendrier'], ['sessions', 'Séances'], ['progress', 'Progression'], ['body', 'Corps']];
    var tabbar = el('div', { class: 'tabbar' });
    tabs.forEach(function (t) {
      tabbar.appendChild(el('button', {
        class: 'tab-btn' + (ui.tab === t[0] ? ' active' : ''), text: t[1],
        onclick: (function (id) { return function () { ui.tab = id; render(); }; })(t[0])
      }));
    });
    app.appendChild(tabbar);

    var content = el('div', { class: 'content' });
    if (ui.tab === 'today') content.appendChild(buildToday());
    else if (ui.tab === 'calendar') content.appendChild(buildCalendar());
    else if (ui.tab === 'sessions') content.appendChild(buildSessions());
    else if (ui.tab === 'progress') content.appendChild(buildProgress());
    else if (ui.tab === 'body') content.appendChild(buildBody());
    app.appendChild(content);

    var footer = el('div', { class: 'footer-bar' }, [
      el('span', { class: 'save-dot', style: ui.saveError ? 'background:var(--red)' : '' }),
      el('span', { text: ui.saveError ? 'Non sauvegardé' : 'Sauvegardé sur cet appareil' }),
      el('button', { class: 'reset-link', text: 'réinitialiser', onclick: function () { ui.confirmReset = true; render(); } })
    ]);
    app.appendChild(footer);

    if (ui.dayModalDate) app.appendChild(buildDayModal());
    if (ui.completingId) app.appendChild(buildCompletionModal());
    if (ui.showMonday) app.appendChild(buildMondayModal());
    if (ui.confirmReset) app.appendChild(buildResetModal());
  }

  render();
})();
