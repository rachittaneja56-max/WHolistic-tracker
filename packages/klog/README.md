# klog

Small CLI for posting quick captures into the Personal Dev KG backend.

## Usage

```bash
node packages/klog/index.mjs "learned why pgvector cosine distance matters" --type til --tags pgvector,embeddings
node packages/klog/index.mjs "fix graph layout bug" --type task --project personal-dev-kg
```

You can also install it locally as a bin:

```bash
npm install -g ./packages/klog
klog "capture from anywhere" --type note --tags quick-capture
```

## Environment

- `KLOG_API_URL` defaults to `http://localhost:8000`
- `KLOG_TOKEN` must match `CLI_CAPTURE_TOKEN` in `apps/api/.env`
