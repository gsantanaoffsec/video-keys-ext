/* content.js — roda em TODOS os frames de TODA pagina, mas nasce DORMINDO.
   Nenhum listener de teclado e registrado enquanto o background nao confirmar
   que a aba esta na lista de sites liberados. Site fora da lista = zero
   interferencia (nem preventDefault, nem timer, nem HUD). */

(() => {
  "use strict";

  if (window.__videoKeysLoaded) return;
  window.__videoKeysLoaded = true;

  // Firefox expoe browser.*; Chrome expoe chrome.*. Um alias resolve os dois.
  const api = globalThis.browser || globalThis.chrome;

  const CFG = {
    seekSmall: 5,      // seta esquerda/direita
    seekBig: 10,       // J / L
    volStep: 0.05,     // seta cima/baixo
    rateStep: 0.25,    // < / >
    rateMin: 0.25,
    rateMax: 4,
    frameStep: 1 / 30, // , / .  (1 quadro, assumindo 30fps)
    cacheMs: 1500,     // por quanto tempo confio no video que ja achei
    announceMs: 2000,  // de quanto em quanto tempo aviso "tenho video aqui"
  };

  let ativo = false;       // liberado pela allowlist?
  let enabled = true;      // Alt+K (liga/desliga manual, dentro de site liberado)
  let tabHasVideo = false; // algum frame desta aba tem video?
  let announceTimer = null;
  let cache = null;
  let cacheAt = 0;

  /* ==================================================================
     1) ACHAR O VIDEO (inclusive dentro de shadow DOM)
  ================================================================== */
  function deepVideos(root, out) {
    out = out || [];
    let nodes;
    try {
      nodes = root.querySelectorAll("*");
    } catch (_) {
      return out;
    }
    for (const el of nodes) {
      if (el.tagName === "VIDEO") out.push(el);
      if (el.shadowRoot) deepVideos(el.shadowRoot, out);
    }
    return out;
  }

  function getVideo() {
    const now = Date.now();
    if (cache && cache.isConnected && now - cacheAt < CFG.cacheMs) return cache;

    const list = deepVideos(document).filter(
      (v) => v.src || v.currentSrc || v.readyState > 0
    );
    cacheAt = now;
    if (!list.length) return (cache = null);

    const playing = list.find((v) => !v.paused && !v.ended);
    cache =
      playing ||
      list.sort(
        (a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight
      )[0];
    return cache;
  }

  /* ==================================================================
     2) HUD — balaozinho de feedback
  ================================================================== */
  let hudEl = null;
  let hudTimer = null;

  function hud(text) {
    const host = document.fullscreenElement || document.body;
    if (!host) return;

    if (!hudEl) {
      hudEl = document.createElement("div");
      hudEl.style.cssText = [
        "all:initial",
        "position:fixed",
        "top:24px",
        "left:50%",
        "transform:translateX(-50%)",
        "z-index:2147483647",
        "pointer-events:none",
        "background:rgba(12,12,14,.88)",
        "color:#fff",
        "font:600 14px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
        "letter-spacing:.04em",
        "padding:10px 14px",
        "border-radius:8px",
        "border:1px solid rgba(255,255,255,.14)",
        "opacity:0",
        "transition:opacity .12s ease",
      ].join(";");
    }
    if (hudEl.parentNode !== host) host.appendChild(hudEl);

    hudEl.textContent = text;
    hudEl.style.opacity = "1";
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => {
      if (hudEl) hudEl.style.opacity = "0";
    }, 900);
  }

  function removerHud() {
    clearTimeout(hudTimer);
    if (hudEl && hudEl.parentNode) hudEl.parentNode.removeChild(hudEl);
    hudEl = null;
  }

  const fmt = (s) => {
    s = Math.max(0, Math.floor(s));
    const m = Math.floor(s / 60);
    return m + ":" + String(s % 60).padStart(2, "0");
  };

  /* ==================================================================
     3) EXECUTAR O COMANDO no <video>
  ================================================================== */
  function apply(cmd, arg, v) {
    switch (cmd) {
      case "toggle-play":
        if (v.paused) {
          v.play();
          hud("Play");
        } else {
          v.pause();
          hud("Pausado");
        }
        break;

      case "seek":
        v.currentTime = Math.min(
          v.duration || Infinity,
          Math.max(0, v.currentTime + arg)
        );
        hud((arg > 0 ? "+" : "") + arg + "s  ·  " + fmt(v.currentTime));
        break;

      case "seek-percent":
        if (v.duration) {
          v.currentTime = v.duration * arg;
          hud(Math.round(arg * 100) + "%  ·  " + fmt(v.currentTime));
        }
        break;

      case "frame":
        v.pause();
        v.currentTime = Math.max(0, v.currentTime + arg * CFG.frameStep);
        hud((arg > 0 ? "▶ " : "◀ ") + "1 quadro");
        break;

      case "volume":
        v.muted = false;
        v.volume = Math.min(1, Math.max(0, v.volume + arg));
        hud("Volume " + Math.round(v.volume * 100) + "%");
        break;

      case "mute":
        v.muted = !v.muted;
        hud(v.muted ? "Mudo" : "Som ligado");
        break;

      case "rate":
        v.playbackRate = Math.min(
          CFG.rateMax,
          Math.max(CFG.rateMin, +(v.playbackRate + arg).toFixed(2))
        );
        hud(v.playbackRate + "x");
        break;

      case "rate-reset":
        v.playbackRate = 1;
        hud("1x");
        break;

      case "fullscreen":
        if (document.fullscreenElement) document.exitFullscreen();
        else
          (v.closest("div") || v)
            .requestFullscreen()
            .catch(() => v.requestFullscreen().catch(() => {}));
        break;

      case "pip":
        if (document.pictureInPictureElement) document.exitPictureInPicture();
        else if (v.requestPictureInPicture) v.requestPictureInPicture().catch(() => {});
        break;
    }
  }

  /* ==================================================================
     4) NAO ATRAPALHAR QUEM ESTA DIGITANDO
     composedPath() percorre do alvo ate a window, atravessando shadow DOM.
     Assim um <input> dentro de web component tambem e respeitado.
  ================================================================== */
  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (el.isContentEditable) return true;
    const role = el.getAttribute && el.getAttribute("role");
    return role === "textbox" || role === "searchbox" || role === "combobox";
  }

  function digitando(e) {
    const path = (e.composedPath && e.composedPath()) || [];
    for (const el of path) if (isEditable(el)) return true;
    return isEditable(document.activeElement);
  }

  // Espaco/Enter em botao ou link pertencem ao botao, nao ao video.
  function focoEmBotao(e) {
    if (e.key !== " " && e.key !== "Spacebar" && e.key !== "Enter") return false;
    const path = (e.composedPath && e.composedPath()) || [document.activeElement];
    for (const el of path) {
      if (!el || el.nodeType !== 1) continue;
      if (el.tagName === "BUTTON" || el.tagName === "A") return true;
    }
    const a = document.activeElement;
    return !!a && (a.tagName === "BUTTON" || a.tagName === "A");
  }

  /* ==================================================================
     5) TRADUZIR A TECLA EM COMANDO
  ================================================================== */
  function resolve(e) {
    const k = e.key;

    if (k === " " || k === "Spacebar" || k.toLowerCase() === "k") return ["toggle-play"];
    if (k === "ArrowLeft") return ["seek", -CFG.seekSmall];
    if (k === "ArrowRight") return ["seek", CFG.seekSmall];
    if (k.toLowerCase() === "j") return ["seek", -CFG.seekBig];
    if (k.toLowerCase() === "l") return ["seek", CFG.seekBig];
    if (k === "ArrowUp") return ["volume", CFG.volStep];
    if (k === "ArrowDown") return ["volume", -CFG.volStep];
    if (k.toLowerCase() === "m") return ["mute"];
    if (k.toLowerCase() === "f") return ["fullscreen"];
    if (k.toLowerCase() === "p") return ["pip"];

    // velocidade: ABNT2 tem tecla propria pra < e >; ANSI usa Shift+, e Shift+.
    if (k === "<" || (e.shiftKey && k === ",")) return ["rate", -CFG.rateStep];
    if (k === ">" || (e.shiftKey && k === ".")) return ["rate", CFG.rateStep];
    if (k.toLowerCase() === "r") return ["rate-reset"];

    if (k === ",") return ["frame", -1];
    if (k === ".") return ["frame", 1];

    if (k >= "0" && k <= "9") return ["seek-percent", Number(k) / 10];

    return null;
  }

  /* ==================================================================
     6) LISTENERS — capture:true chega antes do site; stopImmediatePropagation
     impede que o site reaja depois.
  ================================================================== */
  const swallow = new Set();

  function onKeyDown(e) {
    if (!ativo) return;
    if (e.ctrlKey || e.metaKey || e.isComposing) return;
    if (digitando(e)) return;

    if (e.altKey && e.key.toLowerCase() === "k") {
      enabled = !enabled;
      hud(enabled ? "Atalhos ON" : "Atalhos OFF");
      e.preventDefault();
      return;
    }
    if (!enabled || e.altKey) return;
    if (focoEmBotao(e)) return;

    const parsed = resolve(e);
    if (!parsed) return;

    const v = getVideo();
    if (!v && !tabHasVideo) return; // sem video na aba: nao sequestra o teclado

    e.preventDefault();
    e.stopImmediatePropagation();
    swallow.add(e.code || e.key);

    if (v) apply(parsed[0], parsed[1], v);
    else send({ type: "command", cmd: parsed[0], arg: parsed[1] });
  }

  function onKeyOther(e) {
    if (!ativo) return;
    const id = e.code || e.key;
    if (!swallow.has(id)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === "keyup") swallow.delete(id);
  }

  /* ==================================================================
     7) LIGAR / DESLIGAR conforme a allowlist
  ================================================================== */
  function ativar() {
    if (ativo) return;
    ativo = true;
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keypress", onKeyOther, true);
    window.addEventListener("keyup", onKeyOther, true);
    announceTimer = setInterval(anunciar, CFG.announceMs);
    anunciar();
  }

  function desativar() {
    if (!ativo) return;
    ativo = false;
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keypress", onKeyOther, true);
    window.removeEventListener("keyup", onKeyOther, true);
    clearInterval(announceTimer);
    announceTimer = null;
    tabHasVideo = false;
    cache = null;
    swallow.clear();
    removerHud();
  }

  function anunciar() {
    if (document.querySelector("video")) {
      tabHasVideo = true;
      send({ type: "video-present" });
    }
  }

  /* ==================================================================
     8) CONVERSA COM O BACKGROUND
  ================================================================== */
  function send(payload) {
    try {
      const p = api.runtime.sendMessage(Object.assign({ __videoKeys: true }, payload));
      if (p && p.catch) p.catch(() => {});
    } catch (_) {
      /* extensao recarregada: contexto invalidado, ignora */
    }
  }

  api.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.__videoKeys) return;

    if (msg.type === "allowed") {
      msg.value ? ativar() : desativar();
      return;
    }
    if (!ativo) return; // fora da lista: ignora tudo
    if (msg.type === "tab-has-video") {
      tabHasVideo = true;
    } else if (msg.type === "command") {
      const v = getVideo();
      if (v) apply(msg.cmd, msg.arg, v); // so o frame que tem o video reage
    }
  });

  // Pergunta inicial: "esta aba esta liberada?"
  (async () => {
    try {
      const res = await api.runtime.sendMessage({ __videoKeys: true, type: "check" });
      if (res && res.allowed) ativar();
    } catch (_) {}
  })();
})();
