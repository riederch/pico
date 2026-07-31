import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const tokenPath = 'docs/design-system/01_Foundations/tokens/pico.tokens.json';
const outputs = {
  css: 'docs/design-system/01_Foundations/tokens/pico.tokens.css',
  scss: 'docs/design-system/01_Foundations/tokens/pico.tokens.scss',
  typescript: 'docs/design-system/01_Foundations/tokens/pico.tokens.ts',
  vaultDaemonTypescript:
    'apps/vault-daemon/src/pico-design-tokens.generated.ts',
};
const dashboardPath = 'apps/web/index.html';
const dashboardStart = '      /* pico-design-tokens:start */';
const dashboardEnd = '      /* pico-design-tokens:end */';
const write = process.argv.includes('--write');

if (!write && !process.argv.includes('--check')) {
  console.error('Use --check or --write.');
  process.exit(2);
}

const source = JSON.parse(read(tokenPath));
const errors = [];
const tokens = flattenTokens(source);
const tokenMap = new Map(tokens.map((token) => [token.path, token]));

validateMetadata(source);
for (const token of tokens) {
  validateToken(token);
}

const cssNames = new Map([
  ['color.background.deep', 'bg-deep'],
  ['color.background.base', 'bg-base'],
  ['color.surface.primary', 'surface-1'],
  ['color.surface.secondary', 'surface-2'],
  ['color.surface.active', 'surface-3'],
  ['color.border.subtle', 'border'],
  ['color.text.primary', 'text-primary'],
  ['color.text.secondary', 'text-secondary'],
  ['color.text.muted', 'text-muted'],
  ['color.text.disabled', 'text-disabled'],
  ['color.text.onPrimary', 'text-on-primary'],
  ['color.brand.primary', 'primary'],
  ['color.brand.primaryStrong', 'primary-strong'],
  ['color.brand.primarySoft', 'primary-soft'],
  ['color.brand.focus', 'focus'],
  ['color.status.active', 'status-active'],
  ['color.status.listening', 'status-listening'],
  ['color.status.thinking', 'status-thinking'],
  ['color.status.warning', 'status-warning'],
  ['color.status.blocked', 'status-blocked'],
  ['color.status.success', 'status-success'],
  ['color.context.technology', 'context-technology'],
  ['color.context.waterInfrastructure', 'context-water'],
  ['color.context.fireDepartment', 'context-fire'],
  ['color.context.organization', 'context-organization'],
  ['color.context.smartHome', 'context-smart-home'],
  ['color.context.communication', 'context-communication'],
  ['color.context.energy', 'context-energy'],
  ['color.context.nightFocus', 'context-focus'],
  ['space.1', 'space-1'],
  ['space.2', 'space-2'],
  ['space.3', 'space-3'],
  ['space.4', 'space-4'],
  ['space.5', 'space-5'],
  ['space.6', 'space-6'],
  ['space.7', 'space-7'],
  ['space.8', 'space-8'],
  ['radius.chip', 'radius-chip'],
  ['radius.button', 'radius-button'],
  ['radius.input', 'radius-input'],
  ['radius.message', 'radius-message'],
  ['radius.card', 'radius-card'],
  ['radius.dialog', 'radius-dialog'],
  ['radius.illustration', 'radius-illustration'],
  ['motion.fast', 'motion-fast'],
  ['motion.normal', 'motion-normal'],
  ['motion.slow', 'motion-slow'],
  ['motion.easeStandard', 'ease'],
]);

const baseTokens = tokens.filter((token) => !token.path.startsWith('theme.'));
const lightTokens = tokens.filter((token) =>
  token.path.startsWith('theme.light.')
);

for (const token of baseTokens) {
  if (!cssNames.has(token.path)) {
    errors.push(`${tokenPath}: token ${token.path} has no generated output name.`);
  }
}
for (const token of lightTokens) {
  const basePath = token.path.slice('theme.light.'.length);
  if (!cssNames.has(basePath)) {
    errors.push(`${tokenPath}: light token ${token.path} has no base output name.`);
  }
  const base = tokenMap.get(basePath);
  if (base === undefined || base.type !== token.type) {
    errors.push(`${tokenPath}: light token ${token.path} does not override a base token of the same type.`);
  }
}

