# BBOS Marketing Studio — MVP Product Specification

## Product outcome

Marketing employees can turn Booking Bridge-owned, rights-cleared raw media into branded short-form content, obtain Founder/Admin approval, export it, and prepare or schedule it for supported Instagram/Facebook accounts. BBOS retains immutable versions, rights evidence, approval/publication history, and basic performance attribution.

The MVP succeeds when this workflow is dependable and auditable. It does not attempt to match a professional desktop nonlinear editor.

## Personas and authority

| Persona | MVP authority |
|---|---|
| Marketing employee | Upload and organize assets in assigned scope; record rights information; create/edit projects; request AI drafts; render previews; submit for review; see aggregate performance. Cannot verify their own disputed rights, approve, connect accounts, publish, or read raw commercial/financial records. |
| Founder/Admin | All review actions; verify/override rights with recorded reason; approve/reject exact versions; connect/re-authorize supported social accounts; schedule/publish approved content; inspect audit and authorized analytics. |
| Marketing reviewer/manager | Not a current canonical role. Out of scope unless a separate RBAC decision introduces narrowly defined review/schedule permissions and tests. |
| Media worker | Reads only leased job inputs; validates/processes and writes controlled derivatives/results. No user authority or broad domain access. |
| Publishing adapter | Reads only due, approved publication jobs and exact derivatives; uses vault-held tokens; writes platform state/IDs. No approval or commercial-domain authority. |

## MVP scope

### Included

1. Private media library for video, photo, audio, logo and rights evidence.
2. Resumable upload, quarantine, validation, immutable original, checksums, duplicate signal, metadata, thumbnails and proxies.
3. Tags/search and complete rights/consent records with enforcement.
4. Versioned projects using constrained 9:16, 1:1 and 16:9 brand templates.
5. Trim, reorder, crop/reframe, logo/text overlays, simple color presets, cleared audio, volume/fades, subtitles, simple cut/crossfade and carousel assembly.
6. Local transcription draft and manual subtitle correction.
7. Grounded AI concepts, hooks, scripts, captions, hashtags, CTA and storyboard/variation suggestions.
8. Preview and final image/video export in approved profiles.
9. Exact-version Founder/Admin approval, rejection/revision, material-change invalidation and immutable audit.
10. Production-persisted calendar and mock publisher; direct Instagram/Facebook support only after separate API/account certification.
11. Publication results, platform IDs and basic reach/view/engagement/watch/spend facts when available.
12. Aggregate lead, qualified-lead and confirmed-booking attribution using existing source IDs, including an explicit unattributed bucket.

### Excluded or deferred

- Professional free-form multitrack nonlinear editing, arbitrary effects/plugins or user-authored render commands.
- Automatic publication without human approval.
- Automatic ad creation, budget changes, audience changes or advertising spend.
- Generative image/video production until model, cost, privacy, provenance and commercial-rights policy is approved.
- Advanced stabilization, object removal, masking, keyframing, speech dubbing, voice cloning, face replacement and automatic speaker reframing.
- Autonomous acceptance of AI facts or fabricated testimonials, prices, hotel claims, availability or KPIs.
- Postiz, Activepieces or OpenReelio runtime dependency in the MVP.
- Networks beyond approved Instagram/Facebook capabilities.
- Sembark integration until a supported interface and terms are verified.
- Raw booking, payment, supplier, margin, customer or personally identifiable data in Marketing views.
- Production deployment, live credentials/account connection and real publication as part of implementation without a separate approval.

## Functional requirements

### Media library

**M-01 Upload authorization.** An authenticated authorized user requests an upload session with declared file type, size and scope. The server enforces per-file/session/user limits and returns credentials valid only for the generated quarantine object and short time window.

**M-02 Resumability.** Video uploads tolerate network interruption and continue from a validated offset. Completion is reconciled server-side; the browser cannot mark an asset valid.

**M-03 Validation and promotion.** A worker verifies checksum, magic/type, container, stream/codecs, bytes, duration, dimensions, frame rate and configured safety limits. Passing objects are promoted to immutable originals; failing objects remain inaccessible and receive an actionable status.

