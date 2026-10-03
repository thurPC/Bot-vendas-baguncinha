const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  AttachmentBuilder,
  StringSelectMenuBuilder
} = require("discord.js");
const http = require("http");
const crypto = require("crypto");
const persist = require("./src/persist");
const { ocultarNomePix } = require("./src/pixNome");
const { gerarQrComLogo } = require("./src/qrLogo");
const { enviarProdutoPorEmail } = require("./src/mailer");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const OWNER_ID = process.env.OWNER_ID;
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID;
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
const PORT = Number(process.env.PORT || 10000);
const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
const MP_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const MP_WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET;
const PAYER_EMAIL = process.env.PAYER_EMAIL || "pagamentos@baguncinha.local";

const CANAIS = {
  loja: "1554894024849104926",
  feedbacks: "1555479807926468639",
  logs: "1555479669082427412",
  cupons: "1555484389754798161",
  ticket: "1555489336139579492"
};

const PRAZO_ENTREGA_MIN = 50;
const QR_NOME_PUBLICO = "BAGUNCINHA";
const DIA_MS = 24 * 60 * 60 * 1000;

const PRODUTOS = {
  nitro_1m: {
    id: "nitro_1m",
    nome: "Discord Nitro 1 mes",
    descricao: "Nitro Classic/Full sob encomenda. Entrega do codigo apos o Pix.",
    precoCentavos: 2490,
    emoji: "💎",
    disponivel: true,
    modo: "auto",
    cargoId: null,
    cargoDias: 0,
    imagem: null,
    banner: null,
    bannerPosicao: "bottom",
    categoriaId: "nitro",
    instrucoes: "Apos receber o codigo, abra discord.com/nitro e resgate.",
    precoOriginalCentavos: 0
  },
  nitro_3m: {
    id: "nitro_3m",
    nome: "Discord Nitro 3 meses",
    descricao: "Nitro sob encomenda. Entrega do codigo apos o Pix.",
    precoCentavos: 6490,
    emoji: "💎",
    disponivel: true,
    modo: "auto",
    cargoId: null,
    cargoDias: 0,
    imagem: null,
    banner: null,
    bannerPosicao: "bottom",
    categoriaId: "nitro",
    instrucoes: "Apos receber o codigo, abra discord.com/nitro e resgate.",
    precoOriginalCentavos: 0
  },
  boost_2: {
    id: "boost_2",
    nome: "2 Boosts de servidor",
    descricao: "Boosts sob encomenda. Entrega apos o Pix.",
    precoCentavos: 1990,
    emoji: "🚀",
    disponivel: true,
    modo: "semi",
    cargoId: null,
    cargoDias: 0,
    imagem: null,
    banner: null,
    bannerPosicao: "bottom",
    categoriaId: "boost",
    instrucoes: "A staff envia o procedimento de boost apos o pagamento.",
    precoOriginalCentavos: 0
  }
};

const STATUS = {
  AGUARDANDO_PAGAMENTO: "aguardando_pagamento",
  AGUARDANDO_ENTREGA: "aguardando_entrega",
  ENTREGUE: "entregue",
  CANCELADO: "cancelado",
  EXPIRADO: "expirado"
};

const STATUS_LABEL = {
  aguardando_pagamento: "⏳ Aguardando pagamento ⏳",
  aguardando_entrega: "🟡 Aguardando entrega 🟡",
  entregue: "Entregue ✅",
  cancelado: "❌ Cancelado ❌",
  expirado: "Expirado"
};

const LOG_LABEL = {
  pedido_criado: "🧾 Pedido criado",
  cupom_aplicado: "Cupom aplicado ✅",
  pagamento_confirmado: "Pagamento confirmado ✅",
  aguardando_entrega: "🟡 Aguardando entrega ",
  entregue: "Entrega concluida ✅",
  cancelado: "❌ Pedido cancelado ❌",
  expirado: "Pedido expirado",
  prazo_estourado: " Prazo de entrega estourado",
  cargo_concedido: "🛡️ Cargo temporario concedido",
  cargo_removido: "🛡️ Cargo temporario removido",
  cargo_erro: "⚠️ Falha ao aplicar cargo",
  feedback: "Nova avaliacao",
  ticket_aberto: "🎫 Ticket aberto",
  ticket_fechado: "🎫 Ticket fechado"
};

if (!TOKEN) console.error("TOKEN nao configurado.");
if (!CLIENT_ID) console.error("CLIENT_ID nao configurado.");
if (!GUILD_ID) console.error("GUILD_ID nao configurado.");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.on("error", error => {
  console.error("Erro no client do Discord:", error.message);
});

process.on("unhandledRejection", motivo => {
  console.error("Promise rejeitada sem tratamento:", motivo);
});

process.on("uncaughtException", error => {
  console.error("Excecao nao tratada:", error);
});

function carregarStore() {
  return persist.carregarStore();
}

function salvarStore() {
  persist.salvarStore(store);
}

const store = carregarStore();
if (!store.pedidos) store.pedidos = {};
if (!store.pagamentos) store.pagamentos = {};
if (!store.nextPedidoId) store.nextPedidoId = 1001;
if (!store.cupons) store.cupons = {};
if (!store.estoque) store.estoque = {};
if (!store.nextEstoqueItemId) store.nextEstoqueItemId = 1;
if (!store.cargosTemporarios) store.cargosTemporarios = [];
if (!store.logs) store.logs = [];
if (!store.produtoOverrides) store.produtoOverrides = {};
if (!store.tickets) store.tickets = {};
if (!store.config) store.config = { logChannelId: null, feedbackChannelId: null, ticketCategoryId: null, lojaChannelId: null, banner: null };
store.config.logChannelId = CANAIS.logs;
store.config.feedbackChannelId = CANAIS.feedbacks;
store.config.lojaChannelId = CANAIS.loja;
if (!store.config.banner) store.config.banner = null;
if (!store.config.bannerPosicao) store.config.bannerPosicao = "top";
if (!store.config.pixNomePublico) store.config.pixNomePublico = QR_NOME_PUBLICO;
if (store.config.ocultarNomePix === undefined) store.config.ocultarNomePix = true;
if (!store.config.smtpHost) store.config.smtpHost = null;
if (!store.config.smtpPort) store.config.smtpPort = 587;
if (!store.config.smtpUser) store.config.smtpUser = null;
if (!store.config.smtpPass) store.config.smtpPass = null;
if (!store.config.smtpFrom) store.config.smtpFrom = null;
if (!store.lojaFixa) store.lojaFixa = { channelId: null, messageId: null };
if (!store.paineisFixos) store.paineisFixos = { ticket: null, cupons: null };
if (!store.categorias) {
  store.categorias = {
    nitro: { id: "nitro", nome: "Nitro", emoji: "💎", descricao: "Discord Nitro", posicao: 0, ativo: true },
    boost: { id: "boost", nome: "Boosts", emoji: "🚀", descricao: "Boosts de servidor", posicao: 1, ativo: true }
  };
}
salvarStore();

const escolhasProdutos = Object.values(PRODUTOS).map(p => ({ name: p.nome, value: p.id }));

