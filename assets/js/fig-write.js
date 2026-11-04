/* Figure: writing back through the same contacts (Fig. 4)
   ------------------------------------------------------------------
   Fig. 1's toy model (model.js) run both ways.
   Record: one point current dipole at a patch, along its cortical normal; each
   contact records CorticalModel.potential, exactly as in Fig. 1.
   Stimulate: point currents at the same contacts in the same unbounded uniform
   conductor; any net current returns through a distant electrode. The "push"
   on a patch is the electric field along its columns, counted positive from
   the pia toward the white matter: the direction that depolarizes pyramidal
   cell bodies, in a common first approximation.
   Reciprocity: a unit current at contact k pushes a patch by exactly what
   contact k records from a unit dipole there, so a pattern I pushes a patch by
   sum_k I_k L_k. Playing the recording back, I = L / |L|, is the strongest
   pattern for a fixed sum of squared currents (Cauchy-Schwarz). The current
   lines are traced from the monopole field itself, not from reciprocity.
   Checked in Node against model.js: the push from the monopole field matches
   the recording to 1.4e-7 (relative, finite differences); none of the 19,682
   patterns the toggles can make, at any of the 1,001 slider positions, and none
   of 400,400 random patterns beats playback; and every sentence of the
   explanation holds at every slider position. Illustration only; not research code. */
