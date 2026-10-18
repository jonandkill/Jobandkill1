# Deployment handoff

Verified on 2026-10-18:

- Mobile PWA and six-image gallery ordering merged with the idempotent ingestion API.
- 27 local/mock tests passed. No live Instagram requests were made.
- Local HTTP process started via `start.py`; health, secure session cookie, authenticated API restriction, and PWA manifest checks passed.
- `render.yaml` validated against the JSON Schema downloaded from `https://render.com/schema/render.yaml.json`.
- Validation above is local JSON Schema validation, not a Render server-side deployment validation.

Prepared production configuration:

- One Python process in Singapore, compute plan `0.5c-512mb`.
- One 1GB persistent disk mounted at `/var/data`.
- `ENABLE_LIVE_PUBLISH=false`; no account or access token is bundled.
- Automatic publishing schedule: 12:00 and 19:00, Asia/Seoul; maximum two carousels per day.
- New service uses a separate Git branch; existing services are unchanged.

Remaining before operation:

1. Authorize new recurring hosting costs and create the service with its disk.
2. Set the administrator password in Render's private environment settings.
3. Configure the owner's Meta app credentials and the actual HTTPS OAuth callback.
4. Connect and verify the intended Instagram professional account.
5. Connect the trusted content producer to the ingestion API, then enable publishing.

This repository contains deployable code. It does not establish that a service is live or that an Instagram post was published.
