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

  /* --- Tema: Claro (padrão), Escuro ou Automático (segue o aparelho) ------ */
  var MODES = ['light', 'dark', 'auto'];
  var NAMES = { light: 'claro', dark: 'escuro', auto: 'automático' };
  var media = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme(mode, save) {
    if (MODES.indexOf(mode) < 0) mode = 'light';
    root.setAttribute('data-theme-mode', mode);
    root.setAttribute('data-theme', mode === 'auto' ? (media && media.matches ? 'dark' : 'light') : mode);
    $$('[data-theme-set]').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.getAttribute('data-theme-set') === mode));
    });
    $$('[data-theme-cycle]').forEach(function (b) { b.setAttribute('aria-label', 'Tema: ' + NAMES[mode] + ' (toque para trocar)'); });
    if (save) { try { localStorage.setItem('cbn-theme-mode', mode); } catch (e) {} }
  }
  applyTheme(root.getAttribute('data-theme-mode') || 'light', false);
  $$('[data-theme-set]').forEach(function (b) {
    b.addEventListener('click', function () { applyTheme(b.getAttribute('data-theme-set'), true); });
  });
  $$('[data-theme-cycle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var cur = MODES.indexOf(root.getAttribute('data-theme-mode'));
      applyTheme(MODES[(cur + 1) % MODES.length], true);
    });
  });
  if (media) {
    var onSystem = function () { if (root.getAttribute('data-theme-mode') === 'auto') applyTheme('auto', false); };
    if (media.addEventListener) media.addEventListener('change', onSystem); else if (media.addListener) media.addListener(onSystem);
  }

  /* --- Menu em cápsula: a chapa desliza até o item sob o cursor ----------- */
  $$('[data-capsule]').forEach(function (cap) {
    var pill = $('.capsule__pill', cap);
    var list = $('.capsule__list', cap);
    function moveTo(link) {
      if (link.getAttribute('aria-current')) { pill.classList.remove('is-on'); return; }
      var first = !pill.classList.contains('is-on');
      if (first) pill.classList.add('is-jump');           // primeira aparição: sem deslizar
      pill.style.width = link.offsetWidth + 'px';
      pill.style.transform = 'translateX(' + (list.offsetLeft + link.offsetLeft) + 'px)';
      if (first) { void pill.offsetWidth; pill.classList.remove('is-jump'); }
      pill.classList.add('is-on');
    }
    $$('.capsule__link', cap).forEach(function (link) {
      link.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') moveTo(link); });
      link.addEventListener('focus', function () { moveTo(link); });
    });
    cap.addEventListener('pointerleave', function () { pill.classList.remove('is-on'); });
    cap.addEventListener('focusout', function (e) { if (!cap.contains(e.relatedTarget)) pill.classList.remove('is-on'); });
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

  /* --- Editorias (mobile): traz a editoria atual para a área visível ------- */
  var chipNow = $('.chips__link[aria-current]');
  if (chipNow) { var cl = chipNow.closest('.chips__list'); cl.scrollLeft = Math.max(0, chipNow.offsetLeft - cl.offsetLeft - 60); }

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
      box.innerHTML = '<span>' + name + '<br><b>' + (box.getAttribute('data-format') || '') + ' px</b></span>';
    });
  }
  labelAds();

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

  /* --- Formulários de demonstração (newsletter, contato, anuncie) --------
     O desenvolvedor substitui por envio real no WordPress.                */
  $$('[data-demo-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = $('.cta__small, .form__msg', form);
      if (msg) msg.textContent = form.getAttribute('data-demo-form');
      form.reset();
    });
  });

  /* --- Busca: leva o termo para a página de resultados ------------------- */
  function getTerm() {
    var m = /[?&]s=([^&#]*)/.exec(location.search);
    var t = m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
    if (!t) { try { t = sessionStorage.getItem('cbn-busca') || ''; } catch (e) {} }
    return t;
  }
  $$('form[role="search"]').forEach(function (f) {
    f.addEventListener('submit', function () {
      try { sessionStorage.setItem('cbn-busca', $('input', f).value); } catch (e) {}
    });
  });
  $$('.search__tags a, .article__tags a').forEach(function (a) {
    a.addEventListener('click', function () { try { sessionStorage.setItem('cbn-busca', a.textContent); } catch (e) {} });
  });
  var results = $('[data-results]');
  if (results) {
    var norm = function (s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
    var input = $('[data-results-form] input');
    var count = $('[data-results-count]');
    var none = $('[data-results-empty]');
    var filter = function (term) {
      var words = norm(term).split(/\s+/).filter(Boolean);
      var n = 0;
      $$('.card', results).forEach(function (c) {
        var hay = norm(c.getAttribute('data-search') || c.textContent);
        var ok = words.every(function (w) { return hay.indexOf(w) > -1; });
        c.hidden = !ok; if (ok) n++;
      });
      none.hidden = n > 0;
      count.textContent = term ? n + (n === 1 ? ' resultado para “' : ' resultados para “') + term + '”' : n + ' publicações';
    };
    var term = getTerm();
    input.value = term; filter(term);
    input.addEventListener('input', function () { filter(input.value); });
    $('[data-results-form]').addEventListener('submit', function (e) { e.preventDefault(); filter(input.value); });
  }

  /* --- Editorias: "Carregar mais" ----------------------------------------- */
  $$('[data-load-more]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      $$('[data-more][hidden]').slice(0, 6).forEach(function (el) { el.hidden = false; });
      if (!$('[data-more][hidden]')) btn.hidden = true;
    });
  });

  /* --- Notícia: barra de leitura, tamanho da letra, ouvir e compartilhar -- */
  var bar = $('.progress i');
  var prose = $('[data-prose]');
  if (bar && prose) {
    var onRead = function () {
      var r = prose.getBoundingClientRect();
      var total = r.height - window.innerHeight * 0.5;
      var done = Math.min(1, Math.max(0, (window.innerHeight * 0.5 - r.top) / (total || 1)));
      bar.style.transform = 'scaleX(' + done + ')';
    };
    window.addEventListener('scroll', onRead, { passive: true });
    onRead();
  }
  var fs = 0;
  $$('[data-font]').forEach(function (b) {
    b.addEventListener('click', function () {
      fs = Math.max(-1, Math.min(3, fs + Number(b.getAttribute('data-font'))));
      if (prose) prose.style.setProperty('--fs', (1.14 + fs * 0.1) + 'rem');
    });
  });
  var listen = $('[data-listen]');
  if (listen) {
    if (!('speechSynthesis' in window)) listen.hidden = true;
    else {
      var stopSpeak = function () { speechSynthesis.cancel(); listen.setAttribute('aria-pressed', 'false'); $('span', listen).textContent = 'Ouvir a notícia'; };
      listen.addEventListener('click', function () {
        if (listen.getAttribute('aria-pressed') === 'true') { stopSpeak(); return; }
        var text = ($('.article__title') ? $('.article__title').textContent + '. ' : '') + $$('p, h2, li', prose).filter(function (el) { return !el.closest('.ad'); }).map(function (el) { return el.textContent; }).join(' ');
        var u = new SpeechSynthesisUtterance(text);
        u.lang = 'pt-BR'; u.onend = stopSpeak; u.onerror = stopSpeak;
        speechSynthesis.cancel(); speechSynthesis.speak(u);
        listen.setAttribute('aria-pressed', 'true'); $('span', listen).textContent = 'Parar';
      });
      window.addEventListener('pagehide', function () { speechSynthesis.cancel(); });
    }
  }
  $$('[data-share]').forEach(function (a) {
    var url = encodeURIComponent(location.href);
    var title = encodeURIComponent(document.title);
    var kind = a.getAttribute('data-share');
    a.href = kind === 'wa' ? 'https://wa.me/?text=' + title + '%20' + url : kind === 'fb' ? 'https://www.facebook.com/sharer/sharer.php?u=' + url : 'https://twitter.com/intent/tweet?url=' + url + '&text=' + title;
    a.target = '_blank'; a.rel = 'noopener';
  });
  $$('[data-copy-link]').forEach(function (b) {
    b.addEventListener('click', function () {
      var msg = $('.share__msg', b.parentNode);
      var ok = function () { msg.textContent = 'Link copiado!'; setTimeout(function () { msg.textContent = ''; }, 2500); };
      var fail = function () { msg.textContent = location.href; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(location.href).then(ok, fail); else fail();
    });
  });

  /* --- Stories: visualizador em tela cheia -------------------------------- */
  var stories = $$('.story');
  if (stories.length) {
    var viewer = document.createElement('div');
    viewer.className = 'viewer'; viewer.setAttribute('role', 'dialog'); viewer.setAttribute('aria-modal', 'true'); viewer.setAttribute('aria-label', 'CBN Stories'); viewer.setAttribute('aria-hidden', 'true');
    viewer.innerHTML = '<div class="viewer__stage"><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="><div class="viewer__bars"></div>' +
      '<div class="viewer__top"><span>CBN Stories</span><button class="icon-btn" type="button" data-viewer-close aria-label="Fechar"><svg aria-hidden="true"><use href="#i-close"/></svg></button></div>' +
      '<button class="viewer__nav viewer__nav--prev" type="button" aria-label="Story anterior"></button><button class="viewer__nav viewer__nav--next" type="button" aria-label="Próximo story"></button>' +
      '<p class="viewer__title"></p></div>';
    body.appendChild(viewer);
    var vImg = $('img', viewer), vTitle = $('.viewer__title', viewer), vBars = $('.viewer__bars', viewer);
    vBars.innerHTML = stories.map(function () { return '<i><b></b></i>'; }).join('');
    var vi = 0, vt = null, vFocus = null;
    var showStory = function (n) {
      if (n < 0) n = 0;
      if (n >= stories.length) { closeViewer(); return; }
      vi = n;
      vImg.src = $('img', stories[n]).getAttribute('src');
      vTitle.textContent = $('.story__title', stories[n]).textContent;
      $$('i', vBars).forEach(function (b, k) { b.className = k < n ? 'is-done' : ''; });
      void vBars.offsetWidth; vBars.children[n].className = 'is-on';
      clearTimeout(vt); vt = setTimeout(function () { showStory(vi + 1); }, 5000);
    };
    var closeViewer = function () {
      clearTimeout(vt); viewer.classList.remove('is-open'); viewer.setAttribute('aria-hidden', 'true'); body.classList.remove('is-locked');
      if (vFocus) vFocus.focus();
    };
    stories.forEach(function (s, n) {
      s.addEventListener('click', function (e) {
        e.preventDefault(); vFocus = s;
        viewer.classList.add('is-open'); viewer.setAttribute('aria-hidden', 'false'); body.classList.add('is-locked');
        showStory(n); $('[data-viewer-close]', viewer).focus();
      });
    });
    $('[data-viewer-close]', viewer).addEventListener('click', closeViewer);
    $('.viewer__nav--prev', viewer).addEventListener('click', function () { showStory(vi - 1); });
    $('.viewer__nav--next', viewer).addEventListener('click', function () { showStory(vi + 1); });
    viewer.addEventListener('click', function (e) { if (e.target === viewer) closeViewer(); });
    document.addEventListener('keydown', function (e) {
      if (!viewer.classList.contains('is-open')) return;
      if (e.key === 'Escape') closeViewer();
      if (e.key === 'ArrowRight') showStory(vi + 1);
      if (e.key === 'ArrowLeft') showStory(vi - 1);
    });
  }

  /* --- Rádio: tenta continuar tocando ao trocar de página ----------------- */
  try {
    if (sessionStorage.getItem('cbn-radio') === '1' && audio) { audio.src = STREAM; var rp = audio.play(); setPlaying(true); if (rp && rp.catch) rp.catch(function () { setPlaying(false); }); }
    $$('[data-radio-toggle]').forEach(function (b) { b.addEventListener('click', function () { sessionStorage.setItem('cbn-radio', body.classList.contains('is-playing') ? '1' : '0'); }); });
  } catch (e) {}
})();
