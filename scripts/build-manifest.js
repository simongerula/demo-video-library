import fs from 'node:fs';
import path from 'node:path';

// Reusable: pure CLI, no hardcodes. Copies videos + merges reporter JSON
// into library/manifest.json (schema v1).
// Usage: node scripts/build-manifest.js [--results DIR] [--out FILE] [--videos DIR]

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const resultsDir = arg('--results', 'test-results/video-meta');
const outFile = arg('--out', 'library/manifest.json');
const videosDir = arg('--videos', 'library/videos');

const libraryDir = path.dirname(outFile);
fs.mkdirSync(libraryDir, { recursive: true });
fs.mkdirSync(videosDir, { recursive: true });

let manifest = [];
if (fs.existsSync(outFile)) {
  try {
    manifest = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    if (!Array.isArray(manifest)) manifest = [];
  } catch {
    manifest = [];
  }
}
const byId = new Map(manifest.map((e) => [e.id, e]));

if (!fs.existsSync(resultsDir)) {
  console.log(`No results dir ${resultsDir}, keeping ${byId.size} existing entries.`);
  process.exit(0);
}

const files = fs.readdirSync(resultsDir).filter((f) => f.endsWith('.json'));
if (files.length === 0) {
  console.log(`No reporter JSON in ${resultsDir}, keeping ${byId.size} existing entries.`);
}

const commit = process.env.GITHUB_SHA?.slice(0, 7) ?? null;
const runUrl =
  process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null;

for (const file of files) {
  const record = JSON.parse(fs.readFileSync(path.join(resultsDir, file), 'utf8'));
  let videoRel = byId.get(record.id)?.video ?? null;

  if (record.videoPath && fs.existsSync(record.videoPath)) {
    const dest = path.join(videosDir, `${record.id}.webm`);
    fs.copyFileSync(record.videoPath, dest);
    videoRel = path.relative(process.cwd(), dest);
  }

  byId.set(record.id, {
    v: 1,
    id: record.id,
    title: record.title,
    file: record.file,
    video: videoRel,
    status: record.status,
    durationMs: record.durationMs,
    steps: record.steps ?? [],
    summary: byId.get(record.id)?.summary ?? null,
    tags: byId.get(record.id)?.tags ?? [],
    updatedAt: new Date().toISOString(),
    commit,
    runUrl,
  });
}

const merged = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(outFile, JSON.stringify(merged, null, 2));
console.log(`Manifest: ${merged.length} entries -> ${outFile}`);