function formatarReais(centavos) {
  return (Number(centavos) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function estrelas(nota) {
  const n = Math.max(0, Math.min(5, Number(nota) || 0));
  return "⭐".repeat(n) + "☆".repeat(5 - n);
}

function proximoPedidoId() {
  const id = store.nextPedidoId;
  store.nextPedidoId += 1;
  return id;
}

function getProduto(id) {
  const base = PRODUTOS[id];
  if (!base) return null;
  return { ...base, ...(store.produtoOverrides[id] || {}) };
}

function todosProdutos() {
  return Object.keys(PRODUTOS).map(getProduto);
}

function estoqueDe(produtoId) {
  if (!store.estoque[produtoId]) store.estoque[produtoId] = [];
  return store.estoque[produtoId];
}

function produtoEsgotado(produto) {
  return !!(produto && produto.modo === "auto" && estoqueDe(produto.id).length === 0);
}

function produtoPodeComprar(produto) {
  return !!(produto && produto.disponivel && !produtoEsgotado(produto));
}

function categoriasAtivas() {
  return Object.values(store.categorias || {})
    .filter(c => c && c.ativo !== false)
    .sort((a, b) => (a.posicao || 0) - (b.posicao || 0));
}

function produtosDaCategoria(categoriaId) {
  return todosProdutos().filter(p => (p.categoriaId || "geral") === categoriaId);
}

function aplicarBanner(embed, url, posicao, thumbnailUrl) {
  const pos = String(posicao || "bottom").toLowerCase();
  if (pos === "float" || pos === "flutuante") {
    if (thumbnailUrl || url) embed.setThumbnail(thumbnailUrl || url);
    if (urlMidiaValida(url)) embed.setImage(url);
    return embed;
  }
  if (pos === "top" && urlMidiaValida(url)) embed.setImage(url);
  else if (pos === "bottom" && urlMidiaValida(url)) embed.setImage(url);
  else if (pos === "thumbnail" && urlMidiaValida(url)) embed.setThumbnail(url);
  else if (pos === "author" && urlMidiaValida(url)) embed.setAuthor({ name: "\u200b", iconURL: url });
  if (urlMidiaValida(thumbnailUrl) && pos !== "thumbnail") embed.setThumbnail(thumbnailUrl);
  return embed;
}

function pixNomePublico() {
  if (store.config.ocultarNomePix === false) return store.config.pixNomePublico || QR_NOME_PUBLICO;
  return store.config.pixNomePublico || QR_NOME_PUBLICO;
}

function urlMidiaValida(url) {
  if (!url) return false;
  try {
    const u = new URL(String(url).trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function precoVitrine(produto) {
  const atual = Number(produto.precoCentavos) || 0;
  const original = Number(produto.precoOriginalCentavos) || 0;
  if (original > atual && atual > 0) {
    const pct = Math.round(((original - atual) / original) * 100);
    return `**${formatarReais(atual)}**  ~~${formatarReais(original)}~~ (−${pct}%)`;
  }
  return `**${formatarReais(atual)}**`;
}

function linhaPrecoProduto(produto) {
  const qtd = estoqueDe(produto.id).length;
  let extra = "";
  if (produto.modo === "auto") extra = qtd > 0 ? ` — ${qtd} em estoque` : " — **esgotado**";
  else extra = produto.disponivel ? "" : " — indisponivel";
  return `${produto.emoji} **${produto.nome}** — ${precoVitrine(produto)}${extra}\n${produto.descricao}`;
}

function limparPixCopiaECola(codigo) {
  if (!codigo) return "";
  return String(codigo)
    .replace(/^\uFEFF/, "")
    .replace(/[\r\n\t]/g, "")
    .trim();
}

function botoesPix(pedidoId) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pix_copiar:${pedidoId}`)
      .setLabel("Copiar Pix")
      .setStyle(ButtonStyle.Success)
  );
  if (PUBLIC_URL) {
    row.addComponents(
      new ButtonBuilder()
        .setLabel("Abrir e copiar no celular")
        .setStyle(ButtonStyle.Link)
        .setURL(`${PUBLIC_URL}/pix/${pedidoId}`)
    );
  }
  return [row];
}

function modalPix(pedido) {
  const modal = new ModalBuilder()
    .setCustomId(`pix_copiar_modal:${pedido.id}`)
    .setTitle(`Pix #${pedido.id} — selecione e copie`.slice(0, 45));
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("pix")
        .setLabel("Segure o texto e toque em Copiar")
        .setStyle(TextInputStyle.Paragraph)
        .setValue(String(pedido.pixCopiaECola).slice(0, 4000))
        .setRequired(true)
    )
  );
  return modal;
}

function paginaCopiarPix(pedido) {
  const codigo = String(pedido.pixCopiaECola)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const valor = formatarReais(pedido.valorCentavos);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pix #${pedido.id}</title>
<style>
body{font-family:system-ui,sans-serif;background:#111;color:#fff;margin:0;padding:24px}
.box{max-width:560px;margin:0 auto;background:#1e1e24;border-radius:16px;padding:20px}
h1{font-size:1.2rem;margin:0 0 8px}p{opacity:.8}
textarea{width:100%;min-height:140px;border-radius:12px;border:0;padding:12px;font-size:14px;box-sizing:border-box}
button{width:100%;margin-top:12px;padding:14px;border:0;border-radius:12px;background:#57f287;color:#111;font-weight:700;font-size:16px}
.ok{background:#3ba55d;color:#fff}
</style></head><body><div class="box">
<h1>Pedido #${pedido.id}</h1>
<p>Valor: ${valor}</p>
<textarea id="pix" readonly>${codigo}</textarea>
<button id="btn" onclick="copiar()">Copiar Pix</button>
<p id="msg"></p>
</div>
<script>
async function copiar(){
  const t=document.getElementById("pix");
  t.select();t.setSelectionRange(0,99999);
  try{await navigator.clipboard.writeText(t.value);ok()}
  catch(e){try{document.execCommand("copy");ok()}catch(err){document.getElementById("msg").textContent="Segure o texto e copie."}}
}
function ok(){const b=document.getElementById("btn");b.textContent="Copiado";b.className="ok";document.getElementById("msg").textContent="Cole no app do banco."}
</script></body></html>`;
}

function valorPixReais(centavos) {
  return Number((Math.max(1, Math.round(Number(centavos) || 0)) / 100).toFixed(2));
}

function consumirEstoque(produtoId) {
  const fila = estoqueDe(produtoId);
  const item = fila.shift();
  return item || null;
}

function isStaff(member) {
  if (!member) return false;
  if (OWNER_ID && member.id === OWNER_ID) return true;
  if (ADMIN_ROLE_ID && member.roles.cache.has(ADMIN_ROLE_ID)) return true;
  return member.permissions.has(PermissionFlagsBits.ManageGuild);
}

function registrarLog(tipo, detalhe, dados = {}) {
  const entrada = {
    em: Date.now(),
    tipo,
    detalhe: detalhe || "",
    pedidoId: dados.pedidoId || null,
    userId: dados.userId || null,
    staffId: dados.staffId || null
  };
  store.logs.push(entrada);
  if (store.logs.length > 2000) store.logs.splice(0, store.logs.length - 2000);
  salvarStore();
  enviarLogCanal(entrada).catch(() => {});
}

function embedLog(entrada) {
  const linhas = [];
  if (entrada.pedidoId) linhas.push(`Pedido: **#${entrada.pedidoId}**`);
  if (entrada.userId) linhas.push(`Usuario: <@${entrada.userId}>`);
  if (entrada.staffId) linhas.push(`Fechado por: <@${entrada.staffId}>`);
  return new EmbedBuilder()
    .setTitle(LOG_LABEL[entrada.tipo] || entrada.tipo)
    .setDescription(`${entrada.detalhe}${linhas.length ? `\n\n${linhas.join("\n")}` : ""}`)
    .setColor(0x5865f2)
    .setTimestamp(entrada.em);
}

async function enviarLogCanal(entrada) {
  if (!store.config.logChannelId) return;
  if (store.config.logChannelId === CANAIS.loja || store.config.logChannelId === store.config.lojaChannelId) return;
  const canal = await client.channels.fetch(store.config.logChannelId).catch(() => null);
  if (!canal || canalEhLoja(canal)) return;
  await canal.send({ embeds: [embedLog(entrada)] }).catch(() => {});
}

function validarCupom(codigo, valorCentavos) {
  const chave = String(codigo).trim().toUpperCase();
  const cupom = store.cupons[chave];
  if (!cupom || !cupom.ativo) return { ok: false, motivo: "Cupom inexistente ou inativo." };
  if (cupom.expiraEm && Date.now() > cupom.expiraEm) return { ok: false, motivo: "Esse cupom expirou." };
  if (cupom.usosMax > 0 && cupom.usos >= cupom.usosMax) return { ok: false, motivo: "Esse cupom atingiu o limite de usos." };
  if (cupom.minCentavos > 0 && valorCentavos < cupom.minCentavos) {
    return { ok: false, motivo: `Esse cupom exige compra minima de ${formatarReais(cupom.minCentavos)}.` };
  }
  const bruto = cupom.tipo === "percent" ? Math.floor((valorCentavos * cupom.valor) / 100) : cupom.valor;
  const desconto = Math.min(bruto, Math.max(0, valorCentavos - 1));
  return { ok: true, cupom, descontoCentavos: desconto };
}

function catalogoEmbed(categoriaId) {
  const cats = categoriasAtivas();
  const categoria = categoriaId ? store.categorias[categoriaId] : null;
  const produtos = categoriaId ? produtosDaCategoria(categoriaId) : todosProdutos();
  const linhas = produtos.map(linhaPrecoProduto);
  const titulo = categoria ? `${categoria.emoji || "📁"} ${categoria.nome}` : "Loja Baguncinha";
  const intro = categoria
    ? (categoria.descricao || "Escolha um produto desta categoria.")
    : "Selecione uma categoria para ver os produtos. O bot gera o Pix, confirma o pagamento e entrega.";
  const embed = new EmbedBuilder()
    .setTitle(titulo)
    .setDescription(
      `${intro}\n\n` +
      (linhas.length ? linhas.join("\n\n") : "Nenhum produto nesta categoria.") +
      `\n\nPrazo: ate **${PRAZO_ENTREGA_MIN} min** depois do Pix confirmado.`
    )
    .setColor(0x9b59b6);
  aplicarBanner(embed, store.config.banner, store.config.bannerPosicao || "top");
  return embed;
}

function embedProdutoVitrine(produto) {
  const embed = new EmbedBuilder()
    .setTitle(`${produto.emoji} ${produto.nome}`)
    .setDescription(`${produto.descricao}\n\n${precoVitrine(produto)}`)
    .setColor(0x9b59b6);
  aplicarBanner(embed, produto.banner, produto.bannerPosicao || "bottom", produto.imagem);
  if (produto.instrucoes) {
    embed.addFields({ name: "Instrucoes", value: String(produto.instrucoes).slice(0, 1024) });
  }
  if (produto.modo === "auto") {
    const qtd = estoqueDe(produto.id).length;
    embed.setFooter({ text: qtd > 0 ? `${qtd} em estoque` : "Esgotado" });
  }
  return embed;
}

function selectCategorias(customId = "cat") {
  const cats = categoriasAtivas();
  if (!cats.length) return null;
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder("Selecione o tipo de atendimento / categoria")
      .addOptions(
        cats.slice(0, 25).map(c => ({
          label: c.nome.slice(0, 100),
          value: String(c.id),
          description: (c.descricao || "Ver produtos").slice(0, 100),
          emoji: c.emoji && String(c.emoji).length <= 8 ? c.emoji : undefined
        }))
      )
  );
}

function botoesCatalogo(categoriaId) {
  const rows = [];
  const produtos = categoriaId ? produtosDaCategoria(categoriaId) : todosProdutos();
  for (const produto of produtos.slice(0, categoriaId ? 4 : 5)) {
    const esgotado = produtoEsgotado(produto);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ver:${produto.id}`)
        .setLabel(produto.nome.slice(0, 80))
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`comprar:${produto.id}`)
        .setLabel(esgotado ? "Esgotado" : "Comprar")
        .setStyle(esgotado ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setDisabled(!produtoPodeComprar(produto))
    );
    rows.push(row);
  }
  if (categoriaId) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("loja_home").setLabel("Voltar").setStyle(ButtonStyle.Secondary)
      )
    );
  }
  return rows.slice(0, 5);
}

function payloadLoja(categoriaId) {
  const components = [];
  if (!categoriaId) {
    const sel = selectCategorias("cat");
    if (sel) components.push(sel);
    else components.push(...botoesCatalogo());
  } else {
    components.push(...botoesCatalogo(categoriaId));
  }
  return { content: null, embeds: [catalogoEmbed(categoriaId)], components };
}

async function atualizarLojaFixa() {
  const canalId = store.lojaFixa.channelId || store.config.lojaChannelId;
  const messageId = store.lojaFixa.messageId;
  if (!canalId || !messageId) return;
  const canal = await client.channels.fetch(canalId).catch(() => null);
  if (!canal) return;
  const msg = await canal.messages.fetch(messageId).catch(() => null);
  if (!msg) return;
  await msg.edit(payloadLoja()).catch(() => {});
}

async function publicarLojaFixa(canal) {
  const destino = canal && canal.id === CANAIS.loja ? canal : await client.channels.fetch(CANAIS.loja).catch(() => null);
  if (!destino) {
    console.error("Canal da lojinha nao encontrado.");
    return null;
  }
  if (store.lojaFixa.channelId && store.lojaFixa.messageId) {
    const antigo = await client.channels.fetch(store.lojaFixa.channelId).catch(() => null);
    if (antigo) {
      const msg = await antigo.messages.fetch(store.lojaFixa.messageId).catch(() => null);
      if (msg) {
        await msg.edit(payloadLoja()).catch(() => {});
        return msg;
      }
    }
  }
  const enviada = await destino.send(payloadLoja());
  store.lojaFixa = { channelId: destino.id, messageId: enviada.id };
  store.config.lojaChannelId = destino.id;
  salvarStore();
  return enviada;
}

function payloadPainelTicket() {
  const embed = new EmbedBuilder()
    .setTitle("ATENDIMENTO AO CLIENTE")
    .setDescription("Se você estiver enfrentando algum problema ou precisar de ajuda com nossos serviços, por favor, abra um ticket de suporte. Assim que recebermos seu ticket, nossa equipe de suporte entrará em contato com você para solucionar o problema o mais breve possível. Obrigado pela sua compreensão e cooperação.\n\n*(Podendo haver atrasos e lentidao no atendimento Sab/Dom)*")
    .setColor(0x5865f2);
  const components = [];
  const sel = selectCategorias("ticket_cat");
  if (sel) components.push(sel);
  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("ticket_abrir").setLabel("Abrir ticket").setEmoji("🎫").setStyle(ButtonStyle.Secondary)
    )
  );
  return { embeds: [embed], components };
}

function payloadPainelCupons() {
  const cupons = Object.values(store.cupons).filter(c => c.ativo);
  const linhas = cupons.length
    ? cupons.map(c => {
      const desconto = c.tipo === "percent" ? `${c.valor}%` : formatarReais(c.valor);
      const exp = c.expiraEm ? `<t:${Math.floor(c.expiraEm / 1000)}:R>` : "sem expiracao";
      return `\`${c.codigo}\` — ${desconto} — ${exp}`;
    })
    : ["Nenhum cupom ativo no momento."];
  const embed = new EmbedBuilder()
    .setTitle("Cupons da loja")
    .setDescription(linhas.join("\n"))
    .setColor(0xe67e22);
  return { embeds: [embed], components: [] };
}

async function publicarOuAtualizarPainel(chave, canalId, payload) {
  const canal = await client.channels.fetch(canalId).catch(() => null);
  if (!canal) {
    console.error(`Canal ${chave} (${canalId}) nao encontrado.`);
    return;
  }
  const salvo = store.paineisFixos[chave];
  if (salvo) {
    const msg = await canal.messages.fetch(salvo).catch(() => null);
    if (msg) {
      await msg.edit(payload).catch(() => {});
      return msg;
    }
  }
  const enviada = await canal.send(payload);
  store.paineisFixos[chave] = enviada.id;
  salvarStore();
  return enviada;
}

async function atualizarPainelCupons() {
  await publicarOuAtualizarPainel("cupons", CANAIS.cupons, payloadPainelCupons());
}

async function publicarCanaisFixos() {
  const loja = await client.channels.fetch(CANAIS.loja).catch(() => null);
  if (loja) await publicarLojaFixa(loja);
  else console.error("Canal da lojinha nao encontrado.");
  await publicarOuAtualizarPainel("ticket", CANAIS.ticket, payloadPainelTicket());
  await atualizarPainelCupons();
}

function embedPedidoCliente(pedido, extra, opcoes = {}) {
  const produto = getProduto(pedido.produtoId);
  const embed = new EmbedBuilder()
    .setTitle(`${STATUS_LABEL[pedido.status] || pedido.status}`)
    .setDescription(
      `${extra || ""}\n\n` +
      `🆔 Pedido: **#${pedido.id}**\n` +
      `${produto ? produto.emoji : "📦"} Produto: **${pedido.produtoNome}**\n` +
      `💰 Valor a pagar: **${formatarReais(pedido.valorCentavos)}**\n` +
      (pedido.descontoCentavos > 0 ? `🏷️ De ${formatarReais(pedido.valorOriginalCentavos)} com cupom ${pedido.cupom ? `\`${pedido.cupom}\`` : ""}\n` : "") +
      `📦 Prazo: ate **${PRAZO_ENTREGA_MIN} minutos** apos o Pix confirmado.`
    )
    .setColor(
      pedido.status === STATUS.ENTREGUE ? 0x57f287 :
      pedido.status === STATUS.CANCELADO || pedido.status === STATUS.EXPIRADO ? 0xed4245 :
      pedido.status === STATUS.AGUARDANDO_ENTREGA ? 0xfee75c : 0x5865f2
    )
    .setFooter({ text: `Pedido #${pedido.id}` });

  if (pedido.descontoCentavos > 0) {
    embed.addFields({
      name: "🎟️ Cupom",
      value: `${pedido.cupom ? `\`${pedido.cupom}\`` : "aplicado"} — desconto de ${formatarReais(pedido.descontoCentavos)}\nDe ${formatarReais(pedido.valorOriginalCentavos)} por **${formatarReais(pedido.valorCentavos)}**`
    });
  }
  if (pedido.pixCopiaECola && pedido.status === STATUS.AGUARDANDO_PAGAMENTO) {
    embed.addFields({
      name: "Como pagar",
      value: "Escaneie o QR Code ou toque em **Copiar Pix**. No celular, o codigo abre num campo pra voce selecionar e copiar, sem download."
    });
    embed.addFields({
      name: "Recebedor PIX",
      value: pixNomePublico(),
      inline: true
    });
    if (opcoes.qrNome) {
      embed.setImage(`attachment://${opcoes.qrNome}`);
    }
  }
  if (pedido.entregaMetodo) {
    embed.addFields({
      name: "Entrega",
      value: pedido.entregaMetodo === "email"
        ? `E-mail: ${pedido.entregaEmail || "-"}`
        : "DM do Discord",
      inline: true
    });
  }
  const produtoInfo = getProduto(pedido.produtoId);
  if (produtoInfo?.instrucoes) {
    embed.addFields({ name: "Instrucoes", value: String(produtoInfo.instrucoes).slice(0, 1024) });
  }
  return embed;
}

function embedPedidoAdmin(pedido) {
  const embed = new EmbedBuilder()
    .setTitle(pedido.status === STATUS.ENTREGUE ? "✅ PEDIDO ENTREGUE" : "🔔 NOVO PEDIDO")
    .setDescription(
      `Cliente: <@${pedido.userId}>\n` +
      `Produto: **${pedido.produtoNome}**\n` +
      `Valor: **${formatarReais(pedido.valorCentavos)}**\n` +
      `Pedido: **#${pedido.id}**\n` +
      `Modo: **${pedido.modo === "auto" ? "automatico" : "staff"}**\n` +
      `Status: ${STATUS_LABEL[pedido.status]}\n` +
      `📦 Entrega em ate ${PRAZO_ENTREGA_MIN} min apos o pagamento.`
    )
    .setColor(pedido.status === STATUS.ENTREGUE ? 0x57f287 : 0xfee75c)
    .setFooter({ text: `Pedido #${pedido.id}` });
  return embed;
}

function botoesAdmin(pedidoId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`entregar:${pedidoId}`).setLabel("Entregar").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cancelar:${pedidoId}`).setLabel("Cancelar").setStyle(ButtonStyle.Danger)
    )
  ];
}

function embedFeedback(pedido, nota, comentario) {
  const produto = getProduto(pedido.produtoId);
  return new EmbedBuilder()
    .setTitle(`⭐ Avaliacao — ${nota}/5`)
    .setDescription(`${estrelas(nota)}\n\n${comentario ? `"${comentario}"` : "Sem comentario."}`)
    .addFields(
      { name: "Produto", value: produto ? produto.nome : pedido.produtoNome, inline: true },
      { name: "Cliente", value: `<@${pedido.userId}>`, inline: true },
      { name: "Pedido", value: `#${pedido.id}`, inline: true }
    )
    .setColor(0xf1c40f)
    .setTimestamp(pedido.feedback.em);
}

async function mpRequest(metodo, caminho, corpo) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const resposta = await fetch(`https://api.mercadopago.com${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID()
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: controller.signal
    });
    const json = await resposta.json().catch(() => null);
    return { ok: resposta.ok, status: resposta.status, json };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function criarPix(pedido) {
  if (!MP_ACCESS_TOKEN) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN nao configurado.");
  }

  const notificationUrl = PUBLIC_URL ? `${PUBLIC_URL}/webhook/mercadopago` : undefined;
  const r = await mpRequest("POST", "/v1/payments", {
    transaction_amount: valorPixReais(pedido.valorCentavos),
    description: `${pedido.produtoNome} #${pedido.id}`,
    payment_method_id: "pix",
    payer: { email: PAYER_EMAIL },
    external_reference: String(pedido.id),
    notification_url: notificationUrl,
    metadata: { pedidoId: String(pedido.id), userId: pedido.userId }
  });

  if (!r.ok) {
    const detalhe = r.json?.message || r.json?.error || JSON.stringify(r.json);
    throw new Error(`Mercado Pago ${r.status}: ${detalhe}`);
  }

  const tx = r.json.point_of_interaction?.transaction_data || {};
  let pixCopiaECola = limparPixCopiaECola(tx.qr_code || "");
  if (!pixCopiaECola) {
    throw new Error("Mercado Pago nao devolveu o codigo Pix (qr_code).");
  }
  if (store.config.ocultarNomePix !== false) {
    pixCopiaECola = limparPixCopiaECola(ocultarNomePix(pixCopiaECola, pixNomePublico()));
  }
  return {
    paymentId: String(r.json.id),
    pixCopiaECola,
    pixQrBase64: tx.qr_code_base64 || "",
    valorCobranca: Number(r.json.transaction_amount)
  };
}

async function consultarPagamento(paymentId) {
  const r = await mpRequest("GET", `/v1/payments/${paymentId}`);
  if (!r.ok) throw new Error(`Consulta MP ${r.status}`);
  return r.json;
}

async function canalAdmin(guild) {
  if (ADMIN_CHANNEL_ID) {
    const canal = await guild.channels.fetch(ADMIN_CHANNEL_ID).catch(() => null);
    if (canal) return canal;
  }
  return guild.channels.cache.find(c => c.name === "pedidos-admin" && c.type === ChannelType.GuildText) || null;
}

function canalEhLoja(canal) {
  if (!canal) return false;
  return canal.id === CANAIS.loja || canal.id === store.config.lojaChannelId || canal.id === store.lojaFixa.channelId;
}

async function notificarAdmin(pedido, extra) {
  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) return;
  const canal = await canalAdmin(guild);
  if (!canal) {
    console.error("Canal admin de pedidos nao encontrado. Configure ADMIN_CHANNEL_ID.");
    return;
  }
  if (canalEhLoja(canal)) {
    console.error("Canal admin coincide com a lojinha; entrega/log nao sera enviado la.");
    return;
  }

  const embed = embedPedidoAdmin(pedido);
  if (extra) {
    embed.setDescription(`${embed.data.description}\n${extra}`);
  }

  const payload = {
    content: ADMIN_ROLE_ID && pedido.status === STATUS.AGUARDANDO_ENTREGA ? `<@&${ADMIN_ROLE_ID}>` : null,
    embeds: [embed],
    components: pedido.status === STATUS.AGUARDANDO_ENTREGA ? botoesAdmin(pedido.id) : []
  };

  if (pedido.adminMessageId) {
    const msg = await canal.messages.fetch(pedido.adminMessageId).catch(() => null);
    if (msg) {
      await msg.edit(payload).catch(() => {});
      return;
    }
  }

  const enviada = await canal.send(payload).catch(error => {
    console.error("Erro ao avisar admin:", error.message);
    return null;
  });
  if (enviada) {
    pedido.adminMessageId = enviada.id;
    pedido.adminChannelId = canal.id;
    salvarStore();
  }
}

