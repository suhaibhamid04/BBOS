# BBOS Marketing Studio — Delivery Roadmap

## Delivery principles

Each milestone must be independently reviewable, feature-flagged, and tested with synthetic data. Production credentials, live Meta connections, publishing, and deployment remain separate approvals. Existing Booking, Sales, Reservations, Operations, Accounts, finance policy, quotation/booking snapshots, and production-readiness safeguards are regression gates.

Estimates are engineering effort ranges, not calendar commitments. Parallel work is allowed only where schemas and security boundaries have been agreed.

## Phased implementation

### Milestone 0 — Truth and safety baseline (1–2 engineering weeks)

**Deliverables**

- Replace invented campaign/ROAS/active-campaign fallbacks with honest empty/error states.
- Remove canned factual marketing results on AI failure; expose a retryable failure with correlation ID.
- Inventory current Marketing routes, flags and API schemas in tests.
- Decide canonical role/reviewer permissions, initial storage region, retention owner and environment separation.
- Record architecture decisions for media schema, FFmpeg licensing/build and project composition.

**Exit gate:** No Marketing screen presents synthetic metrics, persisted content, or successful AI output as real. Existing regression suite passes.

### Milestone 1 — Secure Media Library and Rights Foundation (3–5 weeks)

**Deliverables**

- Media asset/version and rights/consent metadata schemas.
- Uppy-based resumable direct upload using narrowly scoped, server-authorized sessions.
- Private quarantine/original/proxy/thumbnail/rights-evidence storage layout.
- MediaInfo/FFprobe/Sharp validation, SHA-256 duplicate signal, thumbnails and image/video proxies in an isolated worker.
- Search/filter by tag, type, owner, rights status and creation date.
- RBAC and storage boundary tests; quotas, retention states and audit events.

**Exit gate:** Employees can safely upload synthetic media, see processed proxies, record rights and find assets. Invalid or unauthorized files never become usable assets.

This is the recommended first implementation milestone because every later editing, AI, approval and publishing feature depends on trusted, rights-cleared media.

### Milestone 2 — Versioned Project and Template Editor (5–8 weeks)

**Deliverables**

- Versioned project/composition JSON schema and optimistic concurrency.
- Konva-based browser preview for clips/images, crop/focal point, logo, text, color preset, audio and subtitles.
- 9:16 Reel/Story, 1:1 post/carousel and 16:9 export templates with safe zones.
- Sharp-backed authoritative photo/carousel export.
- Save, reload, duplicate, autosave conflict and immutable-version behavior.
- Time-boxed Diffusion Studio compatibility spike; adopt only selected modules that pass React/browser, render-equivalence, license and security gates.

**Exit gate:** A user can create and reopen an editable project from approved asset versions, and server output matches the composition within defined tolerances.

### Milestone 3 — Video Render and Transcription Worker (4–6 weeks)

**Deliverables**

- Durable Firestore job leasing, heartbeat, idempotency, backoff, cancellation and operator recovery.
- Pinned, reproducible FFmpeg/MediaInfo/Sharp/whisper.cpp worker image with SBOM and license notices.
- Proxy, preview and final render profiles; subtitles, audio normalization and output validation.
- Resource quotas, sandboxing, hostile-media corpus tests, observability and dead-letter workflow.
- Downloadable exports and immutable render provenance.

**Exit gate:** Deterministic render retries do not duplicate outputs; malformed or resource-exhausting media cannot destabilize BBOS services.

### Milestone 4 — Grounded Creative AI (2–3 weeks)

**Deliverables**

- Versioned prompt schemas for concept, hook, script, storyboard, caption, hashtag and CTA variants.
- Retrieval from authorized transcripts, media metadata, brand facts and approved offer/claim records.
- Claim-to-source mapping and flags for testimonial, hotel, price, availability and performance assertions.
- Model/data provenance, cost/latency logging, redaction and visible failure states.
- Human edit/accept/reject feedback without representing it as autonomous learning.

**Exit gate:** Every sensitive claim is supported or clearly marked unsupported, and injected/transcript content cannot override system policy or access other records.

### Milestone 5 — Review, Approval and Calendar (3–4 weeks)

**Deliverables**

- `DRAFT`, `IN_REVIEW`, `REJECTED`, `APPROVED`, `SCHEDULED`, `PUBLISHING`, `PUBLISHED`, and `FAILED` transitions.
- Exact-version approval, material-change invalidation, rights revalidation and immutable audit events.
- Founder/Admin review UI optimized for desktop and mobile; annotated rejection reasons.
- Calendar backed by production persistence, timezone-aware scheduling, conflicts and honest state.
- Mock publisher/outbox for complete workflow tests.

