const { ocultarNomePix, sanitizeMerchantName } = require("./src/pixNome");

const payload = "00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-426614174000520400005303986540519.905802BR5925JOAO DA SILVA SANTOS6009SAO PAULO62070503***6304";
const out = ocultarNomePix(payload, "BAGUNCINHA");
if (out.includes("JOAO") || out.includes("SILVA")) {
  console.error("nome pessoal ainda no payload");
  process.exit(1);
}
if (!out.includes("BAGUNCINHA")) {
  console.error("nome publico ausente");
  process.exit(1);
}
if (sanitizeMerchantName("Baguncinha") !== "BAGUNCINHA") {
  console.error("sanitize falhou");
  process.exit(1);
}
console.log("pix-nome ok");
