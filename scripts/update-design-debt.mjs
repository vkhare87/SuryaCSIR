#!/usr/bin/env node
/**
 * Maintain the design-token debt allowlist.
 *
 * The `no-restricted-syntax` design rules were configured as `warn`, so CI
 * never failed on them and the count grew to 1083 across 88 files — a rule
 * nobody can act on is not a rule. Flipping straight to `error` would mean
 * a red build until all 1083 are fixed, which nobody would do either.
 *
 * So: `error` everywhere, minus an explicit allowlist of files that already
 * had violations when the ratchet went in. New drift fails immediately;
 * existing debt burns down file by file.
 *
 * Usage
 *   node scripts/update-design-debt.mjs          # verify the list is current
 *   node scripts/update-design-debt.mjs --write  # rewrite it (shrink only)
 *
 * The ratchet: --write refuses to ADD files. A file that is clean today and
 * dirty tomorrow is a regression, and the fix is to clean it, not to widen
 * the allowlist. Removing a file you cleaned is always allowed.
 */

import { ESLint } from 'eslint';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEBT_FILE = join(ROOT, 'eslint.design-debt.json');
const RULE = 'no-restricted-syntax';

const write = process.argv.includes('--write');

function loadDebt() {
  if (!existsSync(DEBT_FILE)) return [];
  return JSON.parse(readFileSync(DEBT_FILE, 'utf8')).files ?? [];
}

async function findViolatingFiles() {
  // Severity is forced to `warn` for this pass so the scan reports every
  // offending file regardless of how the committed config rates them —
  // otherwise the allowlist would hide the very files it needs to list.
  const eslint = new ESLint({
    cwd: ROOT,
    overrideConfig: { rules: { [RULE]: 'warn' } },
  });

  const results = await eslint.lintFiles(['src/**/*.{ts,tsx}']);
  const files = results
    .filter((r) => r.messages.some((m) => m.ruleId === RULE))
    .map((r) => relative(ROOT, r.filePath).split(sep).join('/'));

  return [...new Set(files)].sort();
}

const current = await findViolatingFiles();
const recorded = loadDebt();

const added = current.filter((f) => !recorded.includes(f));
const cleaned = recorded.filter((f) => !current.includes(f));

if (!write) {
  if (added.length > 0) {
    console.error(
      `${added.length} file(s) picked up new design-token violations:\n` +
        added.map((f) => `  ${f}`).join('\n') +
        '\n\nUse semantic tokens from src/index.css (bg-surface, text-text-muted, ' +
        'border-border, …). Do not add these files to eslint.design-debt.json.',
    );
    process.exit(1);
  }
  console.log(
    `OK: ${current.length} file(s) with design-token debt, all recorded.` +
      (cleaned.length ? ` ${cleaned.length} newly clean — run with --write to record.` : ''),
  );
  process.exit(0);
}

if (added.length > 0) {
  console.error(
    'Refusing to grow the allowlist. These files are newly violating:\n' +
      added.map((f) => `  ${f}`).join('\n') +
      '\n\nThe ratchet only turns one way — fix them instead.',
  );
  process.exit(1);
}

writeFileSync(
  DEBT_FILE,
  JSON.stringify(
    {
      _comment:
        'Files with pre-existing design-token violations, exempted from the ' +
        'no-restricted-syntax design rules (downgraded to warn). Shrink only — ' +
        'regenerate with `node scripts/update-design-debt.mjs --write`. ' +
        'See docs/ARCHITECTURE-REMEDIATION.md, A6.',
      files: current,
    },
    null,
    2,
  ) + '\n',
);

console.log(
  `Wrote ${current.length} file(s) to eslint.design-debt.json` +
    (cleaned.length ? ` (${cleaned.length} removed — nice)` : ''),
);
