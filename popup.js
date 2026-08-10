/* popup.js — CRUD da lista de sites liberados.
   Fonte da verdade e o api.storage.sync; a tela so reflete o que esta la. */

// Firefox expoe browser.*; Chrome expoe chrome.*. Um alias resolve os dois.
const api = globalThis.browser || globalThis.chrome;
const { normalizeHost, isHostAllowed, hostFromUrl, STORAGE_KEY } = globalThis.VideoKeysShared;

const $input = document.getElementById("input");
const $add = document.getElementById("add");
const $current = document.getElementById("current");
const $list = document.getElementById("list");
const $erro = document.getElementById("erro");
const $status = document.getElementById("status");

/* ---------- storage ---------- */
async function ler() {
  const dados = await api.storage.sync.get(STORAGE_KEY);
  return Array.isArray(dados[STORAGE_KEY]) ? dados[STORAGE_KEY] : [];
}

async function gravar(lista) {
  await api.storage.sync.set({ [STORAGE_KEY]: lista });
}

/* ---------- render ---------- */
function erro(msg) {
  $erro.textContent = msg || "";
  $erro.hidden = !msg;
}

function render(lista) {
  $list.textContent = "";

  if (!lista.length) {
    const li = document.createElement("li");
    li.className = "vazio";
    li.textContent = "Nenhum site liberado. A extensão está dormindo em toda a web.";
    $list.appendChild(li);
    return;
  }

  for (const host of lista) {
    const li = document.createElement("li");
    li.className = "item";

    const span = document.createElement("span");
    span.textContent = host;

    const btn = document.createElement("button");
    btn.className = "rm";
    btn.textContent = "×";
    btn.title = "Remover " + host;
    btn.setAttribute("aria-label", "Remover " + host);
    btn.addEventListener("click", () => remover(host));

    li.append(span, btn);
    $list.appendChild(li);
  }
}

/* ---------- acoes ---------- */
async function adicionar(valorBruto) {
  const host = normalizeHost(valorBruto);
  if (!host) {
    erro("Domínio inválido. Tente algo como app.rocketseat.com.br");
    return;
  }

  const lista = await ler();
  if (lista.includes(host)) {
    erro(host + " já está na lista.");
    return;
  }

  lista.push(host);
  lista.sort();
  await gravar(lista);

  erro("");
  $input.value = "";
  render(lista);
  atualizarStatus();
}

async function remover(host) {
  const lista = (await ler()).filter((h) => h !== host);
  await gravar(lista);
  render(lista);
  atualizarStatus();
}

/* ---------- aba atual ---------- */
async function abaAtual() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function atualizarStatus() {
  const tab = await abaAtual();
  const host = hostFromUrl(tab && tab.url);

  if (!host) {
    $status.textContent = "Esta aba não é uma página web comum.";
    $status.dataset.on = "false";
    return;
  }

  const ligada = isHostAllowed(host, await ler());
  $status.textContent = ligada ? "Ativa em " + host : "Dormindo em " + host;
  $status.dataset.on = String(ligada);
}

/* ---------- eventos ---------- */
$add.addEventListener("click", () => adicionar($input.value));

$input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") adicionar($input.value);
});

$input.addEventListener("input", () => erro(""));

$current.addEventListener("click", async () => {
  const tab = await abaAtual();
  const host = hostFromUrl(tab && tab.url);
  if (!host) {
    erro("Esta aba não tem um domínio que possa ser liberado.");
    return;
  }
  adicionar(host);
});

/* ---------- inicializacao ---------- */
(async () => {
  render(await ler());
  atualizarStatus();
  $input.focus();
})();
