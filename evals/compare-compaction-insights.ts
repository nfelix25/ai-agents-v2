import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type CompactionInsight = {
  id: string;
  description: string;
  strategy: string;
  promptProfile?: string;
  promptTokenEstimate?: number;
  overallScore: number;
  informationPreservation: number;
  clarity: number;
  completeness: number;
  conciseness: number;
  reason: string;
  missingInfo: string[];
  wellPreserved: string[];
  improvementSuggestions: string[];
  originalTokens: number;
  compactedTokens: number;
  compressionRatio: number;
};

type CompactionInsightsFile = {
  generatedAt: string;
  strategy: string;
  promptProfile?: string;
  summaryMaxOutputTokens?: number | null;
  insights: CompactionInsight[];
};

type Metrics = {
  overallScore: number;
  qualityNoConciseness: number;
  informationPreservation: number;
  clarity: number;
  completeness: number;
  conciseness: number;
  compressionRatio: number;
};

type Strategy = 'A' | 'B';

type InsightsFileCandidate = {
  filePath: string;
  data: CompactionInsightsFile;
  strategy: Strategy;
  key: string;
  generatedAtMs: number;
};

function parseArgValue(flag: `--${string}`): string | undefined {
  const raw = process.argv.find(
    (arg) => arg.startsWith(`${flag}=`) || arg === flag,
  );
  if (!raw) return undefined;
  return raw === flag ? process.argv[process.argv.indexOf(raw) + 1] : raw.split('=')[1];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function computeAverageMetrics(insights: CompactionInsight[]): Metrics {
  return {
    overallScore: average(insights.map((x) => x.overallScore)),
    qualityNoConciseness: average(
      insights.map(
        (x) => (x.informationPreservation + x.clarity + x.completeness) / 3,
      ),
    ),
    informationPreservation: average(insights.map((x) => x.informationPreservation)),
    clarity: average(insights.map((x) => x.clarity)),
    completeness: average(insights.map((x) => x.completeness)),
    conciseness: average(insights.map((x) => x.conciseness)),
    compressionRatio: average(insights.map((x) => x.compressionRatio)),
  };
}

async function findLatestFile(dir: string, strategy: 'A' | 'B'): Promise<string> {
  const candidates = await collectCandidates(dir);
  const strategyCandidates = candidates
    .filter((c) => c.strategy === strategy)
    .sort((a, b) => b.generatedAtMs - a.generatedAtMs);
  if (!strategyCandidates.length) {
    throw new Error(`No insights files found for strategy ${strategy} in ${dir}`);
  }
  return strategyCandidates[0].filePath;
}

async function readInsightsFile(filePath: string): Promise<CompactionInsightsFile> {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw) as CompactionInsightsFile;
}

function getStrategyFromData(data: CompactionInsightsFile): Strategy | null {
  return data.strategy === 'A' || data.strategy === 'B' ? data.strategy : null;
}

function experimentKey(data: CompactionInsightsFile): string {
  const profile = data.promptProfile ?? 'unknown';
  const cap = data.summaryMaxOutputTokens ?? 'uncapped';
  return `${profile}|${cap}`;
}