**M-04 Derivatives.** The system creates at least one thumbnail and editing proxy per supported asset, with tool version, input checksum and output checksum. Derived failure can be retried without re-uploading the original.

**M-05 Duplicate signal.** A SHA-256 match warns or links duplicates. It must not merge rights records automatically because identical bytes can have different usage authority.

**M-06 Organization.** Users can search/filter authorized assets by text/tag, media type, orientation, date, owner/contributor and rights status. User-provided/embedded text is escaped.

**M-07 Rights.** Each usable asset has an auditable record covering ownership/source, contributor/subject consent where relevant, music/font/stock license, permitted channel and territory, validity, proof and restrictions. Policy defines which fields can be `not applicable`.

**M-08 Access and retention.** Originals and evidence are private; the API issues short-lived exact-object access after checking current permission. Retention, deletion and legal hold use server policy and audit events.

### Creative project and editing

**E-01 Project model.** A project references immutable asset versions and a versioned brand template. It stores a bounded declarative composition, purpose, destination profiles, copy, owner, revision and workflow state.

**E-02 Versioning.** Manual save/submission/render can create an immutable project version. Autosave uses optimistic concurrency and cannot overwrite another editor's later revision.

**E-03 Templates.** Initial profiles are 1080×1920 (9:16), 1080×1080 (1:1) and 1920×1080 (16:9), subject to current platform validation. Templates define safe zones, logo placement, fonts/colors, maximum text and allowed edits.

**E-04 Video operations.** Users can select asset clip ranges, split via ranges, reorder, choose focal crop, set simple cut/crossfade, add text/logo/subtitles, choose cleared audio, adjust gains/fades, and select bounded color presets.

**E-05 Photo/carousel operations.** Users can crop, resize, rotate, apply bounded exposure/color presets, place text/logo, order slides and export the selected profile.

**E-06 Preview.** The browser uses proxies for responsive preview and clearly labels quality. It loads only authorized assets. Final server output is authoritative.

**E-07 Export.** The worker generates a publication derivative and downloadable export with exact project version, input hashes, render schema/tool/build version, profile, timestamps and checksum. Automated media validation must pass before use.

**E-08 Fonts and audio.** Only approved, packaged fonts and rights-cleared audio can render. The project version records exact font/audio asset versions and rights snapshot.

### Transcription and AI assistance

**A-01 Transcription.** An authorized user can request local transcription for supported audio/video. Timestamped output is editable; corrections create a new transcript version without deleting the machine output.

**A-02 Tasks.** AI can propose concepts, hooks, scripts, captions, hashtags, calls to action, storyboards and variations for selected project/media and platform profiles.

**A-03 Grounding.** The server supplies only authorized transcript/metadata, brand facts and approved offer/claim records. The generated result links claims to source records or marks them unsupported.

**A-04 Restricted claims.** Price, availability, hotel/inclusion, customer testimony, rights and performance claims require a valid source and human review. AI cannot change these authoritative records.

**A-05 Provenance.** Store task, user, model/version, prompt-template version, source IDs/hashes, structured output, flags, timestamps and acceptance/edit outcome.

**A-06 Failure.** Provider timeout, parse error or policy refusal shows an honest error and creates no invented fallback output.

### Review and approval

**G-01 State transitions.** The server owns allowed transitions among `DRAFT`, `IN_REVIEW`, `REJECTED`, `APPROVED`, `SCHEDULED`, `PUBLISHING`, `PUBLISHED` and `FAILED`.

**G-02 Submission.** Submission captures an immutable content version, caption, target destinations/profiles, rights snapshot and unresolved claim warnings. Blocking issues prevent submission.

**G-03 Decision.** Founder/Admin approves or rejects with actor, timestamp and reason. Rejection preserves the reviewed version and creates a revision path.

**G-04 Material edits.** Changing visible/audible content, source versions, rights, caption/hashtags/CTA, claim, destination, template or policy-controlled schedule creates a new version and invalidates inherited approval.

**G-05 Separation.** The Marketing employee who creates/submits cannot approve under MVP policy. Server authorization applies even if UI controls are manipulated.

