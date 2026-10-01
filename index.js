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
  ChannelType
} = require("discord.js");
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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

const PRODUTOS = {
  nitro_1m: {
    id: "nitro_1m",
    nome: "Discord Nitro 1 mes",
    descricao: "Nitro Classic/Full sob encomenda. Entrega do codigo apos o Pix.",
    precoCentavos: 2490,
    emoji: "💎",
    disponivel: true
  },
  nitro_3m: {
    id: "nitro_3m",
    nome: "Discord Nitro 3 meses",
    descricao: "Nitro sob encomenda. Entrega do codigo apos o Pix.",
    precoCentavos: 6490,
    emoji: "💎",
    disponivel: true
  },
  boost_2: {
    id: "boost_2",
    nome: "2 Boosts de servidor",
    descricao: "Boosts sob encomenda. Entrega apos o Pix.",
    precoCentavos: 1990,
    emoji: "🚀",
    disponivel: true
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

if (!TOKEN) console.error("TOKEN nao configurado.");
if (!CLIENT_ID) console.error("CLIENT_ID nao configurado.");
if (!GUILD_ID) console.error("GUILD_ID nao configurado.");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

function carregarStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    }
  } catch (error) {
    console.error("Erro ao ler store.json:", error.message);
  }
  return { nextPedidoId: 1001, pedidos: {}, pagamentos: {} };
}

function salvarStore() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

const store = carregarStore();
if (!store.pedidos) store.pedidos = {};
if (!store.pagamentos) store.pagamentos = {};
if (!store.nextPedidoId) store.nextPedidoId = 1001;

function formatarReais(centavos) {
  return (Number(centavos) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function proximoPedidoId() {
  const id = store.nextPedidoId;
  store.nextPedidoId += 1;
  return id;
}

function isStaff(member) {
  if (!member) return false;
  if (OWNER_ID && member.id === OWNER_ID) return true;
  if (ADMIN_ROLE_ID && member.roles.cache.has(ADMIN_ROLE_ID)) return true;
  return member.permissions.has(PermissionFlagsBits.ManageGuild);
}

function produtoEmbed(produto) {
  return new EmbedBuilder()
    .setTitle(`${produto.emoji} ${produto.nome} — ${formatarReais(produto.precoCentavos)}`)
    .setDescription(
      `${produto.descricao}\n\n` +
      `🟢 Disponível sob encomenda\n` +
      `📦 Entrega em até **${PRAZO_ENTREGA_MIN} minutos** após a confirmação do pagamento.`
    )
    .setColor(0x57f287);
}

function catalogoEmbed() {
  const linhas = Object.values(PRODUTOS).map(p => {
    return `${p.emoji} **${p.nome}** — ${formatarReais(p.precoCentavos)}\n${p.descricao}`;
  });
  return new EmbedBuilder()
    .setTitle("🛒 Loja Baguncinha")
    .setDescription(
      "Escolha um produto abaixo. O bot gera o Pix, confirma o pagamento e avisa a staff pra entregar.\n\n" +
      linhas.join("\n\n") +
      `\n\n📦 Prazo: até **${PRAZO_ENTREGA_MIN} min** depois do Pix confirmado.`
    )
    .setColor(0x9b59b6);
}

function botoesCatalogo() {
  const row = new ActionRowBuilder();
  for (const produto of Object.values(PRODUTOS)) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`comprar:${produto.id}`)
        .setLabel(`Comprar ${produto.nome}`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(!produto.disponivel)
    );
  }
  return [row];
}

function embedPedidoCliente(pedido, extra) {
  const produto = PRODUTOS[pedido.produtoId];
  const embed = new EmbedBuilder()
    .setTitle(`${STATUS_LABEL[pedido.status] || pedido.status}`)
    .setDescription(
      `${extra || ""}\n\n` +
      `🆔 Pedido: **#${pedido.id}**\n` +
      `${produto ? produto.emoji : "📦"} Produto: **${pedido.produtoNome}**\n` +
      `💰 Valor: **${formatarReais(pedido.valorCentavos)}**\n` +
      `📦 Prazo: até **${PRAZO_ENTREGA_MIN} minutos** após o Pix confirmado.`
    )
    .setColor(
      pedido.status === STATUS.ENTREGUE ? 0x57f287 :
      pedido.status === STATUS.CANCELADO || pedido.status === STATUS.EXPIRADO ? 0xed4245 :
      pedido.status === STATUS.AGUARDANDO_ENTREGA ? 0xfee75c : 0x5865f2
    )
    .setFooter({ text: `Pedido #${pedido.id}` });

  if (pedido.pixCopiaECola && pedido.status === STATUS.AGUARDANDO_PAGAMENTO) {
    embed.addFields({ name: "Pix copia e cola", value: `\`\`\`${pedido.pixCopiaECola.slice(0, 1000)}\`\`\`` });
  }
  return embed;
}

