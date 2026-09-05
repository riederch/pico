/**
 * Die Kette `release:verify`, flachgeklopft - eine Regel, ein Zuhause.
 *
 * **Der Anlass** (2026-09-05, Befund B67). Seit die Kette in `verify:gates`
 * und `verify:passes` geteilt ist, damit CI die drei Testdurchgaenge
 * nebeneinander statt hintereinander fahren kann, ist `release:verify` selbst
 * nur noch zwei Glieder lang. Zwei Leser brauchen trotzdem die *echten*
 * Schritte: `check-verify-split.mjs` haelt Kette und Laeufer zusammen, und
 * `measure-progress-numbers.mjs` zaehlt sie fuer `progress.md`.
 *
 * Zwei Auffaltungen waeren zwei Wahrheiten, und die zweite wuerde still
 * anders zaehlen als die erste. Also steht sie hier einmal.
 */

/** `pnpm foo bar` -> `{ name: 'foo', arguments: 'bar' }`; sonst `undefined`. */
export function picoVerifyStepName(step) {
  const found = /^pnpm ([\w:-]+)((?: [^\s].*)?)$/u.exec(step.trim());
  return found === null ? undefined : { name: found[1], arguments: found[2].trim() };
}

/**
 * Ein Schritt wird aufgeloest, solange sein Skript wieder eine `&&`-Kette aus
 * lauter `pnpm`-Aufrufen ist. Ein Skript, das etwas anderes tut - `node …`,
 * `pnpm -r test` -, ist ein Blatt und wird nicht weiter zerlegt. Ein Aufruf
 * mit Argumenten ebenso: `pnpm display-zone:check Pacific/Niue` ist eine
 * Haelfte und keine Kette.
 */
export function flattenPicoVerifyChain(scripts, chain, seen = new Set()) {
  const leaves = [];
  for (const step of chain.split(' && ')) {
    const parsed = picoVerifyStepName(step);
    const body = parsed === undefined ? undefined : scripts[parsed.name];
    const composite = parsed !== undefined
      && parsed.arguments === ''
      && typeof body === 'string'
      && body.includes(' && ')
      && body.split(' && ').every((inner) => picoVerifyStepName(inner) !== undefined);
    if (composite && !seen.has(parsed.name)) {
      leaves.push(...flattenPicoVerifyChain(scripts, body, new Set([...seen, parsed.name])));
      continue;
    }
    leaves.push(step.trim());
  }
  return leaves;
}
