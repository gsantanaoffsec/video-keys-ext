# Video Keys

Atalhos de teclado no estilo YouTube para players de vídeo que ignoram o teclado.

Alguns players web não respondem a `espaço`, `←` ou `→`. Ou engolem o evento de teclado, ou escondem o `<video>` dentro de um iframe de outro domínio, ou os dois. O Video Keys resolve isso por cima, sem depender de nada que o site ofereça.

**A extensão nasce desativada.** Ela não faz absolutamente nada até você adicionar um site à lista de permitidos.

---

## Atalhos

| Tecla | Ação |
|---|---|
| `Espaço` ou `K` | play / pause |
| `←` `→` | -5s / +5s |
| `J` `L` | -10s / +10s |
| `,` `.` | 1 quadro para trás / frente (pausa o vídeo) |
| `<` `>` (ou `Shift+,` `Shift+.`) | velocidade -0.25x / +0.25x |
| `R` | volta para 1x |
| `↑` `↓` | volume ±5% |
| `M` | mudo |
| `F` | tela cheia |
| `P` | picture-in-picture |
| `0`–`9` | pula para 0%…90% do vídeo |
| `Alt+K` | liga/desliga os atalhos na aba atual |

Um HUD discreto aparece no topo do vídeo confirmando cada ação.

---

## Instalação

A extensão não está publicada em nenhuma loja. A instalação é manual.

### Chrome, Edge, Brave, Opera

1. Baixe e descompacte o projeto numa pasta permanente — se você apagar a pasta, a extensão some.
2. Abra `chrome://extensions`.
3. Ative o **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** e selecione a pasta (a que contém o `manifest.json`).
5. Recarregue as abas já abertas.

### Firefox

1. Abra `about:debugging` → **Este Firefox**.
2. Clique em **Carregar extensão temporária** e selecione o arquivo **`manifest.json`** (aqui é o arquivo, não a pasta).
3. Clique no ícone de extensões na barra de ferramentas → Video Keys → **conceda acesso ao site**.

O passo 3 não é opcional. No Firefox, permissões de host em Manifest V3 são tratadas como opcionais e precisam ser concedidas pelo usuário. Carregando como extensão temporária não existe tela de instalação, então nada é concedido automaticamente — sem esse passo o content script não roda.