function embedPedidoAdmin(pedido) {
  return new EmbedBuilder()
    .setTitle("🔔 NOVO PEDIDO")
    .setDescription(
      `Cliente: <@${pedido.userId}>\n` +
      `Produto: **${pedido.produtoNome}**\n` +
      `Valor: **${formatarReais(pedido.valorCentavos)}**\n` +
      `Pedido: **#${pedido.id}**\n` +
      `Status: ${STATUS_LABEL[pedido.status]}\n` +
      `📦 Entrega em até ${PRAZO_ENTREGA_MIN} min após o pagamento.`
    )
    .setColor(0xfee75c)
    .setFooter({ text: `Pedido #${pedido.id}` });
}

function botoesAdmin(pedidoId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`entregar:${pedidoId}`).setLabel("Entregar").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cancelar:${pedidoId}`).setLabel("Cancelar").setStyle(ButtonStyle.Danger)
    )
  ];
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
    transaction_amount: Number((pedido.valorCentavos / 100).toFixed(2)),
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
  return {
    paymentId: String(r.json.id),
    pixCopiaECola: tx.qr_code || "",
    pixQrBase64: tx.qr_code_base64 || ""
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
    content: ADMIN_ROLE_ID ? `<@&${ADMIN_ROLE_ID}>` : null,
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

async function avisarCliente(pedido, texto, embed) {
  try {
    const user = await client.users.fetch(pedido.userId);
    await user.send({
      content: texto || null,
      embeds: embed ? [embed] : [embedPedidoCliente(pedido)]
    });
  } catch {
    console.log(`Nao consegui DM o cliente do pedido #${pedido.id}.`);
  }
}

async function confirmarPagamento(pedido, payment) {
  if (pedido.status !== STATUS.AGUARDANDO_PAGAMENTO) return;

  pedido.status = STATUS.AGUARDANDO_ENTREGA;
  pedido.pagoEm = Date.now();
  pedido.mpStatus = payment.status;
  pedido.prazoEntregaAte = Date.now() + PRAZO_ENTREGA_MIN * 60 * 1000;
  salvarStore();

  await avisarCliente(
    pedido,
    "✅ Pagamento confirmado!\n📦 Seu pedido foi recebido e está sendo processado.",
    embedPedidoCliente(pedido, "✅ Pagamento confirmado!\n📦 Seu pedido foi recebido e está sendo processado.")
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
    await avisarCliente(pedido, "❌ O Pix foi cancelado ou recusado.");
  }
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
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
].map(c => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("Comandos slash registrados no servidor.");
    return;
  } catch (error) {
    if (error.code === 50001 || error.status === 403) {
      console.error(
        "Missing Access ao registrar no servidor. Confira se o bot foi convidado " +
        `(client_id ${CLIENT_ID}) e se GUILD_ID (${GUILD_ID}) e o servidor certo. ` +
        "Vou tentar registrar os comandos globais como fallback."
      );
    } else {
      console.error("Erro ao registrar no servidor:", error.message);
    }
  }

  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("Comandos globais registrados (podem demorar ate 1h pra aparecer).");
  } catch (error) {
    console.error("Falha tambem no registro global:", error.message);
    throw error;
  }
}