**Exit gate:** No employee can approve/publish their own draft under MVP policy, no changed version inherits approval, and every transition is attributable and replay-safe.

### Milestone 6 — Direct Meta Publishing (4–7 engineering weeks plus external review)

**Deliverables**

- Confirmed Meta account/API path and current capability/permission matrix.
- Server-only OAuth/token-vault flow, reauthorization and account health.
- Instagram/Facebook image, video/Reel and carousel adapters only where the selected accounts support them; Story support is separately gated.
- Container-status polling, idempotency, bounded retry, webhook verification, reconciliation and platform-ID history.
- A mock Meta contract suite and non-production app/account certification before any production approval.

**Exit gate:** Supported formats publish exactly once in a controlled non-production environment, uncertain failures reconcile safely, and revoked credentials halt jobs without data leakage.

Postiz is reconsidered only after this milestone if additional networks are approved and a measured build-versus-operate analysis, AGPL review and security assessment favor it.

### Milestone 7 — Hardening and operational readiness (3–5 weeks)

**Deliverables**

- Accessibility, responsive review, load/backpressure, restore, chaos/failure and security testing.
- Runbooks for stuck upload/render/publication, token expiry, rights revocation, takedown, rollback and data deletion.
- Dashboards/alerts and storage/render/AI budget controls.
- Dependency/SBOM/license update process and owner assignment.
- User training and a launch checklist that still requires explicit deployment and live-account authorization.

**Exit gate:** Recovery tests and cross-domain regression pass; owners accept residual risk and operating cost.

## Parallel workstream — Advertising intelligence and profitability (3–5 weeks after data contracts)

This work can begin after publication identifiers and attribution semantics are fixed, without blocking editor construction.

1. Define canonical mappings for project/content version, publication, Meta campaign/ad/form and existing lead source fields.
2. Confirm whether Sembark has a supported API, webhook or export. Treat it as unavailable until verified.
3. Build append-oriented platform metric snapshots with definitions, API version, window and freshness.
4. Implement a server-side aggregate join to qualified leads and confirmed bookings.
5. Have Accounts/Founder define the permitted contribution metric and currency handling.
6. Report direct, ambiguous/modelled and unattributed conversions separately.
7. Add creative comparisons only above minimum sample sizes and state uncertainty; do not imply causality.

The workstream must preserve current Marketing isolation from raw booking, payment, supplier and customer data.

## Acceptance test catalogue

### Upload, processing and secure access

| ID | Test | Measurable result |
|---|---|---|
| MED-01 | Resume an interrupted large upload | Upload continues from a verified offset and creates one asset version/checksum. |
| MED-02 | Client lies about MIME/extension | Server detection rejects or classifies by content; object remains quarantined. |
| MED-03 | Oversize, excessive-duration/resolution/stream-count and malformed corpus | Each is rejected or bounded within configured CPU, memory, disk and time; API health is unaffected. |
| MED-04 | Duplicate bytes uploaded under another filename | Same content hash is detected; policy links or flags it without discarding distinct rights metadata. |
| MED-05 | Employee requests another scope's object/signed URL | API/storage denies access and records a security audit event without revealing existence/path. |
| MED-06 | Successful processing | Original remains immutable; checksum, metadata, thumbnail and proxy references are present and verifiable. |
| MED-07 | Storage URL expires | Access fails after expiry; issuing a new URL rechecks current permission. |
| MED-08 | Worker crashes mid-job | Lease expires and recovery produces one verified logical result without orphaning a usable partial. |

### Rights and consent

| ID | Test | Measurable result |
|---|---|---|
| RGT-01 | Asset has missing/unknown consent or music license | Review/render/publication is blocked with an actionable reason. |
| RGT-02 | Rights expire between approval and publish | Due job fails closed before platform submission and alerts an authorized reviewer. |
| RGT-03 | Rights limited by channel/territory | Disallowed destination is blocked; allowed destination remains available. |
| RGT-04 | Rights evidence changes | New snapshot/version is audited; an approval bound to materially changed rights is invalidated. |

### Project, video and photo editing