(function () {
  'use strict';

  var M = window.CorticalModel;
  var fig = document.querySelector('[data-fig="write"]');
  if (!M || !M.activityMap || !fig) return;
  var views = {};
  ['record', 'stim'].forEach(function (name) {
    var canvas = fig.querySelector('[data-write-canvas="' + name + '"]');
    if (canvas && canvas.getContext) views[name] = { name: name, canvas: canvas, stage: canvas.parentNode, handle: fig.querySelector('[data-write-handle="' + name + '"]'), ctx: null, base: null, W: 0, H: 0, k: 16, x0: -20, dpr: 1, narrow: false };
  });
  if (!views.record || !views.stim) return;
  var padsEl = fig.querySelector('[data-write-pads]');
  var rowEl = fig.querySelector('[data-write-row]');
  var chipsEl = fig.querySelector('[data-write-chips]') || rowEl;
  var slider = fig.querySelector('[data-write-slider]');
  var resetButton = fig.querySelector('[data-write-reset]');
  var presetButtons = Array.prototype.slice.call(fig.querySelectorAll('[data-preset]'));
  var patternInputs = Array.prototype.slice.call(fig.querySelectorAll('input[name="fig4-pattern"]'));
  var out = {};
  Array.prototype.forEach.call(fig.querySelectorAll('[data-out]'), function (el) { out[el.getAttribute('data-out')] = el; });
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var MONO = '"Atkinson Hyperlegible Mono", ui-monospace, Menlo, Consolas, monospace';
  var NBSP = '\u00a0';

  /* ---------- Model: the fold, contacts and conductor of Fig. 1 ---------- */
  var HALF = 1.25, ELEC_Y = 0.5;
  var CONTACTS = [-16, -12, -8, -4, 0, 4, 8, 12, 16];
  var PATH_X = 30, SRC_LIMIT = 13, Y_TOP = 3.0, Y_BOT = -18.4, FUNDUS_DEPTH = 14;
  var V_REF = 1 / Math.pow(ELEC_Y + HALF, 2);   // a crown source right under a contact; by reciprocity, also that contact's push on it
  // "Elsewhere" is cortex more than 3 mm from the patch along the cortex, within the 37 mm the
  // narrowest view shows; the strongest push is always nearer the contacts than that edge.
  var AWAY = 3, VIEW_X = 18.5;
  var DEG = Math.PI / 180;
  // Built on first approach (see init): the fold, the slider's range and the presets.
  var fold = null, path, pial, white, sLo, sHi, PRESETS;
  function buildModel() {
    fold = M.buildFold({ xMin: -PATH_X, xMax: PATH_X, sulci: [{ x: 0, depth: FUNDUS_DEPTH }], half: HALF });
    path = fold.path;
    pial = fold.pial;
    white = fold.white;
    sLo = PATH_X - SRC_LIMIT;
    sHi = fold.total - (PATH_X - SRC_LIMIT);
    PRESETS = {
      crown: M.nearest(fold, -12, -HALF, sLo, sHi).s,
      wall: M.nearest(fold, -(0.5 + HALF), -7, sLo, sHi).s,
      fundus: M.nearest(fold, 0, -FUNDUS_DEPTH - HALF, sLo, sHi).s
    };
  }

  var REGION_NAME = { crown: 'Gyral crown', lip: 'Lip of the sulcus', wall: 'Sulcal wall', fundus: 'Fundus' };
  var PATTERN_NAME = { playback: 'Playing back the recording', nearest: 'The nearest contact alone', own: 'Your pattern' };

  /* The explanation is assembled from what the model computes, so that every sentence holds
     wherever the patch is (checked at every slider position in Node, not only at the presets).
     The lip and the fundus are curved: near their ends the patch faces the array or lies
     sideways, and where the lip has only begun to bend one contact still records almost
     all of it, so those stretches have sentences of their own. */
  var RECORDING = {
    crown: 'On a crown the patch faces the array, so the contacts right above it record it strongly.',
    'lip near': 'At the lip the cortex starts to bend away from the array, but the contacts right above the patch still record it strongly.',
    lip: 'At the lip the cortex bends away from the array, so the patch’s columns tilt and its recording spreads across several contacts.',
    'lip sideways': 'At the lip the cortex turns down into the fold, so the patch’s columns already lie sideways and the recording is split: positive on one side of the fold, negative on the other.',
    wall: 'In the sulcal wall the columns lie sideways, so the recording is split: positive on one side of the fold, negative on the other.',
    'fundus sideways': 'Where the fundus meets the wall the columns still lie sideways, so from this deep the recording is weak and split: positive on one side of the fold, negative on the other.',
    'fundus tilted': 'In the fundus the cortex curves around the bottom of the fold, so the patch’s columns tilt, and from this deep every contact records it weakly.',
    fundus: 'At the fundus the patch faces the array again, but from deep in the fold, so every contact records it weakly.'
  };
  var PLAYBACK = {
    focal: 'Played back, the current goes mostly through those contacts and down into the patch.',
    spread: 'Played back, the current comes from several contacts at once.',
    split: 'Played back, the current crosses the fold and pushes the patch harder than any single contact can.',
    anodes: 'Played back, every contact becomes an anode.',
    broad: 'Played back, the current spreads across the array and pushes the patch harder than any single contact can.'
  };
  var OWN_HINT = {
    crown: 'A crown patch faces the array: try one anode right above it.',
    'lip near': 'The contact right above this patch records it most: try one anode there.',
    lip: 'At a lip the columns tilt: try anodes on the side they tilt toward.',
    'lip sideways': 'Here the columns lie sideways, as in a wall: try anodes on one side of the fold and cathodes on the other.',
    wall: 'A wall faces sideways: try anodes on one side of the fold and cathodes on the other.',
    'fundus sideways': 'Here the columns lie sideways, as in a wall: try anodes on one side of the fold and cathodes on the other.',
    'fundus tilted': 'Here the columns tilt: try anodes on the side they tilt toward.',
    fundus: 'The fundus faces up, like a deep crown: try several anodes.'
  };
  var WORST_PART = { lip: 'The lip of the sulcus', wall: 'A sulcal wall', fundus: 'The fundus' };

  // Orientation as Fig. 1 reads it: within 8° of facing the array, or of lying sideways.
  function aimOf(p) {
    var angle = Math.acos(Math.max(-1, Math.min(1, p.ny))) / DEG;
    return Math.round(angle) <= 8 ? 'facing' : Math.abs(Math.round(angle) - 90) <= 8 ? 'sideways' : 'tilted';
  }
  function kindOf(m) {
    var part = m.p.part;
    if (part === 'lip') return m.aim === 'sideways' ? 'lip sideways' : m.spread < 3 ? 'lip near' : 'lip';
    if (part === 'fundus') return m.aim === 'facing' ? 'fundus' : 'fundus ' + m.aim;
    return part;
  }
  function playbackSentence(m, kind) {
    if (kind === 'crown' || kind === 'lip near') return PLAYBACK.focal;
    if (kind === 'lip') return PLAYBACK.spread;
    if (m.splitAtFold) return PLAYBACK.split;
    return m.allPositive ? PLAYBACK.anodes : PLAYBACK.broad;
  }
  function worstRatio(m) {
    if (!m.worst || !m.Imax) return 0;
    return m.push ? Math.abs(m.worst.v) / Math.abs(m.push) : Infinity;
  }
  function elsewhereSentence(m) {
    var ratio = worstRatio(m);
    if (ratio < 1) return 'No cortex more than 3' + NBSP + 'mm away is pushed as hard as the patch.';
    var q = path[m.worst.i], where = WORST_PART[q.part];
    // On a crown the strongest push elsewhere is right under a contact, or, for a patch between
    // two contacts, the crown just outside the patch's own 3 mm.
    if (q.part === 'crown') where = distToContact(q.x) <= 0.5 ? 'The crown right under a contact' : 'The crown just over 3' + NBSP + 'mm away';
    return where + ' is pushed ' + (ratio < 1.5 ? 'a little harder' : ratio < 4 ? 'harder' : 'far harder') + ' than the patch' +
      (state.pattern === 'playback' && m.p.part === 'wall' ? ', and the facing wall is pushed the opposite way.' : '.');
  }
  function explain(m) {
    var kind = kindOf(m);
    if (state.pattern === 'own') {
      if (!m.Imax) return 'No contact is passing current. Press a contact, in the row of toggles or in the Stimulate view, to make it an anode (+); press again for a cathode (−).';
      return 'Press contacts, in the row of toggles or in the Stimulate view, to cycle them: anode (+), cathode (−), off. Every pattern gets the same budget, so the score says how close you come to playing back the recording, the most any pattern can reach. ' + OWN_HINT[kind];
    }
    var parts = [RECORDING[kind]];
    if (state.pattern === 'playback') parts.push(playbackSentence(m, kind));
    else {
      var score = 100 * m.push / m.best;
      parts.push(m.push < 0 ? 'The nearest contact alone pushes the patch the opposite way, with the field toward the surface.'
        : Math.round(score) >= 95 ? 'Here the nearest contact alone is almost exactly the playback pattern.'
        : 'The nearest contact alone reaches ' + scoreText(score) + ' of what playing back the recording does.');
    }
    parts.push(elsewhereSentence(m));
    return parts.join(' ');
  }

  var state = { s: 0, pattern: 'playback', own: CONTACTS.map(function () { return 0; }) };

  function readings(p) { return CONTACTS.map(function (cx) { return M.potential(cx, ELEC_Y, 0, p); }); }
  function norm(v) { var a = 0; for (var i = 0; i < v.length; i++) a += v[i] * v[i]; return Math.sqrt(a); }
  function unit(v) { var n = norm(v); return v.map(function (x) { return n ? x / n : 0; }); }
  function distToContact(x) { var d = Infinity; CONTACTS.forEach(function (cx) { d = Math.min(d, Math.abs(cx - x)); }); return d; }
  function nearestContact(p) {
    var best = 0, bd = Infinity;
    CONTACTS.forEach(function (cx, i) { var d = Math.hypot(cx - p.x, ELEC_Y - p.y); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function currents(L, p) {
    if (state.pattern === 'playback') return unit(L);
    if (state.pattern === 'nearest') { var k = nearestContact(p); return CONTACTS.map(function (c, i) { return i === k ? 1 : 0; }); }
    return unit(state.own);   // equal magnitudes on the active contacts, same budget
  }
  // Reciprocity: a pattern's push on a patch is the pattern dotted with that patch's recording.
  function pushAt(I, p) {
    var acc = 0;
    for (var k = 0; k < CONTACTS.length; k++) if (I[k]) acc += I[k] * M.potential(CONTACTS[k], ELEC_Y, 0, p);
    return acc;
  }

  var cache = { key: '', m: null };
  function compute() {
    var key = state.s.toFixed(4) + state.pattern + state.own.join(',');
    if (cache.key === key) return cache.m;
    var p = M.at(fold, state.s), L = readings(p), I = currents(L, p);
    var Lmax = 0, Imax = 0, push = 0, k;
    for (k = 0; k < L.length; k++) { Lmax = Math.max(Lmax, Math.abs(L[k])); Imax = Math.max(Imax, Math.abs(I[k])); push += I[k] * L[k]; }
    // The push along the whole path (every width of view shows a different stretch of it), and the
    // strongest push elsewhere.
    var prof = new Float64Array(path.length), worst = null;
    for (var i = 0; i < path.length; i++) {
      var q = path[i], v = Imax ? pushAt(I, q) : 0;
      prof[i] = v;
      if (Math.abs(q.x) <= VIEW_X && Math.abs(q.s - p.s) > AWAY && (!worst || Math.abs(v) > Math.abs(worst.v))) worst = { i: i, v: v };
    }
    // What the recording looks like, for the explanation: how many contacts record at least a
    // tenth of the strongest, whether every contact reads positive, and whether the two sides
    // of the fold read opposite signs.
    var spread = 0, left = 0, right = 0, allPositive = true;
    for (k = 0; k < L.length; k++) {
      if (Math.abs(L[k]) >= 0.1 * Lmax) spread++;
      if (L[k] <= 0) allPositive = false;
      var sg = L[k] > 0 ? 1 : L[k] < 0 ? -1 : 0;
      if (CONTACTS[k] < 0) left = left === 0 || left === sg ? sg : 2;
      else if (CONTACTS[k] > 0) right = right === 0 || right === sg ? sg : 2;
    }
    var m = { p: p, aim: aimOf(p), L: L, I: I, Lmax: Lmax, Imax: Imax, push: push, best: norm(L), prof: prof, worst: worst,
      spread: spread, allPositive: allPositive, splitAtFold: Math.abs(left) === 1 && left === -right };
    cache.key = key;
    cache.m = m;
    return m;
  }

  /* ---------- Current lines, from the monopole field itself ---------- */
  // In-plane field of point currents at the contacts (all at z = 0, so lines in the plane stay in it).
  // By symmetry the field is parallel to the electrode plane on the plane, so lines below it stay below:
  // the same lines as in a half-space under an insulating sheet.
  function traceLines(I) {
    var Imax = 0;
    I.forEach(function (v) { Imax = Math.max(Imax, Math.abs(v)); });
    if (!Imax) return [];
    var anodes = [], cathodes = [];
    I.forEach(function (v, k) { if (v > 0.04 * Imax) anodes.push(k); else if (v < -0.04 * Imax) cathodes.push(k); });
    var fromAnodes = anodes.length > 0, seeds = fromAnodes ? anodes : cathodes, sinks = fromAnodes ? cathodes : anodes;
    var dir = fromAnodes ? 1 : -1, budget = 30, sum = 0;
    seeds.forEach(function (k) { sum += Math.abs(I[k]); });
    function unitField(x, y) {
      var ex = 0, ey = 0;
      for (var k = 0; k < CONTACTS.length; k++) {
        if (!I[k]) continue;
        var dx = x - CONTACTS[k], dy = y - ELEC_Y, r2 = dx * dx + dy * dy + 1e-9, r3 = r2 * Math.sqrt(r2);
        ex += I[k] * dx / r3;
        ey += I[k] * dy / r3;
      }
      var mag = Math.hypot(ex, ey) || 1e-12;
      return [dir * ex / mag, dir * ey / mag];
    }
    var lines = [], xMax = PATH_X - 2;   // past the edges of the widest view (about ±27 mm, stacked on a tablet)
    seeds.forEach(function (k) {
      var n = Math.max(3, Math.round(budget * Math.abs(I[k]) / sum));
      for (var j = 0; j < n; j++) {
        var a = Math.PI * (1.1 + 0.8 * (j + 0.5) / n);   // spread over the half-plane below the strip
        var x = CONTACTS[k] + 0.32 * Math.cos(a), y = ELEC_Y + 0.32 * Math.sin(a);
        var pts = [[x, y]], len = 0;
        for (var step = 0; step < 1500; step++) {
          var near = Infinity;
          for (var c = 0; c < CONTACTS.length; c++) if (I[c]) near = Math.min(near, Math.hypot(x - CONTACTS[c], y - ELEC_Y));
          var h = near < 1.5 ? 0.06 : 0.18;
          var k1 = unitField(x, y), k2 = unitField(x + h / 2 * k1[0], y + h / 2 * k1[1]);
          var k3 = unitField(x + h / 2 * k2[0], y + h / 2 * k2[1]), k4 = unitField(x + h * k3[0], y + h * k3[1]);
          x += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
          y += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
          len += h;
          pts.push([x, y]);
          if (y > ELEC_Y + 0.02 || x < -xMax || x > xMax || y < Y_BOT - 1) break;
          var hit = false;
          for (var q = 0; q < sinks.length; q++) if (Math.hypot(x - CONTACTS[sinks[q]], y - ELEC_Y) < 0.3) { hit = true; break; }
          if (hit) break;
        }
        if (!fromAnodes) pts.reverse();   // every line runs the way the current flows
        lines.push({ pts: pts, len: len });
      }
    });
    return lines;
  }
  // Tracing takes a few milliseconds, so it waits while the patch is being dragged or glides to a
  // preset (the lines then go until it settles); lines whose currents have not changed are kept.
  var lineCache = { key: '', lines: null };
  function linesFor(I) {
    var key = I.map(function (v) { return v.toFixed(6); }).join(',');
    if (lineCache.key !== key) {
      if (busy()) return null;
      lineCache.key = key;
      lineCache.lines = traceLines(I);
    }
    return lineCache.lines;
  }

  /* ---------- Views ---------- */
  var grain = null;
  function makeGrain() {
    var n = document.createElement('canvas');
    n.width = n.height = 128;
    var g = n.getContext('2d'), img = g.createImageData(128, 128), d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var v = 128 + (Math.random() + Math.random() + Math.random() - 1.5) * 70;
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, v));
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return n;
  }
  function X(v, x) { return (x - v.x0) * v.k; }
  function Y(v, y) { return (Y_TOP - y) * v.k; }
  function polyline(v, c, pts, move) {
    pts.forEach(function (p, i) { if (i === 0 && move !== false) c.moveTo(X(v, p.x), Y(v, p.y)); else c.lineTo(X(v, p.x), Y(v, p.y)); });
  }
  function rgb(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
  // A black stroke under light marks and labels that sit on the push map, which runs to pale yellow.
  var HALO = 3;
  function label(c, text, x, y, align, color, size, width, halo) {
    c.font = '400 ' + size + 'px ' + MONO;
    c.textBaseline = 'middle';
    var w = c.measureText(text).width, pad = 6;
    var left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    left = Math.max(pad, Math.min(left, width - pad - w));
    c.textAlign = 'left';
    if (halo) {
      c.lineWidth = HALO;
      c.lineJoin = 'round';
      c.strokeStyle = '#000';
      c.strokeText(text, left, y);
    }
    c.fillStyle = color;
    c.fillText(text, left, y);
  }
  function haloStroke(c, color, width) {
    c.lineWidth = width + HALO;
    c.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    c.stroke();
    c.lineWidth = width;
    c.strokeStyle = color;
    c.stroke();
  }
  function layer(v) { var c = document.createElement('canvas'); c.width = v.canvas.width; c.height = v.canvas.height; var g = c.getContext('2d'); g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0); return { canvas: c, ctx: g }; }

  // Heights as in Fig. 1 (styles.css reserves them): 21.4 mm deep at 1/40 of the width per mm, at
  // most 17 px per mm; below 560 px 37 mm across, so that phones keep all nine contacts in view.
  function layoutView(v) {
    var w = Math.round(v.canvas.getBoundingClientRect().width);
    if (!w) return false;
    v.narrow = w < 560;
    v.k = v.narrow ? w / 37 : Math.min(w / 40, 17);
    v.x0 = -(w / v.k) / 2;
    v.W = w;
    v.H = Math.round((Y_TOP - Y_BOT) * v.k);
    v.dpr = Math.min(window.devicePixelRatio || 1, 2);
    v.canvas.style.height = v.H + 'px';
    v.canvas.width = Math.round(v.W * v.dpr);
    v.canvas.height = Math.round(v.H * v.dpr);
    v.fs = v.narrow ? 12 : 13;
    v.base = layer(v);
    drawTissue(v, v.base.ctx);
    v.under = layer(v);
    v.over = layer(v);
    v.field = { cell: v.narrow ? 2 : 3 };
    v.field.w = Math.ceil(v.W / v.field.cell);
    v.field.h = Math.ceil(v.H / v.field.cell);
    v.field.canvas = document.createElement('canvas');
    v.field.canvas.width = v.field.w;
    v.field.canvas.height = v.field.h;
    v.field.ctx = v.field.canvas.getContext('2d');
    v.field.img = v.field.ctx.createImageData(v.field.w, v.field.h);
    return true;
  }

  // Tissue as in Fig. 1: white matter, gray matter, scanner grain. Contours go on after the data.
  function drawTissue(v, c) {
    var W = v.W, H = v.H;
    c.fillStyle = '#000';
    c.fillRect(0, 0, W, H);
    c.beginPath();
    polyline(v, c, white);
    c.lineTo(X(v, PATH_X), H + 10);
    c.lineTo(X(v, -PATH_X), H + 10);
    c.closePath();
    c.fillStyle = '#4f4f4f';
    c.fill();
    c.beginPath();
    polyline(v, c, pial);
    polyline(v, c, white.slice().reverse(), false);
    c.closePath();
    c.fillStyle = '#2c2c2c';
    c.fill();
    c.save();
    c.globalCompositeOperation = 'overlay';
    c.globalAlpha = 0.5;
    c.fillStyle = c.createPattern(grain, 'repeat');
    c.fillRect(0, 0, W, H);
    c.restore();
  }
  function drawContours(v, c) {
    c.lineWidth = 1.3;
    c.lineJoin = 'round';
    c.beginPath(); polyline(v, c, white); c.strokeStyle = 'rgba(255, 210, 63, 0.9)'; c.stroke();
    c.beginPath(); polyline(v, c, pial); c.strokeStyle = 'rgba(255, 77, 61, 0.95)'; c.stroke();
  }
  function drawStrip(v, c) {
    var top = Y(v, ELEC_Y + 0.85), bottom = Y(v, ELEC_Y);
    c.fillStyle = 'rgba(235, 235, 235, 0.12)';
    c.fillRect(X(v, -18.2), top, X(v, 18.2) - X(v, -18.2), bottom - top);
    c.fillStyle = 'rgba(255, 255, 255, 0.24)';
    c.fillRect(X(v, -18.2), top, X(v, 18.2) - X(v, -18.2), 1);
  }
  // Contacts: black discs, filled from the opaque activity map by value / strongest, with the
  // site's contact curve: a floor, so a faint contact still reads as dark red or navy, and a
  // cap, so the strongest stays orange or sky blue, apart from the yellow patch ring. Below 4%
  // of the strongest a contact stays black. + and − when they pass current, in black or white,
  // whichever contrasts more with the fill (WCAG relative luminance).
  var CONTACT_FLOOR = 0.12, CONTACT_SPAN = 0.60, CONTACT_OFF = 0.04;
  function contactRGB(value, t) { return M.activityMap(value, CONTACT_FLOOR + CONTACT_SPAN * t); }
  function blackOn(col) {
    var L = col.map(function (c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
    var lum = 0.2126 * L[0] + 0.7152 * L[1] + 0.0722 * L[2];
    return (lum + 0.05) / 0.05 > 1.05 / (lum + 0.05);
  }
  function drawContacts(v, c, values, vmax, signs) {
    var r = Math.max(5, 0.62 * v.k);
    CONTACTS.forEach(function (cx, i) {
      var t = vmax ? Math.abs(values[i]) / vmax : 0, x = X(v, cx), y = Y(v, ELEC_Y);
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fillStyle = '#000';
      c.fill();
      var light = false;
      if (t > CONTACT_OFF) {
        var col = contactRGB(values[i], t);
        c.fillStyle = rgb(col);
        c.fill();
        light = blackOn(col);
      }
      c.lineWidth = 1.2;
      c.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      c.stroke();
      if (signs && state.pattern === 'own' && t <= CONTACT_OFF) {
        c.save();
        c.setLineDash([2.5, 2.5]);
        c.strokeStyle = 'rgba(255, 210, 63, 0.75)';
        c.beginPath();
        c.arc(x, y, r + 3, 0, Math.PI * 2);
        c.stroke();
        c.restore();
      }
      if (signs && t > CONTACT_OFF) {
        var g = 0.48 * r;
        c.strokeStyle = light ? '#000' : '#fff';
        c.lineWidth = 1.6;
        c.beginPath();
        c.moveTo(x - g, y); c.lineTo(x + g, y);
        if (values[i] > 0) { c.moveTo(x, y - g); c.lineTo(x, y + g); }
        c.stroke();
      }
    });
  }
  function drawCrosshair(v, c, p) {
    c.fillStyle = 'rgba(255, 210, 63, 0.3)';
    c.fillRect(Math.round(X(v, p.x)), 0, 1, v.H);
  }
  function ringPath(v, c, p) {
    c.beginPath();
    c.arc(X(v, p.x), Y(v, p.y), Math.max(13, 1.05 * v.k), 0, Math.PI * 2);
  }
  // The handles are hidden until placed: an unplaced one would sit in the view's top-left corner,
  // where its touch-action: none would stop a page scroll that starts there.
  function placeHandle(v, p) {
    if (!v.handle) return;
    v.handle.style.transform = 'translate(' + X(v, p.x).toFixed(1) + 'px,' + Y(v, p.y).toFixed(1) + 'px)';
    if (v.handle.hidden) v.handle.hidden = false;
  }

  /* ---------- Record: the dipole's potential, as in Fig. 1 ---------- */
  function drawDipoleField(v, c, src) {
    var f = v.field, data = f.img.data, cell = f.cell;
    for (var j = 0; j < f.h; j++) {
      var y = Y_TOP - ((j + 0.5) * cell) / v.k;
      for (var i = 0; i < f.w; i++) {
        var idx = (j * f.w + i) * 4;
        if (y > ELEC_Y) { data[idx + 3] = 0; continue; }
        var x = v.x0 + ((i + 0.5) * cell) / v.k, dx = x - src.x, dy = y - src.y, r2 = dx * dx + dy * dy + 0.03;
        var val = (src.nx * dx + src.ny * dy) / (r2 * Math.sqrt(r2));
        var t = (Math.log(Math.abs(val) / V_REF + 1e-12) / Math.LN10 + 2.6) / 2.6;
        if (t <= 0) { data[idx + 3] = 0; continue; }
        if (t > 1) t = 1;
        var col = M.activityColor(val, 0.25 + 0.75 * t);   // translucent over gray tissue, as Fig. 1's glow
        data[idx] = col[0]; data[idx + 1] = col[1]; data[idx + 2] = col[2];
        data[idx + 3] = Math.round(255 * 0.62 * Math.pow(t, 1.25));
      }
    }
    f.ctx.putImageData(f.img, 0, 0);
    c.imageSmoothingEnabled = true;
    c.drawImage(f.canvas, 0, 0, f.w * cell, f.h * cell);
  }
  function drawDipole(v, c, src) {
    var k = v.k, sx = X(v, src.x), sy = Y(v, src.y);
    var tipX = X(v, src.x + 1.55 * src.nx), tipY = Y(v, src.y + 1.55 * src.ny);
    var tailX = X(v, src.x - 0.75 * src.nx), tailY = Y(v, src.y - 0.75 * src.ny);
    var ux = tipX - tailX, uy = tipY - tailY, ul = Math.hypot(ux, uy) || 1;
    ux /= ul; uy /= ul;
    var head = Math.max(6, 0.42 * k);
    c.beginPath();
    c.moveTo(tailX, tailY);
    c.lineTo(tipX - ux * head * 0.6, tipY - uy * head * 0.6);
    c.lineWidth = 1.8;
    c.strokeStyle = '#ededed';
    c.stroke();
    c.beginPath();
    c.moveTo(tipX, tipY);
    c.lineTo(tipX - ux * head - uy * head * 0.55, tipY - uy * head + ux * head * 0.55);
    c.lineTo(tipX - ux * head + uy * head * 0.55, tipY - uy * head - ux * head * 0.55);
    c.closePath();
    c.fillStyle = '#ededed';
    c.fill();
    c.beginPath();
    c.arc(sx, sy, Math.max(4.5, 0.4 * k), 0, Math.PI * 2);
    c.fillStyle = '#ffe478';
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = '#000';
    c.stroke();
  }
  // Under playback the currents are the recording scaled to one budget, so the contacts take
  // the same colours in both views (the reciprocity picture); both use the readings to be exact.
  function stimContacts(m) { return state.pattern === 'playback' ? { values: m.L, vmax: m.Lmax } : { values: m.I, vmax: m.Imax }; }
  function renderRecord(m) {
    var v = views.record, c = v.ctx, W = v.W, fs = v.fs, k = v.k;
    c.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    c.drawImage(v.base.canvas, 0, 0, W, v.H);
    drawDipoleField(v, c, m.p);
    drawContours(v, c);
    drawStrip(v, c);
    var lc = '#a0a0a0';   // tissue labels, as in Fig. 1
    label(c, 'electrodes, 4 mm apart', X(v, -18), Y(v, ELEC_Y + 1.75), 'left', lc, fs, W);
    label(c, 'gyral crown', X(v, -12), Y(v, -4.3), 'center', lc, fs, W);
    if (!v.narrow) label(c, 'white matter', X(v, 11.5), Y(v, -10.5), 'center', lc, fs, W);
    label(c, 'sulcal wall', X(v, -3.8), Y(v, -11.2), 'right', lc, fs, W);
    c.fillStyle = lc;
    c.fillRect(X(v, -3.6), Y(v, -11.2), X(v, -2.2) - X(v, -3.6), 1);
    label(c, 'fundus', X(v, 0), Y(v, -17.7), 'center', lc, fs, W);
    var sbX = Math.max(X(v, -17), 10), sbY = Y(v, -16.9);
    c.fillStyle = '#ededed';
    c.fillRect(sbX, sbY, 4 * k, 1.5);
    c.fillRect(sbX, sbY - 3, 1.5, 7);
    c.fillRect(sbX + 4 * k - 1.5, sbY - 3, 1.5, 7);
    // Under the bar, or beside it on phones, where 37 mm across leaves no room below.
    if (v.narrow) label(c, '4 mm', sbX + 4 * k + 6, sbY + 1, 'left', '#ededed', fs, W);
    else label(c, '4 mm', sbX + 2 * k, Y(v, -17.8), 'center', '#ededed', fs, W);
    drawContacts(v, c, m.L, m.Lmax, false);
    drawCrosshair(v, c, m.p);
    ringPath(v, c, m.p);
    c.lineWidth = 1.2;
    c.strokeStyle = 'rgba(255, 210, 63, 0.6)';
    c.stroke();
    drawDipole(v, c, m.p);
    placeHandle(v, m.p);
  }

  /* ---------- Stimulate: currents, the push on the cortex, the current lines ---------- */
  function pushT(val) { return Math.max(0, Math.min(1, (Math.log(Math.abs(val) / V_REF + 1e-12) / Math.LN10 + 2) / 2)); }   // 1% to 100% of one contact over a crown
  function pushRGB(val) { return M.activityMap(val, 0.1 + 0.9 * pushT(val)); }
  function renderStimLayers(m) {
    var v = views.stim, W = v.W, H = v.H, k = v.k, fs = v.fs;
    // Under: tissue, the crosshair (behind the cortex, so no yellow sits on the map), then the
    // gray-matter ribbon painted by push (opaque map: dark where little reaches it).
    var c = v.under.ctx;
    c.clearRect(0, 0, W, H);
    c.drawImage(v.base.canvas, 0, 0, W, H);
    drawCrosshair(v, c, m.p);
    var i0 = 0, i1 = path.length - 1;
    while (i0 < i1 && path[i0].x < v.x0 - 1) i0++;
    while (i1 > i0 && path[i1].x > v.x0 + W / k + 1) i1--;
    var slice = Math.max(1, Math.round(1 / (k * 0.02)));
    c.lineWidth = 0.8;
    c.lineJoin = 'round';
    for (var i = i0; i < i1 && m.Imax; i += slice) {
      var j = Math.min(i + slice, i1), fill = rgb(pushRGB(m.prof[(i + j) >> 1]));
      c.beginPath();
      c.moveTo(X(v, pial[i].x), Y(v, pial[i].y));
      c.lineTo(X(v, pial[j].x), Y(v, pial[j].y));
      c.lineTo(X(v, white[j].x), Y(v, white[j].y));
      c.lineTo(X(v, white[i].x), Y(v, white[i].y));
      c.closePath();
      c.fillStyle = fill;
      c.fill();
      c.strokeStyle = fill;
      c.stroke();
    }
    drawContours(v, c);
    drawStrip(v, c);

    // Over: contacts with their polarity, the patch's pyramidal cell, the strongest push elsewhere.
    var o = v.over.ctx, sc = stimContacts(m);
    o.clearRect(0, 0, W, H);
    drawContacts(v, o, sc.values, sc.vmax, true);
    var p = m.p, a = M.at(fold, p.s);
    // A pyramidal cell: body in the deep half of the cortex, apical dendrite up to the pia with a
    // small tuft, two basal dendrites. The body is filled with the push it gets.
    var ux = a.nx, uy = -a.ny, tx = -uy, ty = ux;   // canvas directions: along the column (toward pia) and across it
    var cx0 = X(v, a.x - 0.35 * a.nx), cy0 = Y(v, a.y - 0.35 * a.ny);
    function P2(u, w) { return [cx0 + (u * ux + w * tx) * k, cy0 + (u * uy + w * ty) * k]; }
    o.lineCap = 'round';
    o.lineJoin = 'round';
    o.beginPath();
    [[0.42, 0, 1.28, 0], [1.02, 0, 1.3, 0.3], [1.02, 0, 1.3, -0.3], [-0.22, 0.24, -0.62, 0.52], [-0.22, -0.24, -0.62, -0.52]].forEach(function (sg) {
      var A = P2(sg[0], sg[1]), B = P2(sg[2], sg[3]);
      o.moveTo(A[0], A[1]);
      o.lineTo(B[0], B[1]);
    });
    haloStroke(o, '#ededed', 1.3);
    var T1 = P2(0.45, 0), T2 = P2(-0.25, 0.3), T3 = P2(-0.25, -0.3);
    o.beginPath();
    o.moveTo(T1[0], T1[1]); o.lineTo(T2[0], T2[1]); o.lineTo(T3[0], T3[1]);
    o.closePath();
    o.lineWidth = 1.4 + HALO;   // halo, then the fill over its inner half, then the outline
    o.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    o.stroke();
    o.fillStyle = m.Imax ? rgb(M.activityMap(m.push, 0.45 + 0.55 * pushT(m.push))) : '#2c2c2c';
    o.fill();
    o.lineWidth = 1.4;
    o.strokeStyle = '#ededed';
    o.stroke();
    ringPath(v, o, p);
    haloStroke(o, 'rgba(255, 210, 63, 0.75)', 1.2);
    var ratio = worstRatio(m);
    if (ratio >= 1.5 && isFinite(ratio)) {
      var q = path[m.worst.i], qx = X(v, q.x), qy = Y(v, q.y), rr = Math.max(7, 0.55 * k);
      o.beginPath();
      o.arc(qx, qy, rr, 0, Math.PI * 2);
      haloStroke(o, '#ededed', 1.4);
      var text = 'pushed ' + timesText(ratio) + '× harder';
      var side = q.x >= p.x ? 1 : -1;                                   // away from the patch
      var lx = qx + side * (rr + 0.9 * k), ly = qy + rr + 1.25 * k;      // below and beside the ring
      o.beginPath();
      o.moveTo(qx + side * rr * 0.72, qy + rr * 0.72);
      o.lineTo(lx - side * 3, ly - 7);
      haloStroke(o, 'rgba(237, 237, 237, 0.7)', 1);
      label(o, text, lx, ly, side > 0 ? 'left' : 'right', '#ededed', fs, W, true);
    }
    placeHandle(v, p);
  }
  function drawLines(v, c, lines, now) {
    if (!lines || !lines.length) return;
    c.save();
    c.beginPath();
    c.rect(0, Y(v, ELEC_Y) - 0.5, v.W, v.H);   // current flows below the strip
    c.clip();
    c.lineWidth = 1.1;
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(237, 237, 237, 0.42)';
    lines.forEach(function (ln) {
      c.beginPath();
      ln.pts.forEach(function (pt, i) { if (i === 0) c.moveTo(X(v, pt[0]), Y(v, pt[1])); else c.lineTo(X(v, pt[0]), Y(v, pt[1])); });
      c.stroke();
    });
    // One arrowhead per line, part way along, pointing the way the current flows.
    c.fillStyle = 'rgba(237, 237, 237, 0.85)';
    lines.forEach(function (ln, li) {
      var target = (0.26 + 0.32 * ((li * 0.618) % 1)) * ln.len, acc = 0;   // staggered, so they do not line up in a row
      for (var i = 1; i < ln.pts.length; i++) {
        var a = ln.pts[i - 1], b = ln.pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
        acc += d;
        if (acc >= target) {
          var x = X(v, b[0]), y = Y(v, b[1]), dx = (b[0] - a[0]) / (d || 1), dy = -(b[1] - a[1]) / (d || 1), s = 4.2;
          if (x < 0 || x > v.W) break;
          c.beginPath();
          c.moveTo(x + dx * s, y + dy * s);
          c.lineTo(x - dx * s - dy * s * 0.75, y - dy * s + dx * s * 0.75);
          c.lineTo(x - dx * s + dy * s * 0.75, y - dy * s - dx * s * 0.75);
          c.closePath();
          c.fill();
          break;
        }
      }
    });
    if (now !== null) {
      // Pulses running along the lines for a few seconds after a change.
      var env = Math.min(1, (now - flow.t0) / 300, (flow.until - now) / 700);
      c.setLineDash([3, 12]);
      c.lineDashOffset = -((now - flow.t0) * 0.024);
      c.lineWidth = 1.7;
      c.strokeStyle = 'rgba(255, 255, 255, ' + (0.9 * Math.max(0, env)).toFixed(3) + ')';
      lines.forEach(function (ln) {
        c.beginPath();
        ln.pts.forEach(function (pt, i) { if (i === 0) c.moveTo(X(v, pt[0]), Y(v, pt[1])); else c.lineTo(X(v, pt[0]), Y(v, pt[1])); });
        c.stroke();
      });
    }
    c.restore();
  }
  function composeStim(now) {
    var v = views.stim, c = v.ctx, m = compute();
    c.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    c.clearRect(0, 0, v.W, v.H);
    c.drawImage(v.under.canvas, 0, 0, v.W, v.H);
    drawLines(v, c, linesFor(m.I), now);
    c.drawImage(v.over.canvas, 0, 0, v.W, v.H);
  }

  /* ---------- Pulses: at most 4.5 s after a change, only in view, never under reduced motion ---------- */
  var flow = { id: 0, t0: 0, until: 0, visible: false };
  function kickFlow() {
    if (reduceMotion.matches || busy()) return;
    var now = window.performance.now();
    if (now > flow.until) flow.t0 = now;
    flow.until = now + 4500;
    if (!flow.id && flow.visible) flow.id = window.requestAnimationFrame(flowStep);
  }
  function stopFlow() {
    flow.until = 0;
    if (flow.id) { window.cancelAnimationFrame(flow.id); flow.id = 0; }
    if (views.stim.base) composeStim(null);
  }
  function flowStep(now) {
    flow.id = 0;
    if (!flow.visible || now >= flow.until || busy() || reduceMotion.matches) { composeStim(null); return; }
    composeStim(now);
    flow.id = window.requestAnimationFrame(flowStep);
  }

  /* ---------- Contact pads for "Your own" ---------- */
  // Two ways to set a contact in "Your own": press it in the Stimulate view (pointer only), or use
  // the row of toggles that follows the pattern choice (keyboard and screen readers; the same state).
  var pads = [], chips = [];
  function cycle(i) {
    if (!ready()) return;
    state.own[i] = state.own[i] === 0 ? 1 : state.own[i] === 1 ? -1 : 0;
    changed();
    announce('Contact at ' + mm(CONTACTS[i]) + ' is ' + ['a cathode', 'off', 'an anode'][state.own[i] + 1] + '. ' + summary(compute()));
  }
  function mm(x) { return (x < 0 ? '−' : x > 0 ? '+' : '') + Math.abs(x) + ' mm'; }
  function buildContactControls() {
    CONTACTS.forEach(function (cx, i) {
      if (padsEl) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'contact-pad';
        b.tabIndex = -1;
        b.addEventListener('click', function () { cycle(i); });
        padsEl.appendChild(b);
        pads.push(b);
      }
      if (chipsEl) {
        var c = document.createElement('button');
        c.type = 'button';
        c.className = 'chip-btn contact-chip';
        c.innerHTML = '<span class="cc-pos">' + (cx > 0 ? '+' : cx < 0 ? '−' : '') + Math.abs(cx) + '</span><span class="cc-state" aria-hidden="true"></span>';
        c.addEventListener('click', function () { cycle(i); });
        chipsEl.appendChild(c);
        chips.push(c);
      }
    });
  }
  function layoutPads() {
    var v = views.stim;
    var size = Math.round(Math.max(26, Math.min(40, 4 * v.k - 8)));
    pads.forEach(function (b, i) {
      b.style.width = b.style.height = size + 'px';
      b.style.left = (X(v, CONTACTS[i]) - size / 2).toFixed(1) + 'px';
      b.style.top = (Y(v, ELEC_Y) - size / 2).toFixed(1) + 'px';
    });
  }
  function syncPads() {
    if (padsEl) padsEl.hidden = state.pattern !== 'own';
    if (rowEl) rowEl.hidden = state.pattern !== 'own';
    chips.forEach(function (c, i) {
      var st = state.own[i];
      c.setAttribute('aria-label', 'Contact at ' + mm(CONTACTS[i]) + ': ' + ['cathode', 'off', 'anode'][st + 1]);
      c.setAttribute('data-state', ['cathode', 'off', 'anode'][st + 1]);
      c.lastChild.textContent = ['−', 'off', '+'][st + 1];
    });
  }

  /* ---------- Readouts ---------- */
  function formatPct(v) {
    if (v >= 10) return Math.round(v) + '%';
    if (v >= 1) return v.toFixed(1) + '%';
    if (v >= 0.01) return v.toFixed(2) + '%';
    return v > 0 ? '<0.01%' : '0%';
  }
  // The pattern as a share of playback's push, signed; whole percent, or one decimal below 1%.
  // Below 0.05% no sign: the direction of a push that small is not worth stating.
  function scoreText(v) {
    var a = Math.abs(v);
    if (a < 0.05) return a ? '<0.1%' : '0%';
    return (v < 0 ? '−' : '') + (a >= 0.95 ? Math.round(a) : a.toFixed(1)) + '%';
  }
  // How many times the patch's push the strongest push elsewhere is: two decimals near 1, one
  // below 10. Never rounded up across a point where the words change (1, 1.5 and 4), so the
  // number agrees with them: 0.997 reads 0.99, not 1.00, beside "no cortex ... as hard".
  function timesText(r) {
    var digits = r >= 0.95 && r < 1.05 ? 2 : r < 10 ? 1 : 0, f = Math.pow(10, digits), shown = Math.round(r * f) / f;
    [1, 1.5, 4].forEach(function (edge) { if (r < edge && shown >= edge) shown = Math.floor(r * f + 1e-9) / f; });
    return shown.toFixed(digits);
  }
  function ratioText(m) {
    var r = worstRatio(m);
    return r && isFinite(r) ? timesText(r) + '× the patch' : '–';
  }
  function pushText(m) {
    if (!m.Imax) return '–';
    var v = 100 * Math.abs(m.push) / V_REF;
    return m.push < 0 && v >= 0.01 ? '−' + formatPct(v) + ', the opposite way' : formatPct(v);
  }
  function summary(m) {
    if (!m.Imax) return 'No current.';
    return PATTERN_NAME[state.pattern] + ' pushes the patch ' + (m.push < 0 ? 'the opposite way, ' : '') + formatPct(100 * Math.abs(m.push) / V_REF) + ' as hard as one contact over a crown, ' +
      scoreText(100 * m.push / m.best).replace('%', ' percent') + ' of playback. Strongest push more than 3 mm away: ' + ratioText(m).replace('×', ' times') + '.';
  }
  var liveTimer = 0;
  function announce(text) {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(function () { if (out.live) out.live.textContent = text; }, 450);
  }
  function updateText() {
    var m = compute(), p = m.p, region = p.part || 'crown', depth = ELEC_Y - p.y;
    if (out.region) out.region.textContent = REGION_NAME[region];
    if (out.depth) out.depth.textContent = depth.toFixed(1) + NBSP + 'mm';
    if (out.peak) out.peak.textContent = formatPct(100 * m.Lmax / V_REF);
    if (out.push) out.push.textContent = pushText(m);
    if (out.score) out.score.textContent = m.Imax ? scoreText(100 * m.push / m.best) : '–';
    if (out.worst) out.worst.textContent = ratioText(m);
    if (out.explain) out.explain.textContent = explain(m);
    if (out.hint) out.hint.textContent = state.pattern === 'own' ? 'Press a contact, here or in the Stimulate view, to cycle anode (+), cathode (−), off. Positions in mm.' : 'Every pattern gets the same budget: the same sum of squared currents.';
    presetButtons.forEach(function (b) { b.toggleAttribute('data-active', b.getAttribute('data-preset') === region); });
    if (slider) slider.setAttribute('aria-valuetext', REGION_NAME[region] + ', ' + depth.toFixed(1) + ' mm below the electrodes');
    syncPads();
    return m;
  }

  /* ---------- Rendering and state ---------- */
  // Busy: the patch is being dragged (handle or slider thumb) or glides to a preset. Lines are not
  // traced and pulses wait until it settles.
  var dragging = { handle: false, slider: false }, tween = 0;
  function busy() { return dragging.handle || dragging.slider || tween !== 0; }
  var queued = 0;
  function render() {
    queued = 0;
    if (!views.record.base || !views.stim.base) return;
    var m = compute();
    renderRecord(m);
    renderStimLayers(m);
    if (!flow.id) composeStim(null);
  }
  function requestRender() { if (!queued) queued = window.requestAnimationFrame(render); }
  function changed() { updateText(); requestRender(); kickFlow(); }
  function settle() { requestRender(); kickFlow(); }

  function sliderStep(s) { return String(Math.round(1000 * (s - sLo) / (sHi - sLo))); }
  function setS(s, origin) {
    state.s = Math.min(sHi, Math.max(sLo, s));
    if (slider && origin !== 'slider') slider.value = sliderStep(state.s);
    changed();
  }
  function cancelTween() { if (tween) window.cancelAnimationFrame(tween); tween = 0; }
  function tweenTo(target) {
    cancelTween();
    if (reduceMotion.matches) { setS(target, 'preset'); announce(describe()); return; }
    var from = state.s, t0 = 0, duration = Math.min(900, 300 + Math.abs(target - from) * 20);
    function step(now) {
      if (!t0) t0 = now;
      var t = Math.min(1, (now - t0) / duration);
      if (t < 1) {
        tween = window.requestAnimationFrame(step);
        setS(from + (target - from) * M.easeInOut(t), 'tween');
      } else {
        tween = 0;
        setS(target, 'tween');
        announce(describe());
      }
    }
    tween = window.requestAnimationFrame(step);
  }
  function describe() {
    var m = compute();
    return REGION_NAME[m.p.part] + ', ' + (ELEC_Y - m.p.y).toFixed(1) + ' mm below the electrodes. Recorded peak ' + formatPct(100 * m.Lmax / V_REF) + ' of a crown source. ' + summary(m);
  }
  function startOwn() {
    // "Your own" starts from the nearest contact as an anode, so it never opens with no current.
    if (state.pattern === 'own' && state.own.every(function (x) { return x === 0; })) state.own[nearestContact(M.at(fold, state.s))] = 1;
  }

  // A browser can bring back the pattern and position a visitor chose (Back without the
  // back/forward cache, a restored session) without firing change or input events. Applies what
  // the controls show; returns whether anything changed.
  function applyControls() {
    var pattern = state.pattern, moved = false;
    if (slider && slider.value !== sliderStep(state.s)) {
      state.s = sLo + (sHi - sLo) * Number(slider.value) / 1000;
      moved = true;
    }
    patternInputs.forEach(function (input) { if (input.checked) pattern = input.value; });
    if (pattern !== state.pattern) { state.pattern = pattern; startOwn(); moved = true; }
    return moved;
  }

  /* ---------- Controls ---------- */
  if (slider) {
    slider.addEventListener('input', function () {
      if (!ready()) return;
      cancelTween();
      setS(sLo + (sHi - sLo) * Number(slider.value) / 1000, 'slider');
      announce(describe());
    });
    // A thumb dragged by pointer is a drag; keys move it a step at a time and settle at once.
    slider.addEventListener('pointerdown', function () { dragging.slider = true; });
    var sliderDone = function () { if (dragging.slider) { dragging.slider = false; if (inited) settle(); } };
    slider.addEventListener('change', sliderDone);
    window.addEventListener('pointerup', sliderDone);
    window.addEventListener('pointercancel', sliderDone);
  }
  presetButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      if (!ready()) return;
      var target = PRESETS[button.getAttribute('data-preset')];
      if (typeof target === 'number') tweenTo(target);
    });
  });
  patternInputs.forEach(function (input) {
    input.addEventListener('change', function () {
      if (!input.checked || !ready()) return;
      state.pattern = input.value;
      startOwn();
      changed();
      announce(describe());
    });
  });
  if (resetButton) resetButton.addEventListener('click', function () {
    if (!ready()) return;
    state.pattern = 'playback';
    state.own = CONTACTS.map(function () { return 0; });
    patternInputs.forEach(function (input) { input.checked = input.value === 'playback'; });
    tweenTo(PRESETS.wall);
    changed();
  });

  // Dragging the patch: from either view's handle, which alone takes touch-action: none. On the
  // canvases a tap moves the patch there on release, if the pointer has not moved more than a
  // few pixels: a vertical swipe stays a page scroll (the canvases keep pan-y), and the browser
  // cancels the pointer when it takes the swipe.
  var SLOP = 8;
  function toModel(v, event) {
    var rect = v.canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / v.k + v.x0, y: Y_TOP - (event.clientY - rect.top) / v.k };
  }
  Object.keys(views).forEach(function (name) {
    var v = views[name], tap = null;
    if (v.handle) {
      v.handle.addEventListener('pointerdown', function (event) {
        if ((event.button !== undefined && event.button > 0) || !ready()) return;
        event.preventDefault();
        cancelTween();
        dragging.handle = true;
        v.handle.classList.add('is-dragging');
        document.documentElement.classList.add('is-dragging-source');   // no text selection mid-drag
        try { v.handle.setPointerCapture(event.pointerId); } catch (e) { /* capture is a nicety */ }
      });
      v.handle.addEventListener('pointermove', function (event) {
        if (!dragging.handle || !v.handle.classList.contains('is-dragging')) return;
        var pt = toModel(v, event);
        setS(M.nearest(fold, pt.x, pt.y, sLo, sHi).s, 'drag');
      });
      var end = function () {
        if (!v.handle.classList.contains('is-dragging')) return;
        dragging.handle = false;
        v.handle.classList.remove('is-dragging');
        document.documentElement.classList.remove('is-dragging-source');
        settle();
        announce(describe());
      };
      v.handle.addEventListener('pointerup', end);
      v.handle.addEventListener('pointercancel', end);
      v.handle.addEventListener('lostpointercapture', end);
    }
    v.canvas.addEventListener('pointerdown', function (event) {
      tap = event.button !== undefined && event.button > 0 ? null : { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    v.canvas.addEventListener('pointermove', function (event) {
      if (tap && tap.id === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > SLOP) tap = null;
      if (event.pointerType !== 'mouse' || dragging.handle || !inited) return;
      var pt = toModel(v, event);
      v.canvas.style.cursor = M.nearest(fold, pt.x, pt.y, sLo, sHi).dist < 2.6 ? 'pointer' : '';
    });
    v.canvas.addEventListener('pointerup', function (event) {
      if (!tap || tap.id !== event.pointerId) return;
      tap = null;
      if (!ready()) return;
      var pt = toModel(v, event), hit = M.nearest(fold, pt.x, pt.y, sLo, sHi);
      if (hit.dist < 2.6) tweenTo(hit.s);
    });
    v.canvas.addEventListener('pointercancel', function () { tap = null; });
  });

  /* ---------- Setup, on first approach ---------- */
  // Colour keys, as painted: contacts black below 4% of the strongest, then the contact curve;
  // the push from 1% to 100% of one contact over a crown, on a log scale.
  function paintKey(el, color) {
    if (!el) return;
    var stops = [];
    for (var i = 0; i <= 20; i++) stops.push(rgb(color(i / 10 - 1)) + ' ' + (i * 5) + '%');
    el.style.backgroundImage = 'linear-gradient(90deg, ' + stops.join(', ') + ')';
  }
  function layout() {
    var a = layoutView(views.record), b = layoutView(views.stim);
    if (a && b) { layoutPads(); render(); }
  }
  var inited = false;
  function ready() { if (!inited) init(); return inited; }
  function init() {
    if (inited) return;
    inited = true;
    buildModel();
    state.s = PRESETS.wall;
    grain = makeGrain();
    views.record.ctx = views.record.canvas.getContext('2d');
    views.stim.ctx = views.stim.canvas.getContext('2d');
    buildContactControls();
    paintKey(fig.querySelector('[data-ramp="contacts"]'), function (x) { return Math.abs(x) > CONTACT_OFF ? contactRGB(x, Math.abs(x)) : [0, 0, 0]; });
    paintKey(fig.querySelector('[data-ramp="push"]'), function (x) { return M.activityMap(x, 0.1 + 0.9 * Math.abs(x)); });
    applyControls();
    if (slider) slider.value = sliderStep(state.s);
    updateText();
    layout();
    if ('ResizeObserver' in window) {
      var pending = 0;
      var ro = new ResizeObserver(function () {
        if (pending) return;
        pending = window.requestAnimationFrame(function () {
          pending = 0;
          // Only a new width changes the drawing: the first report, and the stages' own new height, do not.
          if (Math.round(views.record.canvas.getBoundingClientRect().width) !== views.record.W ||
              Math.round(views.stim.canvas.getBoundingClientRect().width) !== views.stim.W) layout();
        });
      });
      ro.observe(views.record.stage);
      ro.observe(views.stim.stage);
    } else {
      window.addEventListener('resize', layout);
    }
    if ('IntersectionObserver' in window) {
      var first = true;
      new IntersectionObserver(function (entries) {
        flow.visible = entries[entries.length - 1].isIntersecting;
        if (!flow.visible) return;
        if (first) { first = false; kickFlow(); }   // one round of pulses when the figure first comes into view
        else if (!flow.id && window.performance.now() < flow.until) flow.id = window.requestAnimationFrame(flowStep);
      }).observe(views.stim.canvas);
    } else {
      flow.visible = true;
    }
    var onMotion = function () { if (reduceMotion.matches) stopFlow(); };
    if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', onMotion);
    else if (reduceMotion.addListener) reduceMotion.addListener(onMotion);
    // Labels drawn before the web fonts arrive are drawn again once they have (by the time the
    // figure is first approached they usually have, and there is nothing to redraw).
    if (document.fonts && document.fonts.ready && document.fonts.status !== 'loaded') document.fonts.ready.then(requestRender);
  }
  // The fold, the caches and the canvases are built when the figure comes within about 800 px of
  // the viewport, not at load; a control used before then builds them first.
  if ('IntersectionObserver' in window) {
    var approach = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) { approach.disconnect(); init(); return; }
      }
    }, { rootMargin: '800px 0px' });
    approach.observe(fig);
  } else {
    init();
  }
  // Chromium restores the controls after load, just before pageshow. A built figure takes them up
  // at once. One not built yet is built now if they differ from those in the HTML, so that its
  // words and value text agree with them before it comes near; untouched, it waits as before.
  window.addEventListener('pageshow', function () {
    if (inited) { if (applyControls()) changed(); return; }
    var restored = (slider && slider.value !== slider.defaultValue) ||
      patternInputs.some(function (input) { return input.checked !== input.defaultChecked; });
    if (restored) init();
  });
})();
