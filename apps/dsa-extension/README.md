# Personal Dev KG LeetCode extension

## Development

1. Run the API on `http://localhost:8000` and apply the latest Alembic migration.
2. Open `chrome://extensions` or `edge://extensions`, enable Developer mode, and choose **Load unpacked**.
3. Select this `apps/dsa-extension` directory.
4. In Personal Dev KG, open DSA practice → Connect → Generate pairing code.
5. Enter that code in the extension.

The development manifest permits LeetCode and localhost API origins only. The extension has no cookie permission. LeetCode GraphQL calls execute inside the active authenticated tab; only normalized problem records are sent to Personal Dev KG.

## Release

Generate a release directory with one fixed HTTPS SaaS API origin:

```powershell
$env:PDKG_API_ORIGIN=https://api.your-domain.example
npm run build:release
```

Load or package `apps/dsa-extension/release`. The build rejects non-HTTPS origins and replaces the example API host permission.

The importer uses a versioned persisted job and one-shot `chrome.alarms`. Manifest V3 worker suspension does not erase progress. The popup supports pause, resume, cancel, retry failed, safe diagnostics, reconnect, and forget connection.
## Tests

Run the response-contract and persisted job-state suite:

```powershell
npm test
```

Run the real Manifest V3 worker-stop/recovery test with Playwright Chromium:

```powershell
npx playwright install chromium
npm run test:e2e
```

The browser test explicitly stops the extension service worker through Chrome DevTools, wakes it from a trusted extension page, and verifies that the versioned job is rehydrated with its stale lease and in-flight batch cleared.