| ID | Test | Measurable result |
|---|---|---|
| EDT-01 | Create, save, close and reload project | Composition, layer order, trims, text, fonts, colors and referenced immutable asset versions round-trip exactly. |
| EDT-02 | Two clients edit same revision | Stale save returns a conflict; no newer data is silently overwritten. |
| EDT-03 | Trim/reorder/crop/overlay/subtitle/audio template | Preview and final export meet defined time, geometry, safe-zone, audio and text tolerances. |
| EDT-04 | 9:16, 1:1 and 16:9 profiles | Outputs have exact dimensions, allowed codec/container, expected duration and no missing audio/video stream. |
| EDT-05 | Photo crop/color/logo/text/carousel | Server export matches schema and slide order, preserves no forbidden metadata, and passes dimensions/size constraints. |
| EDT-06 | Retry identical render | Same normalized input maps to one logical output/provenance; no duplicate billing/job side effect. |
| EDT-07 | Unsupported effect/remote URL/command fragment in composition | Schema validation rejects it before worker execution. |

### Transcription and AI

| ID | Test | Measurable result |
|---|---|---|
| AI-01 | Synthetic speech with known transcript | Word/timestamp accuracy meets the agreed threshold; user can correct text and corrected version persists. |
| AI-02 | Generate hooks/scripts/captions from approved facts | Structured result stores model, prompt-template, source IDs/hashes and flags all sensitive claims. |
| AI-03 | Prompt injection in transcript/metadata | It cannot change tool permissions, read unrelated data, publish, approve, or hide unsupported claims. |
| AI-04 | Missing price/availability/testimonial evidence | Output omits the fact or labels it unsupported; it never fabricates it. |
| AI-05 | Provider timeout/error/schema failure | User sees an honest failure; no canned strategy, KPI or claim is presented as generated fact. |
| AI-06 | Unauthorized asset selected | Server denies the generation before model invocation and does not leak metadata. |

### Approval, RBAC and audit

| ID | Test | Measurable result |
|---|---|---|
| GOV-01 | Marketing employee submits a draft then attempts approval | Submission succeeds; self-approval is denied by server policy. |
| GOV-02 | Founder approves exact version | Approval records actor, time, reason/context, version hash, rights snapshot and destinations. |
| GOV-03 | Material edit after approval | A new immutable version is created and prior approval cannot authorize it. |
| GOV-04 | Rejected draft revised | Rejection reason remains immutable; new version can be resubmitted. |
| GOV-05 | Marketing queries raw booking/payment/supplier/customer data | Access remains denied; aggregate report contains no row-level sensitive data. |
| GOV-06 | Audit record tamper/delete attempt | Denied; append-only event remains queryable by authorized auditors. |
| GOV-07 | Mobile review at supported viewport | Reviewer can preview, inspect rights/claims, approve/reject and read errors without horizontal loss or inaccessible controls. |

### Publishing and calendar

| ID | Test | Measurable result |
|---|---|---|
| PUB-01 | Schedule in non-default timezone across DST/offset cases | Stored instant and displayed local time match the user's explicit zone. |
| PUB-02 | Worker retries after timeout following uncertain publish | Adapter reconciles container/post state before retry and produces at most one platform post. |
| PUB-03 | Token revoked or required scope missing | Connection becomes `REAUTH_REQUIRED`; no dependent job submits; secret is absent from logs/UI. |
| PUB-04 | Permanent media/account validation error | Job becomes `FAILED` without automatic loop; message and remediation are audited. |
| PUB-05 | Transient rate/5xx response | Bounded jittered retry honors provider guidance and preserves idempotency. |
| PUB-06 | Webhook with bad signature or replay | Request is rejected; no publication state changes. |
| PUB-07 | Platform confirms publication | Platform container/post IDs, API version, approved content version and timestamps are retained. |
| PUB-08 | Unsupported account/content combination | Capability check prevents scheduling and explains the account prerequisite. |

### Attribution and reporting

| ID | Test | Measurable result |
|---|---|---|
| ATT-01 | Publication IDs flow to lead source fields | Aggregate report traces the synthetic directly attributed lead to its content version. |
| ATT-02 | Lead lacks or conflicts on source | It appears in ambiguous/unattributed counts, never silently assigned. |
| ATT-03 | Confirmed booking and permitted contribution fixture | Correct aggregate appears with currency, metric definition, attribution window and freshness; Marketing cannot open raw record. |
| ATT-04 | Late metric/booking correction | Recomputed report reflects source history and retains calculation version. |
| ATT-05 | Insufficient sample | Creative recommendation states insufficient evidence and does not claim a winner. |

### Regression and operations

| ID | Test | Measurable result |
|---|---|---|
| OPS-01 | Concurrent rendering at configured quota | Backpressure keeps interactive API latency/error budget within the agreed threshold. |
| OPS-02 | Restore metadata and objects from test backup | Projects, versions, rights, audits and object checksums reconcile; secrets follow reauthorization policy. |
| OPS-03 | Dependency/container scan | No unaccepted critical/high reachable issue; SBOM and licenses match pinned build. |
| OPS-04 | Existing full BBOS suite | Lint, unit, build, browser E2E, Firestore rules and Firebase E2E remain green. |

