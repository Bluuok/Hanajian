# Hanajian share-card worker

Cloudflare Worker + private R2 service for temporary WeChat report cards.

This is an experimental, self-hosted feature. See the complete Chinese deployment guide:

- `../../docs/deployment/experimental-wechat-share-card.md`

Required encrypted secrets:

- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `UPLOAD_TOKEN` (random 32+ character token also saved in Hanajian's secure settings)

The existing `wechatexplorer-*` Worker/R2 identifiers remain compatible. These commands require explicit deployment authorization; this repair does not run them.

Create the private bucket, set secrets, and deploy:

```bash
npx wrangler r2 bucket create wechatexplorer-share-reports
npx wrangler secret put WECHAT_APP_ID
npx wrangler secret put WECHAT_APP_SECRET
npx wrangler secret put UPLOAD_TOKEN
npx wrangler deploy
```

Keep the R2 public development URL disabled. All reads go through the Worker and expire with
the card.
