const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const API = "https://discord.com/api/v10";

async function api(caminho) {
  const resposta = await fetch(`${API}${caminho}`, {
    headers: { Authorization: `Bot ${TOKEN}` }
  });
  const json = await resposta.json().catch(() => null);
  return { ok: resposta.ok, status: resposta.status, json };
}

async function main() {
  if (!TOKEN) {
    console.error("Configure TOKEN antes de rodar.");
    process.exit(1);
  }

  console.log("== Token ==");
  const me = await api("/users/@me");
  if (!me.ok) {
    console.error(`Token invalido (HTTP ${me.status}):`, me.json?.message);
    process.exit(1);
  }
  console.log(`Bot: ${me.json.username}#${me.json.discriminator} (id ${me.json.id})`);
  if (me.json.bot !== true) {
    console.warn("Aviso: esse token nao e de um bot.");
  }

  console.log("\n== Aplicacao dona do token ==");
  const app = await api("/applications/@me");
  if (app.ok) {
    console.log(`Aplicacao: ${app.json.name} (id ${app.json.id})`);
    if (CLIENT_ID && app.json.id !== CLIENT_ID) {
      console.error(
        `ERRO: CLIENT_ID (${CLIENT_ID}) e diferente do dono do token (${app.json.id}). ` +
        "Isso causa Missing Access. Use o id da aplicacao do token."
      );
    } else if (CLIENT_ID) {
      console.log("CLIENT_ID confere com o token.");
    }
  } else {
    console.error(`Nao consegui ler a aplicacao (HTTP ${app.status}):`, app.json?.message);
  }

  console.log("\n== Servidores em que o bot esta ==");
  const guilds = await api("/users/@me/guilds");
  if (!guilds.ok) {
    console.error(`Nao consegui listar servidores (HTTP ${guilds.status}):`, guilds.json?.message);
  } else {
    if (guilds.json.length === 0) {
      console.error("O bot NAO esta em nenhum servidor. Convide ele primeiro.");
    }
    for (const g of guilds.json) {
      const alvo = g.id === GUILD_ID ? "  <== GUILD_ID configurado" : "";
      console.log(`- ${g.name} (id ${g.id})${alvo}`);
    }
    if (GUILD_ID && !guilds.json.some(g => g.id === GUILD_ID)) {
      console.error(
        `\nERRO: o bot nao esta no servidor GUILD_ID=${GUILD_ID}. ` +
        "Confirme o convite e o id do servidor."
      );
    } else if (GUILD_ID) {
      console.log("\nOK: o bot esta no servidor configurado.");
    }
  }
}

main().catch(error => {
  console.error("Falha no diagnostico:", error);
  process.exit(1);
});
