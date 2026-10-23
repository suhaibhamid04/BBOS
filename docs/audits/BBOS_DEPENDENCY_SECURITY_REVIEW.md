# BBOS dependency security review — S08

Review completed on 2026-10-20 on `audit/bbos-comprehensive-remediation`. This review used `bun audit --json`, `bun audit fix --dry-run`, `bun pm why`, lockfile inspection, application call-site searches and the full repository regression gates. It does not claim zero vulnerabilities: the final audit reports six advisories whose BBOS paths and preconditions are dispositioned below.

## Dependency inventory

- The repository uses `package.json` and the committed `bun.lock`; no second lockfile is present.
- Production server roots include Express 4, Firebase Admin 14 and Google GenAI. Browser roots include React 19 and Firebase 12. Vite, PostCSS and Tailwind are build-time dependencies. `firebase-tools`, Playwright, the Firestore rules test SDK, TypeScript and `tsx` are development/test tooling.
- Express 4.22.2 is a deployed runtime dependency. Public requests reach its query parser, including the Meta webhook verification route. BBOS does not configure `trust proxy` and does not use `req.ip` or proxy-derived addresses for authorization.
- Firebase Admin reaches `@grpc/grpc-js` through `@google-cloud/firestore` and `google-gax`. The Firebase browser SDK has a separate `@grpc/grpc-js` 1.9.16 copy. BBOS uses both as clients; it does not create a grpc-js server or call `getAuthContext`.
- `firebase-tools` supplies the OpenTelemetry, FTP, `braces` and several glob chains. It is a dev dependency used for local emulators and deployment tooling and is not imported by the application server.

## Audit result

| Point | Total | Critical | High | Moderate | Low |
|---|---:|---:|---:|---:|---:|
| Before | 15 | 1 | 7 | 5 | 2 |
| After | 6 | 0 | 3 | 2 | 1 |

Nine advisories were remediated. The six remaining audit records are two grpc-js records on the browser Firebase client's old constrained copy, three Firebase CLI/tooling findings, and one unused UUID buffer-API finding.

## Advisory classification

The dependency path is transitive in every row. “Reachable” refers to the vulnerable operation and its preconditions, rather than package installation alone.

