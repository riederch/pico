// Silhouette measurement against the registered character reference.
//
// This is the executable half of docs/design-system/07_Governance/
// Character_Geometry_Measurements.md and the acceptance check for ADR 0124
// gate PR6. It answers one question: does a candidate rendering carry the
// proportions of the approved reference?
//
// It cannot answer whether a model is right. Depth is invisible to it, a seam
// where two blended solids meet hides behind the contour, and it rewards
// shrinking a side module that exists as a component. Coverage is necessary
// and never sufficient. A prototype once reached 96.7 per cent while its
// three-dimensional form got worse.
//
//   node tools/character-silhouette/measure.mjs <candidate.png> [options]
//
//   --core            measure head, neck and torso only, excluding arms
//   --overlay <path>  write a comparison image
//   --profile         print the width profile beside the reference
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './png.mjs';

const repoRoot = join(fileURLToPath(new URL('../..', import.meta.url)));
const referencePath = '08_Starter_Kit/assets/PICO_Basis_Avatar.png';

// The exclusions belong to this exact reference image. If the character
// reference is ever replaced, they are re-measured rather than carried over,
// so the tool refuses to run against bytes it was not calibrated for.
const REFERENCE = {
  headWidthPx: 186,
  headCentre: { x: 240, y: 128.5 },
  exclude: {
    // Context accessory, not the figure.
    hologramFromX: 339,
    // The reference image's own caption.
    captionToY: 21,
    // Hover ring and underside glow are emissive, not shell geometry.
    emissiveFromY: 337,
  },
  // Anything past this on either side is an arm, and arms are pose.
  coreHalfWidth: 0.42,
};

const NORMALISED_SIZE = 300;
const PIXELS_PER_HEAD_WIDTH = 150;
const HEAD_ROW_AT = 0.42;

const args = process.argv.slice(2);
const candidatePath = args.find((value) => !value.startsWith('--'));
const wantCore = args.includes('--core');
const wantProfile = args.includes('--profile');
const overlayPath = optionValue('--overlay');

if (candidatePath === undefined) {
  console.error('Usage: node tools/character-silhouette/measure.mjs <candidate.png> '
    + '[--core] [--overlay <path>] [--profile]');
  process.exit(2);
}

const reference = normalise(referenceMask());
const candidate = normalise(candidateMask(decodePng(readFileSync(candidatePath))));
const result = compare(reference, candidate, wantCore ? REFERENCE.coreHalfWidth : null);

console.log(
  `${wantCore ? 'Core' : 'Whole figure'}: ${result.coverage.toFixed(1)} % covered, `
  + `${result.missing.toFixed(1)} % missing, ${result.excess.toFixed(1)} % excess.`,
);

if (wantProfile) {
  console.log('\n     y   reference   candidate       delta');
  for (const row of profileRows(reference, candidate)) {
    console.log(
      `${row.y.padStart(6)}   ${row.reference.padStart(9)}   `
      + `${row.candidate.padStart(9)}   ${row.delta.padStart(9)}`,
    );
  }
}

if (overlayPath !== undefined) {
  writeFileSync(overlayPath, encodePng(NORMALISED_SIZE, NORMALISED_SIZE, result.overlay));
  console.log(`\nOverlay written to ${overlayPath} (white covered, orange missing, blue excess).`);
}

// ---------------------------------------------------------------- reference

/**
 * Which dark pixels are the ground behind the figure.
 *
 * The background is dark and reaches the border. The visor is dark too, but
 * the bright shell encloses it, so a fill from the edge never arrives there
 * and it stays part of the figure. Thresholding alone cannot tell the two
 * apart, and a figure whose visor is as dark as the ground then measures with
 * a hole where its face is.
 */
