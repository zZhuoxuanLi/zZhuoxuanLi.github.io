/* Directions: the loop of a brain–computer interface
   ------------------------------------------------------------------
   Draws the loop in section #next from the words in index.html, so the copy
   lives in one place: the points from the list in .loop-stage, each
   direction's name, time word and link name from its li[data-arc], and the
   record of my work from the "Built on" links (data-at puts a mark for that
   piece of work on its part of the loop; data-mark="current" fills it).
   Reading runs clockwise over the top (brain, electrodes, decoder, output),
   writing comes back along the bottom (sensors, encoder, stimulation,
   brain), and a chord across the middle is feedback through the person's
   own eyes and ears.

   Each part of the loop is a link to its direction. The loop stresses one
   part at a time, by stroke width and label colour only, so nothing on it
   fades: the part under the pointer, else the one holding keyboard focus,
   else (on wide screens, where the loop stays beside the list) the
   direction being read. Hovering or focusing a "Built on" link lights its
   mark; clicking a mark goes to that piece of work.

   Colours are CSS tokens, so a theme change needs no redraw. The loop is
   redrawn only when its width changes, when the window's height changes
   while the loop is sticky (it is sized to fit), and once the web fonts
   load (label widths set the ring's size). Nothing runs while idle.
   A schematic, not data. */