async function avisarCliente(pedido, texto, embed, components) {
  try {
    const user = await client.users.fetch(pedido.userId);
    await user.send({
      content: texto || null,
      embeds: embed ? [embed] : [embedPedidoCliente(pedido)],
      components: components || []
    });
  } catch {
    console.log(`Nao consegui DM o cliente do pedido #${pedido.id}.`);
  }
}

async function pedirFeedback(pedido) {
  try {
    const user = await client.users.fetch(pedido.userId);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`avaliar:${pedido.id}`)
        .setLabel("Avaliar compra")
        .setEmoji("⭐")
        .setStyle(ButtonStyle.Primary)
    );
    await user.send({
      content: `Como foi a compra do pedido **#${pedido.id}**? Sua avaliacao ajuda muito!`,
      components: [row]
    });
  } catch {
    console.log(`Nao consegui pedir feedback do pedido #${pedido.id}.`);
  }
}

async function registrarFeedback(pedido, nota, comentario) {
  pedido.feedback = { nota, comentario: comentario || "", em: Date.now() };
  salvarStore();

  if (store.config.feedbackChannelId) {
    const canal = await client.channels.fetch(store.config.feedbackChannelId).catch(() => null);
    if (canal) {
      await canal.send({ embeds: [embedFeedback(pedido, nota, comentario)] }).catch(() => {});
    }
  }
  registrarLog("feedback", `Pedido #${pedido.id} avaliado com ${nota}/5.`, {
    pedidoId: pedido.id,
    userId: pedido.userId
  });
}

async function concederCargo(pedido, produto) {
  if (!produto || !produto.cargoId || !produto.cargoDias) return;
  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) return;
  const membro = await guild.members.fetch(pedido.userId).catch(() => null);
  if (!membro) {
    registrarLog("cargo_erro", `Nao encontrei o membro do pedido #${pedido.id}.`, { pedidoId: pedido.id, userId: pedido.userId });
    return;
  }
  const cargo = await guild.roles.fetch(produto.cargoId).catch(() => null);
  if (!cargo) {
    registrarLog("cargo_erro", `Cargo ${produto.cargoId} nao existe (pedido #${pedido.id}).`, { pedidoId: pedido.id, userId: pedido.userId });
    return;
  }

  await membro.roles.add(cargo).catch(error => console.error("Erro ao dar cargo:", error.message));
  const expiraEm = Date.now() + produto.cargoDias * DIA_MS;
  pedido.cargo = { roleId: produto.cargoId, expiraEm, dias: produto.cargoDias };
  store.cargosTemporarios.push({
    userId: pedido.userId,
    roleId: produto.cargoId,
    expiraEm,
    pedidoId: pedido.id
  });
  salvarStore();
  registrarLog("cargo_concedido", `Cargo <@&${produto.cargoId}> para <@${pedido.userId}> por ${produto.cargoDias} dia(s).`, {
    pedidoId: pedido.id,
    userId: pedido.userId
  });
}

async function removerCargosExpirados() {
  const agora = Date.now();
  const expirados = store.cargosTemporarios.filter(c => c.expiraEm <= agora);
  if (!expirados.length) return;
  store.cargosTemporarios = store.cargosTemporarios.filter(c => c.expiraEm > agora);
  salvarStore();

  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) return;
  for (const item of expirados) {
    const membro = await guild.members.fetch(item.userId).catch(() => null);
    if (membro) await membro.roles.remove(item.roleId).catch(() => {});
    registrarLog("cargo_removido", `Cargo <@&${item.roleId}> removido de <@${item.userId}>.`, {
      pedidoId: item.pedidoId,
      userId: item.userId
    });
  }
}

function botoesEntrega(pedidoId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`entregadm:${pedidoId}`).setLabel("Receber na DM").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`entregaemail:${pedidoId}`).setLabel("Receber por e-mail").setStyle(ButtonStyle.Secondary)
  );
}

async function entregarPedido(pedido, opcoes) {
  const { automatico, staffId, codigo, extra } = opcoes;
  pedido.status = STATUS.ENTREGUE;
  pedido.entregueEm = Date.now();
  pedido.entrega = { codigo, extra: extra || "", staffId: staffId || null, automatico: !!automatico };
  salvarStore();

  const embed = embedPedidoCliente(
    pedido,
    automatico ? "✅ Pagamento confirmado e entrega automatica concluida." : "✅ Pedido entregue."
  );
  embed.addFields({ name: "🔑 Entrega", value: `\`\`\`${String(codigo).slice(0, 1000)}\`\`\`${extra ? `\n📝 ${extra}` : ""}` });

  const metodo = pedido.entregaMetodo || "dm";
  if (metodo === "email" && pedido.entregaEmail) {
    const produto = getProduto(pedido.produtoId);
    try {
      await enviarProdutoPorEmail(store.config, pedido.entregaEmail, pedido, codigo, extra, produto?.instrucoes);
      await avisarCliente(
        pedido,
        `✅ Pedido #${pedido.id} enviado para **${pedido.entregaEmail}**.`,
        embed
      );
    } catch (error) {
      console.error("Falha no e-mail, caindo para DM:", error.message);
      await avisarCliente(
        pedido,
        automatico ? "✅ Pagamento confirmado! Aqui esta sua entrega automatica:" : "✅ Seu pedido foi entregue:",
        embed
      );
    }
  } else {
    await avisarCliente(
      pedido,
      automatico ? "✅ Pagamento confirmado! Aqui esta sua entrega automatica:" : "✅ Seu pedido foi entregue:",
      embed
    );
  }
  await pedirFeedback(pedido);

  const produto = getProduto(pedido.produtoId);
  await concederCargo(pedido, produto);

  registrarLog("entregue", `Pedido #${pedido.id} ${automatico ? "entregue automaticamente" : `entregue por <@${staffId}>`}.`, {
    pedidoId: pedido.id,
    userId: pedido.userId,
    staffId: staffId || null
  });
  await notificarAdmin(pedido, automatico ? "Entrega automatica concluida." : `Entregue por <@${staffId}>.`);
}

async function confirmarPagamento(pedido, payment) {
  if (pedido.status !== STATUS.AGUARDANDO_PAGAMENTO) return;

  pedido.status = STATUS.AGUARDANDO_ENTREGA;
  pedido.pagoEm = Date.now();
  pedido.mpStatus = payment.status;
  pedido.prazoEntregaAte = Date.now() + PRAZO_ENTREGA_MIN * 60 * 1000;
  salvarStore();

  registrarLog("pagamento_confirmado", `Pix confirmado no pedido #${pedido.id}.`, {
    pedidoId: pedido.id,
    userId: pedido.userId
  });

  const produto = getProduto(pedido.produtoId);
  if (produto && produto.modo === "auto") {
    const item = consumirEstoque(pedido.produtoId);
    if (item) {
      pedido.modo = "auto";
      salvarStore();
      await atualizarLojaFixa();
      await entregarPedido(pedido, { automatico: true, codigo: item.conteudo });
      return;
    }
    registrarLog("aguardando_entrega", `Sem estoque automatico para ${produto.nome}; aguardando staff (pedido #${pedido.id}).`, {
      pedidoId: pedido.id,
      userId: pedido.userId
    });
  }

  pedido.modo = "semi";
  salvarStore();
  await avisarCliente(
    pedido,
    "✅ Pagamento confirmado!\n📦 Seu pedido foi recebido e esta sendo processado.",
    embedPedidoCliente(pedido, "✅ Pagamento confirmado!\n📦 Seu pedido foi recebido e esta sendo processado.")
  );
  await notificarAdmin(pedido, `Pix confirmado em <t:${Math.floor(Date.now() / 1000)}:R>.`);
}

async function processarWebhookPagamento(paymentId) {
  const payment = await consultarPagamento(paymentId);
  const pedidoId = String(payment.external_reference || payment.metadata?.pedidoId || "");
  const pedido = store.pedidos[pedidoId];
  if (!pedido) {
    console.log(`Webhook sem pedido: payment ${paymentId}`);
    return;
  }

  pedido.mpStatus = payment.status;
  store.pagamentos[String(payment.id)] = pedidoId;
  salvarStore();

  if (payment.status === "approved") {
    await confirmarPagamento(pedido, payment);
  } else if (["cancelled", "rejected"].includes(payment.status) && pedido.status === STATUS.AGUARDANDO_PAGAMENTO) {
    pedido.status = STATUS.CANCELADO;
    salvarStore();
    registrarLog("cancelado", `Pix cancelado/recusado no pedido #${pedido.id}.`, { pedidoId: pedido.id, userId: pedido.userId });
    await avisarCliente(pedido, "❌ O Pix foi cancelado ou recusado.");
  }
}

function modalComprar(produtoId) {
  const produto = getProduto(produtoId);
  const modal = new ModalBuilder()
    .setCustomId(`comprar_modal:${produtoId}`)
    .setTitle(`Comprar ${produto ? produto.nome : "produto"}`.slice(0, 45));
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("cupom")
        .setLabel("Cupom de desconto (opcional)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(32)
    )
  );
  return modal;
}

