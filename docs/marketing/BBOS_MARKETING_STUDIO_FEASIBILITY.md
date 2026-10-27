# BBOS Marketing Studio — Feasibility Audit

**Audit date:** 2026-10-23

**Branch:** `audit/bbos-comprehensive-remediation`

**Verified baseline:** `2deeddc55d7ab225c97f36812e8862e1f5de6356`
**Decision:** **FEASIBLE**, through a staged, BBOS-owned workflow built from focused open-source components. A wholesale third-party marketing suite or a full nonlinear editor is not justified for the first release.

This is a research and architecture decision. It does not authorize deployment, production Firebase access, Meta account connection, publication, or advertising spend. The audit preserves the existing React/TypeScript/Vite, Express/Bun, Firestore, Firebase Auth, and RBAC design.

## Executive decision

The smallest credible product is a secure media library, a constrained template editor, an isolated render worker, an approval/versioning workflow, and a direct Meta publishing adapter. BBOS should remain the system of record for approval, permissions, publication history, and attribution.

The recommended open-source core is:

| Need | Component | Decision |
|---|---|---|
| Upload UI | Uppy | Integrate with a BBOS-authorized resumable object-storage flow |
| Image processing | Sharp/libvips | Integrate in the media worker |
| Video rendering | FFmpeg | Integrate as an isolated worker binary with a controlled build |
| Media inspection | MediaInfoLib and FFprobe | Integrate before processing and publication |
| Transcription | whisper.cpp | Integrate in the worker for local transcription |
| Template canvas | Konva | Integrate for browser preview and editable overlays |
| Editing concepts/runtime research | Diffusion Studio | Adapt selected ideas after a proof of concept; do not embed its Electron/SolidJS application |
| Social publishing | Direct Instagram/Facebook adapters | Develop for BBOS first; defer Postiz until multiple networks justify its operational and AGPL cost |

The product must not present generated facts as real performance or commercial claims. Current canned strategy and KPI fallbacks must be removed before users rely on Marketing Studio output.

## Current BBOS capability assessment

| Area | Classification | Evidence and implication |
|---|---|---|
| Marketing navigation and routes | IMPLEMENTED AND VERIFIED | Marketing Strategy, Content Calendar, Campaigns, and Marketing AI are routed in `src/App.tsx` and exposed in navigation. |
| Marketing role boundary | IMPLEMENTED AND VERIFIED | A canonical Marketing role and permissions exist. Tests deny raw booking, quote, trip, payment, and supplier-cost access while allowing aggregate attribution reads. |
| AI HTTP boundary | PARTIALLY IMPLEMENTED | The Express endpoint is role-gated and calls Gemini, but error handling returns canned plans and invented KPI/marketing claims. This cannot be treated as reliable production output. |
| Marketing Strategy | UI PLACEHOLDER | The screen displays hard-coded seasonal strategies and demo pillars. It is not a persisted, evidence-backed planning workflow. |
| Content Calendar | PARTIALLY IMPLEMENTED | The UI creates scheduled/pending items, but production persistence, approval wiring, publication, and recovery are absent. Demo mode uses local storage. |
| Campaign dashboard | UI PLACEHOLDER | Production campaign data begins empty, while fallback ROAS and active-campaign text can imply activity that did not occur. |
| Generated copy | PARTIALLY IMPLEMENTED | A model interface exists, but the client appends canned ad copy, captions, and visual prompts. Claims are not grounded in approved offer or media records. |
| Tool gateway descriptors | PARTIALLY IMPLEMENTED | `marketing.createContentDraft`, `meta.createCampaign`, and `social.publishPost` are authorization descriptors, not executing integrations. |
| Media upload and storage | NOT IMPLEMENTED | No secure Marketing media ingest, resumable upload, object lifecycle, proxy, rights, or render pipeline exists. |
| Video/photo editor | NOT IMPLEMENTED | No timeline/template editor, project model, preview renderer, or export worker exists. |
| Social publishing | NOT IMPLEMENTED | No OAuth connection store, Meta container creation/status polling, publish adapter, idempotency, or platform synchronization exists. |
| Lead attribution fields | PARTIALLY IMPLEMENTED | Leads support `sourceReference`, `campaignId`, `formId`, `adId`, and `contentId`; there is no Marketing-facing aggregate attribution service. |
| Sembark integration | NOT IMPLEMENTED | No Sembark implementation was found in the audited source. |
| Campaign profitability | BLOCKED | The policy allows aggregate attribution, but a service that safely joins platform, lead, booking, and authorized financial data has not been built. |
| Marketing-specific tests | PARTIALLY IMPLEMENTED | RBAC/tool-access and financial-isolation coverage exists. Media, editing, approval, rendering, publication, and analytics tests do not. |

