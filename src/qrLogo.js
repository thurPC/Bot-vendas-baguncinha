const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

const DEFAULT_LOGO = path.join(__dirname, "..", "assets", "qr-logo.png");

function logoPath() {
  return process.env.QR_LOGO_PATH ? path.resolve(process.env.QR_LOGO_PATH) : DEFAULT_LOGO;
}

async function gerarQrComLogo(payload) {
  const qrBuffer = await QRCode.toBuffer(payload, {
    errorCorrectionLevel: "H",
    type: "png",
    margin: 2,
    width: 720,
    color: { dark: "#111111", light: "#FFFFFF" }
  });

  let Jimp;
  try {
    Jimp = require("jimp");
  } catch {
    return qrBuffer;
  }

  const file = logoPath();
  if (!fs.existsSync(file)) return qrBuffer;

  const qr = await Jimp.read(qrBuffer);
  const logo = await Jimp.read(file);
  const size = Math.round(qr.bitmap.width * 0.24);
  logo.cover(size, size);
  if (typeof logo.circle === "function") logo.circle();

  const frameSize = size + 18;
  const frame = new Jimp(frameSize, frameSize, 0x00000000);
  const white = new Jimp(frameSize, frameSize, 0xffffffff);
  if (typeof white.circle === "function") white.circle();
  frame.composite(white, 0, 0);
  frame.composite(logo, 9, 9);

  const x = Math.round((qr.bitmap.width - frame.bitmap.width) / 2);
  const y = Math.round((qr.bitmap.height - frame.bitmap.height) / 2);
  qr.composite(frame, x, y, { mode: Jimp.BLEND_SOURCE_OVER });
  return qr.getBufferAsync(Jimp.MIME_PNG);
}

module.exports = { gerarQrComLogo, logoPath };
