# Free Render deployment

Tracer AI deploys as one Render Free web service. Express serves both the `/api/v1` API and the compiled Vite client so authentication cookies remain same-origin.

## External free services

- Render Free web service: application runtime and TLS.
- MongoDB Atlas Free cluster: durable application data. Use the `tracer_ai` database in the connection string.
- Cloudinary Free plan: resume upload staging.
- Resend Free plan: verification and password-reset email.
- YouTube Data API quota: video discovery.
- AICredits or another configured OpenAI-compatible provider: AI generation. This provider must have available credits.

Redis remains disabled for this synchronous MVP deployment. The application stays queue-ready, but no free Redis dependency is required.

## Before deployment

1. Run `npm run check` and push only after GitHub Actions passes.
2. Rotate every credential that has previously been shared in chat, logs, screenshots, or committed files.
3. Ensure the Atlas connection string selects the `tracer_ai` database.
4. Allow the Render service to reach Atlas. For an MVP, Atlas can temporarily allow `0.0.0.0/0` only when the database user has a strong rotated password. Restrict the allowlist when stable outbound addresses are available.
5. Verify the Resend sender used by `EMAIL_FROM`.
6. Confirm that all three configured AI model IDs are listed by the selected gateway and that the account has credits.

## Create the service

1. In Render, choose **New > Blueprint**.
2. Connect the GitHub repository containing this `render.yaml`.
3. Keep the instance type set to **Free**.
4. Supply every value that Render prompts for. Never paste local `.env` wholesale; add only the production variables declared with `sync: false`.
5. Wait for the build, migrations, startup validation, and readiness health check to complete.

The Blueprint uses:

- Build command: `npm ci && npm run build`
- Start command: `npm run start:production`
- Health check: `/api/v1/health/ready`
- Production API base URL: `/api/v1`

The production start command runs all idempotent MongoDB index migrations before starting Express. Repeated starts do not duplicate migrations.

## Required secrets

- `MONGODB_URI`
- `AICREDITS_API_KEY`
- `AI_MODEL_FAST`
- `AI_MODEL_CORE`
- `AI_MODEL_ESCALATION`
- `YOUTUBE_API_KEY`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `JWT_PRIVATE_KEY_BASE64`
- `JWT_PUBLIC_KEY_BASE64`
- `RESEND_API_KEY`
- `EMAIL_FROM`

`GITHUB_TOKEN` is recommended but optional. Render generates `TOKEN_HASH_SECRET` and `CSRF_SECRET` securely during initial Blueprint creation.

## Release verification

Verify in this order:

1. `GET /api/v1/health/live` returns HTTP 200.
2. `GET /api/v1/health/ready` returns HTTP 200 and MongoDB reports `ready`.
3. Open `/` and hard-refresh a client route such as `/login`.
4. Create an account and complete email verification.
5. Log out and log back in.
6. Generate one small Quick Mode roadmap.
7. Open the generated roadmap from **My Roadmaps**.
8. Upload one PDF and confirm Cloudinary temporary cleanup.
9. Confirm YouTube resources render when suitable candidates exist.
10. Delete the test roadmap and verify its related recent activity is removed.

If a release fails its health check, inspect the first fatal startup log. Do not bypass startup validation. Fix the missing or invalid dependency and redeploy the same commit.

## Free-tier constraints

The Render Free service sleeps after inactivity and can take about one minute to wake. Its filesystem is ephemeral, so no user data or uploads may be stored locally. Atlas and Cloudinary remain the durable stores. Free-tier quotas and service restarts mean this configuration is suitable for an MVP demonstration, not an availability-guaranteed production launch.
