import fs from 'node:fs';
import path from 'node:path';
import type {
  FullConfig,
  Reporter,
  Suite,
  TestCase,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';

// Reusable: no repo-specific imports, no spec names, no bucket/Slack.
// Configured only via reporter options: ['./lib/video-reporter.ts', { outputDir }]
// Output: one JSON per test in outputDir, consumed by scripts/build-manifest.js.

type ReporterOptions = {
  outputDir?: string;
};

type StepInfo = {
  title: string;
  durationMs: number;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80) || 'test';
}

function collectTestSteps(steps: TestStep[], out: StepInfo[] = []): StepInfo[] {
  for (const step of steps) {
    if (step.category === 'test.step') {
      out.push({ title: step.title, durationMs: step.duration });
    }
    if (step.steps?.length) {
      collectTestSteps(step.steps, out);
    }
  }
  return out;
}

// Describe hierarchy above the test, e.g. ['Product detail summary'].
// Skips the project suite (title is the project name), the file-level suite
// (title is the file path), and the root suite.
function describePath(test: TestCase, projectNames: Set<string>): string[] {
  const parts: string[] = [];
  let suite = test.parent;
  while (suite) {
    if (
      suite.title &&
      !suite.title.endsWith('.ts') &&
      !suite.title.includes('/') &&
      !projectNames.has(suite.title)
    ) {
      parts.unshift(suite.title);
    }
    suite = suite.parent;
  }
  return parts;
}

class VideoReporter implements Reporter {
  private outputDir: string;
  private projectNames: Set<string> = new Set();

  constructor(options: ReporterOptions = {}) {
    this.outputDir = options.outputDir ?? 'test-results/video-meta';
  }

  onBegin(config: FullConfig, _suite: Suite): void {
    fs.mkdirSync(this.outputDir, { recursive: true });
    for (const project of config.projects) {
      if (project.name) this.projectNames.add(project.name);
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const fileBase =
      test.location.file
        .split(path.sep)
        .pop()
        ?.replace(/\.spec\.ts$/, '') ?? 'spec';
    const describes = describePath(test, this.projectNames);
    const id = slugify([fileBase, ...describes, test.title].join(' '));
    const steps = collectTestSteps(result.steps);

    // Opt-in library membership + workflow tags, set per test via
    // test(..., { annotation }). Untagged tests (e.g. e2e, setup) produce no
    // record at all, so a touched file only (re)publishes its tagged tests.
    // { type: 'library' } -> record it; { type: 'workflow', description } ->
    // flow membership; { type: 'order', description } -> position in the flow.
    const annotations = test.annotations ?? [];
    if (!annotations.some((a) => a.type === 'library')) return;
    const workflows = annotations
      .filter((a) => a.type === 'workflow')
      .map((a) => a.description);
    const orderRaw = annotations.find((a) => a.type === 'order')?.description;
    const orderParsed = orderRaw !== undefined ? Number.parseInt(orderRaw, 10) : NaN;

    const videoAttachment = result.attachments.find(
      (a) => a.name === 'video' || a.contentType?.startsWith('video'),
    );

    let endpoints: { method: string; path: string }[] = [];
    const endpointsAttachment = result.attachments.find((a) => a.name === 'endpoints');
    try {
      // Body attachments arrive in-memory (no path); file attachments via path.
      const raw =
        endpointsAttachment?.body?.toString('utf8') ??
        (endpointsAttachment?.path ? fs.readFileSync(endpointsAttachment.path, 'utf8') : null);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        endpoints = parsed.filter(
          (e): e is { method: string; path: string } =>
            typeof e === 'object' &&
            e !== null &&
            typeof (e as { method?: unknown }).method === 'string' &&
            typeof (e as { path?: unknown }).path === 'string',
        );
      }
    } catch {
      endpoints = [];
    }

    const record = {
      v: 1,
      id,
      title: [...describes, test.title].join(' › '),
      feature: describes[0] ?? '',
      file: path.relative(process.cwd(), test.location.file),
      project: test.parent.project()?.name ?? '',
      status: result.status,
      retry: result.retry,
      durationMs: result.duration,
      steps: steps.map((s) => s.title),
      stepDetails: steps,
      endpoints,
      workflows,
      playlistOrder: Number.isNaN(orderParsed) ? null : orderParsed,
      videoPath: videoAttachment?.path ?? null,
    };

    const fileName = `${id}${result.retry ? `-retry-${result.retry}` : ''}.json`;
    fs.writeFileSync(
      path.join(this.outputDir, fileName),
      JSON.stringify(record, null, 2),
    );
  }

  printsToStdio(): boolean {
    return false;
  }
}

export default VideoReporter;