function modalAvaliar(pedidoId) {
  const modal = new ModalBuilder()
    .setCustomId(`avaliar_modal:${pedidoId}`)
    .setTitle(`Avaliar pedido #${pedidoId}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("nota")
        .setLabel("Nota de 1 a 5")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(1)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("comentario")
        .setLabel("Comentario (opcional)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500)
    )
  );
  return modal;
}

async function criarPedido(interaction, produtoId, cupomCodigo) {
  const produto = getProduto(produtoId);
  if (!produto || !produto.disponivel) {
    await interaction.reply({ content: "Esse produto nao esta disponivel.", ephemeral: true });
    return;
  }
  if (produtoEsgotado(produto)) {
    await interaction.reply({
      content: `❌ **${produto.nome}** esta esgotado. Sem estoque no momento.`,
      ephemeral: true
    });
    return;
  }
  if (!MP_ACCESS_TOKEN) {
    await interaction.reply({
      content: "Pagamento Pix ainda nao esta configurado (falta MERCADOPAGO_ACCESS_TOKEN).",
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  let descontoCentavos = 0;
  let cupomAplicado = null;
  if (cupomCodigo && cupomCodigo.trim()) {
    const res = validarCupom(cupomCodigo, produto.precoCentavos);
    if (!res.ok) {
      await interaction.editReply(`❌ ${res.motivo}`);
      return;
    }
    descontoCentavos = res.descontoCentavos;
    cupomAplicado = res.cupom;
  }

  const valorFinal = Math.max(1, produto.precoCentavos - descontoCentavos);
  const id = proximoPedidoId();
  const pedido = {
    id,
    userId: interaction.user.id,
    produtoId: produto.id,
    produtoNome: produto.nome,
    modo: produto.modo,
    valorCentavos: valorFinal,
    valorOriginalCentavos: produto.precoCentavos,
    descontoCentavos,
    cupom: cupomAplicado ? cupomAplicado.codigo : null,
    status: STATUS.AGUARDANDO_PAGAMENTO,
    criadoEm: Date.now(),
    pixCopiaECola: "",
    pixQrAnexo: "",
    paymentId: "",
    entrega: null
  };

  let qrAnexo = null;
  try {
    const pix = await criarPix(pedido);
    pedido.paymentId = pix.paymentId;
    pedido.pixCopiaECola = pix.pixCopiaECola;
    if (typeof pix.valorCobranca === "number" && Number.isFinite(pix.valorCobranca)) {
      pedido.valorCentavos = Math.round(pix.valorCobranca * 100);
    }

    const qrBuffer = await gerarQrComLogo(pedido.pixCopiaECola);
    if (qrBuffer) {
      pedido.pixQrAnexo = `pix-${id}.png`;
      qrAnexo = new AttachmentBuilder(qrBuffer, { name: pedido.pixQrAnexo });
    }

    store.pedidos[String(id)] = pedido;
    store.pagamentos[pix.paymentId] = String(id);
    if (cupomAplicado) {
      cupomAplicado.usos += 1;
      registrarLog("cupom_aplicado", `Cupom ${cupomAplicado.codigo} aplicado no pedido #${id} (-${formatarReais(descontoCentavos)}). Valor final ${formatarReais(pedido.valorCentavos)}.`, {
        pedidoId: id,
        userId: pedido.userId
      });
    }
    salvarStore();
  } catch (error) {
    console.error("Erro ao gerar Pix:", error);
    await interaction.editReply("❌ Nao consegui gerar o Pix agora. Tenta de novo em instantes.");
    return;
  }

  registrarLog("pedido_criado", `Pedido #${id} de ${produto.nome} no valor de ${formatarReais(pedido.valorCentavos)}.`, {
    pedidoId: id,
    userId: pedido.userId
  });

  const extra =
    `💰 Pix gerado no valor de **${formatarReais(pedido.valorCentavos)}**.` +
    (descontoCentavos > 0 ? ` Cupom aplicado: de ${formatarReais(pedido.valorOriginalCentavos)} por ${formatarReais(pedido.valorCentavos)}.` : "") +
    "\nEscaneie o QR ou toque em **Copiar Pix** (no celular abre um campo pra copiar, sem download).";

  const embedCarrinho = embedPedidoCliente(pedido, extra, { qrNome: pedido.pixQrAnexo });
  const qrBuf = qrAnexo ? qrAnexo.attachment : null;
  const pixFile = () => (qrBuf ? [new AttachmentBuilder(Buffer.from(qrBuf), { name: pedido.pixQrAnexo })] : []);
  const componentes = [...botoesPix(pedido.id), botoesEntrega(pedido.id)];

  await interaction.editReply({
    content: `⏳ Carrinho gerado — valor final **${formatarReais(pedido.valorCentavos)}**. Escolha onde receber o produto (DM ou e-mail).`,
    embeds: [embedCarrinho],
    components: componentes,
    files: pixFile()
  });

  try {
    const user = await client.users.fetch(interaction.user.id);
    const dm = await user.send({
      content: `Carrinho automatico — pedido **#${pedido.id}**`,
      embeds: [embedCarrinho],
      components: componentes,
      files: pixFile()
    });
    pedido.cartDmMessageId = dm.id;
  } catch {
    console.log(`Nao consegui DM o carrinho do pedido #${pedido.id}.`);
  }

  try {
    const ticket = await abrirTicket(
      interaction.guild,
      interaction.user,
      `Compra ${produto.nome} #${pedido.id}`
    );
    pedido.ticketChannelId = ticket.id;
    const serverMsg = await ticket.send({
      content: `${interaction.user} seu carrinho automatico:`,
      embeds: [embedCarrinho],
      components: componentes,
      files: pixFile()
    });
    pedido.cartServerMessageId = serverMsg.id;
  } catch (error) {
    console.error("Falha ao abrir ticket/carrinho no servidor:", error.message);
  }
  salvarStore();
}

async function handleEntregarModal(interaction, pedidoId) {
  const podeEfemero = interaction.inGuild();
  await interaction.deferReply({ ephemeral: podeEfemero });

  const pedido = store.pedidos[String(pedidoId)];
  if (!pedido) {
    await interaction.editReply({ content: "Pedido nao encontrado." });
    return;
  }
  if (pedido.status !== STATUS.AGUARDANDO_ENTREGA) {
    await interaction.editReply({ content: `Pedido #${pedidoId} nao esta aguardando entrega.` });
    return;
  }

  const codigo = interaction.fields.getTextInputValue("codigo").trim();
  const extra = interaction.fields.getTextInputValue("extra").trim();
  await entregarPedido(pedido, { automatico: false, staffId: interaction.user.id, codigo, extra });

  await interaction.editReply({ content: `✅ Pedido #${pedido.id} entregue ao cliente.` });
}

async function handleAvaliarModal(interaction, pedidoId) {
  const podeEfemero = interaction.inGuild();
  await interaction.deferReply({ ephemeral: podeEfemero });

  const pedido = store.pedidos[String(pedidoId)];
  if (!pedido) {
    await interaction.editReply({ content: "Pedido nao encontrado." });
    return;
  }
  if (pedido.userId !== interaction.user.id) {
    await interaction.editReply({ content: "Voce so pode avaliar os seus pedidos." });
    return;
  }
  if (pedido.feedback) {
    await interaction.editReply({ content: "Voce ja avaliou esse pedido. Obrigado!" });
    return;
  }

  const nota = parseInt(interaction.fields.getTextInputValue("nota").trim(), 10);
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    await interaction.editReply({ content: "A nota precisa ser um numero de 1 a 5." });
    return;
  }
  const comentario = interaction.fields.getTextInputValue("comentario").trim();
  await registrarFeedback(pedido, nota, comentario);
  await interaction.editReply({ content: `${estrelas(nota)} Valeu pela avaliacao!` });
}

async function abrirTicket(guild, user, assunto) {
  const base = `ticket-${user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80) || `ticket-${user.id}`;
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles
      ]
    },
    {
      id: client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory
      ]
    }
  ];
  if (ADMIN_ROLE_ID) {
    overwrites.push({
      id: ADMIN_ROLE_ID,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
    });
  }

  let parent;
  if (store.config.ticketCategoryId) {
    const cat = await guild.channels.fetch(store.config.ticketCategoryId).catch(() => null);
    if (cat) parent = cat.id;
  }

  const canal = await guild.channels.create({
    name: base,
    type: ChannelType.GuildText,
    parent,
    topic: `Ticket de ${user.tag} — ${assunto}`,
    permissionOverwrites: overwrites
  });

  store.tickets[canal.id] = { userId: user.id, abertoEm: Date.now(), assunto, status: "aberto" };
  salvarStore();

  const embed = new EmbedBuilder()
    .setTitle("🎫 Ticket aberto")
    .setDescription(`Ola <@${user.id}>, descreva sua duvida com o maximo de detalhes. A equipe respondera em breve.`)
    .addFields({ name: "Assunto", value: assunto })
    .setColor(0x5865f2);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_fechar:${canal.id}`).setLabel("Fechar ticket").setStyle(ButtonStyle.Danger)
  );

  await canal.send({
    content: ADMIN_ROLE_ID ? `<@${user.id}> <@&${ADMIN_ROLE_ID}>` : `<@${user.id}>`,
    embeds: [embed],
    components: [row]
  });

  registrarLog("ticket_aberto", `Ticket de <@${user.id}>: ${assunto}.`, { userId: user.id });
  return canal;
}

async function fecharTicket(interaction, canalId) {
  const efemero = interaction.inGuild();
  await interaction.deferReply({ ephemeral: efemero });

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply({ content: "Use esse botao dentro do servidor." });
    return;
  }
  const ticket = store.tickets[canalId];
  const canal = guild.channels.cache.get(canalId) || await guild.channels.fetch(canalId).catch(() => null);
  if (!canal || !ticket) {
    await interaction.editReply({ content: "Ticket nao encontrado." });
    return;
  }
  if (ticket.userId !== interaction.user.id && !isStaff(interaction.member)) {
    await interaction.editReply({ content: "So o dono do ticket ou a staff pode fechar." });
    return;
  }
  if (ticket.status === "fechado") {
    await interaction.editReply({ content: "Esse ticket ja esta fechado." });
    return;
  }

  await canal.permissionOverwrites.edit(ticket.userId, { SendMessages: false }).catch(() => {});
  await canal.setName(`fechado-${canal.name.replace(/^fechado-/, "")}`.slice(0, 100)).catch(() => {});

  ticket.status = "fechado";
  ticket.fechadoEm = Date.now();
  ticket.fechadoPor = interaction.user.id;
  salvarStore();

  registrarLog("ticket_fechado", `Ticket de <@${ticket.userId}> fechado por <@${interaction.user.id}>.`, {
    userId: ticket.userId,
    staffId: interaction.user.id
  });
  await interaction.editReply({ content: "🔒 Ticket fechado. Este canal sera removido em alguns segundos." });
  setTimeout(() => {
    canal.delete("Ticket fechado").catch(() => {});
  }, 2500);
}

async function handleEstoque(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "adicionar") {
    const produtoId = interaction.options.getString("produto");
    const produto = getProduto(produtoId);
    if (!produto) {
      await interaction.reply({ content: "Produto invalido.", ephemeral: true });
      return;
    }
    const itens = interaction.options
      .getString("conteudo")
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);
    if (!itens.length) {
      await interaction.reply({ content: "Envie ao menos um item (um por linha).", ephemeral: true });
      return;
    }
    const fila = estoqueDe(produtoId);
    for (const texto of itens) {
      fila.push({ id: store.nextEstoqueItemId++, conteudo: texto, criadoEm: Date.now() });
    }
    salvarStore();
    await atualizarLojaFixa();
    await interaction.reply({
      content: `✅ ${itens.length} item(ns) adicionado(s) ao estoque de **${produto.nome}**. Total agora: **${fila.length}**.`,
      ephemeral: true
    });
    return;
  }

  if (sub === "listar") {
    const linhas = todosProdutos().map(p => {
      const fila = estoqueDe(p.id);
      const modo = p.modo === "auto" ? "automatica" : "staff";
      return `${p.emoji} **${p.nome}** — ${fila.length} em estoque (entrega ${modo})`;
    });
    await interaction.reply({
      embeds: [new EmbedBuilder().setTitle("📦 Estoque").setDescription(linhas.join("\n")).setColor(0x3498db)],
      ephemeral: true
    });
    return;
  }

  if (sub === "remover") {
    const produtoId = interaction.options.getString("produto");
    const itemId = interaction.options.getInteger("id");
    const fila = estoqueDe(produtoId);
    const idx = fila.findIndex(i => i.id === itemId);
    if (idx < 0) {
      await interaction.reply({ content: "Item nao encontrado nesse estoque.", ephemeral: true });
      return;
    }
    fila.splice(idx, 1);
    salvarStore();
    await atualizarLojaFixa();
    await interaction.reply({ content: `🗑️ Item ${itemId} removido do estoque. Total: **${fila.length}**.`, ephemeral: true });
  }
}