**G-06 Mobile review.** Supported mobile widths allow video/image preview, caption/claim/source and rights inspection, rejection reason and explicit approve/reject without hidden required data.

### Calendar and publishing

**P-01 Calendar.** Items persist server-side with explicit IANA timezone and UTC instant. The calendar displays draft/review/approved/scheduled/publishing/published/failed truthfully and supports filters.

**P-02 Capability check.** Before scheduling, the server verifies account connection, scopes, account/content capability, media profile, approval and rights. Unsupported combinations cannot be queued.

**P-03 Credential handling.** OAuth state and PKCE where supported are verified. Tokens remain server-side encrypted/vaulted. Connection metadata shows scopes/health/expiry without exposing tokens.

**P-04 Exactly-once intent.** A stable key for destination plus approved content version plus schedule identifies the intended post. Container/post state is reconciled after uncertain responses before replay.

**P-05 Processing.** The adapter supports required create/upload-reference, processing-status polling and publish steps. It records API version, request correlation, container/post IDs and timestamps.

**P-06 Retry.** Only classified transient failures retry with bounded backoff/jitter. Permission, invalid media, expired token and policy/rights failures stop and request intervention.

**P-07 Reauthorization.** Revocation or lost scopes changes connection health and blocks dependent jobs. Founder/Admin can reauthorize and audit a retry.

**P-08 Mockability.** All publication behavior has a deterministic mock contract used by CI and the demonstration. Tests never require a live Meta account.

### Analytics and attribution

**N-01 Publication metrics.** Append metric snapshots keyed to publication/platform IDs, definition, API version, time window and observed time.

**N-02 Attribution mapping.** Preserve mappings from project/content version to publication, campaign/ad/form/content IDs and current lead source fields.

**N-03 Aggregate boundary.** A server service returns permitted counts/rates and the specifically authorized financial contribution metric. Marketing cannot query or infer raw booking, payment, customer or supplier records.

**N-04 Honesty.** Reports separate direct, ambiguous/modelled and unattributed conversions, identify attribution window/rule and show freshness/missing data.

**N-05 Recommendations.** Creative comparisons state sample size and uncertainty and do not claim causal lift without an appropriate experiment.

## State and version rules

| Situation | Required behavior |
|---|---|
| Edit while `DRAFT` | Update working revision using optimistic concurrency; create immutable version at defined checkpoints. |
| Submit | Freeze the exact composition/copy/destinations and rights snapshot into a reviewable version. |
| Reject | Preserve version and decision; next edit produces a descendant version. |
| Approve | Approval references one immutable version/hash only. |
| Material edit after approval | Create new version and move workflow back to `DRAFT` or `IN_REVIEW` according to policy. |
| Schedule | Reference approved version and exact destination/timezone/instant. |
| Publishing starts | Recheck approval, rights, connection and derivative; lease job. |
| Publish succeeds | Record immutable platform IDs/result; later metric snapshots append. |
| Publish is uncertain | Reconcile platform state before retry; never assume failure means nothing was posted. |
| Rights revoked after publish | Block future use, flag affected scheduled items and follow takedown policy; retain audit history. |

## Conceptual API surface

Exact paths should follow existing Express conventions. All requests require Firebase authentication, server-side RBAC, schema validation, request/correlation IDs and auditable mutations.

| Capability | Example operations |
|---|---|
| Assets/uploads | create upload session; complete/reconcile; get/list asset; update tags; create rights record; issue scoped view URL |
| Projects | create/get/list; update working revision with expected revision; freeze version; request preview/final render |
| AI | request generation for enumerated task; get result/status; record accepted/edited/rejected outcome |
| Review | submit exact version; approve/reject; get audit/history |
| Jobs | get authorized status; cancel allowed queued job; audited operator retry |
| Connections | Founder/Admin OAuth start/callback/status/revoke/re-authorize |
| Calendar/publication | create/update schedule for approved version; cancel before dispatch; get/reconcile status |
| Analytics | publication metrics and authorized aggregate attribution by bounded filters/window |

No endpoint accepts a raw storage path, shell/render command, arbitrary remote URL, role, approval actor, platform success state, commercial total or tenant scope as trusted client authority.

