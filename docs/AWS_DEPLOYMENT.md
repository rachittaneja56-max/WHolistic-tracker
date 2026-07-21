# AWS deployment guide for Personal Dev KG

This guide is tailored to the current shape of this repo:

- `apps/web` is a static Vite + PWA frontend.
- `apps/api` is a long-running FastAPI service.
- `apps/auth` is a long-running Better Auth + Express service.
- PostgreSQL is required, and the first migration creates the `vector` extension.
- Redis is not a hard requirement for v1. The current app only checks Redis from the admin health endpoint and does not have a real background-worker system yet.

## Recommended AWS architecture

This is the setup I would start with on AWS for this project:

- Frontend: Amazon S3 + Amazon CloudFront
- API: Amazon ECS on AWS Fargate behind one shared Application Load Balancer
- Auth: Amazon ECS on AWS Fargate behind the same Application Load Balancer
- Database: Amazon RDS for PostgreSQL
- Secrets: AWS Secrets Manager
- Images: Amazon ECR
- DNS: Amazon Route 53
- TLS: AWS Certificate Manager
- Logs: Amazon CloudWatch Logs
- Optional later: Amazon ElastiCache for Redis, AWS WAF, Multi-AZ RDS

Why this fits the repo well:

- The frontend is a static SPA/PWA, so S3 + CloudFront is simpler and cheaper than running a web container.
- The API and auth services are ordinary HTTP services, so ECS Fargate is a clean fit.
- The database needs PostgreSQL and `pgvector`; Amazon RDS for PostgreSQL supports `pgvector`.
- The app already expects three public origins:
  - `https://kg.example.com`
  - `https://api.kg.example.com`
  - `https://auth.kg.example.com`

Relevant AWS docs used for this recommendation:

- ECS is a fully managed container orchestration service: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html
- ECS services on Fargate work well with Application Load Balancers, and ALBs support path-based rules: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-load-balancing.html
- RDS for PostgreSQL supports `pgvector`: https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-extensions.html
- CloudFront can restrict access to a private S3 origin with Origin Access Control (OAC): https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html
- Route 53 can alias your domain to CloudFront: https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-to-cloudfront-distribution.html
- CloudFront certificates from ACM must be in `us-east-1`: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html
- ECS can inject Secrets Manager values into container environment variables: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html
- ECS Exec is useful for one-off admin/bootstrap commands: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html

## Start with this footprint

For a small deployment, start here:

- One AWS region for the workload
- One public ALB
- Two ECS services behind it: `api` and `auth`
- One Single-AZ RDS PostgreSQL instance
- No ElastiCache initially
- No NAT gateway initially if you are cost-sensitive

Cost note:

- For small deployments, the fixed monthly costs are usually dominated by the ALB, RDS, and NAT gateway.
- If you want the cheaper first version, run the ECS tasks with public IPs but lock inbound traffic so only the ALB can reach them. Keep RDS private.
- If you want the cleaner network design, put ECS tasks in private subnets and add a NAT gateway.

## Region and domain strategy

Pick one workload region close to the people using the app most often.

Examples:

- If you are mostly in India: `ap-south-1` (Mumbai)
- If you are mostly in US East: `us-east-1` (N. Virginia)
- If you are mostly in Europe: choose the nearest major EU region

Important exception:

- Your CloudFront viewer certificate must be requested in `us-east-1`, even if the rest of the stack is elsewhere.

Use subdomains under the same apex domain:

- `kg.example.com` for the frontend
- `api.kg.example.com` for FastAPI
- `auth.kg.example.com` for Better Auth

This matches the current production env model already documented in [MOBILE_PWA.md](MOBILE_PWA.md).

## Repo-specific deployment decisions you should make first

### 1. Decide how you want embeddings to behave

Current code detail:

- `apps/api/app/services/embeddings.py` uses `EMBEDDING_BACKEND=auto` by default.
- In `auto` mode, the API only uses `sentence-transformers` if `EMBEDDING_MODEL_NAME` points to a local filesystem path that already exists.
- If it does not find a local model path, it falls back to deterministic hash embeddings.

That means on AWS, with the current defaults, you will probably get hash embeddings unless you deliberately bundle a local model into the image or change the embedding strategy.

Practical recommendation for v1:

- Start with `EMBEDDING_BACKEND=hash` unless you explicitly want to package a local model.
- Move to a packaged local model later if you want better semantic similarity.

### 2. Decide whether Redis is really needed now

Right now:

- Redis is present in local compose.
- The API admin health endpoint checks `127.0.0.1:6379`.
- There is no serious background job system yet.

Practical recommendation for v1:

- Do not deploy ElastiCache yet unless you are adding real Redis-backed features.
- Expect the current admin health endpoint to report Redis as missing unless you wire Redis in or adjust that code later.

