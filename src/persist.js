const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const JSON_FILE = path.join(DATA_DIR, "store.json");
const JSON_BAK = path.join(DATA_DIR, "store.json.bak");
const JSON_TMP = path.join(DATA_DIR, "store.json.tmp");
const VISUAL_FILE = path.join(DATA_DIR, "visual.json");
const SQLITE_FILE = path.join(DATA_DIR, "loja.db");

const OBJECT_KEYS = [
  "pedidos", "pagamentos", "cupons", "estoque", "produtos", "produtoOverrides",
  "tickets", "carrinhos", "categorias", "guilds", "lojaFixa", "paineisFixos"
];

const VISUAL_CONFIG_KEYS = [
  "lojaTitulo", "lojaDescricao", "lojaCor", "lojaRodape", "banner", "bannerPosicao",
  "pixNomePublico", "ocultarNomePix", "feedbackTitulo", "feedbackMensagem",
  "ticketPainel", "cuponsPainel"
];

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function parseStoreFile(file) {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf-8");
  if (!raw || !String(raw).trim()) return null;
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
}

function loadJson() {
  for (const file of [JSON_FILE, JSON_BAK]) {
    try {
      const parsed = parseStoreFile(file);
      if (parsed) return parsed;
    } catch (error) {
      console.error("Erro ao ler", path.basename(file) + ":", error.message);
    }
  }
  return null;
}

function extractVisual(store) {
  const cfg = store && store.config && typeof store.config === "object" ? store.config : {};
  const config = {};
  for (const key of VISUAL_CONFIG_KEYS) {
    if (cfg[key] !== undefined) config[key] = cfg[key];
  }
  const produtos = {};
  for (const [id, p] of Object.entries(store.produtos || {})) {
    if (!p || typeof p !== "object") continue;
    produtos[id] = {
      id: p.id || id,
      nome: p.nome,
      descricao: p.descricao,
      emoji: p.emoji,
      banner: p.banner,
      bannerPosicao: p.bannerPosicao,
      imagem: p.imagem,
      cor: p.cor,
      rodape: p.rodape,
      instrucoes: p.instrucoes,
      categoriaId: p.categoriaId,
      precoCentavos: p.precoCentavos,
      precoOriginalCentavos: p.precoOriginalCentavos,
      modo: p.modo,
      disponivel: p.disponivel,
      cargoId: p.cargoId,
      cargoDias: p.cargoDias
    };
  }
  return {
    savedAt: Date.now(),
    config,
    categorias: store.categorias || {},
    produtos,
    produtoOverrides: store.produtoOverrides || {},
    guilds: store.guilds || {}
  };
}

function preferFilled(atual, salvo) {
  if (salvo == null) return atual;
  if (atual == null || atual === "") return salvo;
  if (typeof atual === "object" && !Array.isArray(atual) && typeof salvo === "object" && !Array.isArray(salvo)) {
    const out = { ...salvo };
    for (const [k, v] of Object.entries(atual)) {
      out[k] = preferFilled(v, salvo[k]);
    }
    return out;
  }
  return atual;
}

function applyVisual(store, visual) {
  if (!visual || typeof visual !== "object") return store;
  if (!store.config || typeof store.config !== "object") store.config = {};
  for (const key of VISUAL_CONFIG_KEYS) {
    store.config[key] = preferFilled(store.config[key], visual.config && visual.config[key]);
  }
  if (visual.categorias) {
    if (!store.categorias) store.categorias = {};
    for (const [id, cat] of Object.entries(visual.categorias)) {
      store.categorias[id] = preferFilled(store.categorias[id], cat);
    }
  }
  if (visual.produtos) {
    if (!store.produtos) store.produtos = {};
    for (const [id, p] of Object.entries(visual.produtos)) {
      store.produtos[id] = preferFilled(store.produtos[id], p);
    }
  }
  if (visual.produtoOverrides) {
    if (!store.produtoOverrides) store.produtoOverrides = {};
    for (const [id, p] of Object.entries(visual.produtoOverrides)) {
      store.produtoOverrides[id] = preferFilled(store.produtoOverrides[id], p);
    }
  }
  if (visual.guilds) {
    if (!store.guilds) store.guilds = {};
    for (const [id, g] of Object.entries(visual.guilds)) {
      store.guilds[id] = preferFilled(store.guilds[id], g);
    }
  }
  return store;
}

