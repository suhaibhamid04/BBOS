import allowlist from '../config/dependency-audit-allowlist.json';

const result = Bun.spawnSync(['bun', 'audit', '--json'], { stdout: 'pipe', stderr: 'pipe' });
const output = result.stdout.toString().trim();
if (!output) {
  console.error(result.stderr.toString() || 'bun audit returned no JSON output.');
  process.exit(1);
}

let report: Record<string, Array<{ id: number; severity: string; url: string }>>;
try {
  report = JSON.parse(output);
} catch {
  console.error('Unable to parse bun audit JSON output.');
  process.exit(1);
}

const advisories = Object.entries(report).flatMap(([packageName, rows]) => rows.map(row => ({ ...row, packageName })));
const allowed = new Set<number>(allowlist.allowedAdvisoryIds);
const unexpected = advisories.filter(advisory => !allowed.has(advisory.id));
const critical = advisories.filter(advisory => advisory.severity === 'critical');
if (critical.length || unexpected.length) {
  for (const advisory of [...critical, ...unexpected]) {
    console.error(`Unapproved ${advisory.severity} advisory ${advisory.id} in ${advisory.packageName}: ${advisory.url}`);
  }
  process.exit(1);
}

console.log(`Dependency audit gate passed with ${advisories.length} reviewed residual advisories and 0 unexpected advisories.`);
