/* shared.js — regras de dominio, usadas pelo background e pelo popup.
   Script CLASSICO de proposito (nada de import/export): assim o mesmo arquivo
   carrega como script do event page no Firefox e via importScripts no
   service worker do Chrome. Expoe tudo em globalThis.VideoKeysShared. */

(() => {
  "use strict";

  const STORAGE_KEY = "allowedSites";

  /**
   * Transforma qualquer coisa que o usuario digitar num hostname limpo.
   *   "https://app.rocketseat.com.br/aulas/x?y=1"  ->  "app.rocketseat.com.br"
   *   "  WWW.Rocketseat.com.br/ "                  ->  "rocketseat.com.br"
   *   "localhost:3000"                             ->  "localhost"
   * Retorna "" se a entrada nao for um dominio valido.
   */
  function normalizeHost(input) {
    if (!input) return "";
    let raw = String(input).trim().toLowerCase();
    if (!raw) return "";

    // A API URL faz o trabalho pesado (porta, caminho, query, hash, user:pass).
    // Ela exige protocolo, entao eu invento um se nao vier.
    if (!/^[a-z][a-z0-9+.-]*:\/\//.test(raw)) raw = "https://" + raw;

    let host;
    try {
      host = new URL(raw).hostname;
    } catch (_) {
      return "";
    }

    host = host.replace(/^www\./, "").replace(/\.$/, "");

    const valido = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || host === "localhost";
    return valido ? host : "";
  }

  /**
   * O host esta coberto pela lista?
   * Uma entrada cobre ela mesma e todos os subdominios:
   *   "rocketseat.com.br" cobre "app.rocketseat.com.br"
   *   mas NAO cobre "rocketseat.com.br.golpe.com"  (por causa do ".")
   */
  function isHostAllowed(host, lista) {
    const h = normalizeHost(host);
    if (!h || !Array.isArray(lista)) return false;

    return lista.some((item) => {
      const e = normalizeHost(item);
      return !!e && (h === e || h.endsWith("." + e));
    });
  }

  /** Extrai o host de uma URL de aba, ignorando chrome://, about:, file:// etc. */
  function hostFromUrl(url) {
    if (!url || !/^https?:\/\//i.test(url)) return "";
    return normalizeHost(url);
  }

  globalThis.VideoKeysShared = { normalizeHost, isHostAllowed, hostFromUrl, STORAGE_KEY };
})();
