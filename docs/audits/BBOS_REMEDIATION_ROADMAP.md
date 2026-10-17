# BBOS remediation roadmap

Reviewed 2026-10-17. The current branch contains safe source repairs, not a production deployment. Findings and acceptance criteria below distinguish engineering work from decisions requiring approval.

## Immediate

1. **Close the remaining client Firestore boundary (S07, B06).** Map every direct Customer/Company/conversation/message/task/voucher/historical inventory consumer. Implement scoped APIs and explicit projections, migrate clients, then deny direct access. Preserve authorized workflows while moving the boundary. **Acceptance:** two-employee/two-team HTTP and emulator tests prove no cross-scope read/write; deactivation revokes both access paths; Operations cannot recover supplier costs from historical documents. **Effort:** L. **Dependency:** approved identity/data migration design.

2. **Resolve project/database topology (B05).** Select the canonical database explicitly for browser, Admin, rule/index deployment and migration utilities. Inventory existing records before proposing moves; do not copy production data speculatively. **Acceptance:** a named-database nonproduction fixture is read consistently by both adapters and authoritative identity resolves; configuration is validated at startup; reviewed rollback/data migration plan exists. **Effort:** M-L. **Hard stop:** production configuration/migration approval.

3. **Run the missing Firestore checks (A03; S02/S03/S09 release dependency).** Provide the compatible Java runtime, run `test:rules` and `test:e2e:firebase`, inspect transaction/index behavior and failures, then review rule deployment. **Acceptance:** all new negative/positive rule cases and real Firestore workflow cases execute and pass; no skipped case is reported as verified. **Effort:** S-M. No production credential is needed for the local checks.

4. **Triage and patch dependencies (S08).** Separate production-reachable packages from build/CLI chains, confirm advisory conditions, propose compatible patched versions and review lockfile changes. **Acceptance:** each advisory is fixed or has a documented reachability decision/owner; all practical tests plus Firebase tests pass; audit rerun recorded. **Effort:** M. **Hard stop:** upgrades with material behavior/migration risk need review.

5. **Define and implement financial exception workflows (A01).** Agree supplier acknowledgment semantics, material substitutions, date/guest/vehicle amendments, rejection, cancellation/refunds and commission attribution/settlement. **Acceptance:** approved state diagram and monetary examples; immutable before/after snapshots; correct authority and separation of duties; idempotent concurrent execution; no silent change to original sales credit. **Effort:** L. **Hard stop:** unresolved business rules, migrations and potentially irreversible financial effects.

## Next

| Work | Acceptance criteria | Effort / dependencies |
|---|---|---|
| Scalable financial/approval registries (A02, B04 residual) | >200 Bookings, >500 snapshots/inventory rates, >1,000 services and >2,000 payment fixtures produce complete paginated results or explicit bounded failure; no partial monetary total; overlap checks never silently miss conflicting rates | M-L; query/index design |
| CI and meaningful static checks (A03) | Pinned Bun/Java/browser toolchain, unit/HTTP/rules/typecheck/build on every change; browser smoke/full policy; real lint command; test types checked | M; CI platform choice |
| Stronger API schemas and projections (A05) | Malformed/null/array/oversized/nonfinite inputs give documented 4xx; safe error mapping; full allowlisted Trip projections; regression for unknown financial aliases | M; version public contracts where necessary |
| Correct AI tool contract (B10) | Response explicitly says validation-only or a real approved executor produces verified side effects, idempotency and audit; no false success | M; business/API design review |
| Frontend concurrency and accessibility (B08 residual, A06) | Delayed auth/data response tests across logout/user change; keyboard dialogs with Escape, Tab containment and return focus; named controls and error announcements; manual screen-reader review | M; reusable component scope |

## Later

- Split eager views and load scoped domain data on demand. Measure bundle size, initial reads, payload and p95 interaction latency before/after using representative data. Keep the dependency graph comprehensible.
- Extract DataContext and large Trip/Quote workflows by domain boundary with behavior-preserving tests. Avoid merging distinct Reservations/Sales/Operations authority just because code looks similar.
- Add backup/restore exercises, observability and provider deadline/retry tests in a controlled environment. Verify public-route rate limiting and deployment headers with the actual proxy configuration.
- Remove dead code only after static references, dynamic imports, route registration, scripts, tests and migration usage prove it unused. No dead files were deleted in this audit.

## Release/approval boundaries

The user explicitly required stopping before production migrations/configuration changes, destructive data operations, real production credentials, materially risky dependency upgrades, API breaks and ambiguous business-rule changes. Those items were investigated and recorded; no such operation was performed.

Source rule tightening, transaction changes and financial projection fixes need normal code review plus the missing emulator verification before deployment. Existing incomplete voucher records require reviewed reconciliation; the new service refuses to disguise them as a successful generation. A global supplier summary may now return 503 at its safety cap; individual settlement remains available. These are material release behaviors to communicate to operators.

The five immediate actions above are the highest-value remaining work. A passing demo/browser suite does not resolve their production dependencies.