### 3. Keep these two secrets stable

Do not casually rotate these after launch without a plan:

- `BETTER_AUTH_SECRET`
- `APP_ENCRYPTION_SECRET`

Why this matters:

- `BETTER_AUTH_SECRET` protects Better Auth internals, including JWKS private keys.
- If you change it later without clearing or rotating the stored JWKS correctly, auth starts failing with private-key decryption errors.
- `APP_ENCRYPTION_SECRET` protects per-user encrypted settings and integration credentials.

### 4. Remember that web env vars are build-time values

The frontend uses:

- `VITE_API_URL`
- `VITE_AUTH_URL`

These are baked into the built frontend. Changing them means rebuilding the web app and redeploying the static assets.

## AWS resource map

Use this mapping.

| Repo piece | AWS service | Notes |
|---|---|---|
| `apps/web` | S3 + CloudFront | Static SPA/PWA |
| `apps/api` | ECS Fargate service | Behind ALB target group |
| `apps/auth` | ECS Fargate service | Behind ALB target group |
| PostgreSQL | RDS PostgreSQL | Needs `vector` extension migration |
| Container images | ECR | One repo for API, one for auth |
| DNS | Route 53 | Alias to CloudFront and ALB |
| TLS | ACM | CloudFront cert in `us-east-1`; ALB cert in workload region |
| Secrets | Secrets Manager | Inject into ECS task definitions |
| Logs | CloudWatch Logs | One log group per service |

## Network layout

Recommended VPC layout:

- 2 public subnets across 2 AZs
- 2 private subnets across 2 AZs
- ALB in the public subnets
- RDS in the private subnets
- ECS tasks either:
  - private subnets with NAT gateway, or
  - public subnets with public IPs for the cheaper first version

Security groups:

- `alb-sg`
  - inbound: `80`, `443` from the internet
  - outbound: to ECS task SG
- `ecs-app-sg`
  - inbound: `8000` from `alb-sg` for API tasks
  - inbound: `3001` from `alb-sg` for auth tasks
  - outbound: `5432` to RDS SG and normal outbound internet where needed
- `rds-sg`
  - inbound: `5432` from `ecs-app-sg`

## Step-by-step deployment plan

### Step 1. Create DNS and certificates

Create or use a Route 53 hosted zone for your domain.

You will need:

- one ACM certificate in `us-east-1` for `kg.example.com` on CloudFront
- one ACM certificate in your workload region for `api.kg.example.com` and `auth.kg.example.com` on the ALB

Recommended names:

- `kg.example.com`
- `api.kg.example.com`
- `auth.kg.example.com`

### Step 2. Create RDS PostgreSQL

Use Amazon RDS for PostgreSQL.

Recommended first cut:

- PostgreSQL 16 or another current, supported major version that you standardize on
- Single-AZ for the first deployment if cost matters
- automated backups enabled
- encryption at rest enabled
- private subnets only

After the DB is up, migrations will create the `vector` extension with:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

This is already in [20260709_0001_phase0_foundation.py](../apps/api/alembic/versions/20260709_0001_phase0_foundation.py).

### Step 3. Create Secrets Manager secrets

Create Secrets Manager entries for the stable secrets and connection strings.

At minimum create values for:

- `BETTER_AUTH_SECRET`
- `APP_ENCRYPTION_SECRET`
- `AUTH_DATABASE_URL`
- `DATABASE_URL`
- `TURNSTILE_SECRET_KEY`
- `AUTH_VERIFICATION_DELIVERY_TOKEN` if the delivery endpoint requires authentication

You can store full connection strings as secret values. That is the simplest setup for this repo.

Example values:

```env
# auth service
AUTH_DATABASE_URL=postgresql://USER:PASSWORD@rds-endpoint:5432/personal_dev_kg?options=-c%20search_path%3Dauth%2Cpublic

# api service
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@rds-endpoint:5432/personal_dev_kg
```

Also decide on these plain env values:

```env
# web build
VITE_API_URL=https://api.kg.example.com
VITE_AUTH_URL=https://auth.kg.example.com

# api service
APP_ENV=production
FRONTEND_ORIGIN=https://kg.example.com
API_PUBLIC_ORIGIN=https://api.kg.example.com
CORS_ORIGINS=https://kg.example.com
AUTH_JWKS_URL=https://auth.kg.example.com/api/auth/jwks
AUTH_JWT_ISSUER=https://auth.kg.example.com
AUTH_JWT_AUDIENCE=personal-dev-kg-api
ROOT_ADMIN_EMAIL=root-admin@example.com
EMBEDDING_BACKEND=hash
GITHUB_INTEGRATION_ENABLED=false
WEB_SEARCH_ENABLED=false

# auth service
NODE_ENV=production
BETTER_AUTH_URL=https://auth.kg.example.com
FRONTEND_ORIGIN=https://kg.example.com
AUTH_JWT_AUDIENCE=personal-dev-kg-api
AUTH_PORT=3001
AUTH_TRUST_PROXY_HOPS=1
ROOT_ADMIN_EMAIL=root-admin@example.com
AUTH_REQUIRE_EMAIL_VERIFICATION=true
AUTH_VERIFICATION_DELIVERY_URL=https://mailer.example.com/auth-events
AUTH_PASSWORD_RESET_DELIVERY_URL=https://mailer.example.com/auth-events
TURNSTILE_SITE_KEY=<cloudflare-turnstile-site-key>
TURNSTILE_ALLOWED_HOSTNAMES=kg.example.com
```

Inject `TURNSTILE_SECRET_KEY` and, when used, `AUTH_VERIFICATION_DELIVERY_TOKEN` from Secrets Manager into the auth task. `ROOT_ADMIN_EMAIL` must be identical in the API and auth task definitions. The delivery endpoint must accept the `verify-email` and `reset-password` templates sent by the auth service.

### Step 4. Create ECR repositories

Create two ECR repos:

- `personal-dev-kg-api`
- `personal-dev-kg-auth`

The repo does not currently include Dockerfiles, so before ECS you will need to add them or build equivalent images in CI. If you want the repo to be AWS-ready, the next practical step is to add:

- `apps/api/Dockerfile`
- `apps/auth/Dockerfile`

### Step 5. Build and push container images

Build one image for the API and one for auth, then push them to ECR.

Important runtime note:

- Do not run Alembic migrations automatically in every API container start.
- Run migrations as a one-off ECS task before updating the API service.

### Step 6. Create the ECS cluster and task definitions

Create one ECS cluster.

Create two task definitions:

- `pdkg-api`
- `pdkg-auth`

Use Fargate launch type.

Use separate CloudWatch log groups:

- `/ecs/pdkg-api`
- `/ecs/pdkg-auth`

Inject secrets with Secrets Manager in the task definition. ECS supports exposing secret values as environment variables.

### Step 7. Create one shared ALB

Create one internet-facing Application Load Balancer.

Create two target groups:

- `pdkg-api-tg` on port `8000`
- `pdkg-auth-tg` on port `3001`

Use host-based routing rules on the HTTPS listener:

- host `api.kg.example.com` -> `pdkg-api-tg`
- host `auth.kg.example.com` -> `pdkg-auth-tg`

Health checks:

- API health path: `/health`
- Auth health path: `/health`

### Step 8. Run database migrations as a one-off ECS task

Before sending traffic to the API service, run:

```powershell
alembic upgrade head
```

Use the API image and the same database-related environment variables that the service will use.

Important note for this repo:

- Migration `20260714_0005_multi_user_auth` refuses to run if tenant tables already contain data.
- That is fine for a fresh AWS database.
- It becomes important only if you are trying to migrate an already-populated older database.

### Step 9. Start the auth service, then bootstrap the root admin

After the auth ECS service is healthy, create the root admin password.

The current repo already compiles `bootstrap-admin.ts` into `dist`, so the cleanest AWS way is:

1. Enable ECS Exec on the auth service.
2. Open an exec session into the running auth task.
3. Run:

```powershell
node dist/bootstrap-admin.js
```

That will prompt for:

- root admin display name
- root admin password
- confirmation

Use the reserved email:

- the root administrator configured through `ROOT_ADMIN_EMAIL`

### Step 10. Deploy the frontend to S3 + CloudFront

Build the web app with production origins:

```powershell
cd apps/web
$env:VITE_API_URL="https://api.kg.example.com"
$env:VITE_AUTH_URL="https://auth.kg.example.com"
npm ci
npm run build
```

Upload `dist/` to an S3 bucket that will be used only through CloudFront.

Recommended setup:

- keep the S3 bucket private
- attach CloudFront Origin Access Control (OAC)
- point CloudFront at the bucket origin
- do not use the old public S3 website endpoint for the main production deployment

SPA and PWA requirements for this repo:

- configure CloudFront so unknown routes return `index.html`
- preserve direct opens for routes like `/capture`, `/app`, `/agents/assistant`
- keep `sw.js` and `manifest.webmanifest` deployable without an overly aggressive immutable cache policy

After upload, create a Route 53 alias:

- `kg.example.com` -> CloudFront distribution

Also create aliases:

- `api.kg.example.com` -> ALB
- `auth.kg.example.com` -> ALB

### Step 11. Verify the production env wiring

These values must agree:

