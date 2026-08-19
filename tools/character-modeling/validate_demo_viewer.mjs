/**
 * The demo viewer runs the shipped appearance contract, not a copy of it.
 *
 * The page is a browser artefact, so nothing in the Blender validators can see
 * inside it. This check opens the exported HTML in Node: it evaluates the
 * bundle the exporter inlined, reads the model data the exporter wrote beside
 * it, and holds the two against each other. What it proves is the part that
 * would rot silently — that the fields the page offers are the fields the
 * package publishes, and that the authored geometry the page can show is
 * chosen by the real projection rather than by a table somebody typed.
 *
 *   node tools/character-modeling/validate_demo_viewer.mjs [path-to-html]
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const page = process.argv[2] || '/tmp/pico-demo-viewer/pico-demo-viewer.html';
const html = readFileSync(page, 'utf8');

const modelMatch = html.match(
  /<script id="model" type="application\/json">([\s\S]*?)<\/script>/,
);
assert.ok(modelMatch, 'the page carries no model data');
const model = JSON.parse(modelMatch[1]);

const bundleMatch = html.match(/<script>((?:"use strict";\s*)?var PicoAppearance[\s\S]*?)<\/script>/);
assert.ok(bundleMatch, 'the page carries no appearance bundle');
const appearance = new Function(`${bundleMatch[1]}; return PicoAppearance;`)();

// 1  the page offers exactly the fields the package publishes ---------------
const ranges = appearance.appearanceProfileV1FieldRanges;
for (const [zone, corridor] of Object.entries(model.surfaceCorridors)) {
  const group = ranges[corridor.profileGroup];
  assert.ok(group, `${zone} names group ${corridor.profileGroup}, which the package does not publish`);
  assert.deepEqual(
    corridor.fields.map((field) => field.id).sort(),
    Object.keys(group).sort(),
    `${zone} and ${corridor.profileGroup} do not offer the same fields`,
  );
  for (const field of corridor.fields) {
    assert.ok(!('max' in field), `${zone}.${field.id} restates a bound the package owns`);
    const range = group[field.id];
    assert.ok(
      field.value >= range.minimum && field.value <= range.maximum,
      `${zone}.${field.id} starts at ${field.value}, outside ${range.minimum}..${range.maximum}`,
    );
  }
}
assert.deepEqual(
  [...model.geometryFields].sort(),
  Object.keys(ranges.recipeGeometry).sort(),
  'the page lists other geometry fields than the package publishes',
);

// 2  the authored recipes are valid profiles and land in distinct families --
const components = Object.keys(model.authoredHeadRecipes).sort();
assert.deepEqual(components, ['head_crown', 'head_tail']);
const families = new Map();
for (const component of components) {
  const authored = model.authoredHeadRecipes[component];
  const profile = appearance.validateAppearanceProfileV1({
    profileVersion: 1,
    headIdentity: {
      kind: 'procedural_neon_hair',
      recipe: {
        generatorVersion: authored.generatorVersion,
        geometry: authored.geometry,
        material: authored.material,
      },
    },
    surface: {
      surfaceVersion: 1,
      shell: { hue: 210, chroma: 18, lightness: 224, gloss: 214 },
      face: { hue: 220, tint: 20, blackLevel: 52, reflectivity: 128 },
      trim: { hue: 215, chroma: 36, metalness: 198 },
    },
  });
  const core = appearance.projectAppearanceProfileV1ToCompatibilityCoreV1(profile);
  assert.equal(
    core.head.family,
    appearance.deriveSemanticHeadFamilyV1(authored.geometry),
    `${component}: the projection and the family derivation disagree`,
  );
  assert.ok(
    !families.has(core.head.family),
    `${component} and ${families.get(core.head.family)} share family ${core.head.family}; the page could not tell them apart`,
  );
  families.set(core.head.family, component);
  const roundTrip = appearance.parseAppearanceProfileV1(
    appearance.formatAppearanceProfileV1(profile),
  );
  assert.deepEqual(roundTrip, profile, `${component} does not survive its own code`);
}

// 3  a family without authored geometry has something to show --------------
const stub = model.parts.filter((part) => part.component === model.stubComponent);
assert.equal(stub.length, 1, 'the page has no placeholder for an unmodelled family');
assert.equal(stub[0].surface.zone, 'head_module');
const reachable = new Set();
for (const geometry of sampleGeometries(ranges.recipeGeometry)) {
  reachable.add(appearance.deriveSemanticHeadFamilyV1(geometry));
}
const unmodelled = [...reachable].filter((family) => !families.has(family));
assert.ok(
  unmodelled.length > 0,
  'every reachable family has authored geometry, so the placeholder is dead weight',
);

function sampleGeometries(group) {
  // The five fields the family derivation reads, each at its low, middle and
  // high value. Corners alone are not enough: with `side` only ever at its
  // extremes every sample is asymmetric and the sweep sees one family.
  const base = Object.fromEntries(
    Object.entries(group).map(([name, range]) => [name, range.minimum]),
  );
  const deciding = ['side', 'length', 'lift', 'sweep', 'segments'];
  const steps = deciding.map((name) => {
    const { minimum, maximum } = group[name];
    return [minimum, Math.round((minimum + maximum) / 2), maximum];
  });
  const out = [];
  const total = 3 ** deciding.length;
  for (let index = 0; index < total; index += 1) {
    const geometry = { ...base };
    let rest = index;
    deciding.forEach((name, position) => {
      geometry[name] = steps[position][rest % 3];
      rest = Math.floor(rest / 3);
    });
    out.push(geometry);
  }
  return out;
}

console.log(
  `PICO_DEMO_VIEWER_CONTRACT=fields_match authored_families=${[...families.keys()].sort().join(',')} `
  + `unmodelled_families_sampled=${unmodelled.sort().join(',')}`,
);
console.log('PICO_DEMO_VIEWER_CONTRACT_STATUS=valid');