async function handleCupom(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "criar") {
    const codigo = interaction.options.getString("codigo").trim().toUpperCase();
    const tipo = interaction.options.getString("tipo");
    const valor = interaction.options.getNumber("valor");
    const usos = interaction.options.getInteger("usos") || 0;
    const dias = interaction.options.getInteger("dias") || 0;
    const minimo = interaction.options.getNumber("minimo") || 0;

    if (tipo === "percent" && (valor <= 0 || valor > 100)) {
      await interaction.reply({ content: "Desconto percentual precisa estar entre 0 e 100.", ephemeral: true });
      return;
    }
    if (valor <= 0) {
      await interaction.reply({ content: "O valor do desconto precisa ser maior que zero.", ephemeral: true });
      return;
    }

    store.cupons[codigo] = {
      codigo,
      tipo,
      valor: tipo === "percent" ? valor : Math.round(valor * 100),
      usosMax: Math.max(0, usos),
      usos: 0,
      minCentavos: Math.round(minimo * 100),
      expiraEm: dias > 0 ? Date.now() + dias * DIA_MS : null,
      ativo: true,
      criadoEm: Date.now()
    };
    salvarStore();
    await atualizarPainelCupons().catch(() => {});
    await interaction.reply({
      content:
        `🎟️ Cupom **${codigo}** criado.\n` +
        `Desconto: **${tipo === "percent" ? `${valor}%` : formatarReais(Math.round(valor * 100))}**\n` +
        `Usos maximos: **${usos > 0 ? usos : "ilimitado"}**\n` +
        `Validade: **${dias > 0 ? `${dias} dia(s)` : "sem expiracao"}**` +
        (minimo > 0 ? `\nCompra minima: **${formatarReais(Math.round(minimo * 100))}**` : ""),
      ephemeral: true
    });
    return;
  }

  if (sub === "listar") {
    const cupons = Object.values(store.cupons);
    if (!cupons.length) {
      await interaction.reply({ content: "Nenhum cupom cadastrado.", ephemeral: true });
      return;
    }
    const linhas = cupons.map(c => {
      const desconto = c.tipo === "percent" ? `${c.valor}%` : formatarReais(c.valor);
      const uso = `${c.usos}/${c.usosMax > 0 ? c.usosMax : "∞"}`;
      const exp = c.expiraEm ? `<t:${Math.floor(c.expiraEm / 1000)}:R>` : "sem expiracao";
      return `\`${c.codigo}\` — ${desconto} — usos ${uso} — ${exp}`;
    });
    await interaction.reply({
      embeds: [new EmbedBuilder().setTitle("🎟️ Cupons").setDescription(linhas.join("\n")).setColor(0xe67e22)],
      ephemeral: true
    });
    return;
  }

  if (sub === "remover") {
    const codigo = interaction.options.getString("codigo").trim().toUpperCase();
    if (!store.cupons[codigo]) {
      await interaction.reply({ content: "Cupom nao encontrado.", ephemeral: true });
      return;
    }
    store.cupons[codigo].ativo = false;
    salvarStore();
    await atualizarPainelCupons().catch(() => {});
    await interaction.reply({ content: `🚫 Cupom **${codigo}** desativado.`, ephemeral: true });
  }
}

async function handleProduto(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "listar") {
    const linhas = todosProdutos().map(p => {
      const cargo = p.cargoId ? `<@&${p.cargoId}> por ${p.cargoDias} dia(s)` : "nenhum";
      return `${p.emoji} **${p.nome}** (\`${p.id}\`)\n` +
        `Preco: ${formatarReais(p.precoCentavos)} • Modo: ${p.modo === "auto" ? "automatico" : "staff"} • ` +
        `${p.disponivel ? "disponivel" : "indisponivel"}\nCargo temporario: ${cargo}`;
    });
    await interaction.reply({
      embeds: [new EmbedBuilder().setTitle("🛍️ Produtos").setDescription(linhas.join("\n\n")).setColor(0x9b59b6)],
      ephemeral: true
    });
    return;
  }

  if (sub === "editar") {
    const produtoId = interaction.options.getString("produto");
    const produto = getProduto(produtoId);
    if (!produto) {
      await interaction.reply({ content: "Produto invalido.", ephemeral: true });
      return;
    }
    const patch = store.produtoOverrides[produtoId] || {};
    const modo = interaction.options.getString("modo");
    const cargo = interaction.options.getRole("cargo");
    const cargoDias = interaction.options.getInteger("cargo-dias");
    const preco = interaction.options.getNumber("preco");
    const precoOriginal = interaction.options.getNumber("preco-original");
    const disponivel = interaction.options.getBoolean("disponivel");
    const imagem = interaction.options.getString("imagem");
    const banner = interaction.options.getString("banner");
    const bannerPosicao = interaction.options.getString("banner-posicao");
    const instrucoes = interaction.options.getString("instrucoes");
    const categoriaId = interaction.options.getString("categoria");

    if (modo) patch.modo = modo;
    if (cargo) patch.cargoId = cargo.id;
    if (cargoDias !== null && cargoDias !== undefined) patch.cargoDias = cargoDias;
    if (preco !== null && preco !== undefined) patch.precoCentavos = Math.round(preco * 100);
    if (precoOriginal !== null && precoOriginal !== undefined) patch.precoOriginalCentavos = Math.round(precoOriginal * 100);
    if (disponivel !== null && disponivel !== undefined) patch.disponivel = disponivel;
    if (imagem !== null && imagem !== undefined) {
      if (imagem && !urlMidiaValida(imagem)) {
        await interaction.reply({ content: "URL da imagem invalida.", ephemeral: true });
        return;
      }
      patch.imagem = imagem || null;
    }
    if (banner !== null && banner !== undefined) {
      if (banner && !urlMidiaValida(banner)) {
        await interaction.reply({ content: "URL do banner invalida.", ephemeral: true });
        return;
      }
      patch.banner = banner || null;
    }
    if (bannerPosicao) patch.bannerPosicao = bannerPosicao;
    if (instrucoes !== null && instrucoes !== undefined) patch.instrucoes = instrucoes;
    if (categoriaId) patch.categoriaId = categoriaId;

    store.produtoOverrides[produtoId] = patch;
    salvarStore();
    await atualizarLojaFixa();

    const atual = getProduto(produtoId);
    await interaction.reply({
      content:
        `✅ Produto **${atual.nome}** atualizado.\n` +
        `Preco: ${formatarReais(atual.precoCentavos)}\n` +
        `Modo: ${atual.modo === "auto" ? "automatico" : "staff"}\n` +
        `Disponivel: ${atual.disponivel ? "sim" : "nao"}\n` +
        `Cargo temporario: ${atual.cargoId ? `<@&${atual.cargoId}> por ${atual.cargoDias} dia(s)` : "nenhum"}`,
      ephemeral: true
    });
  }
}

async function handleConfig(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "ver") {
    const desc =
      `Canal de logs: ${store.config.logChannelId ? `<#${store.config.logChannelId}>` : "nao definido"}\n` +
      `Canal de feedbacks: ${store.config.feedbackChannelId ? `<#${store.config.feedbackChannelId}>` : "nao definido"}\n` +
      `Categoria de tickets: ${store.config.ticketCategoryId ? `<#${store.config.ticketCategoryId}>` : "nao definida"}\n` +
      `Loja fixa: ${store.lojaFixa.channelId ? `<#${store.lojaFixa.channelId}>` : "nao publicada"}\n` +
      `Banner da loja: ${urlMidiaValida(store.config.banner) ? `definido (${store.config.bannerPosicao || "top"})` : "nao definido"}\n` +
      `Nome PIX publico: **${pixNomePublico()}** (ocultar nome completo: ${store.config.ocultarNomePix !== false ? "sim" : "nao"})\n` +
      `SMTP: ${store.config.smtpHost ? store.config.smtpHost : "nao configurado"}\n` +
      `Cargos temporarios ativos: ${store.cargosTemporarios.length}\n` +
      `Pedidos registrados: ${Object.keys(store.pedidos).length}`;
    await interaction.reply({
      embeds: [new EmbedBuilder().setTitle("⚙️ Configuracao").setDescription(desc).setColor(0x2ecc71)],
      ephemeral: true
    });
    return;
  }

  if (sub === "canal-logs") {
    store.config.logChannelId = CANAIS.logs;
    salvarStore();
    await interaction.reply({ content: `Logs ficam em <#${CANAIS.logs}>.`, ephemeral: true });
    return;
  }

  if (sub === "canal-feedback") {
    store.config.feedbackChannelId = CANAIS.feedbacks;
    salvarStore();
    await interaction.reply({ content: `Feedbacks ficam em <#${CANAIS.feedbacks}>.`, ephemeral: true });
    return;
  }

  if (sub === "categoria-ticket") {
    store.config.ticketCategoryId = interaction.options.getChannel("categoria").id;
    salvarStore();
    await interaction.reply({ content: `✅ Categoria de tickets definida em <#${store.config.ticketCategoryId}>.`, ephemeral: true });
    return;
  }

  if (sub === "canal-loja") {
    await publicarLojaFixa();
    await interaction.reply({ content: `✅ Loja fixa publicada em <#${CANAIS.loja}>.`, ephemeral: true });
    return;
  }

  if (sub === "banner-loja") {
    const url = (interaction.options.getString("url") || "").trim();
    if (url && !urlMidiaValida(url)) {
      await interaction.reply({ content: "URL invalida. Use um link http/https (gif funciona).", ephemeral: true });
      return;
    }
    store.config.banner = url || null;
    salvarStore();
    await atualizarLojaFixa();
    await interaction.reply({ content: url ? "✅ Banner da loja atualizado." : "✅ Banner da loja removido.", ephemeral: true });
    return;
  }

  if (sub === "banner-posicao") {
    const pos = (interaction.options.getString("posicao") || "top").toLowerCase();
    store.config.bannerPosicao = pos;
    salvarStore();
    await atualizarLojaFixa();
    await interaction.reply({ content: `Posicao do banner da loja: **${pos}**.`, ephemeral: true });
    return;
  }

  if (sub === "pix-nome") {
    const nome = (interaction.options.getString("nome") || QR_NOME_PUBLICO).trim();
    const ocultar = interaction.options.getBoolean("ocultar");
    store.config.pixNomePublico = nome;
    if (ocultar !== null && ocultar !== undefined) store.config.ocultarNomePix = ocultar;
    salvarStore();
    await interaction.reply({
      content: `Nome no PIX: **${pixNomePublico()}**. Ocultar nome completo: **${store.config.ocultarNomePix !== false ? "sim" : "nao"}**.`,
      ephemeral: true
    });
    return;
  }

  if (sub === "smtp") {
    store.config.smtpHost = interaction.options.getString("host");
    store.config.smtpPort = interaction.options.getInteger("porta") || 587;
    store.config.smtpUser = interaction.options.getString("usuario");
    store.config.smtpPass = interaction.options.getString("senha");
    store.config.smtpFrom = interaction.options.getString("from");
    salvarStore();
    await interaction.reply({ content: "SMTP salvo no banco. Entregas por e-mail habilitadas.", ephemeral: true });
  }
}

async function handleCategoria(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "criar") {
    const id = interaction.options.getString("id").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
    const nome = interaction.options.getString("nome").trim();
    if (!id || !nome) {
      await interaction.reply({ content: "ID e nome sao obrigatorios.", ephemeral: true });
      return;
    }
    store.categorias[id] = {
      id,
      nome,
      emoji: interaction.options.getString("emoji") || "📁",
      descricao: interaction.options.getString("descricao") || "",
      posicao: Object.keys(store.categorias).length,
      ativo: true
    };
    salvarStore();
    await atualizarLojaFixa();
    await interaction.reply({ content: `Categoria **${nome}** (\`${id}\`) criada.`, ephemeral: true });
    return;
  }
  if (sub === "listar") {
    const linhas = Object.values(store.categorias).map(c =>
      `${c.emoji || "📁"} **${c.nome}** (\`${c.id}\`) — ${c.ativo === false ? "inativa" : "ativa"} — ${produtosDaCategoria(c.id).length} produto(s)`
    );
    await interaction.reply({
      embeds: [new EmbedBuilder().setTitle("Categorias").setDescription(linhas.join("\n") || "Nenhuma.").setColor(0x9b59b6)],
      ephemeral: true
    });
    return;
  }
  if (sub === "remover") {
    const id = interaction.options.getString("id").trim();
    if (!store.categorias[id]) {
      await interaction.reply({ content: "Categoria nao encontrada.", ephemeral: true });
      return;
    }
    store.categorias[id].ativo = false;
    salvarStore();
    await atualizarLojaFixa();
    await interaction.reply({ content: `Categoria \`${id}\` desativada.`, ephemeral: true });
  }
}

async function handleFeedback(interaction) {
  const id = String(interaction.options.getInteger("id"));
  const nota = interaction.options.getInteger("nota");
  const comentario = (interaction.options.getString("comentario") || "").trim();
  const pedido = store.pedidos[id];
  if (!pedido) {
    await interaction.reply({ content: "Pedido nao encontrado.", ephemeral: true });
    return;
  }
  const membro = interaction.member;
  if (pedido.userId !== interaction.user.id && !isStaff(membro)) {
    await interaction.reply({ content: "Voce so pode avaliar os seus pedidos.", ephemeral: true });
    return;
  }
  if (pedido.status !== STATUS.ENTREGUE) {
    await interaction.reply({ content: "So da pra avaliar pedidos ja entregues.", ephemeral: true });
    return;
  }
  if (pedido.feedback) {
    await interaction.reply({ content: "Esse pedido ja foi avaliado.", ephemeral: true });
    return;
  }
  await registrarFeedback(pedido, nota, comentario);
  await interaction.reply({ content: `${estrelas(nota)} Valeu pela avaliacao!`, ephemeral: true });
}

