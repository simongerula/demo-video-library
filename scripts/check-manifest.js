import fs from 'node:fs';
import path from 'node:path';

// Compares the manifest before/after a library capture and reports:
//   NEW     — tagged test ran but had no manifest entry.
//   UPDATED — entry exists but steps[] changed (or it had no video).
//   REMOVED — manifest entry (functional scope) with no tagged test behind it
//             (deleted or untagged spec). Listed only; deleted with --prune.
// Usage: node scripts/check-manifest.js --before OLD --after NEW
//        [--results DIR] [--prune]
// Exits 1 when removals are pending and --prune was not passed.

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

const beforeFile = arg('--before', 'library/manifest.json');
const afterFile = arg('--after', 'library/manifest.json');
const resultsDir = arg('--results', 'test-results/video-meta');
const prune = process.argv.includes('--prune');

function loadManifest(file) {
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const before = loadManifest(beforeFile);
const beforeById = new Map(before.map((e) => [e.id, e]));

let records = [];
if (fs.existsSync(resultsDir)) {
  for (const f of fs.readdirSync(resultsDir).filter((x) => x.endsWith('.json'))) {
    try {
      records.push(JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf8')));
    } catch {
      // Ignore unreadable reporter output.
    }
  }
}
const recordById = new Map(records.map((r) => [r.id, r]));

// Safety: never prune when the capture produced nothing — an empty results
// dir would otherwise nuke the whole manifest.
if (prune && records.length === 0 && before.length > 0) {
  console.error('Refusing to prune: no reporter records found, manifest untouched.');
  process.exit(1);
}

const after = loadManifest(afterFile);
const fresh = [];
const updated = [];
for (const entry of after) {
  const rec = recordById.get(entry.id);
  if (!beforeById.has(entry.id)) {
    fresh.push(entry.id);
  } else if (
    rec &&
    (JSON.stringify(rec.steps ?? []) !== JSON.stringify(beforeById.get(entry.id).steps ?? []) ||
      !beforeById.get(entry.id).video)
  ) {
    updated.push(entry.id);
  }
}

const removed = before
  .filter((e) => e.file?.startsWith('tests/functional/') && !recordById.has(e.id))
  .map((e) => e.id);

function table(title, ids) {
  if (!ids.length) return `### ${title}\n\nNone.\n`;
  return `### ${title}\n\n${ids.map((id) => `- ${id}`).join('\n')}\n`;
}

const report = [
  '# Manifest check',
  '',
  table('New (will be published)', fresh),
  table('Updated (steps or video changed)', updated),
  table('Removed (no tagged test — prune to delete)', removed),
].join('\n');
console.log(report);

const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
  fs.appendFileSync(summaryFile, `${report}\n`);
}

if (prune && removed.length > 0) {
  const kept = after.filter((e) => !removed.includes(e.id));
  fs.writeFileSync(afterFile, JSON.stringify(kept, null, 2));
  for (const id of removed) {
    for (const video of [
      path.join('library/videos', `${id}.webm`),
      path.join('library', `${id}.webm`),
    ]) {
      if (fs.existsSync(video)) fs.rmSync(video);
    }
  }
  console.log(`Pruned ${removed.length} entries -> ${afterFile}`);
}

if (!prune && removed.length > 0) {
  console.error(
    `\n${removed.length} manifest entries have no tagged test. Re-run with prune enabled to delete them.`,
  );
  process.exit(1);
}