function parseCapFilterArg(): number | null | undefined {
  const raw = parseArgValue('--summary-max-output-tokens');
  if (raw === undefined) return undefined;
  if (raw === 'uncapped') return null;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid --summary-max-output-tokens value: "${raw}". Use a positive integer or "uncapped".`,
    );
  }
  return parsed;
}

async function collectCandidates(dir: string): Promise<InsightsFileCandidate[]> {
  const entries = await fs.readdir(dir);
  const files = entries
    .filter((name) => name.startsWith('compaction-insights-') && name.endsWith('.json'))
    .map((name) => path.join(dir, name));

  const results: InsightsFileCandidate[] = [];
  for (const filePath of files) {
    const data = await readInsightsFile(filePath);
    const strategy = getStrategyFromData(data);
    if (!strategy) continue;

    results.push({
      filePath,
      data,
      strategy,
      key: experimentKey(data),
      generatedAtMs: new Date(data.generatedAt).getTime(),
    });
  }

  return results;
}

function findMatchedPair(
  candidates: InsightsFileCandidate[],
  promptProfileFilter?: string,
  capFilter?: number | null,
): { A: InsightsFileCandidate; B: InsightsFileCandidate } {
  const filtered = candidates.filter((c) => {
    if (promptProfileFilter && c.data.promptProfile !== promptProfileFilter) {
      return false;
    }

    if (capFilter !== undefined) {
      const cap = c.data.summaryMaxOutputTokens ?? null;
      if (cap !== capFilter) return false;
    }

    return true;
  });

  const grouped = new Map<string, { A?: InsightsFileCandidate; B?: InsightsFileCandidate }>();
  for (const candidate of filtered) {
    const slot = grouped.get(candidate.key) ?? {};
    const existing = slot[candidate.strategy];
    if (!existing || candidate.generatedAtMs > existing.generatedAtMs) {
      slot[candidate.strategy] = candidate;
      grouped.set(candidate.key, slot);
    }
  }

  const completePairs = [...grouped.values()]
    .filter((pair): pair is { A: InsightsFileCandidate; B: InsightsFileCandidate } =>
      Boolean(pair.A && pair.B),
    )
    .sort(
      (x, y) =>
        Math.max(y.A.generatedAtMs, y.B.generatedAtMs) -
        Math.max(x.A.generatedAtMs, x.B.generatedAtMs),
    );

  if (!completePairs.length) {
    throw new Error(
      'No matched A/B insights pair found. Provide --a and --b explicitly, or rerun both strategies with the same prompt profile/cap.',
    );
  }

  return completePairs[0];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resultsDir = parseArgValue('--dir') ?? path.join(__dirname, 'results');
const promptProfileFilter = parseArgValue('--prompt-profile');
const capFilter = parseCapFilterArg();
const explicitAPath = parseArgValue('--a');
const explicitBPath = parseArgValue('--b');
const outPathArg = parseArgValue('--out');

let aPath = explicitAPath;
let bPath = explicitBPath;

if (!aPath || !bPath) {
  const candidates = await collectCandidates(resultsDir);

  if (!aPath && !bPath) {
    const pair = findMatchedPair(candidates, promptProfileFilter, capFilter);
    aPath = pair.A.filePath;
    bPath = pair.B.filePath;
  } else if (aPath && !bPath) {
    const aDataCandidate = await readInsightsFile(aPath);
    const key = experimentKey(aDataCandidate);
    const bCandidates = candidates
      .filter((c) => c.strategy === 'B' && c.key === key)
      .sort((x, y) => y.generatedAtMs - x.generatedAtMs);
    bPath = bCandidates[0]?.filePath ?? (await findLatestFile(resultsDir, 'B'));
  } else if (!aPath && bPath) {
    const bDataCandidate = await readInsightsFile(bPath);
    const key = experimentKey(bDataCandidate);
    const aCandidates = candidates
      .filter((c) => c.strategy === 'A' && c.key === key)
      .sort((x, y) => y.generatedAtMs - x.generatedAtMs);
    aPath = aCandidates[0]?.filePath ?? (await findLatestFile(resultsDir, 'A'));
  }
}

if (!aPath || !bPath) {
  throw new Error('Unable to resolve both A and B insights files.');
}

const [aData, bData] = await Promise.all([
  readInsightsFile(aPath),
  readInsightsFile(bPath),
]);

const aProfile = aData.promptProfile ?? null;
const bProfile = bData.promptProfile ?? null;
const aCap = aData.summaryMaxOutputTokens ?? null;
const bCap = bData.summaryMaxOutputTokens ?? null;

if (aProfile !== bProfile || aCap !== bCap) {
  console.warn(
    `Warning: comparing runs with different controls (A: profile=${aProfile ?? 'unknown'}, cap=${aCap ?? 'uncapped'} | B: profile=${bProfile ?? 'unknown'}, cap=${bCap ?? 'uncapped'})`,
  );
}

const mapById = (items: CompactionInsight[]) =>
  new Map(items.map((item) => [item.id, item]));

const aById = mapById(aData.insights);
const bById = mapById(bData.insights);
const sharedIds = [...aById.keys()].filter((id) => bById.has(id)).sort();

if (sharedIds.length === 0) {
  throw new Error('No shared conversation ids found between A and B files.');
}

const rows = sharedIds.map((id) => {
  const a = aById.get(id)!;
  const b = bById.get(id)!;
  const aQualityNoConciseness =
    (a.informationPreservation + a.clarity + a.completeness) / 3;
  const bQualityNoConciseness =
    (b.informationPreservation + b.clarity + b.completeness) / 3;

  return {
    id,
    description: a.description || b.description,
    a: {
      overallScore: a.overallScore,
      qualityNoConciseness: aQualityNoConciseness,
      informationPreservation: a.informationPreservation,
      clarity: a.clarity,
      completeness: a.completeness,
      conciseness: a.conciseness,
      compressionRatio: a.compressionRatio,
    },
    b: {
      overallScore: b.overallScore,
      qualityNoConciseness: bQualityNoConciseness,
      informationPreservation: b.informationPreservation,
      clarity: b.clarity,
      completeness: b.completeness,
      conciseness: b.conciseness,
      compressionRatio: b.compressionRatio,
    },
    delta: {
      overallScore: a.overallScore - b.overallScore,
      qualityNoConciseness: aQualityNoConciseness - bQualityNoConciseness,
      informationPreservation: a.informationPreservation - b.informationPreservation,
      clarity: a.clarity - b.clarity,
      completeness: a.completeness - b.completeness,
      conciseness: a.conciseness - b.conciseness,
      compressionRatio: a.compressionRatio - b.compressionRatio,
    },
  };
});

rows.sort((x, y) => Math.abs(y.delta.overallScore) - Math.abs(x.delta.overallScore));

const aMetrics = computeAverageMetrics(aData.insights);
const bMetrics = computeAverageMetrics(bData.insights);

const summary = {
  sharedCases: sharedIds.length,
  aPromptProfile: aProfile,
  bPromptProfile: bProfile,
  aSummaryMaxOutputTokens: aCap,
  bSummaryMaxOutputTokens: bCap,
  metrics: {
    A: aMetrics,
    B: bMetrics,
    deltaAminusB: {
      overallScore: aMetrics.overallScore - bMetrics.overallScore,
      qualityNoConciseness:
        aMetrics.qualityNoConciseness - bMetrics.qualityNoConciseness,
      informationPreservation:
        aMetrics.informationPreservation - bMetrics.informationPreservation,
      clarity: aMetrics.clarity - bMetrics.clarity,
      completeness: aMetrics.completeness - bMetrics.completeness,
      conciseness: aMetrics.conciseness - bMetrics.conciseness,
      compressionRatio: aMetrics.compressionRatio - bMetrics.compressionRatio,
    },
  },
};

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outPath =
  outPathArg ??
  path.join(resultsDir, `compaction-comparison-report-${timestamp}.json`);

await fs.writeFile(
  outPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      files: { A: aPath, B: bPath },
      summary,
      rows,
    },
    null,
    2,
  ),
);

console.log(`Compared files:
  A: ${aPath}
  B: ${bPath}`);
console.log(`Shared cases: ${sharedIds.length}`);
console.log(
  `Average overall score (A vs B): ${aMetrics.overallScore.toFixed(3)} vs ${bMetrics.overallScore.toFixed(3)} (delta ${(
    aMetrics.overallScore - bMetrics.overallScore
  ).toFixed(3)})`,
);
console.log(
  `Average quality-no-conciseness (A vs B): ${aMetrics.qualityNoConciseness.toFixed(3)} vs ${bMetrics.qualityNoConciseness.toFixed(3)} (delta ${(
    aMetrics.qualityNoConciseness - bMetrics.qualityNoConciseness
  ).toFixed(3)})`,
);
console.log('Top 5 per-case overall deltas (A - B):');
for (const row of rows.slice(0, 5)) {
  console.log(
    `  ${row.id}: ${row.a.overallScore.toFixed(3)} vs ${row.b.overallScore.toFixed(3)} (delta ${row.delta.overallScore.toFixed(3)})`,
  );
}
console.log(`Report written to: ${outPath}`);
