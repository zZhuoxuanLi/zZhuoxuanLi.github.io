/* Site behaviour: theme toggle, mobile menu, current-section link,
   copy-email button, CV availability, deep links that open their target,
   and printing with collapsed sections open. No dependencies. Content lives
   in index.html; nothing here needs editing for routine updates. */
(function () {
  'use strict';

  var doc = document.documentElement;
  var lightQuery = window.matchMedia('(prefers-color-scheme: light)');

  var store = {
    get: function (key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } },
    set: function (key, value) { try { window.localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ } }
  };

  function onMediaChange(query, handler) {
    if (query.addEventListener) query.addEventListener('change', handler);
    else if (query.addListener) query.addListener(handler);
  }

  /* ---------- Theme (dark first; light follows the system or the toggle) ---------- */
  var themeButton = document.querySelector('[data-theme-toggle]');

  function effectiveTheme() {
    var set = doc.getAttribute('data-theme');
    if (set === 'light' || set === 'dark') return set;
    return lightQuery.matches ? 'light' : 'dark';
  }

  function syncThemeButton() {
    if (!themeButton) return;
    var current = effectiveTheme();
    themeButton.setAttribute('data-current', current);
    themeButton.setAttribute('aria-label', current === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }

  function announceTheme() { document.dispatchEvent(new CustomEvent('site:themechange')); }

  if (themeButton) {
    themeButton.addEventListener('click', function () {
      var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
      doc.setAttribute('data-theme', next);
      store.set('theme', next);
      syncThemeButton();
      announceTheme();
    });
  }
  onMediaChange(lightQuery, function () { syncThemeButton(); announceTheme(); });
  syncThemeButton();

  /* ---------- Mobile menu ---------- */
  var nav = document.querySelector('[data-nav]');
  var navToggle = document.querySelector('[data-nav-toggle]');

  function setMenu(open) {
    if (!nav || !navToggle) return;
    nav.toggleAttribute('data-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
  }
  if (navToggle) {
    navToggle.addEventListener('click', function () { setMenu(navToggle.getAttribute('aria-expanded') !== 'true'); });
  }
  if (nav) {
    nav.addEventListener('click', function (event) { if (event.target.closest('a')) setMenu(false); });
  }
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && navToggle && navToggle.getAttribute('aria-expanded') === 'true') {
      setMenu(false);
      navToggle.focus();
    }
  });
  document.addEventListener('click', function (event) {
    if (nav && nav.hasAttribute('data-open') && !nav.contains(event.target)) setMenu(false);
  });

  /* ---------- Current section in the nav ---------- */
  var sectionToLink = { research: '#research', next: '#next', publications: '#publications', about: '#about', contact: '#contact' };
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav-list a[href^="#"]'));

  function markCurrent(id) {
    var href = id ? sectionToLink[id] : null;
    navLinks.forEach(function (a) {
      if (href && a.getAttribute('href') === href) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }

  if ('IntersectionObserver' in window) {
    var visible = {};
    var watched = Object.keys(sectionToLink).map(function (id) { return document.getElementById(id); }).filter(Boolean);
    var lastSection = watched[watched.length - 1];
    var shown;
    var update = function () {
      var current = null;
      watched.forEach(function (section) { if (visible[section.id]) current = section.id; });
      // The band below sits 40-45% down the window. On a tall window the last section (short,
      // with only the footer after it) never reaches it, so at the bottom of the page it is current.
      if (lastSection && window.innerHeight + window.pageYOffset >= doc.scrollHeight - 2) current = lastSection.id;
      if (current !== shown) { shown = current; markCurrent(current); }
    };
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { visible[entry.target.id] = entry.isIntersecting; });
      update();
    }, { rootMargin: '-40% 0px -55% 0px' });
    watched.forEach(function (section) { observer.observe(section); });
    window.addEventListener('scroll', update, { passive: true });   // reaching the bottom may cross no band edge
  }

  /* ---------- Deep links open what they point at ---------- */
  function targetOf(hash) {
    if (!hash || hash.length < 2) return null;
    var id = hash.slice(1);
    // A malformed escape (a typed or mangled "#%") would throw and stop everything set up below.
    try { id = decodeURIComponent(id); } catch (e) { /* look it up as written */ }
    return document.getElementById(id);
  }

  /* Arrival: what a link lands on is ringed for a moment (.is-target in styles.css), so the eye
     finds it among its neighbours. A project rings its title block and a figure its title row,
     which fit on screen where the whole would not; an empty alias anchor rings the entry that holds
     it. A section, the main area or a page-wide wrapper gets none: its heading says where you are. */
  function arrivalMark(target) {
    if (target.matches('body, main, section, .wrap')) return null;
    if (target.matches('.project')) return target.querySelector('.project-head');
    if (target.matches('.stage')) return target.querySelector('.stage-head');
    if (!target.children.length && !target.textContent.trim()) return target.parentElement;
    return target;
  }
  var ringed = null, ringTimer = 0;
  function ring(target) {
    var mark = arrivalMark(target);
    if (!mark) return;
    clearTimeout(ringTimer);
    if (ringed) ringed.classList.remove('is-target');
    void mark.offsetWidth;   // restart the ring when the same place is reached again
    mark.classList.add('is-target');
    ringed = mark;
    // Off once it has run (2s), so no ring stays behind: in forced colours it is a still outline.
    ringTimer = setTimeout(function () { mark.classList.remove('is-target'); ringed = null; }, 2100);
  }

  function revealTarget(hash, flash) {
    var target = targetOf(hash);
    if (!target) return;
    var details = target.matches('details') ? [target] : [];
    // Only an experience entry opens its own panel. A section that holds entries (#about, or #main
    // from the skip link) would otherwise open the first panel inside it.
    var inner = target.classList.contains('xp') ? target.querySelector(':scope details.xp-more') : null;
    if (inner) details.push(inner);
    var parent = target.closest('details');
    var shut = parent && !parent.open;
    if (parent) details.push(parent);
    details.forEach(function (d) {
      if (d.open) return;
      // At once, not unfolding (.is-instant in styles.css): for the first moment of the unfolding,
      // a block inside a panel has no place on the page, so a scroll to it would go nowhere.
      d.classList.add('is-instant');
      d.open = true;
      void d.offsetHeight;   // take the open state now, without the transition
      window.requestAnimationFrame(function () { d.classList.remove('is-instant'); });
    });
    // Arriving from another page at a block inside a shut panel (#startup-errp), the browser's own
    // scroll ran while the panel was shut, so the block is brought into view here. (A click opens
    // the panel before the browser scrolls, so it needs nothing more.)
    if (shut && !flash) {
      try { target.scrollIntoView({ block: 'start', behavior: 'instant' }); } catch (e) { target.scrollIntoView(true); }
    }
    if (flash) ring(target);
  }
  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[href^="#"]');
    if (link) revealTarget(link.getAttribute('href'), true);
  });
  window.addEventListener('hashchange', function () { revealTarget(window.location.hash, true); });
  revealTarget(window.location.hash, false);
  // A deep link from elsewhere rings its target too, once the page has loaded and is resting on it.
  function ringArrival() { var target = targetOf(window.location.hash); if (target) ring(target); }
  if (document.readyState === 'complete') ringArrival();
  else window.addEventListener('load', ringArrival);

  /* ---------- Printing ----------
     Collapsed sections print open, then close again. (The print styles also show their content
     where the browser allows it, e.g. with scripts off; this covers the other browsers.)
     Meanwhile they open and close at once (is-printing in styles.css), and the reader is put back
     where they were: the browser keeps the scroll offset while the panels above it change. */
  var openedForPrint = [];
  var scrollBeforePrint = null;
  window.addEventListener('beforeprint', function () {
    scrollBeforePrint = window.pageYOffset;
    doc.classList.add('is-printing');
    Array.prototype.forEach.call(document.querySelectorAll('details:not([open])'), function (d) {
      d.open = true;
      openedForPrint.push(d);
    });
  });
  window.addEventListener('afterprint', function () {
    openedForPrint.forEach(function (d) { d.open = false; });
    openedForPrint = [];
    // Scrolling lays out the closed panels before the class (and with it the animation) goes.
    if (scrollBeforePrint !== null) window.scrollTo({ top: scrollBeforePrint, behavior: 'instant' });
    scrollBeforePrint = null;
    doc.classList.remove('is-printing');
  });

  /* ---------- Copy email ---------- */
  var copyStatus = document.querySelector('[data-copy-status]');
  Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (button) {
    var label = button.querySelector('[data-copy-label]') || button;
    var original = label.textContent;
    var timer = null;

    function reset() { label.textContent = original; button.removeAttribute('data-state'); }
    function selectSource() {
      var source = document.querySelector('[data-copy-source]');
      if (!source || !window.getSelection) return;
      var range = document.createRange();
      range.selectNodeContents(source);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }

    button.addEventListener('click', function () {
      var text = button.getAttribute('data-copy');
      clearTimeout(timer);
      function done() {
        label.textContent = 'Copied';
        button.setAttribute('data-state', 'done');
        if (copyStatus) copyStatus.textContent = 'Email address copied.';
        timer = setTimeout(reset, 2200);
      }
      function fallback() {
        selectSource();
        label.textContent = 'Address selected';
        if (copyStatus) copyStatus.textContent = 'Email address selected. Copy it with your keyboard.';
        timer = setTimeout(reset, 3000);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    });
  });

  /* ---------- CV availability ----------
     CV links start as email requests, so nothing points at a missing file.
     Once cv/Zhuoxuan_Li_CV.pdf is published, they become downloads and the
     header gains a CV link. */
  var cvLinks = Array.prototype.slice.call(document.querySelectorAll('[data-cv-link]'));
  var cvNav = document.querySelector('[data-cv-nav]');
  function cvReady() {
    cvLinks.forEach(function (a) {
      var href = a.getAttribute('data-cv-href');
      var text = a.getAttribute('data-cv-ready-label');
      var label = a.querySelector('[data-cv-label]');
      if (href) a.setAttribute('href', href);
      if (label && text) label.textContent = text;
    });
    if (cvNav) cvNav.hidden = false;
  }
  if (cvLinks.length && /^https?:$/.test(window.location.protocol) && window.fetch) {
    window.fetch(cvLinks[0].getAttribute('data-cv-href'), { method: 'HEAD', cache: 'no-store' })
      .then(function (response) { if (response.ok) cvReady(); })
      .catch(function () { /* stays an email request */ });
  }
})();
