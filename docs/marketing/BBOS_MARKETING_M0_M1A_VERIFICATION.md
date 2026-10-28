# BBOS Marketing M0/M1A security and verification gate

**Verification date:** 2026-10-28

**Branch:** `audit/bbos-comprehensive-remediation`

**Starting Marketing commit:** `2461a49ea66bff701d9fc2412de7e23d2a3ae08d`

**Validated dependency source commit:** `0bb034b96d607d0d259b70cf4045d8434ca65533`

**Initial report commit:** `b8abc42fb05c3b143864f08ace7be158d34b22b5`

**Report publication:** the commit containing this report; the final response and branch history provide its immutable hash because a commit cannot embed its own hash.
**Verdict:** **GO for starting M1B development within the already approved isolation boundaries.** This is not approval to deploy, connect production storage, process real media, publish content, connect Meta, or change Sembark.

## Repository state and isolation

The requested branch and starting commit matched. The only pre-existing worktree modification was `firebase-applet-config.json`; it was preserved and never staged. Direct dependency ranges did not change. The remediation updates `bun.lock`, moves the existing `qs` security override from 6.16.0 to 6.16.1, and tightens `config/dependency-audit-allowlist.json` to the five advisories still emitted by `bun audit`.

No production Firebase resource, live Meta account, Sembark connection, real lead, customer record, or media object was accessed or changed. Firebase validation used localhost Auth and Firestore emulators with `demo-bbos-audit-rules` and `bbos-qa3-local` project identifiers.

## Dependency advisory disposition

The failed implementation-commit audit contained twelve unapproved records: five high, five moderate, and two low. All had compatible fixed versions and were remediated without a direct dependency or framework major upgrade. A thirteenth moderate `qs` record was published while the final report CI was running and was also remediated rather than allowlisted.

| Advisory | Package and installed version before | Severity | Dependency path and context | Reachability and attacker input | Fixed version and action | Regression risk | Final disposition |
|---|---|---|---|---|---|---|---|
| `1243073` / `GHSA-27r3-jxmh-p828` | `body-parser` 1.20.6 | High | Direct `express` 4.22.2 runtime path; also Firebase CLI/exegesis tooling | **Confirmed reachable parser boundary.** `server.ts` installs `express.json({ limit: '10mb' })` before public and authenticated APIs. A remote client controls compressed HTTP request bytes, matching the trailing-byte denial-of-service precondition. | 1.20.9; compatible lockfile patch inside Express `~1.20.5` | Low. Same patch line; full HTTP, unit, build, Chromium and Firebase regressions passed. | **Remediated** |
| `1243074` / `GHSA-27r3-jxmh-p828` | `body-parser` 2.3.0 | High | `@modelcontextprotocol/sdk -> express` 5; Firebase CLI and optional Google GenAI MCP path | Not invoked by BBOS routes. BBOS does not expose an MCP HTTP server; no attacker-controlled compressed request reaches this copy. | 2.4.0; compatible transitive patch | Low. MCP SDK and all integration tests passed. | **Remediated; previously not reachable** |
| `1243098` / `GHSA-w74x-v6f9-j3xg` | `fast-uri` 3.1.8 | Moderate | `ajv -> fast-uri`; Firebase CLI/exegesis and optional MCP validation | BBOS does not import `fast-uri`, expose MCP validation, or use attacker-controlled schema URIs. The Marketing AI response boundary uses custom bounded parsing. | 3.1.9; compatible patch | Low; AJV range remains satisfied. | **Remediated; previously not reachable/dev tooling** |
| `1243101` / `GHSA-xhq7-xmqj-769h` | `fast-uri` 3.1.8 | Low | Same AJV paths | No BBOS path normalizes attacker-controlled relative URI references through this package. | 3.1.9 | Low | **Remediated; previously not reachable/dev tooling** |
| `1243104` / `GHSA-wjr9-j795-jxcr` | `fast-uri` 3.1.8 | Moderate | Same AJV paths | No BBOS authorization, redirect, fetch, or storage decision uses a `fast-uri` canonicalized host. | 3.1.9 | Low | **Remediated; previously not reachable/dev tooling** |
| `1243107` / `GHSA-333x-w4r6-6crp` | `fast-uri` 3.1.8 | Low | Same AJV paths | No public input becomes a suffix reference in this package. | 3.1.9 | Low | **Remediated; previously not reachable/dev tooling** |
| `1243077` / `GHSA-4qv8-2p9j-2685` | `undici` 8.11.2 | Moderate | `firebase-tools -> superstatic -> re2 -> node-gyp -> undici` | Dev tooling only. BBOS does not expose node-gyp's EventSource parser to an application request or untrusted stream. | 8.12.2; compatible patch | Low; native processing was not added and Firebase tooling passed. | **Remediated; dev tooling only** |
| `1243079` / `GHSA-4qv8-2p9j-2685` | `undici` 6.29.0 | Moderate | Direct Firebase CLI dependency | Dev/emulator tooling only; no deployed BBOS route uses this EventSource implementation. | 6.29.1; compatible patch | Low; emulator suites passed. | **Remediated; dev tooling only** |
| `1243080` / `GHSA-f72v-6w45-q472` | `undici` 8.11.2 | Moderate | node-gyp chain under Firebase CLI | Dev tooling only. BBOS does not use this copy for browser Subresource Integrity decisions. | 8.12.2 | Low | **Remediated; dev tooling only** |
| `1243112` / `GHSA-xjj6-f33q-929c` | `undici` 8.11.2 | High | node-gyp chain under Firebase CLI | Dev tooling only; no remote BBOS response is decoded by this copy. | 8.12.2 | Low | **Remediated; dev tooling only** |
| `1243114` / `GHSA-xjj6-f33q-929c` | `undici` 6.29.0 | High | Direct Firebase CLI dependency | Dev/emulator tooling only. A public BBOS request cannot supply an HTTP response with excessive content encodings to this client. | 6.29.1 | Low; Firebase CLI emulator coverage passed. | **Remediated; dev tooling only** |
| `1243066` / `GHSA-mrhx-c7xc-m3w5` | `zod` 4.6.5 | High | Firebase CLI and `@modelcontextprotocol/sdk`; optional Google GenAI MCP path | BBOS does not import Zod or MCP task/schema APIs. Public and AI response inputs do not reach this vulnerable collection validator. | 4.6.6; compatible patch | Low; SDK range remains satisfied and Marketing AI tests passed. | **Remediated; previously not reachable/dev tooling** |
| `1243452` / `GHSA-6pq8-jhm2-2vcw` | `qs` 6.16.0 | Moderate | Direct Express/body-parser production query and serialization path plus Google/Firebase tooling | **Potentially reachable production package.** The specific fault requires `qs.stringify({ array }, { arrayFormat: 'comma' })` with an array element carrying a non-callable own `toString`. BBOS does not directly call `qs.stringify`, but the shared parser/serializer package is used on public HTTP paths, so acceptance was not justified. | 6.16.1; existing package override and lockfile patched | Low. Same patch line; complete local and hosted regression matrix required. | **Remediated during final CI follow-up** |

