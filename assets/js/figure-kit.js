/* Shared helpers for the project figures (fig-speech.js, fig-behavior.js):
   seeded noise so every visitor sees the same synthetic example, canvas sizing,
   rasters in the site's activity colours, mono labels, glides on the site's
   motion curve, pointer scrubbing, and a polite live-region announcer. */
(function () {
  'use strict';

  var M = window.CorticalModel;
  if (!M) return;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var MONO = '"Atkinson Hyperlegible Mono", ui-monospace, Menlo, Consolas, monospace';
  var SANS = '"Atkinson Hyperlegible Next", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

  // mulberry32: small and seeded, so the example is identical on every visit.
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gaussian(rand) {
    var u = 1 - rand(), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  // Moving average with radius r, edges handled by shrinking the window.
  function smooth(a, r) {
    var out = new Array(a.length);
    for (var i = 0; i < a.length; i++) {
      var s = 0, n = 0;
      for (var j = Math.max(0, i - r); j <= Math.min(a.length - 1, i + r); j++) { s += a[j]; n++; }
      out[i] = s / n;
    }
    return out;
  }

  // Sizes a canvas to a CSS height at device resolution and returns its context in CSS pixels.
  function fit(canvas, cssHeight) {
    if (cssHeight) canvas.style.height = cssHeight + 'px';
    var rect = canvas.getBoundingClientRect();
    var w = Math.round(rect.width), h = Math.round(rect.height);
    if (!w || !h) return null;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, W: w, H: h, dpr: dpr };
  }

  // Activity as an opaque colour on black, for a value in units of `scale`: the 1.3 power
  // keeps the small values of noise near zero dark, so the structure stands out. One function
  // for raster() and ramp(), so a key always matches its raster.
  function activityRGB(v, scale) { return M.activityMap(v, Math.pow(Math.min(1, Math.abs(v) / scale), 1.3)); }

  // Paints a rows × cols matrix into a rectangle. kind 'activity' uses the warm/cool
  // activity map (values in units of `scale`); kind 'gray' paints values 0..1 as light.
  var scratch = document.createElement('canvas');
  function raster(ctx, rows, x, y, w, h, kind, scale) {
    var nr = rows.length, nc = rows[0].length;
    scratch.width = nc;
    scratch.height = nr;
    var sctx = scratch.getContext('2d'), img = sctx.createImageData(nc, nr), d = img.data;
    for (var r = 0; r < nr; r++) {
      for (var c = 0; c < nc; c++) {
        var v = rows[r][c], i = (r * nc + c) * 4, rgb, a;
        if (kind === 'gray') {
          a = Math.pow(Math.max(0, Math.min(1, v)), 0.6);
          rgb = [237, 237, 237];
        } else {
          rgb = activityRGB(v, scale);
          a = 1;
        }
        d[i] = Math.round(rgb[0] * a); d[i + 1] = Math.round(rgb[1] * a); d[i + 2] = Math.round(rgb[2] * a); d[i + 3] = 255;
      }
    }
    sctx.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scratch, x, y, w, h);
    ctx.restore();
  }

  // Paints a colour key into an element with the same colours as raster() over black:
  // 'activity' runs from the negative peak through zero to the positive peak, 'gray' from 0 to 1.
  // (styles.css gives .cbar-ramp these same 21 stops, so the key is right before this runs.)
  function ramp(el, kind) {
    if (!el) return;
    var stops = [];
    for (var i = 0; i <= 20; i++) {
      var rgb, a, f = i / 20;
      if (kind === 'gray') {
        a = Math.pow(f, 0.6);
        rgb = [237, 237, 237];
      } else {
        rgb = activityRGB(f * 2 - 1, 1);
        a = 1;
      }
      stops.push('rgb(' + rgb.map(function (c) { return Math.round(c * a); }).join(',') + ') ' + (i * 5) + '%');
    }
    el.style.backgroundImage = 'linear-gradient(90deg, ' + stops.join(', ') + ')';
  }

  // Canvas text in the instrument's voice: mono 13px, or 12px on narrow views, as in Fig. 1.
  function text(ctx, s, x, y, opts) {
    opts = opts || {};
    ctx.font = (opts.weight || 400) + ' ' + (opts.size || 13) + 'px ' + (opts.sans ? SANS : MONO);
    ctx.fillStyle = opts.color || '#969696';
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.baseline || 'alphabetic';
    ctx.fillText(s, x, y);
    return ctx.measureText(s).width;
  }

  // Glides a value on the site's in-out curve; jumps under reduced motion. Returns a cancel function.
  function glide(from, to, duration, apply, done) {
    var id = 0;
    if (reduceMotion.matches || from === to) { apply(to); if (done) done(); return function () {}; }
    var t0 = 0;
    function step(now) {
      if (!t0) t0 = now;
      var t = Math.min(1, (now - t0) / duration);
      apply(from + (to - from) * M.easeInOut(t));
      if (t < 1) id = window.requestAnimationFrame(step);
      else { id = 0; if (done) done(); }
    }
    id = window.requestAnimationFrame(step);
    return function () { if (id) window.cancelAnimationFrame(id); id = 0; };
  }

  // Pointer scrubbing on a canvas: toValue(event) maps a pointer to a value.
  // A mouse scrubs from the press. A finger or pen may be starting a page scroll (the
  // canvases allow vertical panning, and the browser only decides after the press), so it
  // scrubs once it has moved clearly sideways, and a tap sets the value on release; a
  // vertical swipe, or one the browser takes over with pointercancel, changes nothing.
  var SLOP = 8;   // px a touch moves before it counts as a scrub or a scroll
  function scrub(canvas, toValue, onValue, onEnd) {
    var active = false, scrubbing = false, x0 = 0, y0 = 0;
    canvas.addEventListener('pointerdown', function (event) {
      if (event.button !== undefined && event.button > 0) return;
      active = true;
      scrubbing = event.pointerType !== 'touch' && event.pointerType !== 'pen';
      x0 = event.clientX;
      y0 = event.clientY;
      try { canvas.setPointerCapture(event.pointerId); } catch (e) { /* capture is a nicety */ }
      if (scrubbing) onValue(toValue(event));
    });
    canvas.addEventListener('pointermove', function (event) {
      if (!active) return;
      if (!scrubbing) {
        var dx = Math.abs(event.clientX - x0), dy = Math.abs(event.clientY - y0);
        if (dx <= SLOP && dy <= SLOP) return;
        if (dx <= dy) { active = false; return; }   // a vertical swipe: leave it to the page
        scrubbing = true;
      }
      onValue(toValue(event));
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (name) {
      canvas.addEventListener(name, function (event) {
        if (!active) return;
        active = false;
        if (!scrubbing) {
          if (name !== 'pointerup') return;   // taken over by the page before it moved: nothing applied
          onValue(toValue(event));            // a tap
        }
        scrubbing = false;
        if (onEnd) onEnd();
      });
    });
  }

  function announcer(el) {
    var timer = 0;
    return function (message) {
      clearTimeout(timer);
      timer = setTimeout(function () { if (el) el.textContent = message; }, 450);
    };
  }

  function onResize(el, fn) {
    if ('ResizeObserver' in window) {
      var pending = 0;
      new ResizeObserver(function () {
        if (pending) return;
        pending = window.requestAnimationFrame(function () { pending = 0; fn(); });
      }).observe(el);
    } else {
      window.addEventListener('resize', fn);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fn);
  }

  window.FigureKit = {
    rng: rng, gaussian: gaussian, smooth: smooth, fit: fit, raster: raster, ramp: ramp, text: text, mono: MONO,
    glide: glide, scrub: scrub, announcer: announcer, onResize: onResize, reduceMotion: reduceMotion
  };
})();