- frontend `VITE_AUTH_URL` = `https://auth.kg.example.com`
- frontend `VITE_API_URL` = `https://api.kg.example.com`
- API `AUTH_JWKS_URL` = `https://auth.kg.example.com/api/auth/jwks`
- API `AUTH_JWT_ISSUER` = `https://auth.kg.example.com`
- API and auth `AUTH_JWT_AUDIENCE` must match exactly
- API and auth `ROOT_ADMIN_EMAIL` must match exactly
- auth `FRONTEND_ORIGIN` = `https://kg.example.com`
- auth `AUTH_TRUST_PROXY_HOPS` must reflect the trusted proxy path (one hop for the recommended direct ALB setup)
- API `CORS_ORIGINS` must include `https://kg.example.com`

### Step 12. Configure GitHub webhooks if you need them

If you enable GitHub integration:

- set `API_PUBLIC_ORIGIN=https://api.kg.example.com`
- make sure GitHub can reach the API publicly
- configure GitHub repository webhooks to hit the URL shown in the app settings

## Recommended deployment order

Use this order every time you bring up a new environment:

1. Route 53 hosted zone and DNS plan
2. ACM certificates
3. VPC, subnets, security groups
4. RDS PostgreSQL
5. Secrets Manager secrets
6. ECR repos
7. Build and push auth/api images
8. ECS cluster, task definitions, ALB, and services
9. Run `alembic upgrade head`
10. Bootstrap the root admin in the auth service
11. Build the frontend with production `VITE_*` values
12. Upload frontend to S3 and attach CloudFront
13. Smoke test login, capture, admin, and direct-route refreshes

## Smoke tests after deployment

Run these checks immediately after the first deploy:

- `https://kg.example.com` loads the landing page or app shell
- direct open of `https://kg.example.com/capture` works
- `https://api.kg.example.com/health` returns healthy
- `https://auth.kg.example.com/health` returns healthy
- login succeeds from the frontend
- a capture can be created and saved
- admin page loads for the account configured through `ROOT_ADMIN_EMAIL`
- a browser refresh on a deep route still works
- the PWA manifest and service worker are served correctly

## Release-readiness gates

Before making the production workspace available beyond the intended test group:

- run `alembic upgrade head`, including the searchable-workspace migration;
- run the backend, web, auth, and extension test/build matrix plus public and authenticated visual QA;
- install the PWA over HTTPS, verify Home and Capture shortcuts, and share a text snippet into Capture;
- verify that authenticated API and auth responses are absent from service-worker caches;
- obtain product/legal approval for the exact copy published at `/privacy` and `/terms`.

The last item is an explicit launch gate. The application supplies the routes and draft copy, but deployment owners must replace or approve it for their jurisdiction, contact details, retention policy, and AI-provider disclosures.

## AWS-specific pitfalls for this repo

### Better Auth secret rotation can break JWKS

If `BETTER_AUTH_SECRET` changes after JWKS keys have been generated, auth can fail with private-key decryption errors. Treat that secret as stable.

### The auth service currently wants real client IP forwarding

The local warning from Better Auth about client IP detection is a signal that, in production behind ALB, you should configure trusted proxy or IP-header handling for Better Auth rate limiting. Without that, rate limiting may fall back to a shared bucket.

### Frontend env changes require a rebuild

Changing API or auth origins means rebuilding `apps/web` and redeploying the static assets.

### The current default embedding mode on AWS is likely not semantic

With the repo defaults, AWS deployments usually fall back to hash embeddings unless you package a local model path.

### Redis can show as missing without actually breaking the app

The admin health endpoint checks Redis locally, but the core product does not yet depend on a real Redis deployment.

### PWA deployment needs SPA fallback and correct cache behavior

CloudFront must serve `index.html` for unknown frontend routes, and the service-worker script should not be cached too aggressively.

## What I would do first on AWS for this project

If I were deploying this today for a personal or invite-only environment, I would do this:

- Region: one region close to me
- Frontend: S3 + CloudFront
- API + auth: ECS Fargate behind one ALB
- DB: RDS PostgreSQL Single-AZ
- Redis: skip for now
- Embeddings: start with `EMBEDDING_BACKEND=hash`
- Secrets: Secrets Manager
- DNS: Route 53
- TLS: ACM

That gives you a clean setup that matches the repo without pulling in EKS, Lambda, API Gateway, or a heavier platform than the app needs.

## Good next steps after this guide

If you want this repo to become immediately deployable on AWS, the next three changes I would make are:

1. Add production Dockerfiles for `apps/api` and `apps/auth`.
2. Add an AWS deployment checklist or Terraform/CDK skeleton.
3. Add proxy/IP trust settings for Better Auth and, if desired, cleaner production health reporting for Redis.
