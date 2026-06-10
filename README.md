# n8n-nodes-klaaro

Community n8n node for the [Klaaro](https://klaaro.ai) document extraction API.

## Installation

### Community nodes (recommended)

In n8n, go to **Settings → Community nodes**, install `n8n-nodes-klaaro`.

### Manual install

```bash
cd ~/.n8n/custom
npm install n8n-nodes-klaaro
```

Restart n8n after installing.

## Credentials

Create a **Klaaro** credential with your API key (`sk_...`). Obtain keys from the Klaaro dashboard under **Team → API keys**.

The credential injects `Authorization: Bearer <API_KEY>` on every request.

## Nodes

### Klaaro (action node)

| Resource | Operation | Description |
|----------|-----------|-------------|
| Document | Upload | Upload a file or URL; optionally wait for extraction and return records |
| Document | Get | Get a document by ID |
| Document | List | List documents with filters |
| Document | Delete | Delete a document |
| Document | Get Records | Get extracted records for a document (clean / flat / nested) |
| Dataset | List | List datasets |
| Dataset | Get | Get a dataset by ID |
| Dataset | Get Records | List dataset records with filters |
| Dataset | Get Classes | List classes in a dataset |
| Dataset | Get Class | Get a class by slug |
| Dataset | Get Approval Queue | List approval queue items |
| Record | Get | Get a record (clean / flat / nested) |
| Record | Get Field Events | List field change events |
| Record | Get Comments | List record comments |
| Record | Get Approvals | List approval events |

**Upload and wait:** enable **Wait Until Done** to poll until the document completes, then optionally attach extracted records in the same output item.

### Klaaro Trigger

Starts a workflow when Klaaro sends webhook events. On activation, the node registers a webhook via the Klaaro API and removes it on deactivation.

Supported events:

- `document.ocr_completed`
- `document.extraction_completed`
- `document.failed`
- `document.uploaded`
- `record.updated`
- `record.approved`
- `evaluation.completed`

When Klaaro returns a `signingSecret` at webhook creation, incoming deliveries are verified with `X-Docs2DB-Signature`.

**Test mode:** click **Listen for test event** on the trigger node before triggering events in Klaaro. The listener stays open for about 2 minutes.

## Local development

### Prerequisites

- Node.js 18+
- A local n8n instance (`npm install -g n8n` or a cloned [n8n](https://github.com/n8n-io/n8n) repo)
- A Klaaro API key for credential testing

### 1. Clone and build

```bash
git clone <repo-url> klaaro-n8n
cd klaaro-n8n
npm install
npm run build
```

### 2. Publish the package locally

From the `klaaro-n8n` directory:

```bash
npm link
```

### 3. Link into n8n

n8n loads community nodes from `~/.n8n/custom/`. Create that directory if it does not exist:

```bash
mkdir -p ~/.n8n/custom
cd ~/.n8n/custom
npm init -y   # only needed on first setup
npm link n8n-nodes-klaaro
```

If your n8n install uses a custom extensions path, link the package there instead (set via `N8N_CUSTOM_EXTENSIONS`).

### 4. Start n8n

```bash
n8n start
```

Open n8n in the browser and search for **Klaaro** in the node panel.

### 5. Iterate on changes

In one terminal, watch TypeScript:

```bash
cd klaaro-n8n
npm run watch
```

After each change, copy icons if you edited SVG/PNG assets:

```bash
npm run build
```

Restart n8n (or set `N8N_DEV_RELOAD=true` when running n8n from source) to pick up credential or node definition changes.

### Scripts

| Command        | Description                          |
|----------------|--------------------------------------|
| `npm run build`  | Compile TS and copy icons to `dist/` |
| `npm run watch`  | Recompile TS on file changes         |
| `npm run lint`   | Run ESLint (n8n community rules)     |
| `npm run lintfix`| Auto-fix lint issues                 |

### Troubleshooting

- **Node not visible** — confirm `npm link n8n-nodes-klaaro` ran inside `~/.n8n/custom`, then restart n8n.
- **Stale build** — run `npm run build` in `klaaro-n8n` before restarting n8n.
- **Credential test fails** — verify the API key has `read` scope and targets `https://klaaro.ai/api/v1`.

## API base URL

Production default: `https://klaaro.ai/api/v1`.

For local dev, set before starting n8n:

```bash
export KLAARO_API_BASE=http://localhost:3000/api/v1
```

## License

MIT
