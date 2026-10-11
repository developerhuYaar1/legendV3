# Flowdesk market dashboard

A read-only FYERS dashboard for NIFTY and SENSEX futures. It does not place orders.

## Run locally

1. Install Node.js 20 or newer and run `npm ci`.
2. Copy `.env.example` to `.env` and configure the FYERS credentials. Set `DATABASE_URL` for durable history; without it, the app stores history as local JSON under `data/`.
3. Set the FYERS redirect URL to `http://localhost:3000/auth/callback` in both `.env` and the FYERS developer app.
4. Run `npm start` and open `http://localhost:3000`.

## Deploy to Back4App

Follow [`BACK4APP_DEPLOYMENT.md`](./BACK4APP_DEPLOYMENT.md). Configure `DATABASE_URL` if history must survive container restarts.

## Deploy to Render

Create a new Render Blueprint from this repository and use `render.yaml`. Set the FYERS credentials, the Render app URL followed by `/auth/callback` as `FYERS_REDIRECT_URI`, a strong `LEGEND_CAPTURE_TOKEN`, and a PostgreSQL `DATABASE_URL` in Render's environment settings. Register the exact redirect URL in the FYERS developer settings. Persistent order-flow history requires PostgreSQL because Render's free web service filesystem is ephemeral.

## Captured data

Price and session OHLC come from the FYERS market feed. Delta, CVD, value-area analysis, and footprint summaries use actual FYERS Order Flow Bid/Ask captures; the dashboard does not estimate buy/sell volume. The volume-profile chart is not displayed.

Use **Footprint Range Input** under **Detailed market read** to save a five-minute baseline and compare a pullback by entering IST time ranges. A saved baseline highlights strong buyer and seller price areas using captured footprint volume and delta. Pullback comparison reports in-zone volume/delta and marks an area held or broken only after two completed 5-minute closes beyond its edge. This is a rule-based footprint read, not a guarantee. Baselines are isolated per instrument and browser, and expire after a server restart or 12 hours.

## Tests

Run `npm test`.