**Limitação do Firefox:** extensões temporárias somem ao fechar o navegador. Para instalação permanente você precisa de um `.xpi` assinado — envie o pacote ao [addons.mozilla.org](https://addons.mozilla.org) como *unlisted* (a assinatura é automática) ou use o Firefox Developer Edition / Nightly com `xpinstall.signatures.required = false` em `about:config`.

Requisitos: Manifest V3 · Chrome 121+ · Firefox 121+

---

## Uso

Clique no ícone da extensão para abrir o painel.

- **Adicionar** — digite um domínio (`rocketseat.com.br`) ou cole a URL inteira de uma página. A entrada é normalizada automaticamente: protocolo, `www.`, porta, caminho, query e hash são descartados.
- **Liberar o site desta aba** — pega o domínio da aba aberta, sem digitar nada.
- **Remover** — o `×` na linha do site.

Cada entrada cobre o domínio e todos os subdomínios dele. `rocketseat.com.br` já vale para `app.rocketseat.com.br` e `www.rocketseat.com.br`, mas **não** para `rocketseat.com.br.exemplo-falso.com` — a comparação exige o ponto separador.

O topo do painel mostra `Ativa em <domínio>` ou `Dormindo em <domínio>`, que é o teste rápido para saber se está funcionando.

Alterações na lista valem imediatamente, sem recarregar a página.

---

## Como funciona

Três problemas, três soluções.

**O site engole a tecla.** Eventos de teclado descem da `window` até o elemento (captura) e depois sobem (bubbling). A maioria dos sites escuta na subida. O Video Keys escuta na descida — `addEventListener("keydown", fn, true)` — e chama `stopImmediatePropagation()`. Chega primeiro; o site não vê o evento.

**O `<video>` está num iframe de outro domínio.** Um frame não consegue tocar no `<video>` de outro frame cross-origin. A solução é o background script atuando como intermediário:

```
você aperta →  [ frame de cima ]  não tem <video>
                      │  runtime.sendMessage
                      ▼
              [ background ]  ← confere a allowlist e retransmite
                      │  tabs.sendMessage sem frameId
         ┌────────────┼────────────┐
         ▼            ▼            ▼
    [ iframe A ]  [ iframe B ]  [ iframe C ]
     sem vídeo     TEM vídeo     sem vídeo
      ignora        executa       ignora
```

`all_frames: true` no manifest é o que faz o content script existir em todos esses frames.

**O `<video>` está em Shadow DOM.** `document.querySelector("video")` não atravessa shadow roots. A busca é recursiva: varre a árvore e entra em cada elemento que tenha `.shadowRoot`.

### Onde mora a decisão de permissão

Toda checagem de allowlist acontece no background script, nunca no content script. O motivo é o iframe: um player hospedado em outro domínio jamais se reconheceria como pertencente a um site liberado se olhasse o próprio `location.hostname`. O background enxerga `sender.tab.url`, que é sempre a URL da aba — o endereço da portaria, não o do apartamento.

O content script só registra listeners depois que o background confirma a autorização. Em site fora da lista não há `preventDefault`, nem timers, nem HUD, nem listener registrado.

### Compatibilidade entre navegadores

Uma pasta só serve os dois navegadores:

- **Background** — o manifest declara `service_worker` e `scripts` juntos. O Chrome usa o primeiro, o Firefox usa o segundo (o Firefox não suporta service workers para background em MV3; o Chrome 121+ ignora `scripts`).
- **Módulos** — nenhum. O `shared.js` é script clássico e expõe `globalThis.VideoKeysShared`. O `background.js` chama `importScripts("shared.js")` apenas quando essa função existe, o que é verdade no service worker do Chrome e falso no event page do Firefox, onde o manifest já carregou o arquivo.
- **Namespace** — `const api = globalThis.browser || globalThis.chrome;` no topo de cada script.

---

## Estrutura

```
video-keys/
├── manifest.json   Manifest V3, compatível com Chrome e Firefox
├── shared.js       normalização de domínio e matching da allowlist
├── background.js   decide permissão e retransmite comandos entre frames
├── content.js      escuta teclado e controla o <video>
├── popup.html      painel de configuração
├── popup.css       estilos do painel
└── popup.js        adicionar, listar e remover sites
```

---

## Privacidade

- Nenhum dado sai da sua máquina. A extensão não faz requisições de rede.
- O único dado armazenado é a lista de domínios que você mesmo digitou, em `storage.sync` — que sincroniza com o seu perfil do navegador, se você usa sincronização.
- A permissão `<all_urls>` existe porque o content script precisa poder ser injetado em qualquer site *antes* de saber se aquele site está liberado. Ele fica inerte em tudo que não estiver na sua lista.

---

## Limitações conhecidas

- Não funciona em players baseados em `<canvas>` sem elemento `<video>` real.
- Sites que reagem a `keyup` em vez de `keydown` podem ainda executar a própria ação.
- O passo de quadro assume 30fps — em vídeos com outro frame rate o salto é aproximado.
- Havendo vídeos em frames diferentes ao mesmo tempo, o comando vai para o primeiro frame que responder.
- No Firefox, extensão temporária precisa ser recarregada a cada reinício do navegador.

---

## Desenvolvimento

Sem build, sem dependências, sem etapa de compilação. Edite os arquivos e recarregue a extensão (`chrome://extensions` → ↻, ou `about:debugging` → Recarregar). Páginas já abertas precisam de F5, porque content scripts não são reinjetados sozinhos.

Constantes de comportamento — passo de avanço, incremento de volume, limites de velocidade — ficam no objeto `CFG`, no topo do `content.js`.

## Licença

MIT.