if (errors.length > 0) {
  fail(errors);
}

const css = renderCss(baseTokens, lightTokens);
const scss = renderScss(baseTokens, lightTokens);
const typescript = renderTypeScript(source);
const dashboard = injectDashboardCss(read(dashboardPath), css);
const expected = new Map([
  [outputs.css, css],
  [outputs.scss, scss],
  [outputs.typescript, typescript],
  [outputs.vaultDaemonTypescript, typescript],
  [dashboardPath, dashboard],
]);

if (write) {
  for (const [path, content] of expected) {
    writeFileSync(join(repoRoot, path), content);
  }
  console.log('Generated design token outputs.');
} else {
  const stale = [];
  for (const [path, content] of expected) {
    if (read(path) !== content) {
      stale.push(path);
    }
  }
  if (stale.length > 0) {
    fail(stale.map((path) =>
      `${path} is stale; run \`pnpm design-system:generate\`.`
    ));
  }
  console.log('Design token outputs are current and DTCG-valid.');
}

function validateMetadata(document) {
  const metadata = document.$extensions?.['org.pico.design-system'];
  if (
    metadata?.name !== 'PICO Product Design System'
    || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(metadata?.version ?? '')
    || metadata?.characterStandard !== 'PICO Character Design v3.2.1'
    || metadata?.format !== 'DTCG 2025.10'
  ) {
    errors.push(`${tokenPath}: invalid org.pico.design-system metadata.`);
  }
}

function validateToken(token) {
  switch (token.type) {
    case 'color': {
      const value = token.value;
      if (
        !isRecord(value)
        || value.colorSpace !== 'srgb'
        || !Array.isArray(value.components)
        || value.components.length !== 3
        || value.components.some((component) =>
          typeof component !== 'number' || component < 0 || component > 1
        )
        || typeof value.hex !== 'string'
        || !/^#[0-9A-F]{6}$/.test(value.hex)
      ) {
        errors.push(`${tokenPath}: ${token.path} is not a DTCG sRGB color.`);
        return;
      }
      const expectedComponents = value.hex
        .slice(1)
        .match(/../g)
        .map((pair) => Number.parseInt(pair, 16) / 255);
      for (let index = 0; index < 3; index += 1) {
        if (Math.abs(value.components[index] - expectedComponents[index]) > 0.000001) {
          errors.push(`${tokenPath}: ${token.path} components do not match its hex fallback.`);
          break;
        }
      }
      break;
    }
    case 'dimension':
      validateMeasuredValue(token, new Set(['px', 'rem']));
      break;
    case 'duration':
      validateMeasuredValue(token, new Set(['ms', 's']));
      break;
    case 'cubicBezier':
      if (
        !Array.isArray(token.value)
        || token.value.length !== 4
        || token.value.some((component) => typeof component !== 'number')
        || token.value[0] < 0
        || token.value[0] > 1
        || token.value[2] < 0
        || token.value[2] > 1
      ) {
        errors.push(`${tokenPath}: ${token.path} is not a DTCG cubicBezier value.`);
      }
      break;
    default:
      errors.push(`${tokenPath}: ${token.path} uses unsupported type ${JSON.stringify(token.type)}.`);
  }
}

function validateMeasuredValue(token, units) {
  if (
    !isRecord(token.value)
    || typeof token.value.value !== 'number'
    || !units.has(token.value.unit)
  ) {
    errors.push(`${tokenPath}: ${token.path} has an invalid ${token.type} value.`);
  }
}

function flattenTokens(node, prefix = []) {
  const found = [];
  if (!isRecord(node)) {
    return found;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) {
      continue;
    }
    const path = [...prefix, key];
    if (isRecord(value) && '$value' in value) {
      found.push({
        path: path.join('.'),
        type: value.$type,
        value: value.$value,
      });
    } else {
      found.push(...flattenTokens(value, path));
    }
  }
  return found;
}

