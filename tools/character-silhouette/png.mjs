// Minimal PNG reader and writer over Node's own zlib. The repository ships no
// image dependency, and a character measurement that needed one would be a
// dependency nobody reviewed.
//
// Supported: non-interlaced grayscale at 1, 2, 4 and 8 bits, 8-bit RGB, RGBA
// and grayscale-with-alpha, and 8-bit palette images. That covers the
// registered character references, every bake the contract in ADR 0124 allows,
// and the reduced forms an image tool tends to hand back.
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('Not a PNG file.');
  }
  let offset = 8;
  let header;
  let palette;
  const data = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        bitDepth: body[8],
        colorType: body[9],
        interlace: body[12],
      };
    } else if (type === 'PLTE') {
      palette = Buffer.from(body);
    } else if (type === 'IDAT') {
      data.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (header === undefined) {
    throw new Error('PNG has no header chunk.');
  }
  const isPalette = header.colorType === 3;
  const rawChannels = isPalette ? 1 : CHANNELS[header.colorType];
  const subByte = header.bitDepth < 8;
  if (rawChannels === undefined
    || header.interlace !== 0
    || ![1, 2, 4, 8].includes(header.bitDepth)
    || (subByte && header.colorType !== 0 && !isPalette)) {
    throw new Error(
      `Unsupported PNG: bit depth ${header.bitDepth}, colour type `
      + `${header.colorType}, interlace ${header.interlace}.`,
    );
  }

  // Filtering runs over packed bytes; unpacking to one sample per byte only
  // happens afterwards.
  const bitsPerPixel = rawChannels * header.bitDepth;
  const stride = Math.ceil((header.width * bitsPerPixel) / 8);
  const step = Math.max(1, bitsPerPixel >> 3);
  const raw = inflateSync(Buffer.concat(data));
  const packed = Buffer.alloc(stride * header.height);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = packed.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= step ? out[x - step] : 0;
      const up = previous[x];
      const upLeft = x >= step ? previous[x - step] : 0;
      let value = line[x];
      switch (filter) {
        case 0: break;
        case 1: value += left; break;
        case 2: value += up; break;
        case 3: value += (left + up) >> 1; break;
        case 4: value += paeth(left, up, upLeft); break;
        default: throw new Error(`Unknown PNG filter ${filter}.`);
      }
      out[x] = value & 0xff;
    }
    previous = out;
  }

  if (!subByte && !isPalette) {
    return { ...header, channels: rawChannels, pixels: packed };
  }

  // Sub-byte grayscale is scaled to the full range so a threshold behaves the
  // same whatever depth the image arrived in. A palette becomes plain RGB.
  const channels = isPalette ? 3 : 1;
  const pixels = Buffer.alloc(header.width * header.height * channels);
  const mask = (1 << header.bitDepth) - 1;
  const perByte = 8 / header.bitDepth;
  for (let y = 0; y < header.height; y += 1) {
    for (let x = 0; x < header.width; x += 1) {
      let sample;
      if (subByte) {
        const byte = packed[y * stride + Math.floor(x / perByte)];
        const shift = 8 - header.bitDepth * ((x % perByte) + 1);
        sample = (byte >> shift) & mask;
      } else {
        sample = packed[y * stride + x];
      }
      const target = (y * header.width + x) * channels;
      if (isPalette) {
        if (palette === undefined) throw new Error('Palette PNG has no PLTE chunk.');
        pixels[target] = palette[sample * 3];
        pixels[target + 1] = palette[sample * 3 + 1];
        pixels[target + 2] = palette[sample * 3 + 2];
      } else {
        pixels[target] = Math.round((sample * 255) / mask);
      }
    }
  }
  return { ...header, channels, pixels };
}

export function encodePng(width, height, rgb) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, body) {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'ascii');
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)) >>> 0, 8 + body.length);
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return c ^ -1;
}