async function handleAvaliacoes(interaction) {
  const produtoId = interaction.options.getString("produto");
  const produto = getProduto(produtoId);
  const avaliacoes = Object.values(store.pedidos)
    .filter(p => p.produtoId === produtoId && p.feedback)
    .sort((a, b) => b.feedback.em - a.feedback.em);

  if (!avaliacoes.length) {
    await interaction.reply({ content: `Ainda nao ha avaliacoes para **${produto ? produto.nome : produtoId}**.`, ephemeral: true });
    return;
  }

  const media = avaliacoes.reduce((s, p) => s + p.feedback.nota, 0) / avaliacoes.length;
  const linhas = avaliacoes.slice(0, 10).map(p => {
    const comentario = p.feedback.comentario ? `\n"${p.feedback.comentario}"` : "";
    return `${estrelas(p.feedback.nota)} — <@${p.userId}> (pedido #${p.id})${comentario}`;
  });

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(`⭐ Avaliacoes — ${produto ? produto.nome : produtoId}`)
        .setDescription(
          `Media: **${media.toFixed(1)}/5** com **${avaliacoes.length}** avaliacao(oes).\n\n` + linhas.join("\n\n")
        )
        .setColor(0xf1c40f)
    ],
    ephemeral: true
  });
}

async function handlePainelTicket(interaction) {
  await interaction.deferReply({ ephemeral: true });
  await publicarOuAtualizarPainel("ticket", CANAIS.ticket, payloadPainelTicket());
  await interaction.editReply({ content: `Painel de tickets publicado em <#${CANAIS.ticket}>.` });
}

async function handleTicket(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const assunto = interaction.options.getString("assunto") || "Suporte";
  const canal = await abrirTicket(interaction.guild, interaction.user, assunto);
  await interaction.editReply(`✅ Ticket aberto em <#${canal.id}>.`);
}

async function handleLogs(interaction) {
  const quantidade = interaction.options.getInteger("quantidade") || 15;
  const recentes = store.logs.slice(-quantidade).reverse();
  if (!recentes.length) {
    await interaction.reply({ content: "Nenhum log registrado ainda.", ephemeral: true });
    return;
  }
  const linhas = recentes.map(e => {
    const hora = `<t:${Math.floor(e.em / 1000)}:t>`;
    const alvo = e.pedidoId ? ` · pedido #${e.pedidoId}` : e.userId ? ` · <@${e.userId}>` : "";
    return `${hora} — ${LOG_LABEL[e.tipo] || e.tipo}${alvo}\n${e.detalhe}`;
  });
  await interaction.reply({
    embeds: [new EmbedBuilder().setTitle("📜 Logs recentes").setDescription(linhas.join("\n\n").slice(0, 4000)).setColor(0x95a5a6)],
    ephemeral: true
  });
}