async function criarPedido(interaction, produtoId) {
  const produto = PRODUTOS[produtoId];
  if (!produto || !produto.disponivel) {
    await interaction.reply({ content: "Esse produto nao esta disponivel.", ephemeral: true });
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

  const id = proximoPedidoId();
  const pedido = {
    id,
    userId: interaction.user.id,
    produtoId: produto.id,
    produtoNome: produto.nome,
    valorCentavos: produto.precoCentavos,
    status: STATUS.AGUARDANDO_PAGAMENTO,
    criadoEm: Date.now(),
    pixCopiaECola: "",
    paymentId: "",
    entrega: null
  };

  try {
    const pix = await criarPix(pedido);
    pedido.paymentId = pix.paymentId;
    pedido.pixCopiaECola = pix.pixCopiaECola;
    store.pedidos[String(id)] = pedido;
    store.pagamentos[pix.paymentId] = String(id);
    salvarStore();
  } catch (error) {
    console.error("Erro ao gerar Pix:", error);
    await interaction.editReply("❌ Nao consegui gerar o Pix agora. Tenta de novo em instantes.");
    return;
  }

  await interaction.editReply({
    content: "⏳ Aguardando pagamento",
    embeds: [embedPedidoCliente(pedido, "💰 Pix gerado. Pague com o codigo abaixo.")]
  });
}

async function handleEntregarModal(interaction, pedidoId) {
  const pedido = store.pedidos[String(pedidoId)];
  if (!pedido) {
    await interaction.reply({ content: "Pedido nao encontrado.", ephemeral: true });
    return;
  }
  if (pedido.status !== STATUS.AGUARDANDO_ENTREGA) {
    await interaction.reply({ content: `Pedido #${pedidoId} nao esta aguardando entrega.`, ephemeral: true });
    return;
  }

  const codigo = interaction.fields.getTextInputValue("codigo").trim();
  const extra = interaction.fields.getTextInputValue("extra").trim();
  pedido.status = STATUS.ENTREGUE;
  pedido.entregueEm = Date.now();
  pedido.entrega = { codigo, extra, staffId: interaction.user.id };
  salvarStore();

  await avisarCliente(
    pedido,
    `✅ Pedido #${pedido.id} entregue!\n\n🔑 Codigo/licenca:\n\`\`\`${codigo}\`\`\`${extra ? `\n📝 ${extra}` : ""}`,
    embedPedidoCliente(pedido, "✅ Entrega concluida. Confira o codigo na mensagem.")
  );
  await notificarAdmin(pedido, `Entregue por <@${interaction.user.id}>.`);

  await interaction.reply({ content: `✅ Pedido #${pedido.id} entregue ao cliente.`, ephemeral: true });
}

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "loja") {
        await interaction.reply({
          embeds: [catalogoEmbed()],
          components: botoesCatalogo(),
          ephemeral: true
        });
        return;
      }

      if (interaction.commandName === "catalogo") {
        await interaction.reply({
          embeds: [catalogoEmbed()],
          components: botoesCatalogo()
        });
        return;
      }

      if (interaction.commandName === "meuspedidos") {
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

      if (interaction.commandName === "pedido") {
        const id = String(interaction.options.getInteger("id"));
        const pedido = store.pedidos[id];
        if (!pedido) {
          await interaction.reply({ content: "Pedido nao encontrado.", ephemeral: true });
          return;
        }
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (pedido.userId !== interaction.user.id && !isStaff(member)) {
          await interaction.reply({ content: "Voce so pode ver os seus pedidos.", ephemeral: true });
          return;
        }
        await interaction.reply({ embeds: [embedPedidoCliente(pedido)], ephemeral: true });
        return;
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith("comprar:")) {
      const produtoId = interaction.customId.split(":")[1];
      await criarPedido(interaction, produtoId);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("entregar:")) {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!isStaff(member)) {
        await interaction.reply({ content: "So a staff pode entregar.", ephemeral: true });
        return;
      }
      const pedidoId = interaction.customId.split(":")[1];
      const pedido = store.pedidos[pedidoId];
      if (!pedido || pedido.status !== STATUS.AGUARDANDO_ENTREGA) {
        await interaction.reply({ content: "Esse pedido nao esta aguardando entrega.", ephemeral: true });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`entregar_modal:${pedidoId}`)
        .setTitle(`Entregar pedido #${pedidoId}`);
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

    if (interaction.isButton() && interaction.customId.startsWith("cancelar:")) {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!isStaff(member)) {
        await interaction.reply({ content: "So a staff pode cancelar.", ephemeral: true });
        return;
      }
      const pedidoId = interaction.customId.split(":")[1];
      const pedido = store.pedidos[pedidoId];
      if (!pedido || [STATUS.ENTREGUE, STATUS.CANCELADO].includes(pedido.status)) {
        await interaction.reply({ content: "Esse pedido nao pode ser cancelado.", ephemeral: true });
        return;
      }
      pedido.status = STATUS.CANCELADO;
      pedido.canceladoEm = Date.now();
      salvarStore();
      await avisarCliente(pedido, `❌ Pedido #${pedido.id} foi cancelado pela staff.`);
      await notificarAdmin(pedido, `Cancelado por <@${interaction.user.id}>.`);
      await interaction.reply({ content: `Pedido #${pedido.id} cancelado.`, ephemeral: true });
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("entregar_modal:")) {
      const pedidoId = interaction.customId.split(":")[1];
      await handleEntregarModal(interaction, pedidoId);
      return;
    }
  } catch (error) {
    console.error("Erro na interacao:", error);
    const payload = { content: "Deu ruim aqui. Tenta de novo.", ephemeral: true };
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
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`HTTP na porta ${PORT}`);
});

async function start() {
  if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
    console.error("Faltam TOKEN, CLIENT_ID ou GUILD_ID.");
    return;
  }
  await registerCommands();
  await client.login(TOKEN);
}

setInterval(() => {
  const agora = Date.now();
  let mudou = false;
  for (const pedido of Object.values(store.pedidos)) {
    if (pedido.status !== STATUS.AGUARDANDO_PAGAMENTO) continue;
    if (agora - pedido.criadoEm > 45 * 60 * 1000) {
      pedido.status = STATUS.EXPIRADO;
      mudou = true;
    }
  }
  if (mudou) salvarStore();
}, 5 * 60 * 1000);

start().catch(error => {
  console.error("Falha ao iniciar:", error);
});
