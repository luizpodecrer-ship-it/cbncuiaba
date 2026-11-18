/* CBN Cuiabá — interações do front-end (JavaScript puro, sem dependências) */
(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var body = document.body;

  /* --- Data de hoje ------------------------------------------------------- */
  var dateEl = $('[data-today]');
  if (dateEl) {
    var txt = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    dateEl.textContent = txt.charAt(0).toUpperCase() + txt.slice(1);
  }

  /* --- Tema claro/escuro (respeita o sistema e lembra a escolha) ---------- */
  var saved = null;
  try { saved = localStorage.getItem('cbn-theme'); } catch (e) {}
  if (saved) root.setAttribute('data-theme', saved);
  else if (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) root.setAttribute('data-theme', 'dark');
  $$('[data-theme-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('cbn-theme', next); } catch (e) {}
    });
  });

  /* --- Header: sombra ao rolar e esconde ao descer no mobile -------------- */
  var header = $('.header');
  var lastY = 0;
  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    header.classList.toggle('is-stuck', y > 40);
    var mobile = window.innerWidth < 768;
    header.classList.toggle('is-hidden', mobile && y > 300 && y > lastY);
    lastY = y;
  }, { passive: true });

  /* --- Menu lateral e busca ---------------------------------------------- */
  var scrim = $('.scrim');
  var drawer = $('.drawer');
  var search = $('.search');
  var lastFocus = null;

  function open(el) {
    lastFocus = document.activeElement;
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    body.classList.add('is-locked');
    if (el === drawer) scrim.classList.add('is-open');
    var first = el === search ? $('input', el) : $('button, a', el);
    if (first) setTimeout(function () { first.focus(); }, 60);
  }
  function closeAll() {
    [drawer, search].forEach(function (el) {
      el.classList.remove('is-open');
      el.setAttribute('aria-hidden', 'true');
    });
    scrim.classList.remove('is-open');
    body.classList.remove('is-locked');
    if (lastFocus) lastFocus.focus();
  }
  $$('[data-open="menu"]').forEach(function (b) { b.addEventListener('click', function () { open(drawer); }); });
  $$('[data-open="search"]').forEach(function (b) { b.addEventListener('click', function () { open(search); }); });
  $$('[data-close]').forEach(function (b) { b.addEventListener('click', closeAll); });
  scrim.addEventListener('click', closeAll);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAll();
    if (e.key === '/' && !/input|textarea/i.test(e.target.tagName)) { e.preventDefault(); open(search); }
  });

  /* --- Faixa "Urgente" (rotação automática, pausa ao passar o mouse) ------ */
  var items = $$('.breaking__item');
  var idx = 0;
  var timer = null;
  function show(n) {
    if (!items.length) return;
    var cur = items[idx];
    cur.classList.remove('is-active');
    cur.classList.add('is-leaving');
    setTimeout(function () { cur.classList.remove('is-leaving'); }, 500);
    idx = (n + items.length) % items.length;
    items[idx].classList.add('is-active');
  }
  function start() { stop(); timer = setInterval(function () { show(idx + 1); }, 5000); }
  function stop() { clearInterval(timer); }
  if (items.length > 1) {
    var track = $('.breaking');
    track.addEventListener('mouseenter', stop);
    track.addEventListener('mouseleave', start);
    var prev = $('[data-breaking="prev"]');
    var next = $('[data-breaking="next"]');
    if (prev) prev.addEventListener('click', function () { show(idx - 1); start(); });
    if (next) next.addEventListener('click', function () { show(idx + 1); start(); });
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) start();
  }

  /* --- Carrosséis (setas no desktop, gesto nativo no mobile) -------------- */
  $$('[data-scroll]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = $(btn.getAttribute('data-target'));
      if (target) target.scrollBy({ left: Number(btn.getAttribute('data-scroll')) * target.clientWidth * 0.8, behavior: 'smooth' });
    });
  });

  /* --- Rádio ao vivo ------------------------------------------------------
     O áudio só é carregado quando o ouvinte toca em "play" (economiza dados). */
  var audio = $('#radio');
  var STREAM = audio ? audio.getAttribute('data-stream') : '';
  function setPlaying(on) {
    body.classList.toggle('is-playing', on);
    $$('[data-radio-toggle]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'Pausar a rádio ao vivo' : 'Ouvir a rádio ao vivo');
    });
  }
  function toggleRadio() {
    if (!audio) return;
    if (audio.paused) {
      audio.src = STREAM;
      setPlaying(true);
      var p = audio.play();
      if (p && p.catch) p.catch(function () { setPlaying(false); });
    } else {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      setPlaying(false);
    }
  }
  $$('[data-radio-toggle]').forEach(function (b) { b.addEventListener('click', toggleRadio); });
  if (audio) audio.addEventListener('error', function () { setPlaying(false); });
  var vol = $('#volume');
  if (vol && audio) vol.addEventListener('input', function () { audio.volume = vol.value / 100; });

  /* --- Publicidade: mostra o formato do espaço enquanto não há banner ----- */
  function labelAds() {
    $$('.ad__box').forEach(function (box) {
      if (box.querySelector('img, iframe, ins')) return;
      var name = box.getAttribute('data-name') || 'Espaço publicitário';
      box.innerHTML = '<span>' + name + '<br><b>' + box.offsetWidth + ' × ' + box.offsetHeight + ' px</b></span>';
    });
  }
  labelAds();
  var rt;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(labelAds, 150); });

  /* --- Animação de entrada ------------------------------------------------ */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    $$('.reveal').forEach(function (el) { io.observe(el); });
  } else {
    $$('.reveal').forEach(function (el) { el.classList.add('is-in'); });
  }

  /* --- Newsletter (demonstração; o desenvolvedor liga ao serviço real) ---- */
  var form = $('.cta__form');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = $('.cta__small', form);
    msg.textContent = 'Pronto! Você receberá as principais notícias no seu e-mail.';
    form.reset();
  });
})();
