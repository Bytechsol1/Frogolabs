# Live frontend + local NestJS through ngrok

## Verified configuration

- Local backend port: **3001**, from `backend/.env` (`PORT=3001`), the fallback in `backend/src/main.ts`, and the local listener. The Dockerfile's container port is separate.
- API prefix: `/api/v1`. The root API probe is `GET /api/v1`.
- Terra endpoint: **POST `/api/v1/terra/webhook`**, from `TerraController` and the global prefix.
- The webhook has no user JWT guard. It still requires `X-Terra-Signature`, validated against `TERRA_SIGNING_SECRET` over the original raw request body. Other protected API routes still require bearer tokens.
- Frontend API calls use relative `/api/v1/...` URLs. Next.js proxies `/api/*` and `/uploads/*` to the server-only `BACKEND_URL`. There is no need for a `NEXT_PUBLIC_*` API variable or server credentials in browser code.
- Authentication uses bearer tokens, not cookies. Backend CORS therefore does not enable credentials. `CORS_ORIGINS` is an exact-origin allowlist; development also permits `http://localhost:3000` and `http://127.0.0.1:3000`.
- NestJS trusts proxy headers only from loopback, where the local ngrok agent connects. Raw webhook bodies remain enabled.
- No Swagger setup or application callback/redirect URLs tied to localhost were found. Relative upload links continue through the frontend proxy. Patient portal share links use the frontend's current origin.
- Database URLs and all existing credentials are unchanged. **The current database is local PostgreSQL, not Supabase.** This setup does not migrate it to Supabase.

## One-time ngrok setup

If `ngrok` is not installed, use the [official Windows installation instructions](https://ngrok.com/download/windows?tab=install). Authenticate on your machine using your own ngrok account:

```powershell
ngrok config add-authtoken <YOUR_NGROK_AUTHTOKEN>
```

Keep that token local; do not put it in frontend environment variables or send it in chat.

## Terminal 1 — backend

From the repository root:

```powershell
cd E:\frigo-flow
npm run dev:backend
```

This runs NestJS in watch mode from the backend workspace and loads `backend/.env` before modules initialize. Local API: **http://localhost:3001/api/v1**.

Set this in `backend/.env`, substituting the exact live frontend origin, without a path:

```dotenv
CORS_ORIGINS=https://YOUR-LIVE-FRONTEND-HOST
```

Multiple origins can be comma-separated. Restart the backend after changing `.env`. Do not use a wildcard. The current live frontend origin was not present in the project configuration; old development tunnel domains were removed from source.

## Terminal 2 — public backend

```powershell
ngrok http 3001
```

Copy the **HTTPS forwarding origin** printed by ngrok, such as `https://YOUR-NGROK-HOST`. Keep both terminals and the machine running while demonstrating the app.

## Live frontend hosting environment

In the live frontend's hosting dashboard, set the server-side environment variable:

```dotenv
BACKEND_URL=https://YOUR-NGROK-HOST
```

Use the origin only, without `/api/v1`. **Rebuild/redeploy the frontend**: Next.js rewrites are resolved during build. Changing `frontend/.env.local` on this machine does not update an already deployed frontend.

For local frontend development, `frontend/.env.local` retains `BACKEND_URL=http://localhost:3001`. To test the tunnel locally, replace that value with the HTTPS origin and restart Next.js.

The frontend server adds `ngrok-skip-browser-warning` to API and upload requests so ngrok's browser interstitial does not replace JSON/PDF responses. This is an upstream request header, not a secret. See [ngrok's documented browser warning behavior](https://github.com/ngrok/ngrok-docs/blob/main/pricing-limits/free-plan-limits.mdx).

This architecture requires a Next.js server deployment with rewrites/proxy support, rather than a static HTML-only host. No temporary ngrok domain is committed to source. If the forwarding origin changes, update `BACKEND_URL`, rebuild/redeploy, and update Terra's webhook URL.

## Terra dashboard

Configure the webhook destination as:

```text
https://YOUR-NGROK-HOST/api/v1/terra/webhook
```

Terra must POST its signed JSON payload to this URL. Keep the existing Terra credentials and signing secret unchanged; the configured webhook must use the matching signing secret. A browser GET is not a valid webhook test. An unsigned POST should return **401**, not a login redirect.

## Verification after configuration

Local verification completed on 2026-09-28: both projects passed TypeScript checks; all 40 backend tests passed. Live local HTTP checks confirmed API 200, allowed/denied browser origins, bearer-authenticated login and profile reads through the Next.js proxy, unsigned/tampered webhook 401 responses, a valid signed no-op webhook, and a signed webhook reaching the real database lookup for a nonexistent order (404, without writing patient/order data). Frontend configuration checks confirmed environment-based API/upload rewrites and forwarding of the ngrok warning header while preserving Authorization. These checks do not constitute a real Terra delivery or verification of the deployed frontend.

1. Check local API: `curl.exe -i http://localhost:3001/api/v1` → 200.
2. Check tunnel: `curl.exe -i -H "ngrok-skip-browser-warning: true" https://YOUR-NGROK-HOST/api/v1` → 200.
3. Check CORS with your actual origin:

   ```powershell
   curl.exe -i -X OPTIONS "https://YOUR-NGROK-HOST/api/v1/auth/login" -H "Origin: https://YOUR-LIVE-FRONTEND-HOST" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type,authorization" -H "ngrok-skip-browser-warning: true"
   ```

   Expect 204 and `Access-Control-Allow-Origin` equal to your exact frontend origin, without `Access-Control-Allow-Credentials`.
4. Open the live frontend and sign in. Check that `/api/v1/auth/login` and an authenticated read succeed. The browser URL stays on the frontend; Next.js forwards the request to ngrok. The ngrok inspector at `http://127.0.0.1:4040` should show the backend request. Do not share captures containing tokens or patient data.
5. Send a genuine signed test delivery from Terra's dashboard for an existing linked test order. Confirm a 2xx response and verify that the expected order/report changes appear in the application/database. Repeating the same event should not create a duplicate report.

The intended paths are:

```text
Live browser → live Next.js /api proxy → ngrok HTTPS → local NestJS → configured Prisma database
Terra → ngrok HTTPS /api/v1/terra/webhook → HMAC verification → Prisma transaction
```

The database will be Supabase only if the backend is actually configured to connect to Supabase. Current local PostgreSQL checks must not be reported as Supabase verification. Real public end-to-end verification also needs a running authenticated ngrok tunnel, the actual live frontend URL/deployment, and a signed Terra delivery.
