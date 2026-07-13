# Personal Dev KG DSA extension

1. Run the API on `http://localhost:8000` and apply the latest Alembic migration.
2. Open `chrome://extensions` or `edge://extensions`, enable Developer mode, and choose **Load unpacked**.
3. Select this `apps/dsa-extension` directory.
4. In Personal Dev KG, open DSA Tracker → Connect → Generate pairing code.
5. Enter that code in the extension while the API origin is `http://localhost:8000`.

The extension has no cookie permission. LeetCode GraphQL calls execute inside the active, authenticated LeetCode tab; only normalized problem records are sent to Personal Dev KG.
