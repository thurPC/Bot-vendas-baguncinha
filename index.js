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
  AttachmentBuilder
} = require("discord.js");
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const QRCode = require("qrcode");

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

const DATA_FILE = path.join(__dirname, "data", "store.json");
const PRAZO_ENTREGA_MIN = 50;
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
    cargoDias: 0
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
    cargoDias: 0
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
    cargoDias: 0
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
  aguardando_pagamento: "⏳ Aguardando pagamento",
  aguardando_entrega: "🟡 Aguardando entrega",
  entregue: "✅ Entregue",
  cancelado: "❌ Cancelado",
  expirado: "⌛ Expirado"
};

const LOG_LABEL = {
  pedido_criado: "🧾 Pedido criado",
  cupom_aplicado: "🎟️ Cupom aplicado",
  pagamento_confirmado: "💳 Pagamento confirmado",
  aguardando_entrega: "🟡 Aguardando entrega",
  entregue: "✅ Entrega concluida",
  cancelado: "❌ Pedido cancelado",
  expirado: "⌛ Pedido expirado",
  prazo_estourado: "⏰ Prazo de entrega estourado",
  cargo_concedido: "🛡️ Cargo temporario concedido",
  cargo_removido: "🛡️ Cargo temporario removido",
  cargo_erro: "⚠️ Falha ao aplicar cargo",
  feedback: "⭐ Nova avaliacao",
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
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    }
  } catch (error) {
    console.error("Erro ao ler store.json:", error.message);
  }
  return {};
}

function salvarStore() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
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
if (!store.config) store.config = { logChannelId: null, feedbackChannelId: null, ticketCategoryId: null };

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