function loadVisual() {
  try {
    return parseStoreFile(VISUAL_FILE);
  } catch (error) {
    console.error("Erro ao ler visual.json:", error.message);
    return null;
  }
}

function saveVisual(store) {
  try {
    ensureDir();
    fs.writeFileSync(VISUAL_FILE, JSON.stringify(extractVisual(store), null, 2));
  } catch (error) {
    console.error("Erro ao gravar visual.json:", error.message);
  }
}

function saveJson(store) {
  ensureDir();
  const data = JSON.stringify(store, null, 2);
  fs.writeFileSync(JSON_TMP, data);
  if (fs.existsSync(JSON_FILE)) {
    try {
      fs.copyFileSync(JSON_FILE, JSON_BAK);
    } catch (error) {
      console.error("Erro ao gravar store.json.bak:", error.message);
    }
  }
  fs.renameSync(JSON_TMP, JSON_FILE);
  saveVisual(store);
}

function openSqlite() {
  try {
    const { DatabaseSync } = require("node:sqlite");
    ensureDir();
    const db = new DatabaseSync(SQLITE_FILE);
    db.exec("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
    return db;
  } catch {
    return null;
  }
}

function loadSqlite() {
  const db = openSqlite();
  if (!db) return null;
  try {
    const row = db.prepare("SELECT v FROM kv WHERE k = 'store'").get();
    db.close();
    if (!row || !row.v) return null;
    const parsed = JSON.parse(row.v);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    console.error("Erro ao ler loja.db:", error.message);
    try { db.close(); } catch { /* ignore */ }
    return null;
  }
}

function saveSqlite(store) {
  const db = openSqlite();
  if (!db) return false;
  try {
    db.prepare("INSERT INTO kv (k, v) VALUES ('store', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v")
      .run(JSON.stringify(store));
    db.close();
    return true;
  } catch (error) {
    console.error("Erro ao gravar loja.db:", error.message);
    try { db.close(); } catch { /* ignore */ }
    return false;
  }
}

function mergeConfig(prefer, fallback) {
  const p = prefer && typeof prefer === "object" && !Array.isArray(prefer) ? prefer : {};
  const f = fallback && typeof fallback === "object" && !Array.isArray(fallback) ? fallback : {};
  const out = { ...f, ...p };
  for (const key of Object.keys(f)) {
    if (out[key] === undefined || out[key] === null) {
      out[key] = f[key];
      continue;
    }
    if (out[key] && typeof out[key] === "object" && !Array.isArray(out[key]) && f[key] && typeof f[key] === "object" && !Array.isArray(f[key])) {
      out[key] = mergeConfig(p[key], f[key]);
    }
  }
  return out;
}

function mergeDict(prefer, fallback) {
  const p = prefer && typeof prefer === "object" ? prefer : {};
  const f = fallback && typeof fallback === "object" ? fallback : {};
  const out = { ...f, ...p };
  for (const key of Object.keys(f)) {
    if (out[key] && typeof out[key] === "object" && !Array.isArray(out[key]) && f[key] && typeof f[key] === "object" && !Array.isArray(f[key])) {
      out[key] = { ...f[key], ...p[key] };
    }
  }
  return out;
}

function mergeStores(a, b) {
  if (!a) return b || {};
  if (!b) return a;
  const aTime = Number(a.savedAt || 0);
  const bTime = Number(b.savedAt || 0);
  const base = aTime >= bTime ? a : b;
  const other = base === a ? b : a;
  const merged = { ...other, ...base };
  merged.config = mergeConfig(base.config, other.config);
  for (const key of OBJECT_KEYS) {
    merged[key] = mergeDict(base[key], other[key]);
  }
  if (Array.isArray(base.cargosTemporarios) || Array.isArray(other.cargosTemporarios)) {
    merged.cargosTemporarios = Array.isArray(base.cargosTemporarios) ? base.cargosTemporarios : other.cargosTemporarios;
  }
  if (Array.isArray(base.logs) || Array.isArray(other.logs)) {
    merged.logs = Array.isArray(base.logs) ? base.logs : other.logs;
  }
  merged.nextPedidoId = Math.max(Number(a.nextPedidoId || 0), Number(b.nextPedidoId || 0));
  merged.nextEstoqueItemId = Math.max(Number(a.nextEstoqueItemId || 0), Number(b.nextEstoqueItemId || 0));
  return merged;
}

function limparSegredo(valor) {
  if (!valor) return "";
  return String(valor)
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^(Bearer|token)\s+/i, "");
}

