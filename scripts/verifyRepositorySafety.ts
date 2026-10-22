const trackedResult = Bun.spawnSync(['git', 'ls-files', '-z'], { stdout: 'pipe', stderr: 'pipe' });
if (trackedResult.exitCode !== 0) {
  console.error(trackedResult.stderr.toString());
  process.exit(1);
}

const tracked = trackedResult.stdout.toString().split('\0').filter(Boolean);
const forbiddenPaths = tracked.filter(path =>
  /^\.env(?:\.|$)/i.test(path) && path !== '.env.example'
  || /^firebase\.prod\.json$/i.test(path)
  || /service[-_]?account|firebase-admin.*\.json|credentials.*\.json/i.test(path)
);
const secretPatterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /"private_key"\s*:\s*"-----BEGIN/];
const secretHits: string[] = [];
for (const path of tracked) {
  const file = Bun.file(path);
  if (file.size > 2_000_000) continue;
  const text = await file.text().catch(() => '');
  if (secretPatterns.some(pattern => pattern.test(text))) secretHits.push(path);
}

const sourceImports = Bun.spawnSync(['git', 'grep', '-n', 'firebase-applet-config', '--', 'src', 'server', 'shared'], { stdout: 'pipe' });
if (forbiddenPaths.length || secretHits.length || sourceImports.exitCode === 0) {
  forbiddenPaths.forEach(path => console.error(`Forbidden tracked local configuration: ${path}`));
  secretHits.forEach(path => console.error(`Private-key material detected in tracked file: ${path}`));
  if (sourceImports.exitCode === 0) console.error(`Legacy Firebase config import detected:\n${sourceImports.stdout.toString()}`);
  process.exit(1);
}

console.log(`Repository safety gate passed for ${tracked.length} tracked files.`);