Existing RBAC and lead-source fields should be retained. The current screens are useful prototypes, but none constitutes a production Marketing Studio workflow.

## Target business workflow

### A. Media ingestion

1. A Marketing employee requests an upload session from BBOS.
2. BBOS checks role, file count, declared type, quota, and project/asset ownership, then issues a narrowly scoped resumable upload target.
3. The client uploads directly to an object-store quarantine prefix. No video binary enters Firestore or traverses the interactive Express process.
4. A worker verifies magic bytes, allowed container/codecs, size, duration, dimensions, and decompression/resource limits. It calculates a content hash, extracts metadata, and optionally scans for malware.
5. Valid media is copied to an immutable original key. The worker creates thumbnails, low-resolution proxies, waveform data where needed, and a transcription job.
6. The employee adds searchable tags and a rights record: owner, contributor/consent, music/source license, channels, territory, expiry, proof, and restrictions.
7. Unknown, expired, or insufficient rights block render and publication.

Retention must distinguish immutable originals, working proxies, renders, failed/quarantined uploads, and audit metadata. Administrators define retention and legal-hold rules before production.

### B. AI creative planning

AI receives only authorized metadata, transcripts, selected approved assets, brand guidance, and an approved-offer/claim registry. It may propose concepts, Kashmir destination stories, scripts, hooks, storyboards, captions, hashtags, calls to action, variants, and aspect ratios.

Every output stores model/version, input record references, prompt-template version, creation time, and safety/claim flags. Prices, availability, hotel features, customer testimony, and performance claims require evidence and human confirmation. A model or network failure returns an explicit failure; it never substitutes fabricated content.

### C. Video production

The MVP uses a versioned JSON composition rather than a general-purpose nonlinear editor. Users select clips, trim and reorder them, set 9:16/1:1/16:9 output, position text/logo overlays, choose cleared music, adjust simple volume/color/crop settings, and edit subtitles. Konva supplies the interactive preview; the server validates composition data. FFmpeg generates previews and final exports in an isolated worker.

Native open-source capabilities cover decoding/encoding, trim/concat, scaling/cropping, overlays, audio normalization, subtitles, simple transitions, thumbnails, and metadata. Scene selection, semantic rough cuts, speaker-aware reframing, stabilization policy, brand-sensitive layouts, claim verification, and creative ranking require BBOS logic or later model work.

### D. Photo and carousel production

Konva supplies editable positioning and typography. Sharp performs trusted server exports, crop/resize/rotate, color adjustments, format conversion, compositing, and thumbnails. Projects store editable layers and immutable versions. Carousels enforce platform dimensions and slide order.

### E. Human approval

The canonical lifecycle is:

`DRAFT → IN_REVIEW → APPROVED → SCHEDULED → PUBLISHING → PUBLISHED`

Rejection returns the item to `REJECTED`; operational errors enter `FAILED` with a retry classification. A Marketing employee creates and submits. Founder/Admin approves initially. If BBOS later adds a Marketing Manager role, it must receive explicit reviewer permissions rather than inheriting broad commercial access.

Approval binds the exact content version, rights snapshot, caption, destination accounts, and schedule. Any material edit creates a new version and invalidates the approval. All transitions record actor, timestamp, reason, source/target state, request ID, and relevant immutable hashes.

### F. Social publishing

The first adapter should target official Instagram and Facebook APIs. Instagram publishing applies to professional accounts; the Facebook Login route requires a linked Facebook Page, while Stories have narrower account support. Required permissions and review depend on the selected login/API path and features. BBOS must verify current Meta prerequisites during implementation rather than treating account types as interchangeable.

