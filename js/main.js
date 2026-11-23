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
  var breakingTimer = null, viewer = null, io = null, placeNav = null, onairTimer = null, onairTick = null, onairRealign = null;
  var prevPill = null, prevChipScroll = null, prevChipPill = null;

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

  /* Controle de volume: o botão segue o cursor 1:1 enquanto é arrastado; um clique
     no trilho ou uma tecla faz ele deslizar até o ponto. Setas mudam de 5 em 5
     (com Shift, PageUp ou PageDown, de 10 em 10); Home e End vão aos extremos. */
  var lastVolume = 1;
  function initVolume(box) {
    var control = $('.vol__control', box), thumb = $('.vol__thumb', box), bubble = $('.vol__bubble', box), mute = $('[data-mute]', box);
    var dragging = false, grab = 0, lingerTimer = null, byPointer = false;
    var current = function () { return audio ? (audio.muted ? 0 : audio.volume) : 1; };
    var paint = function () {
      var v = current(), n = Math.round(v * 100);
      box.style.setProperty('--p', v);
      box.classList.toggle('is-muted', v === 0);
      thumb.setAttribute('aria-valuenow', n);
      thumb.setAttribute('aria-valuetext', n + '%');
      bubble.textContent = n;
      mute.setAttribute('aria-pressed', String(v === 0));
      mute.setAttribute('aria-label', v === 0 ? 'Ativar o som' : 'Silenciar');
    };
    var set = function (v) {
      v = Math.min(1, Math.max(0, v));
      if (audio) { audio.volume = v; audio.muted = false; }
      if (v > 0) lastVolume = v;
      paint();
    };
    var fromPointer = function (e) {
      var r = control.getBoundingClientRect();
      return (e.clientX - grab - r.left - 8) / (r.width - 16);
    };
    var linger = function () {
      clearTimeout(lingerTimer);
      box.classList.add('is-linger');
      lingerTimer = setTimeout(function () { box.classList.remove('is-linger'); }, 700);
    };
    control.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      var onThumb = e.target === thumb || thumb.contains(e.target);
      var tr = thumb.getBoundingClientRect();
      grab = onThumb ? e.clientX - (tr.left + tr.width / 2) : 0;
      if (!onThumb) { set(fromPointer(e)); void thumb.offsetWidth; }   // clique no trilho: desliza com mola
      dragging = true;
      box.classList.add('is-dragging');
      box.classList.remove('is-key', 'is-linger');
      control.setPointerCapture(e.pointerId);
      byPointer = true; thumb.focus({ preventScroll: true }); byPointer = false;
    });
    control.addEventListener('pointermove', function (e) { if (dragging) set(fromPointer(e)); });
    var end = function () {
      if (!dragging) return;
      dragging = false;
      box.classList.remove('is-dragging');
      linger();
    };
    control.addEventListener('pointerup', end);
    control.addEventListener('pointercancel', end);
    control.addEventListener('lostpointercapture', end);
    thumb.addEventListener('keydown', function (e) {
      var big = e.shiftKey ? 0.1 : 0.05;
      var moves = { ArrowRight: big, ArrowUp: big, ArrowLeft: -big, ArrowDown: -big, PageUp: 0.1, PageDown: -0.1 };
      var v;
      if (e.key === 'Home') v = 0;
      else if (e.key === 'End') v = 1;
      else if (e.key in moves) v = Math.round((current() + moves[e.key]) * 100) / 100;
      else return;
      e.preventDefault();
      box.classList.add('is-key');
      set(v);
    });
    thumb.addEventListener('focus', function () { if (!byPointer) box.classList.add('is-key'); });   // foco pelo teclado mostra o anel e o balão
    thumb.addEventListener('blur', function () { box.classList.remove('is-key'); });
    mute.addEventListener('click', function () {
      if (current() === 0) set(lastVolume || 1);
      else { if (audio) audio.muted = true; paint(); }
      linger();
    });
    paint();
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
    var act = $('.mainnav__active');
    /* Guarda a posição em que a marca está NA TELA (pode estar no meio do deslize),
       para a página seguinte continuar o movimento do mesmo ponto, sem salto. */
    prevPill = null;
    if (act && act.classList.contains('is-on')) {
      var acs = getComputedStyle(act);
      var mx = acs.transform && acs.transform !== 'none' ? new DOMMatrixReadOnly(acs.transform).m41 : 0;
      prevPill = { x: 'translateX(' + mx + 'px)', w: acs.width };
    }
    var cl = $('.chips__list');
    prevChipScroll = cl ? cl.scrollLeft : null;
    var cp = $('.chips__pill');
    prevChipPill = null;
    if (cp && cp.classList.contains('is-on')) { var ccs = getComputedStyle(cp); prevChipPill = { l: ccs.left, w: ccs.width }; }
    try { sessionStorage.setItem('cbn-nav', JSON.stringify({ pill: prevPill, chip: prevChipScroll, chipPill: prevChipPill, t: Date.now() })); } catch (e) {}
  }
  function teardown() {
    clearInterval(breakingTimer); clearInterval(onairTimer); clearInterval(onairTick);
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
        rememberNav();                                   // posição da marca no instante da troca
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

  /* Relógio do cabeçalho: hora, dia da semana e data, atualizados sozinhos */
  function tickClock() {
    var d = new Date();
    var two = function (n) { return (n < 10 ? '0' : '') + n; };
    var wd = d.toLocaleDateString('pt-BR', { weekday: 'long' });
    $$('[data-clock]').forEach(function (el) { el.textContent = two(d.getHours()) + ':' + two(d.getMinutes()); });
    $$('[data-weekday]').forEach(function (el) { el.textContent = wd.charAt(0).toUpperCase() + wd.slice(1); });
    $$('[data-date]').forEach(function (el) { el.textContent = d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }); });
  }

  /* ======================================================================
     init() — liga tudo o que está na página atual
     ====================================================================== */
  function init(soft) {
    header = $('.header'); drawer = $('.drawer'); search = $('.search'); scrim = $('.scrim');
    progressBar = $('.progress i'); prose = $('[data-prose]');

    tickClock();

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
    $$('[data-volume]').forEach(initVolume);

    /* Menu em cápsula: uma chapa vermelha marca a editoria atual e desliza até
       a nova ao trocar de página; outra, cinza, acompanha o cursor.            */
    var memo = null;
    if (!soft) { try { memo = JSON.parse(sessionStorage.getItem('cbn-nav') || 'null'); if (memo && Date.now() - memo.t > 4000) memo = null; } catch (e) {} }
    var fromPill = soft ? prevPill : memo && memo.pill;
    var fromChip = soft ? prevChipScroll : memo && memo.chip;
    var fromChipPill = soft ? prevChipPill : memo && memo.chipPill;
    placeNav = null;
    $$('[data-mainnav]').forEach(function (cap) {
      var list = $('.mainnav__list', cap);
      var hover = $('.mainnav__pill', cap);
      var active = document.createElement('span');
      active.className = 'mainnav__active'; active.setAttribute('aria-hidden', 'true');
      cap.insertBefore(active, list);
      cap.classList.add('is-ready');
      var current = $('.mainnav__link[aria-current]', cap);
      var put = function (el, link) {
        el.style.width = link.offsetWidth + 'px';
        el.style.transform = 'translateX(' + (list.offsetLeft + link.offsetLeft) + 'px)';
      };
      placeNav = function (animate) {
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
        requestAnimationFrame(function () { placeNav(true); });
      } else placeNav(false);

      var moveHover = function (link) {
        if (link === current) { hover.classList.remove('is-on'); return; }
        var first = !hover.classList.contains('is-on');
        if (first) hover.classList.add('is-jump');
        put(hover, link);
        if (first) { void hover.offsetWidth; hover.classList.remove('is-jump'); }
        hover.classList.add('is-on');
      };
      $$('.mainnav__link', cap).forEach(function (link) {
        link.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') moveHover(link); });
        link.addEventListener('focus', function () { moveHover(link); });
        link.addEventListener('click', function (e) {      // resposta imediata ao clique
          if (link === current || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          var old = current;
          if (old) old.removeAttribute('aria-current');
          link.setAttribute('aria-current', 'page');
          current = link; hover.classList.remove('is-on'); placeNav(true);
        });
      });
      cap.addEventListener('pointerleave', function () { hover.classList.remove('is-on'); });
      cap.addEventListener('focusout', function (e) { if (!cap.contains(e.relatedTarget)) hover.classList.remove('is-on'); });
    });

    /* Editorias no mobile: a marca vermelha desliza até a editoria tocada e a
       faixa mantém a rolagem, levando a editoria atual para a área visível.   */
    var chipList = $('.chips__list');
    if (chipList) {
      var chipNow = $('.chips__link[aria-current]', chipList);
      var chipPill = document.createElement('li');
      chipPill.className = 'chips__pill'; chipPill.setAttribute('aria-hidden', 'true'); chipPill.setAttribute('role', 'presentation');
      chipList.insertBefore(chipPill, chipList.firstChild);
      chipList.parentNode.classList.add('is-ready');
      var putChip = function (link, animate) {
        if (!animate) chipPill.classList.add('is-jump');
        chipPill.style.left = link.offsetLeft + 'px';
        chipPill.style.width = link.offsetWidth + 'px';
        chipPill.classList.add('is-on');
        if (!animate) { void chipPill.offsetWidth; chipPill.classList.remove('is-jump'); }
      };
      if (fromChip != null) chipList.scrollLeft = fromChip;
      if (chipNow) {
        if (fromChipPill && !reduce) {                     // parte de onde estava na página anterior
          chipPill.classList.add('is-jump', 'is-on');
          chipPill.style.left = fromChipPill.l; chipPill.style.width = fromChipPill.w;
          void chipPill.offsetWidth; chipPill.classList.remove('is-jump');
          requestAnimationFrame(function () { putChip(chipNow, true); });
        } else putChip(chipNow, false);
        /* A faixa só rola se a editoria atual não estiver inteira na tela — e só
           depois do deslize da marca, para os dois movimentos não se misturarem. */
        var seen = chipNow.offsetLeft - chipList.scrollLeft >= 8 &&
                   chipNow.offsetLeft + chipNow.offsetWidth - chipList.scrollLeft <= chipList.clientWidth - 8;
        var target = Math.max(0, chipNow.offsetLeft - (chipList.clientWidth - chipNow.offsetWidth) / 2);
        if (!seen) {
          if (fromChip != null && !reduce) setTimeout(function () { if (document.contains(chipList)) chipList.scrollTo({ left: target, behavior: 'smooth' }); }, 420);
          else chipList.scrollLeft = target;
        }
      }
      $$('.chips__link', chipList).forEach(function (link) {
        link.addEventListener('click', function (e) {      // resposta imediata ao toque
          if (link === chipNow || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          if (chipNow) chipNow.removeAttribute('aria-current');
          link.setAttribute('aria-current', 'page');
          chipNow = link; putChip(link, true);
        });
      });
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

    /* Máscara de telefone: (65) 99999-9999 para celular ou (65) 3333-3333 para fixo.
       Aceita só números, formata enquanto a pessoa digita e também o que for colado. */
    $$('input[type="tel"]').forEach(function (tel) {
      var mask = function (v) {
        var d = v.replace(/\D/g, '');
        if (d.length > 11 && d.indexOf('55') === 0) d = d.slice(2);   // número colado com +55 na frente
        d = d.slice(0, 11);
        if (d.length > 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
        if (d.length > 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
        if (d.length > 2) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
        return d.length ? '(' + d : '';
      };
      tel.addEventListener('input', function () { tel.value = mask(tel.value); });
      tel.addEventListener('blur', function () {          // avisa se o número ficou incompleto
        var n = tel.value.replace(/\D/g, '').length;
        tel.setCustomValidity(n === 0 || n === 10 || n === 11 ? '' : 'Informe o telefone com DDD, por exemplo (65) 99999-9999.');
      });
      tel.value = mask(tel.value);
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

    /* CBN Ao Vivo: o player do YouTube só é carregado no clique (página mais leve).
       Um vídeo da lista toca no mesmo player; "Voltar para o ao vivo" retorna à transmissão.
       Ao dar play no vídeo, a rádio do rodapé é pausada para não tocar dois áudios. */
    $$('[data-live-player]').forEach(function (box) {
      var LIVE = box.getAttribute('data-live-src');
      var poster = $('[data-live-play]', box), back = $('[data-live-back]', box);
      var links = $$('[data-video]', box.parentNode);
      var frame = null;
      var mark = function (cur) { links.forEach(function (a) { a.classList.toggle('is-current', a === cur); if (a === cur) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); }); };
      var play = function (src, title) {
        if (audio && !audio.paused) toggleRadio();
        if (!frame) {
          frame = document.createElement('iframe');
          frame.className = 'live__frame';
          frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
          frame.setAttribute('allowfullscreen', '');
          frame.referrerPolicy = 'strict-origin-when-cross-origin';
          box.insertBefore(frame, back);
        }
        frame.title = title;
        frame.src = src;
        box.classList.add('is-playing');
      };
      poster.addEventListener('click', function () { play(LIVE, 'CBN Cuiabá ao vivo'); back.hidden = true; mark(null); });
      back.addEventListener('click', function () { play(LIVE, 'CBN Cuiabá ao vivo'); back.hidden = true; mark(null); });
      links.forEach(function (a) {
        a.addEventListener('click', function (e) {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;   // nova aba: abre no YouTube
          e.preventDefault();
          play('https://www.youtube-nocookie.com/embed/' + a.getAttribute('data-video') + '?autoplay=1&rel=0', $('.vid__title', a).textContent);
          back.hidden = false;
          mark(a);
          var r = box.getBoundingClientRect();
          if (r.top < 60 || r.bottom > window.innerHeight) box.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
        });
      });
    });

    /* Vídeos e Entrevistas: o vídeo toca dentro do próprio card (carrega só no clique).
       Ao dar play, a rádio do rodapé é pausada para não tocar dois áudios. */
    $$('[data-yt]').forEach(function (card) {
      var media = $('.yt__media', card);
      media.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;   // nova aba: abre no YouTube
        e.preventDefault();
        if (audio && !audio.paused) toggleRadio();
        var f = document.createElement('iframe');
        f.className = 'yt__frame';
        f.title = $('.yt__title', card).textContent.trim();
        f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        f.setAttribute('allowfullscreen', '');
        f.referrerPolicy = 'strict-origin-when-cross-origin';
        f.src = 'https://www.youtube-nocookie.com/embed/' + card.getAttribute('data-yt') + '?autoplay=1&rel=0';
        media.replaceWith(f);
      });
    });

    /* Faixa de programação: "No ar agora" pelo horário de Cuiabá, barra de progresso
       do programa e slide com urgentes e próximos programas (passa sozinho a cada 5 s,
       pausa com o mouse ou o foco em cima, aceita setas e o deslizar do dedo). */
    var onair = $('[data-onair]');
    if (onair) {
      var grade = [];
      try { grade = JSON.parse($('#cbn-grade', onair).textContent); } catch (e) {}
      var track = $('[data-onair-track]', onair);
      var cuiaba = function () {                                    // data e hora em Cuiabá
        var parts = {};
        new Intl.DateTimeFormat('en-US', { timeZone: 'America/Cuiaba', hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit' })
          .formatToParts(new Date()).forEach(function (x) { parts[x.type] = x.value; });
        var wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
        return { wd: wd, min: (parseInt(parts.hour, 10) % 24) * 60 + parseInt(parts.minute, 10) };
      };
      var toMin = function (s) { var p = s.split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); };
      var label = function (s) { var p = s.split(':'); var h = parseInt(p[0], 10) % 24; return h + 'h' + (p[1] !== '00' ? p[1] : ''); };
      var dayOk = function (item, wd) { return item.dias === 'sab-dom' ? (wd === 0 || wd === 6) : (wd >= 1 && wd <= 5); };
      var today = function (wd) { return grade.filter(function (g) { return dayOk(g, wd); }).sort(function (a, b) { return toMin(a.inicio) - toMin(b.inicio); }); };
      var esc = function (s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
      var urgent = $$('.onair__slide--urgent', track);
      var idx = 0, sig = '';
      var slides = function () { return $$('.onair__slide', track).filter(function (s) { return getComputedStyle(s).display !== 'none'; }); };
      var go = function (n, smooth) {
        var list = slides();
        if (!list.length) return;
        idx = (n + list.length) % list.length;
        if (smooth === false) track.style.transition = 'none';
        var x = list[idx].getBoundingClientRect().left - list[0].getBoundingClientRect().left;   // posição dentro do trilho
        track.style.transform = 'translateX(' + (-x) + 'px)';
        if (smooth === false) { void track.offsetWidth; track.style.transition = ''; }
      };
      var render = function () {
        var now = cuiaba(), list = today(now.wd), cur = null, next = [];
        list.forEach(function (g) {
          var s = toMin(g.inicio), e = toMin(g.fim);
          if (now.min >= s && now.min < e) cur = g; else if (s > now.min) next.push(g);
        });
        var DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
        next = next.map(function (g) { return { g: g, dia: '' }; });
        for (var d = 1; d <= 3 && next.length < 6; d++) {
          var wd2 = (now.wd + d) % 7;
          today(wd2).forEach(function (g) { next.push({ g: g, dia: d === 1 ? 'amanhã, ' : DIAS[wd2] + ', ' }); });
        }
        var local = next.filter(function (n) { return n.g.programa !== 'CBN Brasil'; });   // destaca os programas locais
        next = (local.length ? local : next).slice(0, 3);
        if (cur) {
          $('[data-now-title]', onair).textContent = cur.programa;
          $('[data-now-hosts]', onair).textContent = cur.apresentacao;
          $('[data-now-time]', onair).textContent = label(cur.inicio) + ' às ' + label(cur.fim);
          var pct = Math.max(0, Math.min(100, (now.min - toMin(cur.inicio)) / (toMin(cur.fim) - toMin(cur.inicio)) * 100));
          $('[data-now-progress]', onair).style.setProperty('--p', pct.toFixed(1) + '%');
        }
        var key = (cur ? cur.programa + cur.inicio : '') + '|' + next.map(function (n) { return n.dia + n.g.programa + n.g.inicio; }).join(',');
        if (key === sig) return;                                    // só redesenha o slide quando a grade muda
        sig = key;
        $$('.onair__slide--now, .onair__slide--next', track).forEach(function (s) { s.remove(); });
        var html = '';
        if (cur) html += '<div class="onair__slide onair__slide--now"><span class="onair__tag"><span class="pulse"></span> No ar agora · ' + label(cur.inicio) + ' às ' + label(cur.fim) + '</span><span class="onair__slide-title">' + esc(cur.programa) + '</span><span class="onair__slide-meta">' + esc(cur.apresentacao) + '</span></div>';
        next.forEach(function (n) {
          var g = n.g;
          html += '<div class="onair__slide onair__slide--next"><span class="onair__tag">A seguir · ' + n.dia + label(g.inicio) + '</span><span class="onair__slide-title">' + esc(g.programa) + '</span><span class="onair__slide-meta">' + esc(g.apresentacao) + '</span></div>';
        });
        var tmp = document.createElement('div'); tmp.innerHTML = html;
        var nowSlide = tmp.querySelector('.onair__slide--now');
        if (nowSlide) track.insertBefore(nowSlide, track.firstChild);  // celular: começa pelo "No ar agora"
        $$('.onair__slide--next', tmp).forEach(function (s) { track.appendChild(s); });
        go(0, false);
      };
      var clock = function () {
        var d = new Date();
        var fmt = function (o) { return new Intl.DateTimeFormat('pt-BR', Object.assign({ timeZone: 'America/Cuiaba' }, o)).format(d); };
        $$('[data-clock]', onair).forEach(function (el) { el.textContent = fmt({ hour: '2-digit', minute: '2-digit' }); });
        $$('[data-weekday-short]', onair).forEach(function (el) { var w = fmt({ weekday: 'short' }).replace('.', ''); el.textContent = w.charAt(0).toUpperCase() + w.slice(1); });
        $$('[data-date-short]', onair).forEach(function (el) { el.textContent = fmt({ day: 'numeric', month: 'short' }).replace('.', '').replace(' de ', ' '); });
      };
      var paused = false;
      var auto = function () { clearInterval(onairTimer); if (!reduce) onairTimer = setInterval(function () { if (!paused) go(idx + 1); }, 5000); };
      var slider = $('[data-onair-slider]', onair);
      slider.addEventListener('mouseenter', function () { paused = true; });
      slider.addEventListener('mouseleave', function () { paused = false; });
      slider.addEventListener('focusin', function () { paused = true; });
      slider.addEventListener('focusout', function () { paused = false; });
      $('[data-onair="prev"]', onair).addEventListener('click', function () { go(idx - 1); auto(); });
      $('[data-onair="next"]', onair).addEventListener('click', function () { go(idx + 1); auto(); });
      var x0 = null;                                                // deslizar com o dedo
      slider.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      slider.addEventListener('touchend', function (e) {
        if (x0 === null) return;
        var dx = e.changedTouches[0].clientX - x0; x0 = null;
        if (Math.abs(dx) > 40) { go(idx + (dx < 0 ? 1 : -1)); auto(); }
      });
      onairRealign = function () { go(idx, false); };
      render(); clock(); auto();
      clearInterval(onairTick);
      onairTick = setInterval(function () { render(); clock(); }, 30000);
      if (!urgent.length && !slides().length) slider.hidden = true;
    }

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
      /* No desktop a linha vermelha rola para fora e o menu fica fixo, em modo compacto */
      var top = $('.header__top', header);
      var condensed = window.innerWidth >= 1024 && !!top && top.getBoundingClientRect().bottom <= 1;   // linha vermelha já saiu da tela
      if (condensed !== header.classList.contains('is-condensed')) {
        header.classList.toggle('is-condensed', condensed);
        $$('.header__mini, .header__mini-actions button', header).forEach(function (el) { el.tabIndex = condensed ? 0 : -1; });
      }
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
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        if (placeNav) placeNav(false);
        if (onairRealign && document.querySelector('[data-onair-track]')) onairRealign();
        var cp = $('.chips__pill'), cn = $('.chips__link[aria-current]');
        if (cp && cn) { cp.classList.add('is-jump'); cp.style.left = cn.offsetLeft + 'px'; cp.style.width = cn.offsetWidth + 'px'; void cp.offsetWidth; cp.classList.remove('is-jump'); }
      }, 120);
    });
    /* Quando a fonte termina de carregar, a largura dos textos muda: realinha os traços
       do menu (desktop e mobile) reaproveitando o ajuste feito ao redimensionar a janela. */
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { window.dispatchEvent(new Event('resize')); });

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
    setInterval(tickClock, 15000);
    window.addEventListener('pageshow', function (e) { if (e.persisted) root.classList.remove('is-leaving'); });
    window.addEventListener('pagehide', function () { if (window.speechSynthesis) speechSynthesis.cancel(); });
  }

  boot();
  init(false);
})();
