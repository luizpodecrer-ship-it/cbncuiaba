/* CBN Cuiabá — interações do front-end (JavaScript puro, sem dependências)
   ---------------------------------------------------------------------------
   Estrutura:
     boot()  roda uma vez: ouvintes globais (teclado, rolagem, cliques, voltar).
     init()  roda a cada página exibida: liga os componentes que estão na tela.

   Navegação suave: ao clicar em um link interno, a nova página é buscada em
   segundo plano e trocada sem recarregar o site. O cabeçalho e o player não
   piscam e a rádio continua tocando. Se algo falhar, o link abre normalmente.
     - Para desligar: <body data-soft-nav="off">
     - A cada troca é disparado o evento "cbn:navigate" no document (use-o para
       recarregar banners e registrar a visualização no Analytics).            */
(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var body = document.body;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canVT = !!document.startViewTransition && !reduce;

  /* Estado que muda a cada página */
  var header, drawer, search, scrim, lastFocus, progressBar, prose;
  var breakingTimer = null, viewer = null, io = null, placeCapsule = null;
  var prevPill = null, prevChipScroll = null;

  /* Faz uma troca visual com transição suave quando o navegador permite */
  function transition(fn) {
    if (!canVT) { fn(); return null; }
    root.classList.add('vt-run');
    var t = document.startViewTransition(fn);
    var done = function () { root.classList.remove('vt-run'); };
    t.finished.then(done, done);
    return t;
  }

  /* ======================================================================
     TEMA — Claro (padrão), Escuro ou Automático (segue o aparelho)
     ====================================================================== */
  var MODES = ['light', 'dark', 'auto'];
  var NAMES = { light: 'claro', dark: 'escuro', auto: 'automático' };
  var media = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function savedMode() {
    var m = 'light';
    try { m = localStorage.getItem('cbn-theme-mode') || 'light'; } catch (e) {}
    return MODES.indexOf(m) < 0 ? 'light' : m;
  }
  function paintTheme(mode) {
    root.setAttribute('data-cbn-mode', mode);
    root.setAttribute('data-cbn-theme', mode === 'auto' ? (media && media.matches ? 'dark' : 'light') : mode);
    $$('[data-theme-set]').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-theme-set') === mode)); });
    $$('[data-theme-cycle]').forEach(function (b) { b.setAttribute('aria-label', 'Tema: ' + NAMES[mode] + ' (toque para trocar)'); });
  }
  function setTheme(mode) {
    try { localStorage.setItem('cbn-theme-mode', mode); } catch (e) {}
    transition(function () { paintTheme(mode); });
  }

  /* ======================================================================
     MENU LATERAL E BUSCA
     ====================================================================== */
  function openPanel(el) {
    lastFocus = document.activeElement;
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    body.classList.add('is-locked');
    if (el === drawer) scrim.classList.add('is-open');
    var first = el === search ? $('input', el) : $('button, a', el);
    if (first) setTimeout(function () { first.focus(); }, 80);
  }
  function closePanels() {
    [drawer, search].forEach(function (el) {
      if (!el) return;
      el.classList.remove('is-open');
      el.setAttribute('aria-hidden', 'true');
    });
    if (scrim) scrim.classList.remove('is-open');
    body.classList.remove('is-locked');
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }

  /* ======================================================================
     RÁDIO AO VIVO — o áudio só carrega quando o ouvinte toca em "play"
     ====================================================================== */
  var audio = $('#radio');
  var STREAM = audio ? audio.getAttribute('data-stream') : '';
  function paintRadio(on) {
    body.classList.toggle('is-playing', on);
    $$('[data-radio-toggle]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'Pausar a rádio ao vivo' : 'Ouvir a rádio ao vivo');
    });
  }
  function rememberRadio(on) { try { sessionStorage.setItem('cbn-radio', on ? '1' : '0'); } catch (e) {} }
  function playRadio() {
    audio.src = STREAM;
    paintRadio(true);
    var p = audio.play();
    if (p && p.catch) p.catch(function () { paintRadio(false); });
  }
  function toggleRadio() {
    if (!audio) return;
    if (audio.paused) { playRadio(); rememberRadio(true); }
    else { audio.pause(); audio.removeAttribute('src'); audio.load(); paintRadio(false); rememberRadio(false); }
  }

  /* ======================================================================
     NAVEGAÇÃO SUAVE ENTRE PÁGINAS
     ====================================================================== */
  var SOFT = location.protocol !== 'file:' && !!window.fetch && !!(window.history && history.pushState) &&
             !!window.DOMParser && body.getAttribute('data-soft-nav') !== 'off';
  var cache = {};
  var busy = false;
  var bar = null, barTimer = null;

  function loadBar(on) {
    if (!bar) { bar = document.createElement('div'); bar.className = 'loadbar'; bar.setAttribute('aria-hidden', 'true'); root.appendChild(bar); }
    clearTimeout(barTimer);
    if (on) barTimer = setTimeout(function () { bar.className = 'loadbar is-on'; }, 140);   // só aparece se demorar
    else if (bar.className !== 'loadbar') { bar.className = 'loadbar is-done'; barTimer = setTimeout(function () { bar.className = 'loadbar'; }, 320); }
  }
  function fetchPage(url) {
    var key = url.split('#')[0];
    if (!cache[key]) {
      cache[key] = fetch(key, { credentials: 'same-origin' }).then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.text();
      });
      cache[key].catch(function () { delete cache[key]; });
    }
    return cache[key];
  }
  function rememberNav() {
    var act = $('.capsule__active');
    prevPill = act && act.classList.contains('is-on') ? { x: act.style.transform, w: act.style.width } : null;
    var cl = $('.chips__list');
    prevChipScroll = cl ? cl.scrollLeft : null;
    try { sessionStorage.setItem('cbn-nav', JSON.stringify({ pill: prevPill, chip: prevChipScroll, t: Date.now() })); } catch (e) {}
  }
  function teardown() {
    clearInterval(breakingTimer);
    if (viewer) viewer.close(true);
    viewer = null;
    if (io) io.disconnect();
    if (window.speechSynthesis) speechSynthesis.cancel();
    body.classList.remove('is-locked');
  }
  function swapBody(doc) {
    Array.prototype.slice.call(body.children).forEach(function (el) { if (el !== audio) el.remove(); });
    var frag = document.createDocumentFragment();
    Array.prototype.slice.call(doc.body.children).forEach(function (el) {
      if (el.id === 'radio' || el.tagName === 'SCRIPT') return;
      frag.appendChild(document.importNode(el, true));
    });
    body.insertBefore(frag, audio);
    document.title = doc.title;
    var d1 = $('meta[name="description"]'), d2 = doc.querySelector('meta[name="description"]');
    if (d1 && d2) d1.setAttribute('content', d2.getAttribute('content'));
  }
  function go(url, push, y) {
    if (busy) return;
    busy = true;
    loadBar(true);
    rememberNav();
    fetchPage(url).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      if (!doc.querySelector('main')) throw new Error('página inesperada');
      if (push) {
        history.replaceState({ y: window.scrollY }, '');
        history.pushState({ y: 0 }, '', url);          // em ambientes restritos isto falha e caímos no modo normal
      }
      transition(function () {
        teardown();
        swapBody(doc);
        init(true);
        window.scrollTo({ top: y || 0, left: 0, behavior: 'instant' });
      });
      var main = $('main');
      if (main) { main.setAttribute('tabindex', '-1'); main.focus({ preventScroll: true }); }
      loadBar(false);
      busy = false;
      document.dispatchEvent(new CustomEvent('cbn:navigate', { detail: { url: location.href } }));
    }).catch(function () {
      busy = false;
      loadBar(false);
      location.href = url;                               // qualquer falha: navegação normal
    });
  }
  function leave(url) {                                  // navegação normal, com saída suave
    rememberNav();
    if (reduce || ('onpagereveal' in window && location.protocol !== 'file:')) { location.href = url; return; }
    root.classList.add('is-leaving');
    setTimeout(function () { location.href = url; }, 110);
  }
  /* Página do próprio site: termina em .html ou não tem extensão (URLs amigáveis, como no WordPress) */
  function isPage(path) { return !/\.(?!html?$)[a-z0-9]+$/i.test(path) && !/\/wp-(admin|login|json)/.test(path); }
  function internalLink(a, e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
    if ((a.target && a.target !== '_self') || a.hasAttribute('download')) return false;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#') return false;
    if (a.protocol !== location.protocol || a.host !== location.host) return false;
    return isPage(a.pathname);
  }

  /* ======================================================================
     STORIES — visualizador em tela cheia
     ====================================================================== */
  function buildViewer(stories) {
    var el = document.createElement('div');
    el.className = 'viewer';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'CBN Stories'); el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="viewer__stage"><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="><div class="viewer__bars"></div>' +
      '<div class="viewer__top"><span>CBN Stories</span><button class="icon-btn" type="button" data-viewer-close aria-label="Fechar"><svg aria-hidden="true"><use href="#i-close"/></svg></button></div>' +
      '<button class="viewer__nav viewer__nav--prev" type="button" aria-label="Story anterior"></button><button class="viewer__nav viewer__nav--next" type="button" aria-label="Próximo story"></button>' +
      '<p class="viewer__title"></p></div>';
    body.appendChild(el);
    var img = $('img', el), title = $('.viewer__title', el), bars = $('.viewer__bars', el);
    bars.innerHTML = stories.map(function () { return '<i><b></b></i>'; }).join('');
    var i = 0, timer = null, opener = null;
    var api = {
      isOpen: function () { return el.classList.contains('is-open'); },
      show: function (n) {
        if (n < 0) n = 0;
        if (n >= stories.length) { api.close(); return; }
        i = n;
        img.src = $('img', stories[n]).getAttribute('src');
        title.textContent = $('.story__title', stories[n]).textContent;
        $$('i', bars).forEach(function (b, k) { b.className = k < n ? 'is-done' : ''; });
        void bars.offsetWidth;
        bars.children[n].className = 'is-on';
        clearTimeout(timer);
        timer = setTimeout(function () { api.show(i + 1); }, 5000);
      },
      next: function () { api.show(i + 1); },
      prev: function () { api.show(i - 1); },
      open: function (n, from) {
        opener = from;
        el.classList.add('is-open'); el.setAttribute('aria-hidden', 'false'); body.classList.add('is-locked');
        api.show(n);
        $('[data-viewer-close]', el).focus();
      },
      close: function (silent) {
        clearTimeout(timer);
        el.classList.remove('is-open'); el.setAttribute('aria-hidden', 'true'); body.classList.remove('is-locked');
        if (!silent && opener && document.contains(opener)) opener.focus();
      }
    };
    $('[data-viewer-close]', el).addEventListener('click', function () { api.close(); });
    $('.viewer__nav--prev', el).addEventListener('click', api.prev);
    $('.viewer__nav--next', el).addEventListener('click', api.next);
    el.addEventListener('click', function (e) { if (e.target === el) api.close(); });
    stories.forEach(function (s, n) {
      s.addEventListener('click', function (e) { e.preventDefault(); api.open(n, s); });
    });
    return api;
  }

  /* ======================================================================
     init() — liga tudo o que está na página atual
     ====================================================================== */
  function init(soft) {
    header = $('.header'); drawer = $('.drawer'); search = $('.search'); scrim = $('.scrim');
    progressBar = $('.progress i'); prose = $('[data-prose]');

    /* Data de hoje */
    var dateEl = $('[data-today]');
    if (dateEl) {
      var txt = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      dateEl.textContent = txt.charAt(0).toUpperCase() + txt.slice(1);
    }

    /* Tema */
    paintTheme(savedMode());
    $$('[data-theme-set]').forEach(function (b) { b.addEventListener('click', function () { setTheme(b.getAttribute('data-theme-set')); }); });
    $$('[data-theme-cycle]').forEach(function (b) {
      b.addEventListener('click', function () { setTheme(MODES[(MODES.indexOf(root.getAttribute('data-cbn-mode')) + 1) % MODES.length]); });
    });

    /* Painéis */
    $$('[data-open="menu"]').forEach(function (b) { b.addEventListener('click', function () { openPanel(drawer); }); });
    $$('[data-open="search"]').forEach(function (b) { b.addEventListener('click', function () { openPanel(search); }); });
    $$('[data-close]').forEach(function (b) { b.addEventListener('click', closePanels); });
    if (scrim) scrim.addEventListener('click', closePanels);

    /* Rádio */
    paintRadio(!!audio && !audio.paused);
    $$('[data-radio-toggle]').forEach(function (b) { b.addEventListener('click', toggleRadio); });
    var vol = $('#volume');
    if (vol && audio) { vol.value = Math.round(audio.volume * 100); vol.addEventListener('input', function () { audio.volume = vol.value / 100; }); }

    /* Menu em cápsula: uma chapa vermelha marca a editoria atual e desliza até
       a nova ao trocar de página; outra, cinza, acompanha o cursor.            */
    var memo = null;
    if (!soft) { try { memo = JSON.parse(sessionStorage.getItem('cbn-nav') || 'null'); if (memo && Date.now() - memo.t > 4000) memo = null; } catch (e) {} }
    var fromPill = soft ? prevPill : memo && memo.pill;
    var fromChip = soft ? prevChipScroll : memo && memo.chip;
    placeCapsule = null;
    $$('[data-capsule]').forEach(function (cap) {
      var list = $('.capsule__list', cap);
      var hover = $('.capsule__pill', cap);
      var active = document.createElement('span');
      active.className = 'capsule__active'; active.setAttribute('aria-hidden', 'true');
      cap.insertBefore(active, list);
      cap.classList.add('is-ready');
      var current = $('.capsule__link[aria-current]', cap);
      var put = function (el, link) {
        el.style.width = link.offsetWidth + 'px';
        el.style.transform = 'translateX(' + (list.offsetLeft + link.offsetLeft) + 'px)';
      };
      placeCapsule = function (animate) {
        if (!current) { active.classList.remove('is-on'); return; }
        if (!animate) active.classList.add('is-jump');
        put(active, current);
        active.classList.add('is-on');
        if (!animate) { void active.offsetWidth; active.classList.remove('is-jump'); }
      };
      if (current && fromPill && !reduce) {                // parte de onde estava na página anterior
        active.classList.add('is-jump', 'is-on');
        active.style.width = fromPill.w; active.style.transform = fromPill.x;
        void active.offsetWidth; active.classList.remove('is-jump');
        requestAnimationFrame(function () { placeCapsule(true); });
      } else placeCapsule(false);

      var moveHover = function (link) {
        if (link === current) { hover.classList.remove('is-on'); return; }
        var first = !hover.classList.contains('is-on');
        if (first) hover.classList.add('is-jump');
        put(hover, link);
        if (first) { void hover.offsetWidth; hover.classList.remove('is-jump'); }
        hover.classList.add('is-on');
      };
      $$('.capsule__link', cap).forEach(function (link) {
        link.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') moveHover(link); });
        link.addEventListener('focus', function () { moveHover(link); });
        link.addEventListener('click', function (e) {      // resposta imediata ao clique
          if (link === current || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          var old = current;
          if (old) old.removeAttribute('aria-current');
          link.setAttribute('aria-current', 'page');
          current = link; hover.classList.remove('is-on'); placeCapsule(true);
        });
      });
      cap.addEventListener('pointerleave', function () { hover.classList.remove('is-on'); });
      cap.addEventListener('focusout', function (e) { if (!cap.contains(e.relatedTarget)) hover.classList.remove('is-on'); });
    });

    /* Editorias no mobile: mantém a rolagem e desliza até a editoria atual */
    var chipNow = $('.chips__link[aria-current]');
    if (chipNow) {
      var cl = chipNow.closest('.chips__list');
      var target = Math.max(0, chipNow.offsetLeft - cl.offsetLeft - 60);
      if (fromChip != null && !reduce) { cl.scrollLeft = fromChip; cl.scrollTo({ left: target, behavior: 'smooth' }); }
      else cl.scrollLeft = target;
    }

    /* Barra inferior (mobile): marca a seção atual */
    var file = (location.pathname.split('/').pop() || 'index').replace(/\.html?$/, '');
    var tabs = $$('.tabbar__item');
    tabs.forEach(function (t) { t.classList.remove('is-active'); });
    var tab = file === 'noticias' ? tabs[1] : file === 'index' ? tabs[0] : null;
    if (tab) tab.classList.add('is-active');
    tabs.forEach(function (t) {                           // fica vermelho no instante do toque
      if (t.tagName !== 'A') return;
      t.addEventListener('click', function () { tabs.forEach(function (x) { x.classList.remove('is-active'); }); t.classList.add('is-active'); });
    });

    /* Faixa "Urgente" */
    var items = $$('.breaking__item');
    var idx = 0;
    var showBreaking = function (n) {
      var cur = items[idx];
      cur.classList.remove('is-active'); cur.classList.add('is-leaving');
      setTimeout(function () { cur.classList.remove('is-leaving'); }, 500);
      idx = (n + items.length) % items.length;
      items[idx].classList.add('is-active');
    };
    var startBreaking = function () { clearInterval(breakingTimer); if (!reduce) breakingTimer = setInterval(function () { showBreaking(idx + 1); }, 5000); };
    if (items.length > 1) {
      var track = $('.breaking');
      track.addEventListener('mouseenter', function () { clearInterval(breakingTimer); });
      track.addEventListener('mouseleave', startBreaking);
      var bp = $('[data-breaking="prev"]'), bn = $('[data-breaking="next"]');
      if (bp) bp.addEventListener('click', function () { showBreaking(idx - 1); startBreaking(); });
      if (bn) bn.addEventListener('click', function () { showBreaking(idx + 1); startBreaking(); });
      startBreaking();
    }

    /* Carrosséis */
    $$('[data-scroll]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var t = $(btn.getAttribute('data-target'));
        if (t) t.scrollBy({ left: Number(btn.getAttribute('data-scroll')) * t.clientWidth * 0.8, behavior: 'smooth' });
      });
    });

    /* Publicidade: mostra o formato do espaço enquanto não há banner */
    $$('.ad__box').forEach(function (box) {
      if (box.querySelector('img, iframe, ins')) return;
      box.innerHTML = '<span>' + (box.getAttribute('data-name') || 'Espaço publicitário') + '<br><b>' + (box.getAttribute('data-format') || '') + ' px</b></span>';
    });

    /* Imagens: aparecem com um esmaecer suave, sobre um fundo de espera */
    $$('.card__media img, .story img, .interview__media img, .article__figure img, .opinion__avatar').forEach(function (img) {
      if (img.complete && img.naturalWidth) return;
      img.classList.add('is-loading');
      var ok = function () { img.classList.remove('is-loading'); };
      img.addEventListener('load', ok, { once: true });
      img.addEventListener('error', ok, { once: true });
    });

    /* Entrada dos blocos ao rolar (o que já está na tela não anima) */
    var reveals = $$('.reveal');
    if ('IntersectionObserver' in window && !reduce) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
      }, { rootMargin: '0px 0px -6% 0px' });
      reveals.forEach(function (el) {
        if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('is-in', 'is-static');
        else io.observe(el);
      });
    } else reveals.forEach(function (el) { el.classList.add('is-in', 'is-static'); });

    /* Formulários de demonstração (o desenvolvedor liga ao envio real) */
    $$('[data-demo-form]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var msg = $('.cta__small, .form__msg', form);
        if (msg) msg.textContent = form.getAttribute('data-demo-form');
        form.reset();
      });
    });

    /* Busca */
    $$('form[role="search"]').forEach(function (f) {
      f.addEventListener('submit', function (e) {
        var val = $('input', f).value;
        try { sessionStorage.setItem('cbn-busca', val); } catch (err) {}
        if (f.hasAttribute('data-results-form')) return;
        if (SOFT) { e.preventDefault(); closePanels(); go(new URL(f.getAttribute('action'), location.href).href.split('?')[0] + '?s=' + encodeURIComponent(val), true); }
      });
    });
    $$('.search__tags a, .article__tags a').forEach(function (a) {
      a.addEventListener('click', function () { try { sessionStorage.setItem('cbn-busca', a.textContent); } catch (e) {} });
    });
    var results = $('[data-results]');
    if (results) {
      var norm = function (s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
      var input = $('[data-results-form] input'), count = $('[data-results-count]'), none = $('[data-results-empty]');
      var filter = function (term) {
        var words = norm(term).split(/\s+/).filter(Boolean), n = 0;
        $$('.card', results).forEach(function (c) {
          var ok = words.every(function (w) { return norm(c.getAttribute('data-search') || c.textContent).indexOf(w) > -1; });
          c.hidden = !ok; if (ok) n++;
        });
        none.hidden = n > 0;
        count.textContent = term ? n + (n === 1 ? ' resultado para “' : ' resultados para “') + term + '”' : n + ' publicações';
      };
      var m = /[?&]s=([^&#]*)/.exec(location.search);
      var term = m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
      if (!term) { try { term = sessionStorage.getItem('cbn-busca') || ''; } catch (e) {} }
      input.value = term; filter(term);
      input.addEventListener('input', function () { filter(input.value); });
      $('[data-results-form]').addEventListener('submit', function (e) { e.preventDefault(); filter(input.value); });
    }

    /* Editorias: "Carregar mais" */
    $$('[data-load-more]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $$('[data-more][hidden]').slice(0, 6).forEach(function (el, k) {
          el.hidden = false; el.style.animationDelay = (k * 50) + 'ms'; el.classList.add('fade-in');
        });
        if (!$('[data-more][hidden]')) btn.hidden = true;
      });
    });

    /* Notícia: tamanho da letra, ouvir e compartilhar */
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
          var text = ($('.article__title') ? $('.article__title').textContent + '. ' : '') +
            $$('p, h2, li', prose).filter(function (el) { return !el.closest('.ad'); }).map(function (el) { return el.textContent; }).join(' ');
          var u = new SpeechSynthesisUtterance(text);
          u.lang = 'pt-BR'; u.onend = stopSpeak; u.onerror = stopSpeak;
          speechSynthesis.cancel(); speechSynthesis.speak(u);
          listen.setAttribute('aria-pressed', 'true'); $('span', listen).textContent = 'Parar';
        });
      }
    }
    $$('[data-share]').forEach(function (a) {
      var url = encodeURIComponent(location.href), title = encodeURIComponent(document.title), kind = a.getAttribute('data-share');
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

    /* Stories */
    var stories = $$('.story');
    if (stories.length) viewer = buildViewer(stories);

    lastY = window.scrollY;
    onScroll();
  }

  /* ======================================================================
     boot() — ouvintes globais, registrados uma única vez
     ====================================================================== */
  var lastY = 0, ticking = false;
  function onScroll() {
    var y = window.scrollY;
    if (header) {
      header.classList.toggle('is-stuck', y > 40);
      if (Math.abs(y - lastY) > 6) {                       // ignora tremidas do dedo
        header.classList.toggle('is-hidden', window.innerWidth < 768 && y > 300 && y > lastY);
        lastY = y;
      }
    }
    if (progressBar && prose) {
      var r = prose.getBoundingClientRect();
      var total = r.height - window.innerHeight * 0.5;
      progressBar.style.transform = 'scaleX(' + Math.min(1, Math.max(0, (window.innerHeight * 0.5 - r.top) / (total || 1))) + ')';
    }
    ticking = false;
  }
  function boot() {
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });

    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (placeCapsule) placeCapsule(false); }, 120); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (placeCapsule) placeCapsule(false); });

    document.addEventListener('keydown', function (e) {
      if (viewer && viewer.isOpen()) {
        if (e.key === 'Escape') viewer.close();
        if (e.key === 'ArrowRight') viewer.next();
        if (e.key === 'ArrowLeft') viewer.prev();
        return;
      }
      if (e.key === 'Escape') closePanels();
      if (e.key === '/' && !/input|textarea|select/i.test(e.target.tagName) && search) { e.preventDefault(); openPanel(search); }
    });

    if (media) {
      var onSystem = function () { if (root.getAttribute('data-cbn-mode') === 'auto') paintTheme('auto'); };
      if (media.addEventListener) media.addEventListener('change', onSystem); else if (media.addListener) media.addListener(onSystem);
    }

    if (audio) audio.addEventListener('error', function () { paintRadio(false); });
    try { if (audio && sessionStorage.getItem('cbn-radio') === '1') playRadio(); } catch (e) {}   // retoma após recarregar

    /* Cliques em links internos */
    document.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || !internalLink(a, e)) return;
      e.preventDefault();
      if (a.pathname === location.pathname && a.search === location.search) {
        closePanels();
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
        return;
      }
      if (SOFT) go(a.href, true); else leave(a.href);
    });
    /* Adianta o carregamento quando o leitor demonstra intenção de clicar */
    if (SOFT) {
      var warm = function (e) {
        var a = e.target.closest ? e.target.closest('a[href]') : null;
        if (a && a.protocol === location.protocol && a.host === location.host && isPage(a.pathname) && a.pathname !== location.pathname && a.getAttribute('href').charAt(0) !== '#') fetchPage(a.href);
      };
      var ht;
      document.addEventListener('pointerover', function (e) { if (e.pointerType === 'mouse') { clearTimeout(ht); ht = setTimeout(function () { warm(e); }, 70); } }, { passive: true });
      document.addEventListener('touchstart', warm, { passive: true });
      window.addEventListener('popstate', function (e) { go(location.href, false, (e.state && e.state.y) || 0); });
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    }
    window.addEventListener('pageshow', function (e) { if (e.persisted) root.classList.remove('is-leaving'); });
    window.addEventListener('pagehide', function () { if (window.speechSynthesis) speechSynthesis.cancel(); });
  }

  boot();
  init(false);
})();