(function () {
  'use strict';

  var section = document.getElementById('next');
  if (!section) return;

  /* ---------- Questions fold on phones ----------
     The HTML leaves them open, so without scripts everything shows. Below 640px they fold on
     load, which keeps the four directions to a short scroll, and a tap opens each. They fold
     at once: is-instant holds back the opening animation until two frames have passed. */
  if (window.matchMedia('(max-width: 639.98px)').matches) {
    var folded = Array.prototype.slice.call(section.querySelectorAll('details[data-questions]'));
    folded.forEach(function (d) { d.classList.add('is-instant'); d.open = false; });
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        folded.forEach(function (d) { d.classList.remove('is-instant'); });
      });
    });
  }

  var fig = section.querySelector('[data-loop]');
  var stage = fig && fig.querySelector('[data-loop-stage]');
  var pointList = stage && stage.querySelector('[data-loop-points]');
  if (!pointList) return;

  var NS = 'http://www.w3.org/2000/svg';
  var DEG = Math.PI / 180;
  var PAD = 10;        // room kept between a label and the drawing's edge
  var GAP = 8;         // from a point's circle to its label
  var R_MAX = 190;     // the ring stops growing here; beyond it the drawing just centres
  var R_MIN = 72;
  var wide = window.matchMedia('(min-width: 1000px)');

  // Each part of the loop: its arcs, clockwise from a0 down to a1 in degrees (counterclockwise
  // from the right, as in maths), and the points it passes. "close" also owns the chord from
  // the world back to the brain. "write" takes two arcs: one half-circle arc is ambiguous in SVG.
  var PARTS = {
    read: { arcs: [[180, 135]], points: [0, 1] },
    decode: { arcs: [[135, 45]], points: [1, 2, 3] },
    close: { arcs: [[45, 0]], chord: true, points: [3, 4, 0] },
    write: { arcs: [[0, -90], [-90, -180]], points: [4, 5, 6, 7, 0] }
  };
  var ORDER = ['read', 'decode', 'close', 'write'];

  // The points, from the list: each 45 degrees clockwise of the one before, from the brain on
  // the left. A point's name is the item's own text; its sub-label, the span inside.
  var points = Array.prototype.map.call(pointList.children, function (li, i) {
    var name = '', sub = li.querySelector('span');
    for (var n = li.firstChild; n; n = n.nextSibling) if (n.nodeType === 3) name += n.nodeValue;
    return { a: 180 - 45 * i, name: name.trim(), sub: sub ? sub.textContent.trim() : '' };
  });
  if (points.length !== 8 || !document.createElementNS || !window.SVGElement) {
    // The parts assume eight points: otherwise the list stays, as text.
    pointList.style.display = 'flex';
    stage.classList.add('is-drawn');
    return;
  }

  // The directions, from their list items.
  var rows = [], dirs = {};
  Array.prototype.forEach.call(section.querySelectorAll('li[data-arc]'), function (li) {
    var key = li.getAttribute('data-arc');
    if (!PARTS[key] || dirs[key]) return;
    rows.push(li);
    dirs[key] = {
      id: li.id,
      name: li.getAttribute('data-name') || '',
      when: li.getAttribute('data-when') || '',
      label: li.getAttribute('data-arc-label') || li.getAttribute('data-name') || '',
      via: li.getAttribute('data-via') || '',
      long: li.hasAttribute('data-long')
    };
  });

  // The record: one mark per "Built on" link that names its part of the loop (data-at).
  // Any link to the same entry lights that mark, so a project cited under a second direction
  // points back to where it sits on the loop.
  var marks = [], markByHref = {};
  var workLinks = Array.prototype.slice.call(section.querySelectorAll('a[data-mark]'));
  workLinks.forEach(function (a) {
    var at = a.getAttribute('data-at'), href = a.getAttribute('href');
    if (!at || !PARTS[at] || !href || markByHref[href]) return;
    var m = { at: at, href: href, label: a.getAttribute('data-label') || a.textContent,
      current: a.getAttribute('data-mark') === 'current', node: null, x: 0, y: 0, lit: 0 };
    marks.push(m);
    markByHref[href] = m;
  });
  workLinks.forEach(function (a) {
    var m = markByHref[a.getAttribute('href')];
    if (!m) return;
    // Touch has no hover: a tap on a link just follows it.
    a.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') light(m, true); });
    a.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') light(m, false); });
    a.addEventListener('focus', function () { light(m, true); });
    a.addEventListener('blur', function () { light(m, false); });
  });

  /* ---------- Geometry ---------- */
  function el(name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs.hasOwnProperty(k) && attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }
  function f(v) { return Math.round(v * 100) / 100; }   // two decimals keep the paths short
  function pt(g, a, r) { return [g.cx + r * Math.cos(a * DEG), g.cy - r * Math.sin(a * DEG)]; }
  // Clockwise on screen from angle a0 down to a1.
  function arcPath(g, a0, a1) {
    var p0 = pt(g, a0, g.R), p1 = pt(g, a1, g.R);
    return 'M' + f(p0[0]) + ' ' + f(p0[1]) + 'A' + f(g.R) + ' ' + f(g.R) + ' 0 ' + (a0 - a1 > 180 ? 1 : 0) + ' 1 ' + f(p1[0]) + ' ' + f(p1[1]);
  }
  function partPath(g, key) {
    var part = PARTS[key];
    var d = part.arcs.map(function (s) { return arcPath(g, s[0], s[1]); }).join('');
    if (part.chord) d += 'M' + f(g.cx + g.R) + ' ' + f(g.cy) + 'H' + f(g.cx - g.R);
    return d;
  }
  // A small arrowhead with its tip at (x, y), pointing along (ux, uy).
  function chevron(x, y, ux, uy, s) {
    var bx = x - ux * s, by = y - uy * s, px = -uy * s * 0.75, py = ux * s * 0.75;
    return 'M' + f(bx + px) + ' ' + f(by + py) + 'L' + f(x) + ' ' + f(y) + 'L' + f(bx - px) + ' ' + f(by - py);
  }
  // Where the marks of one part sit. On an arc, each takes the middle of the free stretch between
  // two neighbours on the ring (a point's circle, the larger brain, an arrowhead), in reading
  // order; on the chord, even steps from the world toward the middle. Never on a point.
  function markPlaces(g, key, n) {
    var out = [], i;
    if (!n) return out;
    if (PARTS[key].chord) {
      for (i = 0; i < n; i++) out.push([g.cx + g.R * (1 - (i + 1) / (n + 1)), g.cy]);
      return out;
    }
    var a0 = PARTS[key].arcs[0][0], a1 = PARTS[key].arcs[PARTS[key].arcs.length - 1][1];
    var slots = [], toDeg = 180 / Math.PI / g.R;
    for (var a = a0; a > a1; a -= 22.5) {
      // From a point (a multiple of 45 degrees) to an arrowhead, or the reverse; sizes in pixels.
      var r0 = a % 45 === 0 ? (Math.abs(a) === 180 ? 13 : 5.5) : 5, r1 = a % 45 === 0 ? 5 : (Math.abs(a - 22.5) === 180 ? 13 : 5.5);
      slots.push(a - (r0 + (22.5 / toDeg - r0 - r1) / 2) * toDeg);
    }
    for (i = 0; i < n; i++) {
      // More marks than places: share the part out evenly instead.
      var at = n <= slots.length ? slots[Math.round((i + 0.5) * slots.length / n - 0.5)] : a0 - (a0 - a1) * (i + 0.5) / n;
      out.push(pt(g, at, g.R));
    }
    return out;
  }

  /* ---------- Layout: label sizes set the ring ----------
     Labels are measured in a hidden copy of the drawing (same classes, so the same fonts), and
     the ring takes the largest radius that keeps every label on the drawing. A long sub-label
     wraps to two lines rather than shrink the ring. A sticky loop also fits the window's height. */
  var meter = null;
  function measure(cls, text) {
    if (!text) return 0;
    var t = el('text', { class: cls }, meter);
    t.textContent = text;
    var w = t.getComputedTextLength();
    meter.removeChild(t);
    return w;
  }
  function sizeOf(cls) {
    var t = el('text', { class: cls }, meter);
    t.textContent = 'x';
    var s = parseFloat(window.getComputedStyle(t).fontSize) || 12;
    meter.removeChild(t);
    return s;
  }
  // Two lines from one: at the " · " that joins two items, else at the space nearest the middle.
  function split(text) {
    var dot = text.indexOf(' · ');
    if (dot > 0) return [text.slice(0, dot), text.slice(dot + 3)];
    var mid = text.length / 2, best = -1;
    for (var i = 0; i < text.length; i++) {
      if (text.charAt(i) === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
    }
    return best < 0 ? [text] : [text.slice(0, best), text.slice(best + 1)];
  }
  function isSticky() { return window.getComputedStyle(fig).position === 'sticky'; }

  function layout(W) {
    var mode = W < 360 ? 'is-tiny' : W < 480 ? 'is-narrow' : '';
    meter.setAttribute('class', 'lp-meter ' + mode);
    var sz = { point: sizeOf('lp-point'), sub: sizeOf('lp-sub'), name: sizeOf('lp-name'), when: sizeOf('lp-when'), via: sizeOf('lp-via') };
    // Phones keep one line per part inside the ring: there the dash, the key and each direction's
    // own heading give the time. The smallest also drop the points' sub-labels.
    var showSub = mode !== 'is-tiny', showWhen = !mode;

    var labels = points.map(function (p, i) {
      var dx = Math.cos(p.a * DEG), dy = -Math.sin(p.a * DEG);
      return {
        r: i === 0 ? 13 : 5.5,      // the brain is drawn larger
        dx: Math.abs(dx) < 1e-9 ? 0 : dx, dy: Math.abs(dy) < 1e-9 ? 0 : dy,
        anchor: dx > 0.35 ? 'start' : dx < -0.35 ? 'end' : 'middle',
        lines: [{ text: p.name, cls: 'lp-point', size: sz.point, w: measure('lp-point', p.name) }],
        sub: showSub ? p.sub : ''
      };
    });
    function widest(lines) { var w = 0; lines.forEach(function (l) { w = Math.max(w, l.w); }); return w; }
    // The largest radius at which a label stays on the drawing, given its lines.
    function fitR(lab, lines) {
      if (lab.anchor === 'middle') return Infinity;
      return (W / 2 - PAD - widest(lines)) / Math.abs(lab.dx) - (lab.r + GAP);
    }
    var R = R_MAX;
    labels.forEach(function (lab) { R = Math.min(R, fitR(lab, lab.lines)); });
    labels.forEach(function (lab) {
      if (!lab.sub) return;
      var one = [{ text: lab.sub, cls: 'lp-sub', size: sz.sub, w: measure('lp-sub', lab.sub) }];
      if (fitR(lab, lab.lines.concat(one)) < R - 0.5) {
        one = split(lab.sub).map(function (s) { return { text: s, cls: 'lp-sub', size: sz.sub, w: measure('lp-sub', s) }; });
      }
      lab.lines = lab.lines.concat(one);
    });
    labels.forEach(function (lab) { R = Math.min(R, fitR(lab, lab.lines)); });
    // A sub-label wrapped only for a radius another label has since ruled out goes back to one line.
    labels.forEach(function (lab) {
      if (lab.lines.length < 3) return;
      var one = [{ text: lab.sub, cls: 'lp-sub', size: sz.sub, w: measure('lp-sub', lab.sub) }];
      if (fitR(lab, [lab.lines[0]].concat(one)) >= R - 0.5) lab.lines = [lab.lines[0]].concat(one);
    });

    // Each label is a block of lines: above an upper point, below a lower one, centred beside
    // a point on the sides. Baselines sit 0.78 of a line's size below its top.
    labels.forEach(function (lab) {
      var h = 0;
      lab.lines.forEach(function (l, k) { l.top = h; h += l.size * (k === lab.lines.length - 1 ? 1 : 1.3); });
      lab.h = h;
    });
    function extents(Rt) {
      var top = Rt + 10, bottom = Rt + 10;   // room for the marks and a focus ring on the ring itself
      labels.forEach(function (lab) {
        var by = lab.dy * (Rt + lab.r + GAP);
        var t = lab.dy < -0.35 ? by - lab.h : lab.dy > 0.35 ? by : by - lab.h / 2;
        top = Math.max(top, -t);
        bottom = Math.max(bottom, t + lab.h);
      });
      return { top: Math.ceil(top + 4), bottom: Math.ceil(bottom + 4) };
    }
    R = Math.max(R_MIN, R);
    var ext = extents(R);
    if (isSticky()) {
      // Fit the whole figure under the sticky header: title, drawing, key and caption.
      var others = fig.getBoundingClientRect().height - stage.getBoundingClientRect().height;
      var room = window.innerHeight - (parseFloat(window.getComputedStyle(fig).top) || 0) - others - 16;
      for (var k = 0; k < 3 && ext.top + ext.bottom > room && R > R_MIN; k++) {
        R = Math.max(R_MIN, R - (ext.top + ext.bottom - room) / 2);
        ext = extents(R);
      }
    }
    R = Math.round(R * 2) / 2;
    ext = extents(R);
    return { W: W, H: ext.top + ext.bottom, cx: W / 2, cy: ext.top, R: R, mode: mode, sz: sz, labels: labels, showWhen: showWhen };
  }

  /* ---------- The drawing ---------- */
  var svg = null, geom = null, tip = null, tipFor = null;

  function text(parent, cls, x, y, anchor, s, extra) {
    var attrs = { class: cls, x: f(x), y: f(y), 'text-anchor': anchor };
    for (var k in extra) if (extra.hasOwnProperty(k)) attrs[k] = extra[k];
    var t = el('text', attrs, parent);
    t.textContent = s;
    return t;
  }

  function draw() {
    var W = Math.round(stage.getBoundingClientRect().width);
    if (!W) return;
    if (!meter) {
      meter = el('svg', { class: 'lp-meter', 'aria-hidden': 'true', focusable: 'false' });
      stage.appendChild(meter);
    }
    var g = layout(W), R = g.R, cx = g.cx, cy = g.cy;
    // A part's link that holds keyboard focus keeps it across the redraw.
    var held = document.activeElement;
    var refocus = svg && svg.contains(held) && held.classList.contains('lp-link') ? held.getAttribute('data-h') : null;

    var next = el('svg', { class: ('lp ' + g.mode).trim(), width: g.W, height: g.H, viewBox: '0 0 ' + g.W + ' ' + g.H,
      role: 'group', 'aria-label': stage.getAttribute('data-label') });

    // The ring, and the dotted tie: recording and stimulation, which one model of the head describes.
    var base = el('g', { 'aria-hidden': 'true' }, next);
    el('circle', { class: 'lp-ring', cx: f(cx), cy: f(cy), r: R }, base);
    var tieX = cx - R * Math.SQRT1_2;
    el('path', { class: 'lp-tie', d: 'M' + f(tieX) + ' ' + f(cy - R * Math.SQRT1_2 + 10) + 'V' + f(cy + R * Math.SQRT1_2 - 10) }, base);

    // Each part: a link holding a wide hit stroke, the focus ring (drawn only on keyboard focus),
    // the arc, and the part's name and time word inside the ring.
    var sz = g.sz, via = dirs.close ? dirs.close.via : '';
    var viaW = measure('lp-via', via), viaX = Math.max((tieX + cx) / 2, tieX + 6 + viaW / 2);
    ORDER.forEach(function (key) {
      var dir = dirs[key];
      if (!dir) return;
      var d = partPath(g, key);
      var a = el('a', { class: 'lp-link', href: '#' + dir.id, 'aria-label': dir.label, 'data-h': key }, next);
      el('path', { class: 'lp-hit', d: d }, a);
      el('path', { class: 'lp-halo', d: d }, a);
      el('path', { class: 'lp-halo-gap', d: d }, a);
      el('path', { class: 'lp-arc' + (dir.long ? ' is-long' : ''), d: d, 'data-h': key }, a);

      var when = g.showWhen ? dir.when : '';
      var nameW = measure('lp-name', dir.name), half = Math.max(nameW, measure('lp-when', when)) / 2;
      var lineGap = sz.when * 1.3, x, y;
      if (key === 'read') {
        // Higher than the close label across the ring, so the two never read as one line.
        x = Math.max(cx - 0.47 * R, tieX + 8 + half);
        y = cy - 0.36 * R;
      } else if (key === 'decode') {
        x = cx;
        y = cy - 0.58 * R;
      } else if (key === 'close') {
        // Above the chord, clear of its marks, and inside the ring.
        y = cy - 13 - (when ? lineGap : 0);
        var rise = cy - (y - sz.name * 0.78);   // the label's top, above the chord
        x = Math.min(cx + 0.45 * R, cx + Math.sqrt(Math.max(0, R * R - rise * rise)) - 10 - half);
      } else {
        x = cx;
        y = cy + 0.5 * R;
      }
      var lg = el('g', { class: 'lp-label', 'data-h': key, 'aria-hidden': 'true' }, a);
      text(lg, 'lp-name', x, y, 'middle', dir.name);
      if (when) text(lg, 'lp-when', x, y + lineGap, 'middle', when);
      if (key === 'close' && via) text(lg, 'lp-via', viaX, cy + 5 + sz.via, 'middle', via, { 'data-h': key });
    });

    // Direction of travel: an arrowhead between each pair of points, and one on the chord.
    var chev = el('g', { class: 'lp-chevs', 'aria-hidden': 'true' }, next);
    for (var k = 0; k < 8; k++) {
      var mid = 157.5 - 45 * k, p = pt(g, mid, R), ux = Math.sin(mid * DEG), uy = Math.cos(mid * DEG);
      var owner = mid > 135 ? 'read' : mid > 45 ? 'decode' : mid > 0 ? 'close' : 'write';
      if (dirs[owner]) el('path', { class: 'lp-chev', d: chevron(p[0] + ux * 3, p[1] + uy * 3, ux, uy, 5), 'data-h': owner }, chev);
    }
    if (dirs.close) el('path', { class: 'lp-chev', d: chevron(viaX - 3, cy, -1, 0, 5), 'data-h': 'close' }, chev);

    // The points: open circles, the brain in the contour colours (pial ring, white-matter core).
    var dots = el('g', { class: 'lp-points', 'aria-hidden': 'true' }, next);
    g.labels.forEach(function (lab, i) {
      var p = pt(g, points[i].a, R);
      el('circle', { class: 'lp-node', cx: f(p[0]), cy: f(p[1]), r: lab.r, 'data-p': i }, dots);
      if (i === 0) {
        el('circle', { class: 'lp-brain-pial', cx: f(p[0]), cy: f(p[1]), r: 8.5 }, dots);
        el('circle', { class: 'lp-brain-wm', cx: f(p[0]), cy: f(p[1]), r: 4.5 }, dots);
      }
      var bx = p[0] + lab.dx * (lab.r + GAP), by = p[1] + lab.dy * (lab.r + GAP);
      var topY = lab.dy < -0.35 ? by - lab.h : lab.dy > 0.35 ? by : by - lab.h / 2;
      lab.lines.forEach(function (l) {
        text(dots, l.cls, bx, topY + l.top + l.size * 0.78, lab.anchor, l.text, l.cls === 'lp-point' ? { 'data-p': i } : null);
      });
    });

    // The record: a mark on its part of the loop for each piece of work, as a contact sits on a
    // strip. Pointer only: the same links are in the list below, for keyboards and screen readers.
    var rec = el('g', {}, next);
    ORDER.forEach(function (key) {
      var mine = marks.filter(function (m) { return m.at === key; });
      var places = markPlaces(g, key, mine.length);
      mine.forEach(function (m, i) {
        m.x = places[i][0];
        m.y = places[i][1];
        var a = el('a', { class: 'lp-mark' + (m.lit ? ' is-lit' : ''), href: m.href, tabindex: '-1', 'aria-hidden': 'true', 'data-h': key }, rec);
        el('circle', { class: 'lp-mark-hit', cx: f(m.x), cy: f(m.y), r: 13 }, a);
        el('circle', { class: 'lp-mark-ring', cx: f(m.x), cy: f(m.y), r: 7.5 }, a);
        el('circle', { class: 'lp-mark-halo', cx: f(m.x), cy: f(m.y), r: 10.5 }, a);
        el('circle', { class: 'lp-mark-dot' + (m.current ? ' is-current' : ''), cx: f(m.x), cy: f(m.y), r: 4.5 }, a);
        m.node = a;
        a.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') { light(m, true); setHover(key); } });
        a.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') { light(m, false); setHover(null); } });
        // The page scrolls away to the entry under a still pointer, which may send no leave.
        a.addEventListener('click', function () { m.lit = 1; light(m, false); setHover(null); });
      });
    });

    // Hover and focus on the parts (bound to this drawing's links).
    Array.prototype.forEach.call(next.querySelectorAll('.lp-link'), function (a) {
      var key = a.getAttribute('data-h');
      a.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') setHover(key); });
      a.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') setHover(null); });
      a.addEventListener('focus', function () { setFocus(key); });
      a.addEventListener('blur', function () { setFocus(null); });
    });

    if (svg) stage.replaceChild(next, svg); else stage.insertBefore(next, meter);
    svg = next;
    geom = g;
    stage.classList.add('is-drawn');
    if (refocus) {
      var again = svg.querySelector('.lp-link[data-h="' + refocus + '"]');
      if (again) again.focus({ preventScroll: true });
    }
    apply();
    if (tipFor) showTip(tipFor);
  }

  /* ---------- Tooltip for a mark ---------- */
  function showTip(m) {
    if (!geom || !m.node) return;
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'lp-tip';
      tip.setAttribute('aria-hidden', 'true');
      stage.appendChild(tip);
    }
    tip.textContent = m.label;
    tip.hidden = false;
    // Toward the ring's open middle, so it never covers the points' labels outside.
    tip.classList.toggle('is-below', m.y <= geom.cy + 1);
    var half = tip.offsetWidth / 2;
    tip.style.left = Math.max(half + 4, Math.min(geom.W - half - 4, m.x)) + 'px';
    tip.style.top = m.y + 'px';
    tipFor = m;
  }
  function hideTip() {
    if (tip) tip.hidden = true;
    tipFor = null;
  }
  // Hover and focus can overlap on one mark, so lighting counts up and down.
  function light(m, on) {
    m.lit = Math.max(0, m.lit + (on ? 1 : -1));
    if (m.node) m.node.classList.toggle('is-lit', m.lit > 0);
    if (m.lit > 0) showTip(m);
    else if (tipFor === m) hideTip();
  }

  /* ---------- Which part is stressed: hover, else focus, else the direction being read ---------- */
  var hoverH = null, focusH = null, readH = null;
  function apply() {
    var h = hoverH || focusH || readH;
    if (h) fig.setAttribute('data-active', h); else fig.removeAttribute('data-active');
    if (svg) {
      Array.prototype.forEach.call(svg.querySelectorAll('[data-h]'), function (n) {
        n.classList.toggle('is-active', n.getAttribute('data-h') === h);
      });
      var on = h ? PARTS[h].points : [];
      Array.prototype.forEach.call(svg.querySelectorAll('[data-p]'), function (n) {
        n.classList.toggle('is-on', on.indexOf(+n.getAttribute('data-p')) >= 0);
      });
    }
    rows.forEach(function (li) { li.classList.toggle('is-active', li.getAttribute('data-arc') === h); });
  }
  function setHover(h) { if (h !== hoverH) { hoverH = h; apply(); } }
  function setFocus(h) { if (h !== focusH) { focusH = h; apply(); } }

  rows.forEach(function (li) {
    var key = li.getAttribute('data-arc');
    li.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') setHover(key); });
    li.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') setHover(null); });
    li.addEventListener('focusin', function () { setFocus(key); });
    li.addEventListener('focusout', function () { setFocus(null); });
  });

  // Wide screens: the loop sits beside the list and follows the direction crossing mid-window.
  // (Narrower, the loop is above the list and out of sight while it is read.)
  var inBand = {};
  function follow() {
    var current = null;
    if (wide.matches) ORDER.forEach(function (h) { if (inBand[h]) current = h; });
    if (current !== readH) { readH = current; apply(); }
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { inBand[e.target.getAttribute('data-arc')] = e.isIntersecting; });
      follow();
    }, { rootMargin: '-42% 0px -52% 0px' });
    rows.forEach(function (li) { io.observe(li); });
  }
  if (wide.addEventListener) wide.addEventListener('change', follow);
  else if (wide.addListener) wide.addListener(follow);

  /* ---------- Redraw on width changes, a sticky loop's window height, and loaded fonts ---------- */
  draw();
  var lastW = Math.round(stage.getBoundingClientRect().width), lastH = window.innerHeight, pending = 0;
  function schedule() {
    if (!pending) pending = window.requestAnimationFrame(function () { pending = 0; draw(); });
  }
  if ('ResizeObserver' in window) {
    new ResizeObserver(function () {
      var w = Math.round(stage.getBoundingClientRect().width);
      if (w !== lastW) { lastW = w; schedule(); }
    }).observe(stage);
  } else {
    window.addEventListener('resize', schedule);
  }
  // Only wide screens size the loop to the window's height; elsewhere a height change (a phone's
  // address bar sliding away) leaves it alone.
  window.addEventListener('resize', function () {
    if (window.innerHeight === lastH) return;
    lastH = window.innerHeight;
    if (wide.matches) schedule();
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
})();