function normalizarRepo(repo) {
  return limparSegredo(repo)
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "");
}

const GITHUB_TOKEN = limparSegredo(process.env.GITHUB_TOKEN);
const GITHUB_REPO = normalizarRepo(process.env.GITHUB_REPO || "thurPC/Bot-vendas-baguncinha");
const GITHUB_DATA_BRANCH = limparSegredo(process.env.GITHUB_DATA_BRANCH) || "dados";
const GITHUB_DATA_PATH = "data/store.json";
const GITHUB_SAVE_INTERVAL_MS = 2 * 60 * 1000;

let githubSha = null;
let githubSalvando = false;
let githubTimer = null;
let githubPendente = null;
let githubUltimoTexto = null;

function githubErroAuth(status, json) {
  if (status !== 401 && status !== 403) return null;
  const detalhe = json?.message || "sem detalhes";
  return `GitHub recusou o token (${status}: ${detalhe}). Confere GITHUB_TOKEN: Contents Read and write no repo ${GITHUB_REPO}.`;
}

async function githubRequest(metodo, caminho, corpo) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);
  try {
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "bot-vendas-baguncinha"
    };
    if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
    if (corpo) headers["Content-Type"] = "application/json";
    const resposta = await fetch(`https://api.github.com${caminho}`, {
      method: metodo,
      headers,
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: controller.signal
    });
    let json = null;
    try {
      json = await resposta.json();
    } catch {
      json = null;
    }
    return { status: resposta.status, ok: resposta.ok, json };
  } finally {
    clearTimeout(timeoutId);
  }
}

function githubChecarResposta(r, acao) {
  const erroAuth = githubErroAuth(r.status, r.json);
  if (erroAuth) throw new Error(erroAuth);
  if (!r.ok) {
    throw new Error(`GitHub respondeu ${r.status} ao ${acao} (${r.json?.message || "sem detalhes"})`);
  }
}

async function githubShaDaBranchPadrao() {
  const repo = await githubRequest("GET", `/repos/${GITHUB_REPO}`);
  githubChecarResposta(repo, `ler o repositorio ${GITHUB_REPO}`);
  const nomes = [];
  if (repo.json?.default_branch) nomes.push(repo.json.default_branch);
  for (const nome of ["main", "master"]) {
    if (!nomes.includes(nome)) nomes.push(nome);
  }
  for (const nome of nomes) {
    const ref = await githubRequest("GET", `/repos/${GITHUB_REPO}/git/ref/heads/${encodeURIComponent(nome)}`);
    const erroAuth = githubErroAuth(ref.status, ref.json);
    if (erroAuth) throw new Error(erroAuth);
    if (ref.ok && ref.json?.object?.sha) return ref.json.object.sha;
  }
  throw new Error(`Nao achei a branch padrao do GitHub (tentei: ${nomes.join(", ")}).`);
}

async function githubGarantirBranch() {
  const existe = await githubRequest(
    "GET",
    `/repos/${GITHUB_REPO}/git/ref/heads/${encodeURIComponent(GITHUB_DATA_BRANCH)}`
  );
  if (existe.ok) return;
  const erroAuth = githubErroAuth(existe.status, existe.json);
  if (erroAuth) throw new Error(erroAuth);
  if (existe.status !== 404) {
    throw new Error(`Nao consegui verificar a branch "${GITHUB_DATA_BRANCH}" (${existe.status}).`);
  }
  const shaBase = await githubShaDaBranchPadrao();
  const criada = await githubRequest("POST", `/repos/${GITHUB_REPO}/git/refs`, {
    ref: `refs/heads/${GITHUB_DATA_BRANCH}`,
    sha: shaBase
  });
  if (!criada.ok && criada.status !== 422) {
    const auth = githubErroAuth(criada.status, criada.json);
    if (auth) throw new Error(auth);
    throw new Error(`Nao consegui criar a branch "${GITHUB_DATA_BRANCH}" (${criada.status}).`);
  }
  console.log(`Branch "${GITHUB_DATA_BRANCH}" criada no GitHub para backup da loja.`);
}

async function githubCarregar() {
  if (!GITHUB_TOKEN) return null;
  const r = await githubRequest(
    "GET",
    `/repos/${GITHUB_REPO}/contents/${GITHUB_DATA_PATH}?ref=${encodeURIComponent(GITHUB_DATA_BRANCH)}`
  );
  if (r.status === 404) return null;
  githubChecarResposta(r, "carregar backup");
  githubSha = r.json.sha;
  const texto = Buffer.from(r.json.content.replace(/\n/g, ""), "base64").toString("utf-8");
  const objeto = JSON.parse(texto);
  githubUltimoTexto = JSON.stringify(objeto);
  return objeto && typeof objeto === "object" && !Array.isArray(objeto) ? objeto : null;
}