`bun audit fix` also safely updated `@modelcontextprotocol/sdk` 1.31.0 to 1.32.0 and Vite 6.4.3 to 6.4.4. Those patches remove nine previously allowlisted MCP/Vite advisory records. The allowlist was reduced from fifteen historical IDs to the five currently emitted and previously evidenced residual records.

## Residual audit records

The audit does not report zero vulnerabilities. It reports five reviewed records and zero unexpected records.

| Advisory | Severity | Installed path | Evidence and control | Disposition |
|---|---|---|---|---|
| `1240623`, `@grpc/grpc-js` certificate authorization | High | Firebase browser SDK constrained to grpc-js 1.9.16 | Requires a grpc-js server using `getAuthContext`; BBOS uses the package as a Firestore client and implements no gRPC server. Firebase's `~1.9.0` constraint blocks a compatible fixed update. | Proven not reachable; retain until supported Firebase update |
| `1240625`, `@grpc/grpc-js` handler-message disclosure | Low | Same Firebase browser client | Requires a grpc-js server method handler. No such BBOS handler exists. | Proven not reachable |
| `1153174`, `@opentelemetry/core` baggage memory use | Moderate | Firebase CLI through Google Cloud Pub/Sub | Dev tooling only; the deployed application does not import this copy or accept W3C baggage through it. Upgrading requires an unsupported OpenTelemetry major outside the dependent range. | Reviewed dev-tooling residual |
| `1240853`, `basic-ftp` directory-list CPU use | High | Firebase CLI proxy/get-uri path | Dev tooling only; BBOS has no FTP route and tooling is not run against untrusted FTP services. The dependent requires the vulnerable 5.x major. | Reviewed dev-tooling residual |
| `1119441`, `uuid` buffer bounds | Moderate | Google/Firebase transitive UUID 9 | Requires UUID v3/v5/v6 with a caller-supplied output buffer. BBOS neither imports UUID nor exposes that operation. Dependents constrain UUID to major 9. | Proven not reachable |

No critical advisory remains. No reachable high-severity application vulnerability is allowlisted.

## Java and emulator configuration