function limparPixCopiaECola(codigo) {
  if (!codigo) return "";
  return String(codigo).replace(/[\s\u200b\u200c\u200d\ufeff`]/g, "").trim();
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
  if (entrada.staffId) linhas.push(`Staff: <@${entrada.staffId}>`);
  return new EmbedBuilder()
    .setTitle(LOG_LABEL[entrada.tipo] || entrada.tipo)
    .setDescription(`${entrada.detalhe}${linhas.length ? `\n\n${linhas.join("\n")}` : ""}`)
    .setColor(0x5865f2)
    .setTimestamp(entrada.em);
}

async function enviarLogCanal(entrada) {
  if (!store.config.logChannelId) return;
  const canal = await client.channels.fetch(store.config.logChannelId).catch(() => null);
  if (!canal) return;
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

function catalogoEmbed() {
  const linhas = todosProdutos().map(p => {
    const qtd = estoqueDe(p.id).length;
    let extra = "";
    if (p.modo === "auto") extra = qtd > 0 ? ` — ${qtd} em estoque` : " — **esgotado**";
    else extra = p.disponivel ? "" : " — indisponivel";
    return `${p.emoji} **${p.nome}** — ${formatarReais(p.precoCentavos)}${extra}\n${p.descricao}`;
  });
  return new EmbedBuilder()
    .setTitle("🛒 Loja Baguncinha")
    .setDescription(
      "Escolha um produto abaixo. O bot gera o Pix, confirma o pagamento e entrega.\n\n" +
      linhas.join("\n\n") +
      `\n\n📦 Prazo: ate **${PRAZO_ENTREGA_MIN} min** depois do Pix confirmado.`
    )
    .setColor(0x9b59b6);
}

function botoesCatalogo() {
  const row = new ActionRowBuilder();
  for (const produto of todosProdutos()) {
    const esgotado = produtoEsgotado(produto);
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`comprar:${produto.id}`)
        .setLabel(esgotado ? `Esgotado ${produto.nome}` : `Comprar ${produto.nome}`)
        .setStyle(esgotado ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setDisabled(!produtoPodeComprar(produto))
    );
  }
  return [row];
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
      name: "Pix copia e cola",
      value: "O codigo limpo vai na mensagem seguinte. Copie ele inteiro, sem espaco extra."
    });
    if (opcoes.qrNome) {
      embed.setImage(`attachment://${opcoes.qrNome}`);
    }
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
    description: `${pedido.produtoNome} #${pedido.id} — ${formatarReais(pedido.valorCentavos)}`,
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
  const pixCopiaECola = limparPixCopiaECola(tx.qr_code || "");
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

async function notificarAdmin(pedido, extra) {
  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) return;
  const canal = await canalAdmin(guild);
  if (!canal) {
    console.error("Canal admin de pedidos nao encontrado. Configure ADMIN_CHANNEL_ID.");
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

  await avisarCliente(
    pedido,
    automatico ? "✅ Pagamento confirmado! Aqui esta sua entrega automatica:" : "✅ Seu pedido foi entregue:",
    embed
  );
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

    if (pedido.pixCopiaECola) {
      const qrBuffer = await QRCode.toBuffer(pedido.pixCopiaECola, {
        type: "png",
        width: 512,
        margin: 2,
        errorCorrectionLevel: "M"
      });
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
    "\nEscaneie o QR Code ou copie o codigo da proxima mensagem.";

  await interaction.editReply({
    content: `⏳ Aguardando pagamento — valor final **${formatarReais(pedido.valorCentavos)}**`,
    embeds: [embedPedidoCliente(pedido, extra, { qrNome: pedido.pixQrAnexo })],
    files: qrAnexo ? [qrAnexo] : []
  });

  if (pedido.pixCopiaECola) {
    await interaction.followUp({
      content: pedido.pixCopiaECola,
      ephemeral: true
    }).catch(() => {});
  }
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
  await interaction.editReply({ content: "🔒 Ticket fechado." });
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
    const disponivel = interaction.options.getBoolean("disponivel");

    if (modo) patch.modo = modo;
    if (cargo) patch.cargoId = cargo.id;
    if (cargoDias !== null && cargoDias !== undefined) patch.cargoDias = cargoDias;
    if (preco !== null && preco !== undefined) patch.precoCentavos = Math.round(preco * 100);
    if (disponivel !== null && disponivel !== undefined) patch.disponivel = disponivel;

    store.produtoOverrides[produtoId] = patch;
    salvarStore();

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
      `Cargos temporarios ativos: ${store.cargosTemporarios.length}\n` +
      `Pedidos registrados: ${Object.keys(store.pedidos).length}`;
    await interaction.reply({
      embeds: [new EmbedBuilder().setTitle("⚙️ Configuracao").setDescription(desc).setColor(0x2ecc71)],
      ephemeral: true
    });
    return;
  }

  if (sub === "canal-logs") {
    store.config.logChannelId = interaction.options.getChannel("canal").id;
    salvarStore();
    await interaction.reply({ content: `✅ Canal de logs definido em <#${store.config.logChannelId}>.`, ephemeral: true });
    return;
  }

  if (sub === "canal-feedback") {
    store.config.feedbackChannelId = interaction.options.getChannel("canal").id;
    salvarStore();
    await interaction.reply({ content: `✅ Canal de feedbacks definido em <#${store.config.feedbackChannelId}>.`, ephemeral: true });
    return;
  }

  if (sub === "categoria-ticket") {
    store.config.ticketCategoryId = interaction.options.getChannel("categoria").id;
    salvarStore();
    await interaction.reply({ content: `✅ Categoria de tickets definida em <#${store.config.ticketCategoryId}>.`, ephemeral: true });
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
  const embed = new EmbedBuilder()
    .setTitle("🎫 Central de atendimento")
    .setDescription("Precisa de ajuda? Clique no botao abaixo para abrir um ticket privado com a equipe.")
    .setColor(0x5865f2);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_abrir").setLabel("Abrir ticket").setEmoji("🎫").setStyle(ButtonStyle.Primary)
  );
  await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.editReply({ content: "✅ Painel de tickets publicado." });
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
        .addBooleanOption(o => o.setName("disponivel").setDescription("Produto a venda?"))
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
      await interaction.reply({
        embeds: [catalogoEmbed()],
        components: botoesCatalogo(),
        ephemeral: true
      });
      return;
    case "catalogo":
      await interaction.reply({
        embeds: [catalogoEmbed()],
        components: botoesCatalogo()
      });
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
        ephemeral: true
      });
      if (pedido.pixCopiaECola && pedido.status === STATUS.AGUARDANDO_PAGAMENTO) {
        await interaction.followUp({ content: pedido.pixCopiaECola, ephemeral: true }).catch(() => {});
      }
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

  await interaction
    .reply({ content: "Esse botao ficou desatualizado. Use os comandos de novo.", ephemeral: true })
    .catch(() => {});
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
});

function verificarPrazos() {
  const agora = Date.now();
  let mudou = false;
  for (const pedido of Object.values(store.pedidos)) {
    if (pedido.status === STATUS.AGUARDANDO_PAGAMENTO && agora - pedido.criadoEm > 45 * 60 * 1000) {
      pedido.status = STATUS.EXPIRADO;
      mudou = true;
      registrarLog("expirado", `Pedido #${pedido.id} expirou sem pagamento.`, { pedidoId: pedido.id, userId: pedido.userId });
      avisarCliente(pedido, `⌛ Seu pedido #${pedido.id} expirou por falta de pagamento.`).catch(() => {});
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