function renderCss(base, light) {
  const lines = [
    '/* Generated from pico.tokens.json; do not edit by hand. */',
    ':root {',
    '  color-scheme: dark;',
  ];
  for (const token of base) {
    lines.push(
      `  --pico-${cssNames.get(token.path)}: ${cssValue(token)};`,
    );
  }
  lines.push('}', '', '[data-theme="light"] {', '  color-scheme: light;');
  for (const token of light) {
    const basePath = token.path.slice('theme.light.'.length);
    lines.push(
      `  --pico-${cssNames.get(basePath)}: ${cssValue(token)};`,
    );
  }
  lines.push('}', '');
  return lines.join('\n');
}

function renderScss(base, light) {
  const groups = [
    ['$pico-colors', base.filter((token) => token.type === 'color')],
    ['$pico-light-colors', light],
    ['$pico-space', base.filter((token) => token.path.startsWith('space.'))],
    ['$pico-radius', base.filter((token) => token.path.startsWith('radius.'))],
    ['$pico-motion', base.filter((token) => token.path.startsWith('motion.'))],
  ];
  const lines = ['// Generated from pico.tokens.json; do not edit by hand.'];
  for (const [name, entries] of groups) {
    lines.push(`${name}: (`);
    entries.forEach((token, index) => {
      const basePath = token.path.startsWith('theme.light.')
        ? token.path.slice('theme.light.'.length)
        : token.path;
      const suffix = scssKey(basePath, token.type);
      const comma = index === entries.length - 1 ? '' : ',';
      lines.push(`  ${suffix}: ${cssValue(token)}${comma}`);
    });
    lines.push(');', '');
  }
  return lines.join('\n');
}

function scssKey(path, type) {
  if (type === 'color') {
    return cssNames.get(path);
  }
  const key = path.slice(path.lastIndexOf('.') + 1);
  return key === 'easeStandard' ? 'ease' : key;
}

function renderTypeScript(document) {
  const platformTokens = platformNode(document);
  return [
    '// Generated from docs/design-system/01_Foundations/tokens/pico.tokens.json; do not edit by hand.',
    `export const picoTokens = ${JSON.stringify(platformTokens, null, 2)} as const;`,
    '',
  ].join('\n');
}

function platformNode(node) {
  if (!isRecord(node)) {
    return node;
  }
  if ('$value' in node) {
    return platformValue(node.$type, node.$value);
  }
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !key.startsWith('$'))
      .map(([key, value]) => [key, platformNode(value)]),
  );
}

function platformValue(type, value) {
  switch (type) {
    case 'color':
      return value.hex;
    case 'dimension':
    case 'duration':
      return `${value.value}${value.unit}`;
    case 'cubicBezier':
      return value;
    default:
      throw new Error(`Unsupported token type: ${type}`);
  }
}

function cssValue(token) {
  switch (token.type) {
    case 'color':
      return token.value.hex.toLowerCase();
    case 'dimension':
    case 'duration':
      return `${token.value.value}${token.value.unit}`;
    case 'cubicBezier':
      return `cubic-bezier(${token.value.join(', ')})`;
    default:
      throw new Error(`Unsupported token type: ${token.type}`);
  }
}

function injectDashboardCss(html, css) {
  const start = html.indexOf(dashboardStart);
  const end = html.indexOf(dashboardEnd);
  if (start === -1 || end === -1 || end < start) {
    errors.push(`${dashboardPath}: missing generated token markers.`);
    fail(errors);
  }
  const indented = css
    .trimEnd()
    .split('\n')
    .map((line) => line.length === 0 ? '' : `      ${line}`)
    .join('\n');
  return [
    html.slice(0, start),
    dashboardStart,
    '\n',
    indented,
    '\n',
    html.slice(end),
  ].join('');
}

function read(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(messages) {
  console.error('Design token generation failed:');
  for (const message of messages) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}
