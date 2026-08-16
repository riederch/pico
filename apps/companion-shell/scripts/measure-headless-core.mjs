/**
 * The subject of one headless measurement: a Node process that has loaded a
 * named module graph and is then doing nothing.
 *
 * **Loaded, not started.** Starting the runtime needs a founded profile and a
 * running Vault daemon, and both of those are the *same* in a tray and in a
 * headless process - measuring them would add a constant to both sides of a
 * comparison and call it a finding. What differs between the two is what has
 * to be resident before anything happens, so that is what this holds still.
 *
 * Argument: `bare` loads nothing, `core` loads the companion service core.
 * The first is the control, and it is the reason the second means anything -
 * without it, Node's own floor would be reported as Pico's cost.
 */
const variant = process.argv[2];

if (variant === 'core') {
  // The shell-free service core, exactly as `runtime.ts` reaches it. That this
  // import works in plain Node at all is ADR 0113's claim under test: the
  // companion layer is shell-free, so it can be weighed without a shell.
  await import('../dist/runtime.js');
} else if (variant === 'sodium') {
  /**
   * The suspect, weighed alone.
   *
   * `main.ts` imports `libsodium-wrappers-sumo` at the top level, so the tray
   * pays for a WebAssembly crypto library before the window exists. Whether
   * that is worth deferring is a question about a number, and this is the
   * number - measured on its own so it can be subtracted from the core rather
   * than guessed at.
   */
  const { default: sodium } = await import('libsodium-wrappers-sumo');
  await sodium.ready;
} else if (variant === 'sodium-import') {
  /**
   * The same library, imported and left alone.
   *
   * The distinction that decides whether anything can be done about it: if the
   * cost is in the module and not in `ready`, deferring the await buys
   * nothing, and the only thing left is not importing it - which the tray
   * cannot do, because the runtime it starts needs it immediately.
   */
  await import('libsodium-wrappers-sumo');
} else if (variant !== 'bare') {
  process.stderr.write(`unknown_variant:${String(variant)}\n`);
  process.exit(2);
}

// Idle, and staying alive to be measured. An unref'd timer would let the
// process exit before the parent read anything.
const holdOpen = setInterval(() => {}, 60_000);
process.on('SIGTERM', () => {
  clearInterval(holdOpen);
  process.exit(0);
});

process.stdout.write(`ready ${process.pid}\n`);
