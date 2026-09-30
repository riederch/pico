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
  companionShellTypescript:
    'apps/companion-shell/src/pico-design-tokens.generated.ts',
  contrastReport: 'docs/design-system/06_Accessibility/Contrast_Report.md',
  // The Android app (ADR 0131): its colours as resources, from the same
  // source and under the same names as the CSS, so the launcher icon is not
  // a second copy of the brand (ADR 0133).
  androidColors: 'apps/android/res/values/pico_colors.xml',
  androidLightColors: 'apps/android/res/values-notnight/pico_colors.xml',
};
// These styles live in real stylesheets instead of inline <style> blocks so
// both surfaces can serve a strict CSP (`default-src 'self'` for the
// Foundation dashboard, `style-src 'self'` for the companion renderer)
// without an 'unsafe-inline' carve-out.
const stylesheetPaths = [
  'apps/web/styles.css',
  'apps/companion-shell/src/renderer/styles.css',
];
const stylesheetStart = '/* pico-design-tokens:start */';
const stylesheetEnd = '/* pico-design-tokens:end */';
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
  ['color.border.strong', 'border-strong'],
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
  ['typography.fontFamily.sans', 'font-sans'],
]);

// The SCSS output is the only one that groups by hand instead of mapping every
// token, so a new token group silently vanishes from it while every other
// output carries it. The list is declared here and checked below, in the same
// place the CSS-name check runs, so the failure reads like every other one
// instead of arriving as a stack trace out of the renderer.
const scssBaseGroups = [
  ['$pico-colors', (token) => token.type === 'color'],
  ['$pico-space', (token) => token.path.startsWith('space.')],
  ['$pico-radius', (token) => token.path.startsWith('radius.')],
  ['$pico-motion', (token) => token.path.startsWith('motion.')],
  ['$pico-typography', (token) => token.path.startsWith('typography.')],
];

const themes = ['dark', 'light'];
const surfacePaths = [
  'color.background.deep',
  'color.background.base',
  'color.surface.primary',
  'color.surface.secondary',
  'color.surface.active',
];
// Binding contrast pairs. A ratio below the minimum fails generation, so the
// contrast report can never publish a number the tokens do not actually hold.
// Text tokens are checked against every surface they may sit on, not just the
// app background, because a card is exactly where muted text ends up.
const contrastContract = [
  { foreground: 'color.text.primary', backgrounds: surfacePaths, minimum: 4.5 },
  { foreground: 'color.text.secondary', backgrounds: surfacePaths, minimum: 4.5 },
  { foreground: 'color.text.muted', backgrounds: surfacePaths, minimum: 4.5 },
  { foreground: 'color.brand.focus', backgrounds: surfacePaths, minimum: 3 },
  { foreground: 'color.border.strong', backgrounds: surfacePaths, minimum: 3 },
  {
    foreground: 'color.text.onPrimary',
    backgrounds: ['color.brand.primary'],
    minimum: 4.5,
  },
];
// Reported without enforcement. Status colors belong to the Character status
// light group and carry their meaning through symbol and text as well, so the
// product system may not silently darken them for a light surface; that needs
// a Character decision. `border.subtle` separates panels instead of bounding a
// control, which is what `border.strong` is for.
const contrastNotes = [
  { foreground: 'color.status.active', backgrounds: ['color.surface.primary'] },
  { foreground: 'color.status.listening', backgrounds: ['color.surface.primary'] },
  { foreground: 'color.status.thinking', backgrounds: ['color.surface.primary'] },
  { foreground: 'color.status.warning', backgrounds: ['color.surface.primary'] },
  { foreground: 'color.status.blocked', backgrounds: ['color.surface.primary'] },
  { foreground: 'color.status.success', backgrounds: ['color.surface.primary'] },
  { foreground: 'color.border.subtle', backgrounds: ['color.surface.primary'] },
];

const baseTokens = tokens.filter((token) => !token.path.startsWith('theme.'));
const lightTokens = tokens.filter((token) =>
  token.path.startsWith('theme.light.')
);

