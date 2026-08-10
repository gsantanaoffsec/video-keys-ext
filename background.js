/* background.js — dois papeis:
   1) PORTEIRO: decide se a aba esta na lista de sites liberados.
   2) CARTEIRO: repassa comandos do frame de cima pro frame que tem o <video>.

   Toda decisao de permissao mora aqui porque so o background enxerga
   sender.tab.url (a URL da ABA). Um iframe do player esta em outro dominio
   e sozinho nunca saberia que pertence a uma pagina liberada.

   Cross-browser:
   - Chrome roda este arquivo como SERVICE WORKER -> importScripts existe.
   - Firefox roda como EVENT PAGE e ja carregou shared.js pelo manifest
     -> importScripts nao existe, e o if abaixo simplesmente pula. */

if (typeof importScripts === "function" && !globalThis.VideoKeysShared) {
  importScripts("shared.js");
}

// Firefox expoe browser.* (promises); Chrome expoe chrome.* (promises no MV3).
const api = globalThis.browser || globalThis.chrome;
const { isHostAllowed, hostFromUrl, STORAGE_KEY } = globalThis.VideoKeysShared;

/* ---------- cache da lista ----------
   O background do MV3 dorme e acorda. "pronto" garante que qualquer handler
   espere a primeira leitura do storage antes de responder. */
let lista = [];
let pronto = carregar();

async function carregar() {
  const dados = await api.storage.sync.get(STORAGE_KEY);
  lista = Array.isArray(dados[STORAGE_KEY]) ? dados[STORAGE_KEY] : [];
  return lista;
}

async function abaLiberada(tab) {
  await pronto;
  return isHostAllowed(hostFromUrl(tab && tab.url), lista);
}

/* ---------- mensagens vindas dos content scripts ---------- */
api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.__videoKeys) return;

  const tab = sender.tab;
  if (!tab || tab.id == null) return;

  // "check": o content script acabou de carregar e pergunta se pode agir
  if (msg.type === "check") {
    abaLiberada(tab).then((ok) => sendResponse({ allowed: ok }));
    return true; // mantem o canal aberto pra resposta assincrona
  }

  // Qualquer outra coisa so passa se a aba estiver liberada.
  abaLiberada(tab).then((ok) => {
    if (!ok) return;

    if (msg.type === "command") {
      enviar(tab.id, { type: "command", cmd: msg.cmd, arg: msg.arg });
    } else if (msg.type === "video-present") {
      enviar(tab.id, { type: "tab-has-video" });
    }
  });
});

/* ---------- mudou a lista no popup: avisa todas as abas na hora ---------- */
api.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes[STORAGE_KEY]) return;
  lista = changes[STORAGE_KEY].newValue || [];
  pronto = Promise.resolve(lista);
  revalidarTodasAsAbas();
});

async function revalidarTodasAsAbas() {
  const abas = await api.tabs.query({});
  for (const t of abas) {
    if (t.id == null || !t.url) continue;
    enviar(t.id, { type: "allowed", value: isHostAllowed(hostFromUrl(t.url), lista) });
  }
}

/* ---------- navegou pra outro dominio na mesma aba ---------- */
api.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return;
  await pronto;
  enviar(tabId, { type: "allowed", value: isHostAllowed(hostFromUrl(changeInfo.url), lista) });
});

/* ---------- utilitarios ---------- */
// sem frameId = entrega em TODOS os frames da aba
function enviar(tabId, payload) {
  const p = api.tabs.sendMessage(tabId, Object.assign({ __videoKeys: true }, payload));
  if (p && p.catch) p.catch(() => {});
}

api.runtime.onInstalled.addListener(() => {
  pronto = carregar();
});
api.runtime.onStartup.addListener(() => {
  pronto = carregar();
});
