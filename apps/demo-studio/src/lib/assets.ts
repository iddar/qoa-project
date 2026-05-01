import { writeFile } from "node:fs/promises";
import QRCode from "qrcode";
import sharp from "sharp";
import { generatedDir } from "../config";

const wavHeader = (sampleRate: number, sampleCount: number) => {
  const byteRate = sampleRate * 2;
  const blockAlign = 2;
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
};

export const createToneWav = async (filePath: string, options: { seconds: number; frequency: number }) => {
  const sampleRate = 16_000;
  const sampleCount = Math.floor(sampleRate * options.seconds);
  const samples = Buffer.alloc(sampleCount * 2);
  for (let index = 0; index < sampleCount; index += 1) {
    const fade = Math.min(index / 1200, (sampleCount - index) / 1200, 1);
    const value = Math.sin((index / sampleRate) * Math.PI * 2 * options.frequency) * 0.18 * fade;
    samples.writeInt16LE(Math.max(-1, Math.min(1, value)) * 32767, index * 2);
  }

  await writeFile(filePath, Buffer.concat([wavHeader(sampleRate, sampleCount), samples]));
};

export const createQrPng = async (filePath: string, value: string) => {
  await QRCode.toFile(filePath, value, {
    type: "png",
    margin: 2,
    width: 768,
    color: {
      dark: "#111827",
      light: "#ffffff",
    },
  });
};

export const createInventoryPhoto = async (filePath: string) => {
  const svg = `
    <svg width="1200" height="1600" viewBox="0 0 1200 1600" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="1600" fill="#f4f1e8"/>
      <rect x="118" y="110" width="964" height="1380" rx="28" fill="#fffdf7" stroke="#d6d3c8" stroke-width="4"/>
      <text x="600" y="210" text-anchor="middle" font-family="Arial" font-size="54" font-weight="700" fill="#202124">Distribuidora Centro</text>
      <text x="600" y="275" text-anchor="middle" font-family="Arial" font-size="30" fill="#5f6368">Nota de entrega - demo QOA</text>
      <line x1="190" y1="340" x2="1010" y2="340" stroke="#d6d3c8" stroke-width="3"/>
      <text x="190" y="420" font-family="Arial" font-size="34" font-weight="700" fill="#202124">Producto</text>
      <text x="900" y="420" text-anchor="end" font-family="Arial" font-size="34" font-weight="700" fill="#202124">Pzas.</text>
      <text x="190" y="520" font-family="Arial" font-size="42" fill="#202124">Refresco Cola 600 ml</text>
      <text x="900" y="520" text-anchor="end" font-family="Arial" font-size="42" fill="#202124">24</text>
      <text x="190" y="620" font-family="Arial" font-size="42" fill="#202124">Papas Clasicas 45 g</text>
      <text x="900" y="620" text-anchor="end" font-family="Arial" font-size="42" fill="#202124">18</text>
      <text x="190" y="720" font-family="Arial" font-size="42" fill="#202124">Galletas Vainilla 90 g</text>
      <text x="900" y="720" text-anchor="end" font-family="Arial" font-size="42" fill="#202124">12</text>
      <line x1="190" y1="820" x2="1010" y2="820" stroke="#d6d3c8" stroke-width="3"/>
      <text x="190" y="900" font-family="Arial" font-size="30" fill="#5f6368">Recibido por tienda</text>
      <text x="190" y="1320" font-family="Arial" font-size="28" fill="#9aa0a6">Foto fixture generada por Demo Studio</text>
    </svg>
  `;

  await sharp(Buffer.from(svg)).png().toFile(filePath);
};

export const generatedAsset = (fileName: string) => `${generatedDir}/${fileName}`;