async function githubSalvarAgora(store) {
  if (!GITHUB_TOKEN || !store) return false;
  const texto = JSON.stringify(store, null, 2);
  if (texto === githubUltimoTexto) return true;
  if (githubSalvando) {
    githubPendente = store;
    return false;
  }
  githubSalvando = true;
  try {
    if (githubSha === null) {
      await githubGarantirBranch();
      const atual = await githubRequest(
        "GET",
        `/repos/${GITHUB_REPO}/contents/${GITHUB_DATA_PATH}?ref=${encodeURIComponent(GITHUB_DATA_BRANCH)}`
      );
      if (atual.ok) githubSha = atual.json.sha;
    }
    const enviar = () =>
      githubRequest("PUT", `/repos/${GITHUB_REPO}/contents/${GITHUB_DATA_PATH}`, {
        message: `backup automatico da loja (${Object.keys(store.pedidos || {}).length} pedidos)`,
        content: Buffer.from(texto).toString("base64"),
        branch: GITHUB_DATA_BRANCH,
        ...(githubSha ? { sha: githubSha } : {})
      });
    let r = await enviar();
    if (r.status === 409 || r.status === 422) {
      const atual = await githubRequest(
        "GET",
        `/repos/${GITHUB_REPO}/contents/${GITHUB_DATA_PATH}?ref=${encodeURIComponent(GITHUB_DATA_BRANCH)}`
      );
      githubSha = atual.ok ? atual.json.sha : null;
      r = await enviar();
    }
    githubChecarResposta(r, "salvar backup");
    githubSha = r.json.content.sha;
    githubUltimoTexto = texto;
    console.log("Progresso da loja salvo no GitHub.");
    return true;
  } finally {
    githubSalvando = false;
    if (githubPendente) {
      const proximo = githubPendente;
      githubPendente = null;
      githubSalvarAgora(proximo).catch(error => {
        console.error("Erro ao salvar backup no GitHub:", error.message);
      });
    }
  }
}

function agendarGithub(store) {
  if (!GITHUB_TOKEN || !store) return;
  githubPendente = store;
  if (githubTimer) return;
  githubTimer = setTimeout(() => {
    githubTimer = null;
    const alvo = githubPendente;
    githubPendente = null;
    githubSalvarAgora(alvo).catch(error => {
      console.error("Erro ao salvar backup no GitHub:", error.message);
    });
  }, GITHUB_SAVE_INTERVAL_MS);
}

async function sincronizarDoGithub(store) {
  if (!GITHUB_TOKEN) {
    console.log("GITHUB_TOKEN nao configurado — o progresso some no proximo deploy do Render.");
    return false;
  }
  try {
    const remote = await githubCarregar();
    if (!remote) {
      console.log("Ainda nao tem backup no GitHub — vai ser criado no primeiro salvamento.");
      agendarGithub(store);
      return false;
    }
    const merged = mergeStores(store, remote);
    for (const key of Object.keys(merged)) store[key] = merged[key];
    applyVisual(store, loadVisual());
    saveJson(store);
    saveSqlite(store);
    console.log(`Loja carregada do GitHub (${Object.keys(store.pedidos || {}).length} pedido(s)).`);
    return true;
  } catch (error) {
    console.error("Erro ao carregar backup do GitHub:", error.message);
    return false;
  }
}

function carregarStore() {
  const fromJson = loadJson();
  const fromDb = loadSqlite();
  const loaded = mergeStores(
    fromJson && typeof fromJson === "object" ? fromJson : null,
    fromDb && typeof fromDb === "object" ? fromDb : null
  );
  const store = loaded && typeof loaded === "object" ? loaded : {};
  applyVisual(store, loadVisual());
  return store;
}

function salvarStore(store) {
  if (store && typeof store === "object") store.savedAt = Date.now();
  saveJson(store);
  saveSqlite(store);
  agendarGithub(store);
}

module.exports = {
  carregarStore,
  salvarStore,
  sincronizarDoGithub,
  githubSalvarAgora,
  JSON_FILE,
  SQLITE_FILE,
  VISUAL_FILE
};
