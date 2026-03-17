## Slack audit + PR-only workflow

### Environment variables (Railway)
- **AUDIT_WEBHOOK_URL**: Slack Incoming Webhook URL (secret)
- **GITHUB_WEBHOOK_SECRET**: secret used to verify GitHub webhook signatures (secret)
- **RAILWAY_WEBHOOK_SECRET**: optional shared secret for `/api/webhooks/railway` (secret)
- **ADMIN_TOKEN**: required to call `/api/audit/test` (secret)

### Webhook endpoints (hosted on Railway)
- **GitHub**: `POST /api/webhooks/github`
  - Configure in GitHub repo settings → Webhooks:
    - Content type: `application/json`
    - Secret: `GITHUB_WEBHOOK_SECRET`
    - Events: Pull requests, Check runs (optional), Push (optional)
- **Railway (optional)**: `POST /api/webhooks/railway`
  - Must include header `x-webhook-secret: <RAILWAY_WEBHOOK_SECRET>`

### Test the Slack audit wiring
Call the protected endpoint:

```bash
curl -X POST "$BASE_URL/api/audit/test" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"audit.test","resource":"chscanner"}'
```

### Enforce PR-only on GitHub
In GitHub repo settings → Branches → Branch protection rules for `main`:
- Require a pull request before merging
- (Recommended) Require status checks to pass before merging
- Restrict who can push to matching branches