OAuth authorization happens server-side. Tokens are encrypted at rest, never returned to the browser, scoped minimally, and tracked for expiry/revocation. The adapter creates media containers from short-lived, controlled public/signed media URLs, polls processing status, publishes once, records Meta IDs, and synchronizes results. An idempotency key based on account, approved content version, and schedule prevents duplicate posts. Only transient errors retry; permission, rights, validation, and expired-token failures require intervention.

Postiz is credible for a later multi-network requirement, but it brings PostgreSQL, Redis, Temporal, provider-app setup, an additional security boundary, and AGPL obligations. If adopted, run it as an isolated scheduler receiving only approved publication jobs. BBOS remains the approval and audit authority.

### G. Analytics and improvement

The data model maps `contentVersionId → publicationId/platformPostId → campaign/ad/content IDs → lead attribution fields`. Scheduled snapshots store platform reach, views, engagement, and watch-time metrics when available. An authorized aggregate service joins qualified leads, confirmed bookings, Meta spend, and contribution metrics without exposing raw booking, supplier, payment, or customer data to Marketing.

Reports distinguish direct, modeled/ambiguous, and unattributed conversions. They expose data windows, currency, metric source, freshness, and missing data. Recommendations must include sample size and confidence limitations.

## Integration and custom-development decisions

Reusable software substantially lowers media-processing work, but the following remain BBOS-specific:

- asset, rights, consent, retention, and access-control records;
- the constrained project/composition schema and brand templates;
- server validation and project/version conflict handling;
- AI grounding, claim checks, prompt provenance, and review flags;
- approval, scheduling, publication audit, and material-change rules;
- OAuth connection ownership and direct Meta adapter;
- lead/booking/profitability aggregation within existing RBAC;
- secure job leasing, quotas, observability, and operator recovery;
- migration of current placeholder screens to truthful states.

## Financial feasibility

These are planning estimates in USD, excluding tax, exchange rates, support, backups, logging, CDN, build minutes, music/stock licensing, Meta advertising, human review, and Meta App Review. Google prices vary by region and product configuration and must be checked in the billing calculator before approval.

### Workload assumptions

| Assumption | Small initial use | Larger multi-employee use |
|---|---:|---:|
| Active users | 2 | 10 |
| New original media/month | 100 GiB | 1 TiB |
| Average retained storage | 300 GiB | 5 TiB |
| Internet egress/month | 50 GiB | 500 GiB |
| Source minutes processed/month | 200 | 3,000 |
| Final short videos/month | 40 | 400 |
| Gemini input/output tokens/month | 1M / 0.25M | 10M / 3M |

### Illustrative variable cost

| Cost | Unit assumption | Small | Larger | Qualification |
|---|---:|---:|---:|---|
| Standard object storage | Mumbai Standard about $0.022/GiB-month | $6.60 | $112.64 | Based on published hourly regional storage price; operations and replicas excluded. |
| Internet egress | illustrative $0.12/GiB to Asia | $6.00 | $60.00 | Actual destination/tier/CDN changes this. Internal Google transfer rules differ. |
| CPU render workload | 4 vCPU, 2 GiB, elapsed render 1.5× source | $1.37 list | $20.52 list | Cloud Run list-rate illustration before eligible free tier. Larger estimate is about $15.30 after the cited monthly free tier if eligible. Real codec speed may vary by an order of magnitude. |
| Gemini 2.5 Flash text | $0.15/M input, $1.25/M output | $0.46 | $5.25 | Existing model family; excludes media generation and cached/batch variations. |
| Gemini 2.5 Flash-Lite text | $0.10/M input, $0.40/M output | $0.20 | $2.20 | An option for low-risk drafting after quality evaluation. |
| whisper.cpp | No transcription API fee | worker compute | worker compute | Model storage, CPU/GPU time, and operations remain payable. |

FFmpeg, Sharp, MediaInfoLib, whisper.cpp, Konva, and Uppy have no per-use license fee under their audited open-source licenses. Compute, storage, monitoring, security maintenance, and people are still costs. Generative image/video models are intentionally outside this estimate because no provider/model, quality bar, or rights policy has been approved.