for (const token of baseTokens) {
  if (!cssNames.has(token.path)) {
    errors.push(`${tokenPath}: token ${token.path} has no generated output name.`);
  }
  if (!scssBaseGroups.some(([, matches]) => matches(token))) {
    errors.push(`${tokenPath}: token ${token.path} matches no SCSS group.`);
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

if (errors.length === 0) {
  validateContrast();
}
if (errors.length > 0) {
  fail(errors);
}

const css = renderCss(baseTokens, lightTokens);
const scss = renderScss(baseTokens, lightTokens);
const typescript = renderTypeScript(source);
const expected = new Map([
  [outputs.css, css],
  [outputs.scss, scss],
  [outputs.typescript, typescript],
  [outputs.vaultDaemonTypescript, typescript],
  [outputs.companionShellTypescript, typescript],
  [outputs.contrastReport, renderContrastReport()],
  [outputs.androidColors, renderAndroidColors(baseTokens, (path) => path)],
  [outputs.androidLightColors, renderAndroidColors(lightTokens,
    (path) => path.slice('theme.light.'.length))],
]);
for (const path of stylesheetPaths) {
  expected.set(path, injectGeneratedCss(read(path), css, path));
}

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
    // A fallback stack is ordered and its order is the whole meaning, so the
    // value is always an array - a bare string would make a one-family stack
    // and a fallback chain indistinguishable at the type level.
    case 'fontFamily':
      if (
        !Array.isArray(token.value)
        || token.value.length === 0
        || token.value.some((family) =>
          typeof family !== 'string' || family.trim() !== family || family === ''
        )
      ) {
        errors.push(`${tokenPath}: ${token.path} is not a DTCG fontFamily stack.`);
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

/**
 * Android colour resources. The base set is the dark theme, as it is for
 * CSS, so it goes to `values/`; the light overrides go to `values-notnight/`,
 * which Android picks when the system is not in night mode. The names are the
 * CSS names with underscores, because a resource name cannot carry a dash.
 */
function renderAndroidColors(tokensToRender, basePathOf) {
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- Generated from pico.tokens.json; do not edit by hand. -->',
    '<resources>',
  ];
  for (const token of tokensToRender) {
    if (token.type !== 'color') {
      continue;
    }
    const name = cssNames.get(basePathOf(token.path)).replace(/-/gu, '_');
    lines.push(`  <color name="pico_${name}">${token.value.hex.toUpperCase()}</color>`);
  }
  lines.push('</resources>', '');
  return lines.join('\n');
}

function renderScss(base, light) {
  const [colors, ...rest] = scssBaseGroups;
  const groups = [
    // Light colours stay directly under the base colours, where they override
    // them; the remaining groups keep their declared order.
    [colors[0], base.filter(colors[1])],
    ['$pico-light-colors', light],
    ...rest.map(([name, matches]) => [name, base.filter(matches)]),
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
    '//',
    '// ADR 0133 L3. An early materialization, and the four things one states:',
    '//',
    '// 1. Why late derivation is not affordable: these are read by an Electron',
    '//    renderer under a CSP that forbids fetching anything, and by a PDF',
    '//    generator that runs with no filesystem root it may reach. Neither can',
    '//    open the token source at the moment it needs a colour, so the flatten',
    '//    happens at build time or it does not happen.',
    '// 2. Which direction the drift runs, and why that is the fail-safe one:',
    '//    towards *stale*. A copy can only lag the source, never lead it, so a',
    '//    surface renders the palette from last release rather than a colour',
    '//    nobody chose.',
    '// 3. Where the drift is corrected: `pnpm design-system:generate` rewrites',
    '//    every copy from the one source, and `design-system:check` runs the same',
    '//    generator with `--check` inside `release:verify`, so a lagging copy',
    '//    fails the release rather than shipping.',
    '// 4. What a consumer may still assume: that every copy is byte-identical to',
    '//    the others and to the source at release time - and nothing more. The',
    '//    file has no identity of its own: it may be regenerated without a',
    '//    version, and no further derivation may take it as input where the',
    '//    token source would have served.',
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
    // The stack stays a list here. A PDF writer needs the first available
    // family, not a CSS declaration, and flattening it would force every
    // non-CSS consumer to parse the string back apart (ADR 0133).
    case 'fontFamily':
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
    // CSS is the one consumer that wants the stack flattened, so it is
    // flattened here and nowhere else (ADR 0133).
    case 'fontFamily':
      return token.value.map(cssFontFamilyName).join(', ');
    default:
      throw new Error(`Unsupported token type: ${token.type}`);
  }
}

/**
 * Quotes a family name only where CSS requires it. An unquoted custom-ident
 * cannot contain spaces and cannot start with a digit; generic families such
 * as `sans-serif` must stay unquoted or they stop being generic.
 */
function cssFontFamilyName(family) {
  return /^-?[A-Za-z_][A-Za-z0-9_-]*$/.test(family)
    ? family
    : JSON.stringify(family);
}

function injectGeneratedCss(stylesheet, css, path) {
  const start = stylesheet.indexOf(stylesheetStart);
  const end = stylesheet.indexOf(stylesheetEnd);
  if (start === -1 || end === -1 || end < start) {
    errors.push(`${path}: missing generated token markers.`);
    fail(errors);
  }
  return [
    stylesheet.slice(0, start),
    stylesheetStart,
    '\n',
    css.trimEnd(),
    '\n',
    stylesheet.slice(end),
  ].join('');
}

function themedColor(path, theme) {
  const token = theme === 'light'
    ? tokenMap.get(`theme.light.${path}`) ?? tokenMap.get(path)
    : tokenMap.get(path);
  return token?.value?.hex;
}

function relativeLuminance(hex) {
  const [red, green, blue] = hex
    .slice(1)
    .match(/../g)
    .map((pair) => Number.parseInt(pair, 16) / 255)
    .map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground, background) {
  const [lighter, darker] = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

function themedRatio(foreground, background, theme) {
  return contrastRatio(
    themedColor(foreground, theme),
    themedColor(background, theme),
  );
}

function validateContrast() {
  for (const theme of themes) {
    for (const { foreground, backgrounds, minimum } of contrastContract) {
      for (const background of backgrounds) {
        const ratio = themedRatio(foreground, background, theme);
        // Compare the published two-decimal value so a report row can never
        // read as passing while the check treats it as a failure.
        if (Number.parseFloat(ratio.toFixed(2)) < minimum) {
          errors.push(
            `${theme} theme: ${foreground} on ${background} reaches only `
            + `${ratio.toFixed(2)}:1, below the required ${minimum}:1.`,
          );
        }
      }
    }
  }
}

function shortTokenPath(path) {
  return path.startsWith('color.') ? path.slice('color.'.length) : path;
}

function renderContrastReport() {
  const lines = [
    '# Kontrastbericht',
    '',
    'Erzeugt aus `01_Foundations/tokens/pico.tokens.json` durch',
    '`pnpm design-system:generate`. Nicht von Hand bearbeiten.',
    '',
    'Die verbindlichen Paare sind Teil des Release-Gates: Ein Verhaeltnis',
    'unterhalb des Ziels laesst die Token-Generierung fehlschlagen. Dieser',
    'Bericht kann daher keinen Wert behaupten, den die Tokens nicht einhalten.',
    '',
    'Textfarben werden gegen jede Flaeche geprueft, auf der sie stehen duerfen,',
    'nicht nur gegen den App-Hintergrund. Zielniveau ist WCAG 2.2 AA: 4,5:1 fuer',
    'normalen Text, 3:1 fuer Fokusanzeige und Steuerungsraender.',
    '',
  ];
  for (const theme of themes) {
    lines.push(`## ${theme === 'dark' ? 'Dark Mode' : 'Light Mode'}`, '');
    lines.push('### Verbindlich geprueft', '');
    lines.push('| Vordergrund | Hintergrund | Ziel | Verhaeltnis | Bewertung |');
    lines.push('|---|---|---:|---:|---|');
    for (const { foreground, backgrounds, minimum } of contrastContract) {
      for (const background of backgrounds) {
        const ratio = themedRatio(foreground, background, theme);
        lines.push(
          `| ${shortTokenPath(foreground)} | ${shortTokenPath(background)} `
          + `| ${minimum.toFixed(1)}:1 | ${ratio.toFixed(2)}:1 `
          + `| ${contrastVerdict(ratio, minimum)} |`,
        );
      }
    }
    lines.push('');
    lines.push('### Nachrichtlich, nicht erzwungen', '');
    lines.push('| Vordergrund | Hintergrund | Verhaeltnis |');
    lines.push('|---|---|---:|');
    for (const { foreground, backgrounds } of contrastNotes) {
      for (const background of backgrounds) {
        const ratio = themedRatio(foreground, background, theme);
        lines.push(
          `| ${shortTokenPath(foreground)} | ${shortTokenPath(background)} `
          + `| ${ratio.toFixed(2)}:1 |`,
        );
      }
    }
    lines.push('');
  }
  lines.push(
    '## Warum die nachrichtlichen Werte nicht erzwungen werden',
    '',
    'Statusfarben gehoeren zur Statuslichtgruppe aus PICO Character Design',
    'v3.2.1. Das Produktsystem darf sie nicht eigenmaechtig fuer eine helle',
    'Flaeche abdunkeln; das waere eine Character-Entscheidung. Statusbedeutung',
    'wird zusaetzlich durch Symbol und Text getragen, und fuer kleinen',
    'Fliesstext ist stets eine gepruefte Textfarbe zu verwenden.',
    '',
    '`border.subtle` trennt Panels und Tabellenzeilen; die sichtbare Begrenzung',
    'eines Bedienelements ist `border.strong` und wird verbindlich geprueft.',
    '',
    '### Offener Punkt',
    '',
    'Im Light Mode erreichen mehrere Statusfarben als Vordergrund auf heller',
    'Flaeche kein Verhaeltnis von 3:1. Solange keine Produktoberflaeche den',
    'Light Mode als Statusflaeche nutzt, bleibt das folgenlos. Vor der ersten',
    'hellen Statusoberflaeche braucht es eine Character-Entscheidung ueber',
    'eigene Status-Vordergrundfarben fuer helle Flaechen.',
    '',
  );
  return lines.join('\n');
}

function contrastVerdict(ratio, minimum) {
  if (Number.parseFloat(ratio.toFixed(2)) < minimum) {
    return 'unter Ziel';
  }
  if (minimum >= 4.5) {
    return ratio >= 7 ? 'AAA' : 'AA';
  }
  return 'erfuellt';
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