The host initially had no `java` command or `JAVA_HOME`. GitHub CI already uses `actions/setup-java@v5` with Temurin 21. Chocolatey identified approved `Temurin21` 21.0.12.101, but a normal system install could not write to `C:\ProgramData` because this shell has no Windows administrator token.

For this verification, Chocolatey downloaded the approved Temurin package and verified the MSI hash. The MSI was administratively extracted into a temporary user-local directory. Only the test-process environment set `JAVA_HOME` and prepended its `bin` directory to `PATH`; system PATH, registry and project configuration were unchanged. `java -version` reported Temurin OpenJDK 21.0.12.1 LTS.

Normal workstation procedure from an elevated PowerShell is:

```powershell
choco install temurin21 --yes --no-progress
java -version
```

CI should continue using the existing `actions/setup-java@v5` Temurin 21 step.

## Exact verification results

| Command | Result |
|---|---|
| `bun install --frozen-lockfile` | PASS; 857 installs across 889 packages checked, no changes |
| `bun run verify:repository` | PASS; 344 tracked files at final local validation (343 before this report was added) |
| `bun run verify:audit` | PASS; 5 reviewed residual advisories, 0 unexpected |
| `bun run lint` | PASS; TypeScript emitted no errors |
| `bun test` | PASS; **741 passed, 8 emulator-specific skipped, 0 failed, 2,953 assertions**, 56 files |
| `bun run build` | PASS with the existing large-client-chunk warning; Vite 6.4.4 |
| `bun run test:e2e` | PASS; **56/56 Chromium tests**, 0 failed |
| `bun run test:rules` | PASS; **5/5**, 0 failed, isolated Firestore emulator |
| `bun run test:e2e:firebase` | PASS; **1/1**, 0 failed, isolated Auth/Firestore emulators |
| `git diff --check` | PASS; no whitespace errors |

The eight normal `bun test` skips are the emulator-specific cases exercised by the dedicated emulator commands.

## GitHub Production Readiness CI

The workflow remains compatible with the branch and changes. It triggers on pushes to `audit/bbos-comprehensive-remediation`, pins Bun 1.4.0, provisions Temurin 21, installs from the frozen lockfile, and runs the same safety, audit, type, unit, build, Chromium, rules, Firebase and whitespace gates.

- Implementation commit `2461a49...`: run `40488866078` **failed** at `verify:audit` on exactly the twelve new records classified above.
- Dependency source commit `0bb034b96d607d0d259b70cf4045d8434ca65533`: run `40491792322` **passed** all steps in 3m21s: <https://github.com/suhaibhamid04/BBOS/actions/runs/40491792322>.
- Initial report commit `b8abc42fb05c3b143864f08ace7be158d34b22b5`: run `40643414283` **failed** at `verify:audit` because `1243452` was published after the prior green run. No test failure was hidden; `qs` was patched to 6.16.1.

The final report commit receives its own workflow run after push. Its exact result is reported to the user and must be successful before this verification task is called complete.

## Security and RBAC regression findings

- Marketing remains denied payment, supplier cost, raw Trip/Quote/Booking financial data and unrelated commercial mutation paths.
- Media actions remain owner scoped for Marketing; Founder/Admin retain rights verification; inactive, unrelated-role and cross-scope attempts fail closed.
- Tests still reject client control of media owner, role, verification, storage reference, audit actor, immutable version and job state.
- Firestore rules remain unchanged and pass all five executable denial regressions.
- Firebase E2E confirms normal authenticated Sales behavior and direct-rule denials with real emulator tokens.
- No storage adapter, native media processor, publisher, Meta connector, or Sembark transition was introduced.

## Remaining risks and non-blockers

1. Five transparently reviewed residual advisories remain for non-reachable gRPC/UUID operations or Firebase CLI-only paths. They must be re-evaluated when Firebase/Google dependency ranges move.
2. `package.json` contains Vite in both dependencies and devDependencies with the same range; Bun warns but resolves one patched version. This pre-existing cleanup is not a security or M1B-foundation blocker.
3. The production build retains its existing client chunk-size warning.
4. A normal local JDK install still requires an administrator-run Chocolatey command; CI and this verification have a working Temurin 21 path.
5. Production object storage, IAM, retention, rights evidence, media worker isolation and native-processing supply-chain review remain M1B design work and require separate approval before real data or deployment.

## Final gate decision

**GO for beginning separately authorized M1B development against synthetic data and non-production adapters.** M0/M1A now has a passing dependency gate, full local verification, emulator verification and hosted CI on the validated source commit. This decision does not authorize deployment, production Firebase/storage, real media, native rendering, publishing, Meta integration, advertising automation, or Sembark cutover.
