# Mobile PWA deployment

The installable app and operating-system share target require a secure HTTPS origin in production. The only exception browsers make is for local development on `localhost`; a phone opening a computer's LAN IP does not receive that exception.

## Production origins

Use stable HTTPS origins for all three services. For example:

```env
# apps/web/.env
VITE_API_URL=https://api.kg.example.com
VITE_AUTH_URL=https://auth.kg.example.com

# apps/api/.env
FRONTEND_ORIGIN=https://kg.example.com
API_PUBLIC_ORIGIN=https://api.kg.example.com
CORS_ORIGINS=https://kg.example.com
AUTH_JWKS_URL=https://auth.kg.example.com/api/auth/jwks
AUTH_JWT_ISSUER=https://auth.kg.example.com
AUTH_JWT_AUDIENCE=personal-dev-kg-api

# apps/auth/.env
NODE_ENV=production
BETTER_AUTH_URL=https://auth.kg.example.com
FRONTEND_ORIGIN=https://kg.example.com
AUTH_JWT_AUDIENCE=personal-dev-kg-api
ROOT_ADMIN_EMAIL=root-admin@example.com
AUTH_TRUST_PROXY_HOPS=1
AUTH_REQUIRE_EMAIL_VERIFICATION=true
AUTH_VERIFICATION_DELIVERY_URL=https://mailer.example.com/auth-events
AUTH_PASSWORD_RESET_DELIVERY_URL=https://mailer.example.com/auth-events
TURNSTILE_SITE_KEY=<cloudflare-turnstile-site-key>
TURNSTILE_SECRET_KEY=<cloudflare-turnstile-secret-key>
TURNSTILE_ALLOWED_HOSTNAMES=kg.example.com
```

Replace the example hosts and credentials with the deployment's real values. `VITE_*` values are build-time settings, so rebuild the web app after changing them. Keep the API audience and `ROOT_ADMIN_EMAIL` identical in the API and auth service. The delivery endpoint must accept both auth templates; protect it with `AUTH_VERIFICATION_DELIVERY_TOKEN` when appropriate.

## Hosting requirements

- Terminate TLS with a valid public certificate and redirect HTTP to HTTPS.
- Serve `index.html` for unknown frontend paths such as `/capture`, so PWA shortcuts, share targets, and login return URLs can open the SPA directly.
- Do not proxy or cache authenticated API and auth responses through the frontend service worker. The PWA caches only versioned frontend assets and the navigation shell.
- Send the generated manifest and service worker with their correct content types. Do not apply a long immutable cache lifetime to the service-worker script.
- Keep production Better Auth secure cookies enabled and allow credentials only from the configured frontend origin.

## Mobile verification

After deployment, install the app from a supported browser, launch the Today and Quick Capture shortcuts, and share a text snippet and URL into Personal Dev KG. If the platform does not expose web share targets, open Quick Capture from the app and paste the content normally.

Offline writes are intentionally unsupported. The UI may load its static shell without a connection, but it must not cache private API responses or queue captures on the device.