Postiz or Activepieces self-hosting would add persistent databases, queues, backups, patching, and incident response. Their cost cannot be credibly priced until workload, availability, and hosting choices are fixed.

## Delivery complexity

| Milestone | Engineering estimate |
|---|---:|
| Truthful current UI/fallback cleanup and schema decisions | 1–2 weeks |
| Secure media library, rights records, upload/proxy pipeline | 3–5 weeks |
| Project/template editor | 5–8 weeks |
| Isolated render/transcription worker | 4–6 weeks |
| Grounded AI planning and claim controls | 2–3 weeks |
| Versioned approval/audit workflow | 3–4 weeks |
| Direct Meta adapter | 4–7 weeks plus external review time |
| Analytics and attribution aggregates | 3–5 weeks |
| Hardening, accessibility, load, and recovery testing | 3–5 weeks |

The MVP is approximately **24–36 engineering weeks**. A two-engineer team with part-time design/QA is roughly **14–20 calendar weeks**, excluding Meta review, legal/licensing decisions, and procurement. This is a directional estimate, not a delivery commitment.

## Main risks and controls

| Risk | Control/gate |
|---|---|
| Malicious or pathological media | Quarantine, magic-byte validation, bounded decode, non-root sandbox, no public inbound access, limits on size/duration/frames/memory/CPU/time, controlled codecs, optional malware scan. |
| Codec/license/patent exposure | Pin the FFmpeg build, retain notices/source offer where required, avoid `--enable-nonfree`, document enabled libraries, and obtain legal review for distribution and target codecs/territories. |
| AI fabrication | Ground on approved records, classify sensitive claims, require citations/review, record provenance, and fail visibly. |
| Rights violations | Rights ledger and expiry/channel checks as render/publish gates; retain proof and approval snapshot. |
| Duplicate publication | Transactional outbox/job record, stable idempotency key, Meta status reconciliation, and operator-visible recovery. |
| Token compromise | Encrypted server-side secrets, least scopes, rotation/revocation, strict logs, no browser/token export. |
| Render workload destabilizes BBOS | Separate worker deployment, queues/leases, quotas, backpressure, and no FFmpeg execution in the interactive API. |
| Misleading attribution | Explicit attribution classes, freshness/data-window labels, unattributed bucket, and restricted aggregate service. |
| Third-party suite burden | Use focused libraries first; require architecture, license, security, and operational gates before adopting Postiz or Activepieces. |

## Remaining decisions and unknowns

1. Confirm Meta account types, Page linkage, Business verification, app ownership, and the exact Instagram/Facebook API login path.
2. Decide whether Founder/Admin alone approves the MVP or whether to add a narrowly scoped Marketing Reviewer/Manager permission.
3. Approve media retention, deletion, legal hold, geographic storage, backup, and recovery requirements.
4. Inventory consent, influencer, testimonial, music, font, logo, hotel, and destination media rights; choose authoritative evidence fields.
5. Decide target export codecs/resolutions, expected concurrency, maximum source size/duration, and acceptable render latency.
6. Define approved offer/price/availability sources and claim owners.
7. Define attribution windows and the authorized contribution metric exposed to Marketing.
8. Confirm whether Sembark offers an API/export/webhook and its data-processing terms; no integration exists today.
9. Have counsel review FFmpeg build choices and any future MPL/AGPL/GPL deployment or distribution model.

## Primary sources

- [Meta Instagram API official collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)
- [Meta Instagram content publishing documentation](https://developers.facebook.com/docs/instagram-platform/content-publishing/)
- [Google Cloud Storage pricing](https://cloud.google.com/storage/pricing)
- [Google Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Cloud Storage resumable uploads](https://cloud.google.com/storage/docs/resumable-uploads)
- [Cloud Storage signed URLs](https://cloud.google.com/storage/docs/access-control/signed-urls)
- [Firebase Storage web uploads](https://firebase.google.com/docs/storage/web/upload-files)
- [FFmpeg legal and license guidance](https://ffmpeg.org/legal.html)

Repository pins and licensing evidence are recorded in [BBOS_OPEN_SOURCE_COMPONENT_MATRIX.md](./BBOS_OPEN_SOURCE_COMPONENT_MATRIX.md).
