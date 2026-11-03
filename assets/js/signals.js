/* Experience: the signals each role worked with, by year
   ------------------------------------------------------------------
   Drawn from index.html alone, so the entries stay the one place to edit:
   - the rows, kinds of signal from outside the body to inside cortex, are the
     list in [data-signals-rows] (each sub-label in a span);
   - each role is an li.xp with data-signal (its rows' keys), data-from and
     data-to (YYYY-MM, or "now") and data-short (its bar's label).
   The axis runs from January of the first year listed to the end of the
   current year, and the "now" line and the current bars end at today's date,
   so nothing here goes stale. Each bar links to its entry in the list, which
   makes the chart an index rather than a second copy, and its accessible name
   gives the signal, the dates, the role and the place. Current roles are
   filled and earlier ones open, as the marks on the loop are.
   Labels never overlap: current roles place theirs first, then the longer
   bars, each trying above its bar, beside it, then below it (a row grows only
   when one needs that). A label with no free place is shown only while its
   bar is hovered or focused. Redrawn only when the width changes and when
   fonts load; nothing runs while idle. */
(function () {
  'use strict';

  var fig = document.querySelector('[data-signals]');
  var stage = fig && fig.querySelector('[data-signals-stage]');
  var rowList = stage && stage.querySelector('[data-signals-rows]');
  if (!rowList || !document.createElementNS || !window.SVGElement) return;
  var NS = 'http://www.w3.org/2000/svg';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function words(node) { return node ? node.textContent.replace(/\s+/g, ' ').trim() : ''; }

  // A month as a count of months (January 2023 is 2023 * 12), or null if it is not YYYY-MM.
  function month(s) {
    var m = /^(\d{4})-(\d{1,2})$/.exec(s || '');
    return m && +m[2] >= 1 && +m[2] <= 12 ? +m[1] * 12 + (+m[2] - 1) : null;
  }
  function monthName(t) { return MONTHS[t % 12] + ' ' + Math.floor(t / 12); }
  // Today on the same scale, to the day, so the line and the current bars move as the year does.
  function today() {
    var d = new Date(), days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getFullYear() * 12 + d.getMonth() + (d.getDate() - 0.5) / days;
  }

  /* ---------- Rows and bars, read once from the page ---------- */
  var rows = [], rowByKey = {}, bars = [];
  Array.prototype.forEach.call(rowList.querySelectorAll('li[data-row]'), function (li) {
    var name = Array.prototype.filter.call(li.childNodes, function (n) { return n.nodeType === 3; })
      .map(function (n) { return n.textContent; }).join(' ').replace(/\s+/g, ' ').trim();
    var row = { key: li.getAttribute('data-row'), name: name, sub: words(li.querySelector('span')), bars: [] };
    rows.push(row);
    rowByKey[row.key] = row;
  });

  Array.prototype.forEach.call(document.querySelectorAll('li.xp[data-signal]'), function (li) {
    var from = month(li.getAttribute('data-from'));
    var current = li.getAttribute('data-to') === 'now';
    var to = current ? null : month(li.getAttribute('data-to'));
    if (!li.id || from === null || (!current && (to === null || to < from))) return;
    var role = words(li.querySelector('.xp-role'));
    // The place is the first sentence of the entry's second line; the supervisors follow it.
    var place = words(li.querySelector('.xp-org')).split(/\.\s/)[0].replace(/\.$/, '');
    var short = li.getAttribute('data-short') || role;
    var when = current ? 'since ' + monthName(from)
      : from === to ? monthName(from)
      : Math.floor(from / 12) === Math.floor(to / 12) ? MONTHS[from % 12] + ' to ' + monthName(to)
      : monthName(from) + ' to ' + monthName(to);
    li.getAttribute('data-signal').split(/\s+/).forEach(function (key) {
      var row = rowByKey[key];
      if (!row) return;
      var bar = {
        id: li.id, row: row, from: from, to: to, current: current, short: short,
        name: row.name + (row.sub ? ' (' + row.sub + ')' : '') + ': ' + short + ', ' + when + '. ' +
          [role, place].filter(Boolean).join(', ') + '.'
      };
      row.bars.push(bar);
      bars.push(bar);
    });
  });
  if (!rows.length || !bars.length) return;

  // Roles on one row that meet, or share at most a month (May to August 2025, then August 2025 to
  // June 2026), take turns in one lane and meet halfway through the shared month. A role that
  // overlaps more takes a lane of its own below, so bars never cover each other.
  function pack(row, now) {
    var lanes = [];
    row.bars.sort(function (a, b) { return a.from - b.from; }).forEach(function (b) {
      b.s = b.from;
      b.e = b.current ? Math.max(now, b.from + 0.5) : b.to + 1;
      for (var i = 0; i < lanes.length; i++) {
        var last = lanes[i][lanes[i].length - 1];
        if (b.s >= last.e - 1 && b.e > last.e) {
          if (b.s < last.e) last.e = b.s = (b.s + last.e) / 2;
          b.lane = i;
          lanes[i].push(b);
          return;
        }
      }
      b.lane = lanes.length;
      lanes.push([b]);
    });
    row.lanes = Math.max(1, lanes.length);
    // Left to right in each lane: the order Tab takes through the bars.
    row.bars.sort(function (a, b) { return (a.lane - b.lane) || (a.s - b.s); });
  }

  /* ---------- Drawing ---------- */
  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function text(parent, cls, x, y, s) {
    var t = el('text', { class: cls, x: x, y: y }, parent);
    t.textContent = s;
    return t;
  }
  function crisp(x) { return Math.round(x) + 0.5; }   // a 1px line on a pixel, not across two

  // Vertical layout, in px. TOP leaves room for "now" over the rows; a row with one lane is ROW
  // tall (its name runs across its top on phones), each further lane adds LANE, and a label below
  // the last lane adds BELOW. BAR is the first lane's bar centre within its row; AXIS holds years.
  // Labels sit with their baseline 9px over a bar's centre, 4px under it when beside the bar, or
  // 16px under it when below. As a box, a label runs from 11px over its baseline to 4px under (the
  // font's full height), so labels on neighbouring lines that would touch count as overlapping.
  var TOP = 22, LANE = 24, BELOW = 14, AXIS = 26;
  var BASE = { above: -9, beside: 4, below: 16 };

  var svg = null, drawnW = 0;
  function draw() {
    var W = stage.getBoundingClientRect().width;
    if (!W) return;
    drawnW = W;
    var narrow = W < 600;   // phones: each row's name runs across its top, over the full width
    var ROW = narrow ? 52 : 48, BAR = narrow ? 40 : 30;
    var now = today();
    var t0 = Infinity, t1 = (Math.floor(now / 12) + 1) * 12;   // to the end of this year
    bars.forEach(function (b) {
      t0 = Math.min(t0, b.from);
      if (!b.current) t1 = Math.max(t1, Math.ceil((b.to + 1) / 12) * 12);   // or of a later end date
    });
    t0 = Math.floor(t0 / 12) * 12;                                         // from January of the first year
    rows.forEach(function (row) { pack(row, now); });

    var next = el('svg', { class: 'sg', width: W, height: 0, role: 'list' });
    if (svg && svg.parentNode) svg.parentNode.replaceChild(next, svg); else stage.appendChild(next);
    svg = next;

    // Measure first: the row names (on wide screens their column is as wide as the longest needs),
    // the bar labels and a year.
    var meter = el('g', { visibility: 'hidden' }, svg);
    function width(cls, s) { return text(meter, cls, 0, 0, s).getComputedTextLength(); }
    var x0 = 0;
    rows.forEach(function (row) {
      row.nameW = width('sg-row-name', row.name);
      row.subW = width('sg-row-sub', row.sub);
      x0 = Math.max(x0, row.nameW, row.subW);
    });
    bars.forEach(function (b) { b.w = width('sg-bar-label' + (b.current ? ' is-now' : ''), b.short); });
    var yearW = width('sg-year', '2000'), nowW = width('sg-now-label', 'now');
    svg.removeChild(meter);

    x0 = narrow ? 0 : Math.min(Math.ceil(x0) + 24, Math.round(W * 0.4));
    var x1 = W - 1, minX = x0;
    function X(t) { return x0 + (x1 - x0) * (t - t0) / (t1 - t0); }
    bars.forEach(function (b) {
      b.a0 = X(b.s) + 1.5;                                  // 3px apart where two roles meet
      b.a1 = b.current ? X(b.e) : X(b.e) - 1.5;             // a current role ends on the line
      b.a1 = Math.min(W, Math.max(b.a1, b.a0 + 6));
      b.cy = BAR + b.lane * LANE;                           // within its row, for now
    });

    // Labels, row by row, in the row's own coordinates. Bars take their boxes first; then current
    // roles place their labels, then the longer bars. Each tries over its bar from its start, then
    // to its end; then beside it on its line, before or after; then over it, slid along as far as
    // it still covers half the bar (or half the label); then the same three below the bar.
    rows.forEach(function (row) {
      var boxes = row.bars.map(function (b) { return { x0: b.a0, x1: b.a1, y0: b.cy - 4, y1: b.cy + 4, bar: true }; });
      row.below = false;
      function fits(b, x, where) {
        var base = b.cy + BASE[where];
        var box = { x0: x, x1: x + b.w, y0: base - 11, y1: base + 4, base: base };
        if (x < minX || box.x1 > W) return null;
        if (where === 'below' && b.lane !== row.lanes - 1) return null;   // only under the last lane
        var clash = boxes.some(function (p) {
          // A word space from labels on the same line, a little air from those on the next line.
          var gap = p.bar ? 5 : p.base === base ? 10 : 3;
          return p.x0 < box.x1 + gap && box.x0 < p.x1 + gap && p.y0 < box.y1 && box.y0 < p.y1;
        });
        return clash ? null : box;
      }
      function slide(b, where) {
        var keep = Math.min(b.w, b.a1 - b.a0) / 2;
        var lo = b.a0 - b.w + keep, hi = b.a1 - keep;
        for (var d = 0; d <= hi - lo; d += 2) {
          var box = (b.a0 - d >= lo && fits(b, b.a0 - d, where)) || (b.a0 + d <= hi && fits(b, b.a0 + d, where));
          if (box) return box;
        }
        return null;
      }
      row.bars.slice().sort(function (a, b) {
        return (b.current - a.current) || ((b.a1 - b.a0) - (a.a1 - a.a0)) || (a.s - b.s);
      }).forEach(function (b) {
        var box = fits(b, b.a0, 'above') || fits(b, b.a1 - b.w, 'above') ||
          fits(b, b.a0 - 6 - b.w, 'beside') || fits(b, b.a1 + 6, 'beside') || slide(b, 'above') ||
          fits(b, b.a0, 'below') || fits(b, b.a1 - b.w, 'below') || slide(b, 'below');
        b.box = box;
        if (box) {
          boxes.push(box);
          if (box.y0 > b.cy) row.below = true;
        }
      });
    });

    // Now the rows have their heights. On phones every row keeps room for a label below its bars:
    // the rows read as equals, and the chart's height does not change when the fonts arrive and
    // the labels move (which would shift whatever a link has just scrolled to).
    var y = TOP;
    rows.forEach(function (row) { row.y = y; y += ROW + (row.lanes - 1) * LANE + (narrow || row.below ? BELOW : 0); row.end = y; });
    var bottom = y, H = Math.ceil(bottom + AXIS);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    var grid = el('g', { 'aria-hidden': 'true' }, svg);
    // Years: a line at each January, and a label where there is room for one (every other year, or
    // fewer, once the axis is long for the width).
    var yearPx = (x1 - x0) * 12 / (t1 - t0), step = 1;
    while (step * yearPx < yearW + 10) step++;
    for (var yr = t0 / 12; yr <= t1 / 12; yr++) {
      var gx = crisp(X(yr * 12));
      el('line', { class: 'sg-grid', x1: gx, x2: gx, y1: TOP, y2: bottom }, grid);
      if (yr < t1 / 12 && (yr - t0 / 12) % step === 0) text(grid, 'sg-year', gx + 3.5, bottom + 17, String(yr));
    }
    rows.forEach(function (row) {
      var ry = crisp(row.end) - 1;
      el('line', { class: 'sg-rule', x1: narrow ? 0 : x0, x2: W, y1: ry, y2: ry }, grid);
      if (narrow) {
        text(grid, 'sg-row-name', 0, row.y + 15, row.name);
        // The sub-label follows the name if it fits; it is in each bar's name either way.
        if (row.nameW + 8 + row.subW <= W) text(grid, 'sg-row-sub', row.nameW + 8, row.y + 15, row.sub);
      } else {
        var mid = row.y + BAR + (row.lanes - 1) * LANE / 2;
        text(grid, 'sg-row-name', 0, mid - 5, row.name);
        text(grid, 'sg-row-sub', 0, mid + 10, row.sub);
      }
    });
    // Today: a line in the contour colour, named over the rows.
    var nx = crisp(X(now));
    el('line', { class: 'sg-now', x1: nx, x2: nx, y1: TOP - 4, y2: bottom + 4 }, grid);
    text(grid, 'sg-now-label', Math.max(minX, Math.min(W - nowW, nx - nowW / 2)), TOP - 8, 'now');

    // Bars, row by row and left to right. Each is a link to its entry. The pointer finds it on its
    // bar and on its label, each with a margin smaller than the gaps kept around them, so no link
    // reaches over another's bar; the focus ring takes in both and lets the pointer through.
    var links = [];
    rows.forEach(function (row) {
      row.bars.forEach(function (b) {
        var cy = row.y + b.cy;
        var item = el('g', { role: 'listitem' }, svg);
        var link = el('a', { class: 'sg-link', href: '#' + b.id, 'aria-label': b.name }, item);
        var l = b.a0, r = b.a1, top = cy - 4, btm = cy + 4;
        if (b.box) {
          l = Math.min(l, b.box.x0); r = Math.max(r, b.box.x1);
          top = Math.min(top, row.y + b.box.y0); btm = Math.max(btm, row.y + b.box.y1);
        }
        l = Math.max(1, l - 3); r = Math.min(W - 1, r + 3);
        el('rect', { class: 'sg-ring', x: l, y: top - 3, width: r - l, height: btm - top + 6, rx: 3 }, link);
        el('rect', { class: 'sg-hit', x: b.a0 - 1, y: cy - 5, width: b.a1 - b.a0 + 2, height: 10 }, link);
        if (b.box) el('rect', { class: 'sg-hit', x: b.box.x0 - 1, y: row.y + b.box.y0, width: b.box.x1 - b.box.x0 + 2, height: b.box.y1 - b.box.y0 }, link);
        el('rect', { class: 'sg-bar' + (b.current ? ' is-now' : ''), x: b.a0, y: cy - 4, width: b.a1 - b.a0, height: 8, rx: 4 }, link);
        var cls = 'sg-bar-label' + (b.current ? ' is-now' : '');
        if (b.box) {
          text(link, cls, b.box.x0, row.y + b.box.base, b.short);
        } else {
          // No free place: shown over the chart while the bar is hovered or focused.
          link.classList.add('is-tucked');
          text(link, cls, Math.max(minX, Math.min(W - b.w, b.a0)), cy + BASE.above, b.short);
        }
        links.push({ link: link, b: b, cy: cy });
      });
    });

    // The overlay for a tucked label, drawn last so that it covers what is under it.
    var pop = el('g', { class: 'sg-pop', 'aria-hidden': 'true', visibility: 'hidden' }, svg);
    var popBg = el('rect', { class: 'sg-pop-bg', rx: 2 }, pop);
    var popText = text(pop, 'sg-bar-label', 0, 0, '');
    showLabel = function (link) {
      var hit = null;
      links.forEach(function (o) { if (o.link === link) hit = o; });
      if (!hit || !link.classList.contains('is-tucked')) { pop.setAttribute('visibility', 'hidden'); return; }
      var b = hit.b, s = b.short, w = b.w;
      if (w > W - 8) {   // wider than the chart: cut to fit (the link's name keeps it whole)
        var n = Math.max(1, Math.floor((W - 8) / (w / s.length)) - 1);
        s = s.slice(0, n).replace(/\s+$/, '') + '…';
        w = W - 8;
      }
      var x = Math.max(4, Math.min(W - w - 4, b.a0)), base = hit.cy + BASE.above;
      popText.textContent = s;
      popText.setAttribute('class', 'sg-bar-label' + (b.current ? ' is-now' : ''));
      popText.setAttribute('x', x);
      popText.setAttribute('y', base);
      popBg.setAttribute('x', x - 4);
      popBg.setAttribute('y', base - 13);
      popBg.setAttribute('width', popText.getComputedTextLength() + 8);
      popBg.setAttribute('height', 18);
      pop.setAttribute('visibility', 'visible');
    };

    rowList.hidden = true;   // the drawing stands in for the list from here
    stage.classList.add('is-drawn');
  }

  // A tucked label shows while its bar is hovered or focused. The listeners sit on the stage, not
  // the <svg>: Chrome gives an SVG element with focus listeners a Tab stop of its own.
  var showLabel = function () {};
  function linkOf(event) { return event.target.closest ? event.target.closest('.sg-link') : null; }
  stage.addEventListener('mouseover', function (event) { showLabel(linkOf(event)); });
  stage.addEventListener('mouseleave', function () { showLabel(null); });
  stage.addEventListener('focusin', function (event) { showLabel(linkOf(event)); });
  stage.addEventListener('focusout', function () { showLabel(null); });

  draw();
  var pending = 0;
  function redraw() {
    if (pending) return;
    pending = window.requestAnimationFrame(function () { pending = 0; draw(); });
  }
  if ('ResizeObserver' in window) {
    // Only a new width changes the drawing; its own change of height comes back here and stops.
    new ResizeObserver(function () { if (Math.abs(stage.getBoundingClientRect().width - drawnW) >= 0.5) redraw(); }).observe(stage);
  } else {
    window.addEventListener('resize', redraw);
  }
  // Labels are placed by their measured widths, so they are placed again once the fonts arrive.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
})();