## Non-functional requirements

### Security and privacy

- Private-by-default storage and least-privilege service identities.
- Cross-tenant/scope object isolation verified at API, Firestore rules and storage layer.
- Untrusted media sandbox and explicit resource limits.
- Secrets never enter client state, Firestore plaintext, analytics, render logs or error messages.
- Audit trails are append-only from normal application roles and retain version hashes.
- Personal/testimonial media goes only to approved processors under the defined data policy.
- Dependency pins, SBOM, license inventory, vulnerability response owner and reproducible worker build.

### Reliability

- Interactive BBOS remains responsive at configured render concurrency.
- Jobs are durable, lease-based, idempotent and recoverable after worker/process restart.
- Partial outputs cannot be treated as complete.
- Backups and tested restore cover metadata, projects, rights, audit and objects.
- Provider outages degrade to visible queued/failed states without invented success or duplicate publication.

### Performance and scale targets

Targets must be finalized from actual footage. Initial acceptance targets for the small workload are:

- metadata/list APIs: p95 under 1 second for typical bounded pages in the test environment;
- project autosave acknowledgement: p95 under 1 second excluding media transfer;
- upload progress/resume feedback: visible within 2 seconds of connection recovery;
- thumbnail/proxy progress: observable, with no request held open for processing;
- browser preview: responsive editing using proxies on the supported device/browser matrix;
- rendering: queued asynchronously with an explicit SLA derived from the benchmark corpus;
- no more than configured concurrent workers/jobs; overload queues rather than degrading core domains.

Codec, hardware, and source complexity strongly affect render latency, so the project must benchmark representative 1080p/4K phone footage before setting a production SLA.

### Accessibility and usability

- Keyboard-operable asset selection, canvas alternatives/property panels, form labels, visible focus and meaningful error text.
- Caption editing does not depend on canvas manipulation.
- Color contrast and status do not rely on color alone.
- Reviewer experience supports defined mobile viewports and low-bandwidth proxy playback.
- Destructive actions state affected versions/schedules and require the existing BBOS confirmation convention.

### Observability and cost control

- Correlation across upload, processing, project version, render, approval and publication.
- Metrics for queue age/depth, worker saturation/failure, processing minutes, stored/egressed bytes, AI tokens/cost, publication errors and token health.
- Configured quotas and alerts for upload bytes, retained bytes, render minutes, AI use and retry storms.
- Logs contain opaque IDs, error classes and safe metadata; no tokens, signed URLs, customer content or raw transcript by default.

## Release acceptance

The MVP is ready for a launch decision only when:

1. All applicable tests in [BBOS_MARKETING_STUDIO_ROADMAP.md](./BBOS_MARKETING_STUDIO_ROADMAP.md) pass with the synthetic corpus and mock publisher.
2. The full existing BBOS lint, unit, build, browser E2E, Firestore rules and Firebase E2E suites pass without weakened rules or domain access.
3. A hostile-media/resource test cannot disrupt interactive BBOS or access other objects.
4. Exact-version approval, material-change invalidation, rights expiry and exactly-once publication intent are demonstrated.
5. No screen or AI failure displays invented campaign, KPI, ROAS, testimonial, price, availability or publication success.
6. The worker artifact has a pinned manifest, SBOM, vulnerability review, licenses/notices and approved FFmpeg codec configuration.
7. Backup/restore and stuck-job/token-revocation runbooks are exercised.
8. Founder, Marketing, Accounts (for permitted financial metric), Engineering/Security and Legal (rights/OSS/codec matters) accept their recorded decisions.
9. Live Meta access, production deployment and advertising remain subject to distinct explicit authorization.

## Success measures after an approved launch

- share of published content created from assets with verified rights;
- median time from project creation to decision and from approval to publication;
- render/publication first-attempt and eventual success rates;
- percentage of jobs needing operator recovery;
- asset reuse and template reuse;
- proportion of leads/bookings directly, ambiguously and not attributed;
- agency spend avoided only when finance verifies a comparable service was actually replaced;
- creative performance reported with sample size and attribution limitations.

Success metrics must not reward bypassing review, rights checks, or truthful attribution.
