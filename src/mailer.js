async function enviarProdutoPorEmail(config, to, pedido, codigo, extra, instrucoes) {
  if (!config?.smtpHost || !config?.smtpUser || !config?.smtpFrom) {
    throw new Error("SMTP nao configurado");
  }
  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch {
    throw new Error("Dependencia nodemailer ausente");
  }
  const port = Number(config.smtpPort || 587);
  const mail = nodemailer.createTransport({
    host: config.smtpHost,
    port,
    secure: port === 465,
    auth: { user: config.smtpUser, pass: config.smtpPass }
  });
  const linhas = [
    `Pedido #${pedido.id}`,
    `Produto: ${pedido.produtoNome}`,
    `Valor: ${(pedido.valorCentavos / 100).toFixed(2)}`,
    "",
    "Conteudo:",
    String(codigo || ""),
    extra ? `\n${extra}` : "",
    instrucoes ? `\nInstrucoes:\n${instrucoes}` : ""
  ];
  await mail.sendMail({
    from: config.smtpFrom,
    to,
    subject: `Pedido #${pedido.id} — ${pedido.produtoNome}`,
    text: linhas.filter(Boolean).join("\n")
  });
}

<<<<<<< HEAD
async function testarSmtp(config, to) {
  if (!config?.smtpHost || !config?.smtpUser || !config?.smtpFrom) {
    throw new Error("SMTP nao configurado");
  }
  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch {
    throw new Error("Dependencia nodemailer ausente");
  }
  const port = Number(config.smtpPort || 587);
  const mail = nodemailer.createTransport({
    host: config.smtpHost,
    port,
    secure: port === 465,
    auth: { user: config.smtpUser, pass: config.smtpPass }
  });
  await mail.sendMail({
    from: config.smtpFrom,
    to,
    subject: "BGC STORE — teste SMTP",
    text: "Se voce recebeu este e-mail, o SMTP da loja Baguncinha esta ok."
  });
}

module.exports = { enviarProdutoPorEmail, testarSmtp };
=======
module.exports = { enviarProdutoPorEmail };
>>>>>>> origin/main