| # | Package / advisory | Severity | Installed before → after; fixed version | Path and runtime category | Reachability, attacker input and current controls | Remediation | Residual risk | Final disposition |
|---:|---|---|---|---|---|---|---|---|
| 1 | `@grpc/grpc-js` [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j), 1.14 range | High | 1.14.4 → 1.14.5; fixed 1.14.5 | `firebase-admin → @google-cloud/firestore → google-gax → grpc-js`; production client networking | `NOT_REACHABLE`: advisory requires a grpc-js server using certificate authorization through `getAuthContext`; BBOS creates no gRPC server and exposes no attacker certificate to that API | Compatible lockfile patch | None from this installed copy | **Remediated** |
| 2 | `@grpc/grpc-js` GHSA-m9gg-hp2v-232j, old range | High | 1.9.16 retained; fixed 1.13.6 | `firebase → @firebase/firestore → grpc-js`; browser Firestore client | `NOT_REACHABLE`: same server-only precondition; BBOS uses this copy as a Firestore client. Source search found no grpc server or `getAuthContext` call | Not overridden: Firebase declares `~1.9.0`; forcing 1.13.6 crosses its tested range | Vulnerable package remains installed, but the affected server API is absent. Reassess when Firebase updates its constraint | **Proven not reachable** |
| 3 | `@grpc/grpc-js` [GHSA-f596-whhp-79r4](https://github.com/advisories/GHSA-f596-whhp-79r4), 1.14 range | Low | 1.14.4 → 1.14.5; fixed 1.14.5 | Same Firebase Admin client chain; production client networking | `NOT_REACHABLE`: disclosure requires a grpc-js server method handler that throws a message to a remote client; BBOS defines no such handler | Compatible lockfile patch | None from this installed copy | **Remediated** |
| 4 | `@grpc/grpc-js` GHSA-f596-whhp-79r4, old range | Low | 1.9.16 retained; fixed 1.13.6 | Same browser Firebase client chain | `NOT_REACHABLE`: BBOS is the gRPC client and has no grpc-js server method handlers | Not overridden because Firebase constrains this copy to `~1.9.0` | Package remains installed; affected server behavior is absent | **Proven not reachable** |
| 5 | `@opentelemetry/core` [GHSA-8988-4f7v-96qf](https://github.com/advisories/GHSA-8988-4f7v-96qf) | Moderate | 1.30.1 retained; fixed 2.8.0 | `firebase-tools → @google-cloud/pubsub → @opentelemetry/core`; dev CLI | `DEV_TOOLING_ONLY`: the deployed app does not import this copy or accept remote W3C baggage into it | No major override across Pub/Sub's declared `^1.30.1` range; use CLI only from trusted development/CI input | A hostile endpoint/header encountered by that local CLI chain could consume memory | **Dev-only with documented controls** |
| 6 | `basic-ftp` [GHSA-c475-qrg2-pj4r](https://github.com/advisories/GHSA-c475-qrg2-pj4r) | High | 5.3.1 retained; fixed 6.2.1 | `firebase-tools → proxy-agent → pac-proxy-agent → get-uri → basic-ftp`; dev CLI | `DEV_TOOLING_ONLY`: BBOS has no FTP route, parser or remotely supplied FTP listing | No major override across `get-uri`'s declared `^5.0.2` range; do not run tooling against untrusted FTP services | Malicious FTP directory listings can consume local CLI CPU | **Dev-only with documented controls** |
| 7 | `brace-expansion` [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | High | 2.1.4 → 2.1.7; fixed 2.1.5 | Firebase CLI glob/archive chains and `google-gax → rimraf`; tooling/package housekeeping | `NOT_REACHABLE`: no public route passes a pattern to these glob operations | Compatible lockfile patch | None from the affected 2.x copy; unrelated 1.1.21 does not match the advisory range | **Remediated** |
| 8 | `brace-expansion` [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | Moderate | 2.1.4 → 2.1.7; fixed 2.1.7 | Same glob/archive and housekeeping chains | `NOT_REACHABLE`: remote BBOS input does not become a filesystem glob | Compatible lockfile patch | None | **Remediated** |
| 9 | `brace-expansion` [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | High | 2.1.4 → 2.1.7; fixed 2.1.6 | Same glob/archive and housekeeping chains | `NOT_REACHABLE`: remote BBOS input does not become a filesystem glob | Compatible lockfile patch | None | **Remediated** |
| 10 | `braces` [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | High | 3.0.3 retained; Bun reports no fixed release | `firebase-tools → chokidar → braces`; dev CLI file watching | `DEV_TOOLING_ONLY`: patterns originate in trusted local emulator/tooling configuration, not HTTP, WhatsApp, auth or application query input | No fixed package version is currently reported; avoid attacker-controlled watch patterns and update Firebase CLI/chokidar when a fixed chain ships | A malicious local pattern could exhaust the CLI process stack | **Dev-only with documented controls** |
| 11 | `proxy-addr` [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) | Critical | 2.0.7 → 2.0.8; fixed 2.0.8 | Direct `express → proxy-addr`; production HTTP runtime | `NOT_REACHABLE` before patch: exploit requires a matching trust-proxy subnet and crafted mapped IPv6 address. BBOS does not set `trust proxy` or authorize through client IP | Compatible lockfile patch | None | **Remediated** |
| 12 | `qs` [GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx) | Moderate | 6.15.3 → 6.16.0; fixed 6.16.0 | Direct `express/body-parser → qs`; production HTTP query parsing | `CONFIRMED_REACHABLE`: unauthenticated Meta verification parameters and authenticated route query strings are attacker controlled and parsed. Webhook token verification limits business action, but does not prevent parser resource use | Justified `overrides.qs = 6.16.0`, required because Express 4 pins `~6.15.1`; full HTTP/E2E regression passed | Override is same-major but outside Express's patch range; retain regressions until upstream range advances | **Remediated** |
| 13 | `qs` [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) | Moderate | 6.15.3 → 6.16.0; fixed 6.16.0 | Same production query-parser path | `CONFIRMED_REACHABLE`: public query strings reach the affected parser before route-level validation | Same tested override | Same bounded compatibility risk | **Remediated** |
| 14 | `source-map-js` [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | High | 1.2.1 → 1.2.2; fixed 1.2.2 | `vite → postcss → source-map-js` and Tailwind build chain | `DEV_TOOLING_ONLY`: used while compiling assets; no deployed request parser path | Compatible lockfile patch | None | **Remediated** |
| 15 | `uuid` [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | Moderate | 9.0.1 retained; fixed 11.1.1 | Firebase Admin optional Storage/auth libraries and Firebase CLI through `gaxios`/`teeny-request`; production transitive plus tooling | `NOT_REACHABLE`: the flaw requires calling UUID v3/v5/v6 with a supplied output buffer. BBOS does not import UUID or expose such a buffer/API; its generated identifiers do not use that path | No forced major override across dependents' `^9` ranges; update through supported Google/Firebase releases | Vulnerable code remains installed but no call path or attacker-controlled buffer exists | **Proven not reachable** |

## Safe upgrades applied

- `@grpc/grpc-js` 1.14.4 → 1.14.5 on the Firebase Admin/Google client path.
- `proxy-addr` 2.0.7 → 2.0.8.
- `qs` 6.15.3 → 6.16.0 through a documented package override.
- `source-map-js` 1.2.1 → 1.2.2.
- `brace-expansion` 2.1.4 → 2.1.7.

No direct framework, Firebase, build-system or other major-version upgrade was made.

## Residual controls and ownership

- Keep `firebase-tools` in `devDependencies`; do not package or import it in the deployed server. Run it with trusted project configuration, filesystem patterns, proxy settings and endpoints. Dependency owner: engineering/tooling; review on each Firebase CLI update.
- Do not force the Firestore browser client's grpc-js outside `~1.9.0`. Dependency owner: frontend platform; accept an upstream Firebase release once its supported constraint moves to a fixed version.
- Do not expose UUID v3/v5/v6 output buffers through application input. Dependency owner: backend platform; accept supported Google/Firebase dependency updates when they move from UUID 9.
- Re-run `bun audit` on dependency changes. A new production call path into any residual package reopens S08.

## Regression evidence

| Command | Result |
|---|---|
| `bun install` | Passed; lockfile saved |
| `bun run lint` | Passed (`tsc --noEmit`) |
| `bun test` | 687 passed, 0 failed, 8 skipped; 2,734 assertions |
| WhatsApp server flow | 12 passed, 0 failed; included in the full unit run |
| `bun run build` | Passed; existing Vite large-chunk warning remains |
| `bun run test:e2e` | 56 passed, 0 failed, including both Meta WhatsApp browser scenarios |
| `bun run test:rules` | 5 passed, 0 failed against the Firestore emulator; rules unchanged |
| `bun run test:e2e:firebase` | 1 passed, 0 failed against Auth + Firestore emulators |
| `bun audit --json` | Exit 1 with six documented residual advisories: 0 critical, 3 high, 2 moderate, 1 low |

## Final decision

**S08 CLOSED.** All 15 original advisories are either remediated, proven not reachable, or isolated to development tooling with explicit controls. No confirmed reachable vulnerability remains. Six advisory records remain installed and accepted under the narrow conditions above; the audit is intentionally not described as clean or as reporting zero vulnerabilities.

## Post-closure advisory-feed check — 2026-10-22

The production-readiness sprint changed no dependency declaration or lockfile. A fresh registry-backed `bun audit --json` reports 15 records: 0 critical, 6 high, 7 moderate, and 2 low. The original residual dispositions remain unchanged. The current feed retains four MCP SDK records and reports five Vite/launch-editor records:

| Package/path | New records | Reachability disposition |
|---|---:|---|
| `firebase-tools -> @modelcontextprotocol/sdk@1.31.0` and optional peer under `@google/genai` | 4 | `firebase-tools` is development/emulator tooling. Production AI code calls only `ai.models.generateContent`; it does not construct MCP servers, task handlers, HTTP transports, OAuth requests, or bearer-auth verifiers. The vulnerable operations are not invoked. |
| direct build dependency `vite@6.4.3` and its `launch-editor` development-server behavior | 5 | Vite is used to build or run a trusted local development server and is not imported by the deployed Express runtime. BBOS does not expose Vite custom middleware or editor-launch endpoints as deployed application routes and does not accept attacker-controlled editor commands/configuration. `DEV_TOOLING_ONLY`. |

This advisory-feed drift does not create a reachable production path and does not reopen the original S08 finding under its closure standard. The CI audit gate records the 15 reviewed advisory IDs and fails on every new or critical record. Engineering should accept supported Firebase CLI, Google GenAI, and Vite updates when compatible fixed releases are available and rerun the full matrix; no unplanned major or build-system upgrade was introduced.

## Post-closure remediation — 2026-10-23

The live advisory feed added moderate [GHSA-rxp7-6hxx-x8q5](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5) for `ip-address <=10.7.3`. BBOS installed `10.7.2` transitively through `firebase-tools -> @modelcontextprotocol/sdk -> express-rate-limit` and `firebase-tools -> proxy-agent -> socks`; these are development/emulator tooling paths, and no deployed BBOS route passes an attacker-controlled address to `Address6`. The compatible patched release `10.7.4` satisfies every existing dependent range, so the lockfile was upgraded from `10.7.2` to `10.7.4` without an override or framework change. The record is remediated rather than allowlisted, and the reviewed residual audit returns to 15 records: 0 critical, 6 high, 7 moderate, and 2 low.