async function handleRelatorio(interaction) {
  const pedidos = Object.values(store.pedidos);
  const entregues = pedidos.filter(p => p.status === STATUS.ENTREGUE);
  const faturamento = entregues.reduce((s, p) => s + p.valorCentavos, 0);
  const descontos = pedidos.reduce((s, p) => s + (p.descontoCentavos || 0), 0);
  const ticketMedio = entregues.length ? faturamento / entregues.length : 0;

  const porProduto = {};
  for (const p of pedidos) {
    porProduto[p.produtoId] = porProduto[p.produtoId] || { total: 0, entregues: 0, receita: 0 };
    porProduto[p.produtoId].total += 1;
    if (p.status === STATUS.ENTREGUE) {
      porProduto[p.produtoId].entregues += 1;
      porProduto[p.produtoId].receita += p.valorCentavos;
    }
  }
  const linhasProdutos = Object.entries(porProduto).map(([id, v]) => {
    const produto = getProduto(id);
    return `${produto ? produto.emoji : "📦"} **${produto ? produto.nome : id}** — ${v.entregues}/${v.total} entregues — ${formatarReais(v.receita)}`;
  });

  const embed = new EmbedBuilder()
    .setTitle("📊 Relatorio de vendas")
    .addFields(
      { name: "Pedidos totais", value: String(pedidos.length), inline: true },
      { name: "Entregues", value: String(entregues.length), inline: true },
      { name: "Faturamento", value: formatarReais(faturamento), inline: true },
      { name: "Ticket medio", value: formatarReais(ticketMedio), inline: true },
      { name: "Descontos concedidos", value: formatarReais(descontos), inline: true },
      { name: "Avaliacoes", value: String(pedidos.filter(p => p.feedback).length), inline: true }
    )
    .setColor(0x2ecc71);
  if (linhasProdutos.length) embed.addFields({ name: "Por produto", value: linhasProdutos.join("\n").slice(0, 1024) });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

const commands = [
  new SlashCommandBuilder()
    .setName("loja")
    .setDescription("Abre a loja da Baguncinha."),
  new SlashCommandBuilder()
    .setName("meuspedidos")
    .setDescription("Mostra seus pedidos."),
  new SlashCommandBuilder()
    .setName("pedido")
    .setDescription("Consulta um pedido pelo numero.")
    .addIntegerOption(option =>
      option.setName("id").setDescription("Numero do pedido").setRequired(true).setMinValue(1)
    ),
  new SlashCommandBuilder()
    .setName("catalogo")
    .setDescription("Publica o catalogo com botoes de compra neste canal (staff).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName("estoque")
    .setDescription("Gerencia o estoque das entregas automaticas (staff).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName("adicionar").setDescription("Adiciona itens ao estoque (um por linha).")
        .addStringOption(o => o.setName("produto").setDescription("Produto").setRequired(true).addChoices(...escolhasProdutos))
        .addStringOption(o => o.setName("conteudo").setDescription("Segredo/codigo. Um item por linha.").setRequired(true))
    )
    .addSubcommand(sub => sub.setName("listar").setDescription("Mostra o estoque."))
    .addSubcommand(sub =>
      sub.setName("remover").setDescription("Remove um item pelo id.")
        .addStringOption(o => o.setName("produto").setDescription("Produto").setRequired(true).addChoices(...escolhasProdutos))
        .addIntegerOption(o => o.setName("id").setDescription("Id do item").setRequired(true).setMinValue(1))
    ),
  new SlashCommandBuilder()
    .setName("cupom")
    .setDescription("Gerencia cupons de desconto (staff).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName("criar").setDescription("Cria um cupom de desconto.")
        .addStringOption(o => o.setName("codigo").setDescription("Codigo do cupom").setRequired(true).setMaxLength(32))
        .addStringOption(o =>
          o.setName("tipo").setDescription("Tipo de desconto").setRequired(true)
            .addChoices({ name: "Percentual (%)", value: "percent" }, { name: "Valor fixo (R$)", value: "fixo" })
        )
        .addNumberOption(o => o.setName("valor").setDescription("Percentual ou valor em reais").setRequired(true))
        .addIntegerOption(o => o.setName("usos").setDescription("Limite de usos (0 = ilimitado)").setMinValue(0))
        .addIntegerOption(o => o.setName("dias").setDescription("Validade em dias (0 = sem expiracao)").setMinValue(0))
        .addNumberOption(o => o.setName("minimo").setDescription("Compra minima em reais").setMinValue(0))
    )
    .addSubcommand(sub => sub.setName("listar").setDescription("Lista os cupons."))
    .addSubcommand(sub =>
      sub.setName("remover").setDescription("Desativa um cupom.")
        .addStringOption(o => o.setName("codigo").setDescription("Codigo do cupom").setRequired(true))
    ),
  new SlashCommandBuilder()
    .setName("produto")
    .setDescription("Gerencia os produtos (staff).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub.setName("listar").setDescription("Lista os produtos."))
    .addSubcommand(sub =>
      sub.setName("editar").setDescription("Edita um produto.")
        .addStringOption(o => o.setName("produto").setDescription("Produto").setRequired(true).addChoices(...escolhasProdutos))
        .addStringOption(o =>
          o.setName("modo").setDescription("Entrega automatica (se houver estoque) ou pela staff")
            .addChoices({ name: "Automatico", value: "auto" }, { name: "Staff", value: "semi" })
        )
        .addRoleOption(o => o.setName("cargo").setDescription("Cargo temporario entregue na compra"))
        .addIntegerOption(o => o.setName("cargo-dias").setDescription("Duracao do cargo em dias").setMinValue(0))
        .addNumberOption(o => o.setName("preco").setDescription("Preco em reais").setMinValue(0))
        .addNumberOption(o => o.setName("preco-original").setDescription("Preco riscado (de) em reais").setMinValue(0))
        .addBooleanOption(o => o.setName("disponivel").setDescription("Produto a venda?"))
        .addStringOption(o => o.setName("imagem").setDescription("URL da foto do item (gif ok)"))
        .addStringOption(o => o.setName("banner").setDescription("URL do banner/gif do produto"))
        .addStringOption(o =>
          o.setName("banner-posicao").setDescription("Posicao do banner")
            .addChoices(
              { name: "Em cima", value: "top" },
              { name: "Em baixo", value: "bottom" },
              { name: "Miniatura", value: "thumbnail" },
              { name: "Flutuante", value: "float" }
            )
        )
        .addStringOption(o => o.setName("instrucoes").setDescription("Instrucoes de uso do produto").setMaxLength(1000))
        .addStringOption(o => o.setName("categoria").setDescription("ID da categoria (ex: nitro)").setMaxLength(32))
    ),
  new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configura canais e categoria de tickets (staff).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub.setName("ver").setDescription("Mostra a configuracao atual."))
    .addSubcommand(sub =>
      sub.setName("canal-logs").setDescription("Define o canal de logs.")
        .addChannelOption(o => o.setName("canal").setDescription("Canal de texto").setRequired(true).addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand(sub =>
      sub.setName("canal-feedback").setDescription("Define o canal de avaliacoes.")
        .addChannelOption(o => o.setName("canal").setDescription("Canal de texto").setRequired(true).addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand(sub =>
      sub.setName("categoria-ticket").setDescription("Define a categoria dos tickets.")
        .addChannelOption(o => o.setName("categoria").setDescription("Categoria").setRequired(true).addChannelTypes(ChannelType.GuildCategory))
    )
    .addSubcommand(sub =>
      sub.setName("canal-loja").setDescription("Publica a loja fixa neste canal (sem precisar de /loja).")
        .addChannelOption(o => o.setName("canal").setDescription("Canal da loja").setRequired(true).addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand(sub =>
      sub.setName("banner-loja").setDescription("Define o banner/gif da loja inicial.")
        .addStringOption(o => o.setName("url").setDescription("URL da imagem ou gif (vazio remove)").setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName("banner-posicao").setDescription("Posicao do banner da loja (top, bottom, thumbnail, float).")
        .addStringOption(o =>
          o.setName("posicao").setDescription("Posicao").setRequired(true)
            .addChoices(
              { name: "Em cima (imagem)", value: "top" },
              { name: "Em baixo (imagem)", value: "bottom" },
              { name: "Miniatura", value: "thumbnail" },
              { name: "Flutuante", value: "float" },
              { name: "Autor", value: "author" }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName("pix-nome").setDescription("Nome que aparece no PIX (nao use seu nome completo).")
        .addStringOption(o => o.setName("nome").setDescription("Nome da loja no QR").setRequired(true).setMaxLength(25))
        .addBooleanOption(o => o.setName("ocultar").setDescription("Ocultar nome pessoal no PIX").setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName("smtp").setDescription("Configura e-mail para entrega de produtos.")
        .addStringOption(o => o.setName("host").setDescription("Host SMTP").setRequired(true))
        .addStringOption(o => o.setName("usuario").setDescription("Usuario SMTP").setRequired(true))
        .addStringOption(o => o.setName("senha").setDescription("Senha / app password").setRequired(true))
        .addStringOption(o => o.setName("from").setDescription("From (ex: Loja <loja@email.com>)").setRequired(true))
        .addIntegerOption(o => o.setName("porta").setDescription("Porta (587 ou 465)").setMinValue(1))
    ),
  new SlashCommandBuilder()
    .setName("categoria")
    .setDescription("Gerencia categorias da loja (staff).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName("criar").setDescription("Cria uma categoria.")
        .addStringOption(o => o.setName("id").setDescription("ID interno (ex: nitro)").setRequired(true).setMaxLength(32))
        .addStringOption(o => o.setName("nome").setDescription("Nome visivel").setRequired(true).setMaxLength(80))
        .addStringOption(o => o.setName("emoji").setDescription("Emoji").setMaxLength(8))
        .addStringOption(o => o.setName("descricao").setDescription("Descricao").setMaxLength(200))
    )
    .addSubcommand(sub => sub.setName("listar").setDescription("Lista as categorias."))
    .addSubcommand(sub =>
      sub.setName("remover").setDescription("Desativa uma categoria.")
        .addStringOption(o => o.setName("id").setDescription("ID da categoria").setRequired(true))
    ),
  new SlashCommandBuilder()
    .setName("feedback")
    .setDescription("Avalia um pedido entregue.")
    .addIntegerOption(o => o.setName("id").setDescription("Numero do pedido").setRequired(true).setMinValue(1))
    .addIntegerOption(o => o.setName("nota").setDescription("Nota de 1 a 5").setRequired(true).setMinValue(1).setMaxValue(5))
    .addStringOption(o => o.setName("comentario").setDescription("Comentario (opcional)").setMaxLength(500)),
  new SlashCommandBuilder()
    .setName("avaliacoes")
    .setDescription("Mostra as avaliacoes de um produto.")
    .addStringOption(o => o.setName("produto").setDescription("Produto").setRequired(true).addChoices(...escolhasProdutos)),
  new SlashCommandBuilder()
    .setName("painel-ticket")
    .setDescription("Publica o painel de abertura de tickets (staff).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Abre um ticket de atendimento.")
    .addStringOption(o => o.setName("assunto").setDescription("Assunto do ticket").setMaxLength(100)),
  new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Mostra os logs de vendas recentes (staff).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption(o => o.setName("quantidade").setDescription("Quantidade de logs").setMinValue(1).setMaxValue(50)),
  new SlashCommandBuilder()
    .setName("relatorio")
    .setDescription("Resumo de vendas (staff).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map(c => c.toJSON());

async function discordGet(caminho) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const resposta = await fetch(`https://discord.com/api/v10${caminho}`, {
      headers: { Authorization: `Bot ${TOKEN}` },
      signal: controller.signal
    });
    const json = await resposta.json().catch(() => null);
    return { ok: resposta.ok, status: resposta.status, json };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function diagnosticoInicial() {
  console.log("== Diagnostico de conexao ==");

  const me = await discordGet("/users/@me").catch(error => ({ ok: false, json: { message: error.message } }));
  if (!me.ok) {
    console.error(`Token invalido (HTTP ${me.status}): ${me.json?.message || "sem detalhe"}`);
    return;
  }
  console.log(`Token pertence a: ${me.json.username} (id ${me.json.id})`);

  const app = await discordGet("/applications/@me").catch(() => ({ ok: false }));
  if (app.ok) {
    console.log(`Aplicacao do token: ${app.json.name} (id ${app.json.id})`);
    if (CLIENT_ID && app.json.id !== CLIENT_ID) {
      console.error(
        `PROBLEMA: CLIENT_ID (${CLIENT_ID}) e diferente do dono do token (${app.json.id}). ` +
        "Use o id da aplicacao do token."
      );
    } else if (CLIENT_ID) {
      console.log("CLIENT_ID confere com o token.");
    }
  } else {
    console.error("Nao consegui ler a aplicacao do token.");
  }

  const guilds = await discordGet("/users/@me/guilds").catch(() => ({ ok: false }));
  if (guilds.ok) {
    if (guilds.json.length === 0) {
      console.error("O bot NAO esta em nenhum servidor. Convide ele primeiro.");
    }
    for (const g of guilds.json) {
      const marca = g.id === GUILD_ID ? "  <== GUILD_ID configurado" : "";
      console.log(`Servidor: ${g.name} (id ${g.id})${marca}`);
    }
    if (GUILD_ID && !guilds.json.some(g => g.id === GUILD_ID)) {
      console.error(
        `PROBLEMA: o bot nao esta no servidor GUILD_ID=${GUILD_ID}. ` +
        "Confirme o id do servidor e reconvide com o escopo applications.commands."
      );
    } else if (GUILD_ID) {
      console.log("OK: o bot esta no servidor configurado.");
    }
  } else {
    console.error("Nao consegui listar os servidores do bot.");
  }
}

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  // Registra a lista atual no servidor. Isso sobrescreve os comandos do servidor
  // a cada start, entao qualquer comando removido/renomeado some na hora.
  let registradoNoServidor = false;
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log(`Comandos slash registrados no servidor (${commands.length}).`);
    registradoNoServidor = true;
  } catch (error) {
    if (error.code === 50001 || error.status === 403) {
      console.error(
        "Missing Access ao registrar no servidor. Veja o diagnostico acima. " +
        "Vou tentar registrar os comandos globais como fallback."
      );
    } else {
      console.error("Erro ao registrar no servidor:", error.message);
    }
  }

  // Limpa comandos globais antigos que ficaram presos na lista do bot. Sem isso,
  // comandos de versoes passadas continuam aparecendo no Discord (cache de ate 1h)
  // e o bot responde "Comando desconhecido" quando alguem usa um deles.
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
    console.log("Comandos globais antigos limpos.");
  } catch (error) {
    console.error("Nao consegui limpar os comandos globais antigos:", error.message);
  }

  if (registradoNoServidor) return;

  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("Comandos globais registrados (podem demorar ate 1h pra aparecer).");
  } catch (error) {
    console.error("Falha tambem no registro global:", error.message);
    console.error("Vou conectar mesmo assim pra ver o diagnostico completo nos logs.");
  }
}

async function handleCommand(interaction) {
  switch (interaction.commandName) {
    case "loja":
      if (isStaff(interaction.member)) {
        await publicarLojaFixa();
        await interaction.reply({ content: `Loja fixa publicada em <#${CANAIS.loja}>.`, ephemeral: true });
      } else {
        await interaction.reply({ content: `A loja fica em <#${CANAIS.loja}>.`, ephemeral: true });
      }
      return;
    case "catalogo":
      await publicarLojaFixa();
      await interaction.reply({ content: `Loja fixa publicada em <#${CANAIS.loja}>.`, ephemeral: true });
      return;
    case "meuspedidos": {
      const meus = Object.values(store.pedidos)
        .filter(p => p.userId === interaction.user.id)
        .sort((a, b) => b.id - a.id)
        .slice(0, 8);
      if (meus.length === 0) {
        await interaction.reply({ content: "Voce ainda nao tem pedidos.", ephemeral: true });
        return;
      }
      const linhas = meus.map(p => `#${p.id} — ${p.produtoNome} — ${formatarReais(p.valorCentavos)} — ${STATUS_LABEL[p.status]}`);
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle("Seus pedidos").setDescription(linhas.join("\n")).setColor(0x9b59b6)],
        ephemeral: true
      });
      return;
    }
    case "pedido": {
      const id = String(interaction.options.getInteger("id"));
      const pedido = store.pedidos[id];
      if (!pedido) {
        await interaction.reply({ content: "Pedido nao encontrado.", ephemeral: true });
        return;
      }
      const member = interaction.member;
      if (pedido.userId !== interaction.user.id && !isStaff(member)) {
        await interaction.reply({ content: "Voce so pode ver os seus pedidos.", ephemeral: true });
        return;
      }
      await interaction.reply({
        embeds: [embedPedidoCliente(pedido)],
        components: pedido.pixCopiaECola && pedido.status === STATUS.AGUARDANDO_PAGAMENTO ? botoesPix(pedido.id) : [],
        ephemeral: true
      });
      return;
    }
    case "estoque":
      await handleEstoque(interaction);
      return;
    case "cupom":
      await handleCupom(interaction);
      return;
    case "produto":
      await handleProduto(interaction);
      return;
    case "config":
      await handleConfig(interaction);
      return;
    case "categoria":
      await handleCategoria(interaction);
      return;
    case "feedback":
      await handleFeedback(interaction);
      return;
    case "avaliacoes":
      await handleAvaliacoes(interaction);
      return;
    case "painel-ticket":
      await handlePainelTicket(interaction);
      return;
    case "ticket":
      await handleTicket(interaction);
      return;
    case "logs":
      await handleLogs(interaction);
      return;
    case "relatorio":
      await handleRelatorio(interaction);
      return;
    default:
      console.warn(`Comando nao reconhecido: /${interaction.commandName}. Os comandos atuais serao re-registrados.`);
      await registerCommands().catch(() => {});
      await interaction
        .reply({ content: "Comando desconhecido. Reinvocarei apos o bot atualizar.", ephemeral: true })
        .catch(() => {});
  }
}

async function handleButton(interaction) {
  const [acao, valor] = interaction.customId.split(":");

  if (acao === "comprar") {
    const produto = getProduto(valor);
    if (!produto || !produto.disponivel) {
      await interaction.reply({ content: "Esse produto nao esta disponivel.", ephemeral: true });
      return;
    }
    if (produtoEsgotado(produto)) {
      await interaction.reply({
        content: `❌ **${produto.nome}** esta esgotado. Sem estoque no momento.`,
        ephemeral: true
      });
      return;
    }
    await interaction.showModal(modalComprar(valor));
    return;
  }

  if (acao === "ver") {
    const produto = getProduto(valor);
    if (!produto) {
      await interaction.reply({ content: "Produto nao encontrado.", ephemeral: true });
      return;
    }
    const esgotado = produtoEsgotado(produto);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`comprar:${produto.id}`)
        .setLabel(esgotado ? "Esgotado" : "Comprar")
        .setStyle(esgotado ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setDisabled(!produtoPodeComprar(produto))
    );
    if (isStaff(interaction.member)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`gear:${produto.id}`)
          .setEmoji("⚙️")
          .setStyle(ButtonStyle.Secondary)
      );
    }
    await interaction.reply({ embeds: [embedProdutoVitrine(produto)], components: [row], ephemeral: true });
    return;
  }

  if (acao === "gear") {
    if (!isStaff(interaction.member)) {
      await interaction.reply({ content: "So a staff pode configurar.", ephemeral: true });
      return;
    }
    const produto = getProduto(valor);
    if (!produto) {
      await interaction.reply({ content: "Produto nao encontrado.", ephemeral: true });
      return;
    }
    const qtd = estoqueDe(produto.id).length;
    const embed = new EmbedBuilder()
      .setTitle(`Config — ${produto.nome}`)
      .setDescription(
        `${precoVitrine(produto)}\n` +
        `Modo: **${produto.modo === "auto" ? "automatico" : "staff"}**\n` +
        `Disponivel: **${produto.disponivel ? "sim" : "nao"}**\n` +
        `Estoque: **${qtd}**`
      )
      .setColor(0x95a5a6);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`editprod:${produto.id}`).setLabel("Editar item").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`editextra:${produto.id}`).setLabel("Banner / instrucoes").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`addstock:${produto.id}`).setLabel("Adicionar estoque").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`clearstock:${produto.id}`).setLabel("Limpar estoque").setStyle(ButtonStyle.Danger)
    );
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    return;
  }

  if (acao === "addstock") {
    if (!isStaff(interaction.member)) {
      await interaction.reply({ content: "So a staff pode gerenciar estoque.", ephemeral: true });
      return;
    }
    const produto = getProduto(valor);
    if (!produto) {
      await interaction.reply({ content: "Produto nao encontrado.", ephemeral: true });
      return;
    }
    const modal = new ModalBuilder().setCustomId(`addstock_modal:${valor}`).setTitle(`Estoque — ${produto.nome}`.slice(0, 45));
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("conteudo")
          .setLabel("Itens (um por linha)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(4000)
      )
    );
    await interaction.showModal(modal);
    return;
  }

  if (acao === "clearstock") {
    if (!isStaff(interaction.member)) {
      await interaction.reply({ content: "So a staff pode limpar estoque.", ephemeral: true });
      return;
    }
    const produto = getProduto(valor);
    if (!produto) {
      await interaction.reply({ content: "Produto nao encontrado.", ephemeral: true });
      return;
    }
    const fila = estoqueDe(valor);
    const total = fila.length;
    store.estoque[valor] = [];
    salvarStore();
    await atualizarLojaFixa();
    await interaction.reply({ content: `Estoque de **${produto.nome}** limpo (${total} item(ns) removidos).`, ephemeral: true });
    return;
  }

  if (acao === "editprod") {
    if (!isStaff(interaction.member)) {
      await interaction.reply({ content: "So a staff pode editar.", ephemeral: true });
      return;
    }
    const produto = getProduto(valor);
    if (!produto) {
      await interaction.reply({ content: "Produto nao encontrado.", ephemeral: true });
      return;
    }
    const modal = new ModalBuilder().setCustomId(`editprod_modal:${valor}`).setTitle(`Editar ${produto.nome}`.slice(0, 45));
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("preco")
          .setLabel("Preco atual (reais)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(String((produto.precoCentavos / 100).toFixed(2)))
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("preco_original")
          .setLabel("Preco riscado / de (reais, 0 = sem)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(String(((produto.precoOriginalCentavos || 0) / 100).toFixed(2)))
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("imagem")
          .setLabel("URL da foto do item (gif ok)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(produto.imagem || "")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("banner")
          .setLabel("URL do banner/gif do produto")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(produto.banner || "")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("descricao")
          .setLabel("Descricao")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setValue((produto.descricao || "").slice(0, 1000))
      )
    );
    await interaction.showModal(modal);
    return;
  }

  if (acao === "editextra") {
    if (!isStaff(interaction.member)) {
      await interaction.reply({ content: "So a staff pode editar.", ephemeral: true });
      return;
    }
    const produto = getProduto(valor);
    if (!produto) {
      await interaction.reply({ content: "Produto nao encontrado.", ephemeral: true });
      return;
    }
    const modal = new ModalBuilder().setCustomId(`editextra_modal:${valor}`).setTitle(`Extra ${produto.nome}`.slice(0, 45));
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("banner_posicao")
          .setLabel("Banner: top, bottom, thumbnail, float")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(produto.bannerPosicao || "bottom")
          .setMaxLength(20)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("instrucoes")
          .setLabel("Instrucoes do produto")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setValue((produto.instrucoes || "").slice(0, 1000))
          .setMaxLength(1000)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("categoria")
          .setLabel("ID da categoria")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(produto.categoriaId || "")
          .setMaxLength(32)
      )
    );
    await interaction.showModal(modal);
    return;
  }

  if (acao === "pix_copiar" || acao === "pix_txt") {
    const pedido = store.pedidos[String(valor)];
    if (!pedido || !pedido.pixCopiaECola) {
      await interaction.reply({ content: "Esse Pix nao esta mais disponivel.", ephemeral: true });
      return;
    }
    if (pedido.userId !== interaction.user.id && !isStaff(interaction.member)) {
      await interaction.reply({ content: "Esse Pix nao e seu.", ephemeral: true });
      return;
    }
    await interaction.showModal(modalPix(pedido));
    return;
  }

  if (acao === "entregar") {
    const member = interaction.member;
    if (!isStaff(member)) {
      await interaction.reply({ content: "So a staff pode entregar.", ephemeral: true });
      return;
    }
    const pedido = store.pedidos[valor];
    if (!pedido || pedido.status !== STATUS.AGUARDANDO_ENTREGA) {
      await interaction.reply({ content: "Esse pedido nao esta aguardando entrega.", ephemeral: true });
      return;
    }
    const modal = new ModalBuilder().setCustomId(`entregar_modal:${valor}`).setTitle(`Entregar pedido #${valor}`);
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("codigo")
          .setLabel("Codigo / licenca / chave")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("extra")
          .setLabel("Observacao para o cliente (opcional)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(200)
      )
    );
    await interaction.showModal(modal);
    return;
  }

  if (acao === "cancelar") {
    await interaction.deferReply({ ephemeral: true });
    const member = interaction.member;
    if (!isStaff(member)) {
      await interaction.editReply({ content: "So a staff pode cancelar." });
      return;
    }
    const pedido = store.pedidos[valor];
    if (!pedido || [STATUS.ENTREGUE, STATUS.CANCELADO].includes(pedido.status)) {
      await interaction.editReply({ content: "Esse pedido nao pode ser cancelado." });
      return;
    }
    pedido.status = STATUS.CANCELADO;
    pedido.canceladoEm = Date.now();
    salvarStore();
    registrarLog("cancelado", `Pedido #${pedido.id} cancelado por <@${interaction.user.id}>.`, {
      pedidoId: pedido.id,
      userId: pedido.userId,
      staffId: interaction.user.id
    });
    await avisarCliente(pedido, `❌ Pedido #${pedido.id} foi cancelado pela staff.`);
    await notificarAdmin(pedido, `Cancelado por <@${interaction.user.id}>.`);
    await interaction.editReply({ content: `Pedido #${pedido.id} cancelado.` });
    return;
  }

  if (acao === "avaliar") {
    await interaction.showModal(modalAvaliar(valor));
    return;
  }

  if (acao === "ticket_abrir") {
    await interaction.deferReply({ ephemeral: true });
    const canal = await abrirTicket(interaction.guild, interaction.user, "Atendimento");
    await interaction.editReply(`✅ Ticket aberto em <#${canal.id}>.`);
    return;
  }

  if (acao === "ticket_fechar") {
    await fecharTicket(interaction, valor);
    return;
  }

  if (acao === "loja_home") {
    await interaction.update(payloadLoja()).catch(() => {});
    return;
  }

  if (acao === "entregadm") {
    const pedido = store.pedidos[String(valor)];
    if (!pedido || pedido.userId !== interaction.user.id) {
      await interaction.reply({ content: "Pedido invalido.", ephemeral: true });
      return;
    }
    pedido.entregaMetodo = "dm";
    pedido.entregaEmail = null;
    salvarStore();
    await interaction.reply({ content: "Entrega definida: **DM**. Depois de pagar, o produto chega na sua DM.", ephemeral: true });
    return;
  }

  if (acao === "entregaemail") {
    const pedido = store.pedidos[String(valor)];
    if (!pedido || pedido.userId !== interaction.user.id) {
      await interaction.reply({ content: "Pedido invalido.", ephemeral: true });
      return;
    }
    const modal = new ModalBuilder().setCustomId(`email_modal:${valor}`).setTitle("Receber por e-mail");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("email")
          .setLabel("Seu e-mail")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("voce@email.com")
          .setMaxLength(120)
      )
    );
    await interaction.showModal(modal);
    return;
  }

  await interaction
    .reply({ content: "Esse botao ficou desatualizado. Use os comandos de novo.", ephemeral: true })
    .catch(() => {});
}