function darkBackground(width, height, channels, pixels) {
  const lit = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * channels;
    const luminance = channels >= 3
      ? 0.2126 * pixels[o] + 0.7152 * pixels[o + 1] + 0.0722 * pixels[o + 2]
      : pixels[o];
    lit[i] = luminance >= 52 ? 1 : 0;
  }
  const background = new Uint8Array(width * height);
  const stack = [0, width - 1, (height - 1) * width, height * width - 1];
  while (stack.length > 0) {
    const index = stack.pop();
    if (background[index] === 1 || lit[index] === 1) continue;
    background[index] = 1;
    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) stack.push(index - 1);
    if (x < width - 1) stack.push(index + 1);
    if (y > 0) stack.push(index - width);
    if (y < height - 1) stack.push(index + width);
  }
  return background;
}


function referenceMask() {
  const bytes = readFileSync(join(repoRoot, 'docs/design-system', referencePath));
  assertRegisteredReference(bytes);
  const image = decodePng(bytes);
  const { width, height, channels, pixels } = image;

  const background = darkBackground(width, height, channels, pixels);

  const mask = new Uint8Array(width * height);
  const { hologramFromX, captionToY, emissiveFromY } = REFERENCE.exclude;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (background[index] === 1) continue;
      if (x >= hologramFromX || y <= captionToY || y >= emissiveFromY) continue;
      mask[index] = 1;
    }
  }
  return { width, height, mask };
}

function assertRegisteredReference(bytes) {
  const registry = JSON.parse(readFileSync(
    join(repoRoot, 'docs/design-system/07_Governance/approved-character-assets.json'),
    'utf8',
  ));
  const entry = (registry.assets ?? []).find((asset) => asset.path === referencePath);
  if (entry === undefined) {
    throw new Error(`${referencePath} is not in the character asset registry.`);
  }
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== entry.sha256) {
    throw new Error(
      'The character reference no longer has the bytes this tool was calibrated '
      + 'against. Re-measure the exclusions and the head anchor before trusting '
      + 'any number from it.',
    );
  }
}

// ---------------------------------------------------------------- candidate

function candidateMask(image) {
  const { width, height, channels, pixels } = image;
  const mask = new Uint8Array(width * height);
  // A bake carries alpha by contract. Anything else is treated as a figure on
  // a dark ground, which is what an ad-hoc render usually is.
  const hasAlpha = channels === 4 || channels === 2;
  let transparent = false;
  if (hasAlpha) {
    for (let i = 0; i < width * height && !transparent; i += 1) {
      transparent = pixels[i * channels + channels - 1] < 250;
    }
  }
  if (hasAlpha && transparent) {
    for (let i = 0; i < width * height; i += 1) {
      mask[i] = pixels[i * channels + channels - 1] > 128 ? 1 : 0;
    }
    return { width, height, mask };
  }
  // The same rule the reference gets: the ground is what a fill from the
  // border reaches. Thresholding here instead cost a candidate its whole
  // visor, and with it twenty-two points of coverage that had nothing to do
  // with its shape.
  const background = darkBackground(width, height, channels, pixels);
  for (let i = 0; i < width * height; i += 1) {
    mask[i] = background[i] === 1 ? 0 : 1;
  }
  return { width, height, mask };
}

// -------------------------------------------------------------- normalising

function rowSpans({ width, height, mask }) {
  const spans = new Map();
  for (let y = 0; y < height; y += 1) {
    let min = -1;
    let max = -1;
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] === 1) {
        if (min === -1) min = x;
        max = x;
      }
    }
    if (min !== -1) spans.set(y, [min, max]);
  }
  return spans;
}

/**
 * The head is the widest row in the upper part of the figure. The antenna is
 * too thin to win it and the torso sits below the window, so this holds for
 * the reference and for any candidate that is still Pico.
 */
function headAnchor(image) {
  const spans = rowSpans(image);
  if (spans.size === 0) throw new Error('The image contains no figure.');
  const rows = [...spans.keys()];
  const top = Math.min(...rows);
  const bottom = Math.max(...rows);
  const window = rows.filter((y) => y <= top + (bottom - top) * 0.45);
  const headRow = window.reduce((best, y) => (
    spans.get(y)[1] - spans.get(y)[0] > spans.get(best)[1] - spans.get(best)[0] ? y : best
  ), window[0]);
  const [left, right] = spans.get(headRow);
  return { width: right - left, centreX: (left + right) / 2, row: headRow };
}