## Synthetic end-to-end demonstration

Use assets created specifically for testing: a short generated landscape clip, a synthetic voice track, a geometric logo, a licensed test music tone, staged testimonial text explicitly labelled fictional, and fake offer data. Use Firebase emulators or an isolated non-production project and a mock Meta server.

1. Sign in as Marketing and resumably upload media; interrupt and resume one file.
2. Show quarantine, validation, checksum, thumbnail, proxy, transcript and complete rights record.
3. Generate three hooks and captions from the fake offer; demonstrate unsupported-claim flagging and manual correction.
4. Create a 15-second 9:16 project, trim/reorder clips, add logo, subtitles and cleared audio, then save/reload.
5. Render a preview and final output; inspect output metadata and provenance.
6. Submit to Founder. Reject once with a reason, revise, and approve the new exact version.
7. Schedule to the mock platform. Inject a timeout after container creation; demonstrate reconciliation and exactly-once publication.
8. Ingest synthetic reach/spend/lead/booking events and show direct plus unattributed reporting without exposing raw financial records.
9. Display the complete immutable audit history and verify a Marketing user cannot approve, access another scope's asset, or view raw commercial data.

No real customer, influencer, hotel, account token, Meta account, price, booking, or advertising spend is used.

## Decision gates

| Gate | Owner(s) | Needed before |
|---|---|---|
| Retention, rights/consent and takedown policy | Founder/Legal/Marketing | Milestone 1 completion |
| Storage region, security and budget | Engineering/Founder | Milestone 1 implementation |
| FFmpeg build/codecs and OSS compliance | Engineering/Legal | Worker artifact approval |
| Reviewer role/material-change policy | Founder/Engineering | Milestone 5 |
| Meta app/account/path/scopes and review | Founder/Marketing/Engineering | Milestone 6 |
| Approved claims/offers and AI data handling | Marketing/Founder/Engineering | Milestone 4 |
| Attribution window/contribution metric | Founder/Accounts/Marketing | Analytics workstream |
| Sembark interface and terms | Founder/Engineering | Sembark-related attribution |

## Next Codex implementation prompt outline

The first implementation prompt should be narrow and stop after Milestone 0 plus the Milestone 1 design foundation:

```markdown
# BBOS MARKETING STUDIO — MILESTONE 0/1A

Continue on `audit/bbos-comprehensive-remediation` from the verified current HEAD.
Read all five `docs/marketing/BBOS_*` audit documents first. Preserve the intentional
local `firebase-applet-config.json` change. Do not deploy, connect production Firebase
or Meta, publish, or spend money.

Objectives:
1. Remove misleading Marketing UI and AI fallback data. Empty and failure states must
   be explicit; never emit invented campaigns, ROAS, KPIs, prices, availability,
   testimonials, or marketing facts.
2. Add server-validated domain schemas/interfaces for media assets, immutable asset
   versions, rights/consent, upload sessions, derived objects, and durable media jobs.
3. Add authorization policy and tests for Marketing upload/read/edit/submit and
   Founder/Admin rights verification, preserving existing denial of raw commercial data.
4. Add a storage adapter interface and fake/emulator implementation only. Do not add
   production credentials or deployment configuration.
5. Add a worker contract and deterministic job state/idempotency tests. Do not yet
   install or invoke FFmpeg.

Before edits, verify branch, HEAD, worktree and applicable repository instructions.
Use the repository's current patterns. Add no binary media. Do not modify A01, B05,
finance authorization, booking/quotation snapshots, or existing Firestore safeguards.

Acceptance:
- Existing BBOS lint/unit/build/E2E/rules/Firebase E2E suites pass.
- New tests prove cross-scope denial, immutable version semantics, rights-blocking,
  upload-session constraints, lease recovery, idempotency, honest empty/error states,
  and no raw commercial-data exposure.
- Firestore rules are not weakened.
- Update audit documentation with exact implemented versus deferred scope.

Return: verified baseline; current findings; schemas and boundaries added; misleading
fallbacks removed; tests; full regression results; files changed; risks/decisions;
Milestone 0/1A status. Stop before worker binaries, real object storage, Meta, or deploy.
```

After this foundation is reviewed, a separate prompt should implement the emulator-backed upload path and isolated processing proof of concept with the pinned component/build review. Keeping those changes separate makes schema and authorization decisions reviewable before native media dependencies enter the repository.