async function handleSelect(interaction) {
  const id = interaction.customId;
  const valor = interaction.values[0];

  if (id === "cat") {
    await interaction.reply({ ...payloadLoja(valor), ephemeral: true });
    return;
  }

  if (id === "ticket_cat") {
    const categoria = store.categorias[valor];
    await interaction.deferReply({ ephemeral: true });
    const canal = await abrirTicket(
      interaction.guild,
      interaction.user,
      categoria ? `Atendimento: ${categoria.nome}` : "Atendimento"
    );
    await interaction.editReply(`Ticket aberto em <#${canal.id}> (${categoria ? categoria.nome : valor}).`);
  }
}

async function handleModal(interaction) {
  const [acao, valor] = interaction.customId.split(":");

  if (acao === "comprar_modal") {
    let cupom = "";
    try {
      cupom = interaction.fields.getTextInputValue("cupom");
    } catch {
      cupom = "";
    }
    await criarPedido(interaction, valor, cupom);
    return;
  }

  if (acao === "entregar_modal") {
    await handleEntregarModal(interaction, valor);
    return;
  }

  if (acao === "avaliar_modal") {
    await handleAvaliarModal(interaction, valor);
    return;
  }

  if (acao === "pix_copiar_modal") {
    await interaction.reply({ content: "Cole o Pix no app do banco.", ephemeral: true }).catch(() => {});
    return;
  }

  if (acao === "addstock_modal") {
    if (!isStaff(interaction.member)) {
      await interaction.reply({ content: "So a staff pode gerenciar estoque.", ephemeral: true });
      return;
    }
    const produto = getProduto(valor);
    if (!produto) {
      await interaction.reply({ content: "Produto nao encontrado.", ephemeral: true });
      return;
    }
    const itens = interaction.fields.getTextInputValue("conteudo").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!itens.length) {
      await interaction.reply({ content: "Envie ao menos um item (um por linha).", ephemeral: true });
      return;
    }
    const fila = estoqueDe(valor);
    for (const texto of itens) {
      fila.push({ id: store.nextEstoqueItemId++, conteudo: texto, criadoEm: Date.now() });
    }
    salvarStore();
    await atualizarLojaFixa();
    await interaction.reply({
      content: `✅ ${itens.length} item(ns) adicionado(s) ao estoque de **${produto.nome}**. Total agora: **${fila.length}**.`,
      ephemeral: true
    });
    return;
  }

  if (acao === "email_modal") {
    const pedido = store.pedidos[String(valor)];
    if (!pedido || pedido.userId !== interaction.user.id) {
      await interaction.reply({ content: "Pedido invalido.", ephemeral: true });
      return;
    }
    const email = interaction.fields.getTextInputValue("email").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await interaction.reply({ content: "E-mail invalido.", ephemeral: true });
      return;
    }
    pedido.entregaMetodo = "email";
    pedido.entregaEmail = email;
    salvarStore();
    await interaction.reply({
      content: `Entrega definida: **e-mail** (${email}). Depois de pagar, o produto chega nesse endereco.`,
      ephemeral: true
    });
    return;
  }

  if (acao === "editprod_modal") {
    if (!isStaff(interaction.member)) {
      await interaction.reply({ content: "So a staff pode editar.", ephemeral: true });
      return;
    }
    const produto = getProduto(valor);
    if (!produto) {
      await interaction.reply({ content: "Produto nao encontrado.", ephemeral: true });
      return;
    }
    const patch = store.produtoOverrides[valor] || {};
    const precoTxt = interaction.fields.getTextInputValue("preco").trim();
    const originalTxt = interaction.fields.getTextInputValue("preco_original").trim();
    const imagem = interaction.fields.getTextInputValue("imagem").trim();
    const banner = interaction.fields.getTextInputValue("banner").trim();
    const descricao = interaction.fields.getTextInputValue("descricao").trim();

    if (precoTxt) {
      const n = Number(precoTxt.replace(",", "."));
      if (!Number.isFinite(n) || n < 0) {
        await interaction.reply({ content: "Preco invalido.", ephemeral: true });
        return;
      }
      patch.precoCentavos = Math.round(n * 100);
    }
    if (originalTxt) {
      const n = Number(originalTxt.replace(",", "."));
      if (!Number.isFinite(n) || n < 0) {
        await interaction.reply({ content: "Preco original invalido.", ephemeral: true });
        return;
      }
      patch.precoOriginalCentavos = Math.round(n * 100);
    }
    if (imagem && !urlMidiaValida(imagem)) {
      await interaction.reply({ content: "URL da imagem invalida.", ephemeral: true });
      return;
    }
    if (banner && !urlMidiaValida(banner)) {
      await interaction.reply({ content: "URL do banner invalida.", ephemeral: true });
      return;
    }
    patch.imagem = imagem || null;
    patch.banner = banner || null;
    if (descricao) patch.descricao = descricao;
    store.produtoOverrides[valor] = patch;
    salvarStore();
    await atualizarLojaFixa();
    const atual = getProduto(valor);
    await interaction.reply({
      content: `✅ **${atual.nome}** atualizado.\nPreco: ${precoVitrine(atual)}`,
      ephemeral: true
    });
    return;
  }

  if (acao === "editextra_modal") {
    if (!isStaff(interaction.member)) {
      await interaction.reply({ content: "So a staff pode editar.", ephemeral: true });
      return;
    }
    const produto = getProduto(valor);
    if (!produto) {
      await interaction.reply({ content: "Produto nao encontrado.", ephemeral: true });
      return;
    }
    const patch = store.produtoOverrides[valor] || {};
    const posicao = interaction.fields.getTextInputValue("banner_posicao").trim().toLowerCase();
    const instrucoes = interaction.fields.getTextInputValue("instrucoes").trim();
    const categoriaId = interaction.fields.getTextInputValue("categoria").trim();
    if (posicao) patch.bannerPosicao = posicao;
    patch.instrucoes = instrucoes;
    if (categoriaId) patch.categoriaId = categoriaId;
    store.produtoOverrides[valor] = patch;
    salvarStore();
    await atualizarLojaFixa();
    await interaction.reply({ content: `✅ Extra de **${produto.nome}** salvo (banner, instrucoes, categoria).`, ephemeral: true });
    return;
  }

  await interaction
    .reply({ content: "Esse formulario ficou desatualizado. Tente novamente.", ephemeral: interaction.inGuild() })
    .catch(() => {});
}

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
      return;
    }
    if (interaction.isStringSelectMenu()) {
      await handleSelect(interaction);
      return;
    }
    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }
    if (interaction.isModalSubmit()) {
      await handleModal(interaction);
    }
  } catch (error) {
    console.error("Erro na interacao:", error);
    const payload = { content: "Deu ruim aqui. Tenta de novo.", ephemeral: true };
    if (typeof interaction.inGuild === "function" && !interaction.inGuild()) delete payload.ephemeral;
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

function lerBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function validarAssinaturaMp(req, rawBody) {
  if (!MP_WEBHOOK_SECRET) return true;
  const header = req.headers["x-signature"];
  const requestId = req.headers["x-request-id"];
  if (!header || !requestId) return false;
  const partes = Object.fromEntries(
    String(header).split(",").map(p => p.trim().split("=")).filter(p => p.length === 2)
  );
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return false;
  const dataId = new URL(req.url, "http://localhost").searchParams.get("data.id") || "";
  const manifesto = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hash = crypto.createHmac("sha256", MP_WEBHOOK_SECRET).update(manifesto).digest("hex");
  return hash === v1;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bot de vendas Baguncinha online.");
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/pix/")) {
    const id = decodeURIComponent(req.url.slice("/pix/".length).split("?")[0] || "");
    const pedido = store.pedidos[id];
    if (!pedido || !pedido.pixCopiaECola || pedido.status !== STATUS.AGUARDANDO_PAGAMENTO) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Pix nao encontrado ou expirado.");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(paginaCopiarPix(pedido));
    return;
  }

  if (req.method === "POST" && req.url.startsWith("/webhook/mercadopago")) {
    try {
      const raw = await lerBody(req);
      if (!validarAssinaturaMp(req, raw)) {
        res.writeHead(401);
        res.end("invalid signature");
        return;
      }
      const payload = raw.length ? JSON.parse(raw.toString("utf-8")) : {};
      const tipo = payload.type || payload.action || "";
      const paymentId = payload.data?.id || payload.resource;
      res.writeHead(200);
      res.end("ok");
      if (tipo.includes("payment") && paymentId) {
        processarWebhookPagamento(String(paymentId)).catch(error => {
          console.error("Erro no webhook:", error.message);
        });
      }
    } catch (error) {
      console.error("Webhook invalido:", error.message);
      res.writeHead(400);
      res.end("bad request");
    }
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

client.once("ready", () => {
  console.log(`Bot conectado como ${client.user.tag}`);

  try {
    verificarPrazos();
  } catch (err) {
    console.error("Erro em verificarPrazos:", err);
  }

  try {
    removerCargosExpirados();
  } catch (err) {
    console.error("Erro em removerCargosExpirados:", err);
  }

  publicarCanaisFixos().catch(err => console.error("Erro ao publicar canais fixos:", err.message));
});

function verificarPrazos() {
  const agora = Date.now();
  let mudou = false;
  for (const pedido of Object.values(store.pedidos)) {
    if (pedido.status === STATUS.AGUARDANDO_PAGAMENTO && agora - pedido.criadoEm > 45 * 60 * 1000) {
      pedido.status = STATUS.EXPIRADO;
      mudou = true;
      registrarLog("expirado", `Pedido #${pedido.id} expirou sem pagamento.`, { pedidoId: pedido.id, userId: pedido.userId });
      avisarCliente(pedido, `⌛ Seu pedido #${pedido.id} foi fechado por falta de pagamento.`).catch(() => {});
    }
    if (
      pedido.status === STATUS.AGUARDANDO_ENTREGA &&
      pedido.prazoEntregaAte &&
      agora > pedido.prazoEntregaAte &&
      !pedido.prazoAvisado
    ) {
      pedido.prazoAvisado = true;
      mudou = true;
      registrarLog("prazo_estourado", `Pedido #${pedido.id} passou do prazo de entrega.`, { pedidoId: pedido.id, userId: pedido.userId });
    }
  }
  if (mudou) salvarStore();
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`HTTP na porta ${PORT}`);
});

async function start() {
  if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
    console.error("Faltam TOKEN, CLIENT_ID ou GUILD_ID.");
    return;
  }
  await diagnosticoInicial();
  await registerCommands().catch(error => {
    console.error("Falha ao registrar comandos:", error.message);
  });
  await client.login(TOKEN);
}

setInterval(async () => {
  verificarPrazos();
  await removerCargosExpirados().catch(() => {});
}, 5 * 60 * 1000);

start().catch(error => {
  console.error("Falha ao iniciar:", error);
});
