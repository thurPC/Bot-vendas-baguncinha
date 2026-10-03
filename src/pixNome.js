function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function sanitizeMerchantName(name) {
  const cleaned = String(name || "LOJA")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .toUpperCase()
    .trim();
  return (cleaned || "LOJA").slice(0, 25);
}

function parseTlv(payload) {
  const parts = [];
  let i = 0;
  const raw = String(payload || "");
  while (i + 4 <= raw.length) {
    const id = raw.slice(i, i + 2);
    const len = Number.parseInt(raw.slice(i + 2, i + 4), 10);
    if (!Number.isFinite(len) || len < 0) break;
    const value = raw.slice(i + 4, i + 4 + len);
    parts.push({ id, value });
    i += 4 + len;
    if (id === "63") break;
  }
  return parts;
}

function buildPayload(parts) {
  let out = "";
  for (const part of parts) {
    if (part.id === "63") continue;
    const value = String(part.value);
    out += part.id + String(value.length).padStart(2, "0") + value;
  }
  out += "6304";
  out += crc16(out);
  return out;
}

function ocultarNomePix(payload, nomePublico) {
  const nome = sanitizeMerchantName(nomePublico);
  const parts = parseTlv(payload);
  if (!parts.length) return String(payload || "");
  let found = false;
  for (const part of parts) {
    if (part.id === "59") {
      part.value = nome;
      found = true;
    }
  }
  if (!found) parts.splice(Math.max(0, parts.length - 1), 0, { id: "59", value: nome });
  return buildPayload(parts);
}

module.exports = { crc16, sanitizeMerchantName, ocultarNomePix };
