# Back4App deployment

## App environment

Configure the following environment variables in the Back4App container settings:

- `FYERS_APP_ID`
- `FYERS_SECRET_ID`
- `FYERS_REDIRECT_URI` — the public app URL followed by `/auth/callback`
- `FYERS_NIFTY_SYMBOL` and `FYERS_SENSEX_SYMBOL` — optional symbol overrides
- `LEGEND_CAPTURE_TOKEN` — a strong random secret used to authorize capture uploads
- `DATABASE_URL` — optional PostgreSQL connection string for history that must survive container restarts

Register the exact `FYERS_REDIRECT_URI` in the FYERS developer settings. Keep all secrets in Back4App environment settings; do not commit them or paste them in chat. Without `DATABASE_URL`, local JSON persistence is not guaranteed to survive a container restart.

## Capture FYERS orderflow without a VPS

1. Install `scripts/violentmonkey-fyers-capture.user.js` in Violentmonkey on the desktop browser that can access the logged-in FYERS chart.
2. In the userscript menu, choose **Set hosted dashboard URL** and enter the public HTTPS URL of the Back4App app (not the Back4App management dashboard URL).
3. Choose **Set Legend capture token** and enter the same `LEGEND_CAPTURE_TOKEN` configured in Back4App.
4. Open the FYERS Order Flow page, select a NIFTY or SENSEX futures contract, and set its footprint timeframe to five minutes. Keep that chart tab open while capturing.

The userscript sends compact, changed-only footprint/profile responses directly to the Back4App app. Other footprint timeframes are ignored. No separate VPS, Telegram bot, or local Node capture process is needed. The dashboard's read-only baseline/pullback inputs are available under **Detailed market read**.

The capture token authorizes writes to the capture endpoint. Anyone who can access Violentmonkey storage can use it to submit capture data; rotate the token in Back4App and update the Violentmonkey menu value if it is exposed. The script observes FYERS page `fetch` and `XMLHttpRequest` responses; if FYERS changes its chart transport, capture may need updating.