function normalise(image) {
  const anchor = headAnchor(image);
  const scale = anchor.width / PIXELS_PER_HEAD_WIDTH;
  const out = new Uint8Array(NORMALISED_SIZE * NORMALISED_SIZE);
  for (let j = 0; j < NORMALISED_SIZE; j += 1) {
    for (let i = 0; i < NORMALISED_SIZE; i += 1) {
      const sx = Math.round(anchor.centreX + (i - NORMALISED_SIZE / 2) * scale);
      const sy = Math.round(anchor.row + (j - NORMALISED_SIZE * HEAD_ROW_AT) * scale);
      if (sx < 0 || sy < 0 || sx >= image.width || sy >= image.height) continue;
      out[j * NORMALISED_SIZE + i] = image.mask[sy * image.width + sx];
    }
  }
  return out;
}

// ----------------------------------------------------------------- compare

function compare(reference, candidate, coreHalfWidth) {
  const overlay = Buffer.alloc(NORMALISED_SIZE * NORMALISED_SIZE * 3);
  for (let i = 0; i < NORMALISED_SIZE * NORMALISED_SIZE; i += 1) {
    overlay[i * 3] = 18;
    overlay[i * 3 + 1] = 18;
    overlay[i * 3 + 2] = 22;
  }
  let both = 0;
  let missing = 0;
  let excess = 0;
  for (let j = 0; j < NORMALISED_SIZE; j += 1) {
    for (let i = 0; i < NORMALISED_SIZE; i += 1) {
      const index = j * NORMALISED_SIZE + i;
      if (coreHalfWidth !== null
        && Math.abs((i - NORMALISED_SIZE / 2) / PIXELS_PER_HEAD_WIDTH) > coreHalfWidth) {
        continue;
      }
      const r = reference[index] === 1;
      const c = candidate[index] === 1;
      let colour = null;
      if (r && c) { both += 1; colour = [225, 228, 235]; }
      else if (r) { missing += 1; colour = [235, 150, 60]; }
      else if (c) { excess += 1; colour = [70, 190, 255]; }
      if (colour !== null) {
        overlay[index * 3] = colour[0];
        overlay[index * 3 + 1] = colour[1];
        overlay[index * 3 + 2] = colour[2];
      }
    }
  }
  const total = both + missing + excess || 1;
  return {
    coverage: (both / (both + missing || 1)) * 100,
    missing: (missing / total) * 100,
    excess: (excess / total) * 100,
    overlay,
  };
}

function profileRows(reference, candidate) {
  const widthAt = (mask, j) => {
    let min = -1;
    let max = -1;
    for (let i = 0; i < NORMALISED_SIZE; i += 1) {
      if (mask[j * NORMALISED_SIZE + i] === 1) {
        if (min === -1) min = i;
        max = i;
      }
    }
    return min === -1 ? null : (max - min) / PIXELS_PER_HEAD_WIDTH;
  };
  const rows = [];
  for (let j = 10; j < NORMALISED_SIZE - 10; j += 12) {
    const a = widthAt(reference, j);
    const b = widthAt(candidate, j);
    if (a === null && b === null) continue;
    const y = (NORMALISED_SIZE * HEAD_ROW_AT - j) / PIXELS_PER_HEAD_WIDTH;
    rows.push({
      y: y.toFixed(2),
      reference: a === null ? '-' : a.toFixed(3),
      candidate: b === null ? '-' : b.toFixed(3),
      delta: a === null || b === null ? '-' : (b - a >= 0 ? '+' : '') + (b - a).toFixed(3),
    });
  }
  return rows;
}

function optionValue(flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}
