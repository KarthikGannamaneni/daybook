# WhatsApp setup (Meta Cloud API, no BSP)

Roughly 30 minutes. Nothing here costs money: inbound messages are free, and
replies inside the 24-hour customer-service window are free until 30 September
2026, then billed at utility rates (fractions of a cent in India).

## 1. Create the Meta app

1. https://developers.facebook.com → **My Apps** → **Create App**.
2. Use case: **Other** → type: **Business** → name it (for example `Khata Dev`).
3. In the app dashboard, add the **WhatsApp** product.
4. Meta gives you a **test number** and a temporary token. Note the
   **Phone number ID** — that is `WHATSAPP_PHONE_NUMBER_ID`, not the phone
   number itself.

The free test number can message up to **5 recipient numbers**, which is enough
for development. Add yours under **API Setup → To**, and accept the confirmation
that arrives on that phone.

## 2. Collect the four secrets

| Variable | Where |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp → API Setup |
| `WHATSAPP_ACCESS_TOKEN` | See below — use a **permanent** token |
| `WHATSAPP_APP_SECRET` | App Settings → Basic → App Secret → Show |
| `WHATSAPP_VERIFY_TOKEN` | You invent it: `openssl rand -hex 16` |

The token on the API Setup page expires in 24 hours. For anything beyond a first
test, create a permanent one:

1. business.facebook.com → **Business Settings → Users → System Users** → Add.
2. Give it the **Admin** role, then **Add Assets** → your app → *Manage app*.
3. **Generate New Token** → select the app → scopes `whatsapp_business_messaging`
   and `whatsapp_business_management` → **no expiry**.
4. Store it; Meta shows it once.

## 3. Deploy the webhook

```bash
supabase functions deploy whatsapp-webhook
supabase secrets set \
  WHATSAPP_PHONE_NUMBER_ID=... \
  WHATSAPP_ACCESS_TOKEN=... \
  WHATSAPP_APP_SECRET=... \
  WHATSAPP_VERIFY_TOKEN=...
```

Do **not** set `MOCK_WHATSAPP` in production. Leaving it at `1` logs replies to
`whatsapp_messages` and never sends them, which looks exactly like a silent
outage.

The URL is:

```
https://<project-ref>.supabase.co/functions/v1/whatsapp-webhook
```

## 4. Point Meta at it

1. WhatsApp → **Configuration** → **Edit** next to Webhook.
2. Callback URL: the URL above. Verify token: your `WHATSAPP_VERIFY_TOKEN`.
3. **Verify and save.** Meta issues a `GET` with `hub.challenge`; the function
   echoes it when the token matches, and returns 403 when it does not.
4. Under **Webhook fields**, subscribe to **messages** only. Subscribing to
   `message_status` produces delivery callbacks the handler ignores, and noise
   in the logs.

## 5. Link a phone to a business

1. In the app: **Settings → WhatsApp → Get a linking code**.
2. Send those 6 characters from the phone you want to link to the business
   WhatsApp number.
3. The webhook matches the code, stores the sender's number in
   `whatsapp_links`, and replies once: `Linked. Send an entry like: 450 tea shop`.

Codes expire after 10 minutes and are single-use.

## 6. Check it works

Send `450 tea shop` from the linked number. Within a couple of seconds you get
exactly one reply:

```
Saved: ₹450 expense, Food & Tea, Cash. Today's total ₹1,230. Reply "undo" within 10 minutes to remove.
```

The full P0 command set:

| Send | Result |
|---|---|
| `450 tea shop` | Expense 450, note "tea shop", category predicted |
| `paid 12000 rent` | Expense 12000, category Rent |
| `got 5000 from ramesh` | Income 5000, party Ramesh |
| `+5000 ramesh` | Same |
| `450 tea shop bank` / `... upi` | Account override |
| `450 tea shop yesterday` / `... on 3 sep` | Date override |
| a photo with any caption above | Entry with the bill attached |
| `undo` | Removes your last WhatsApp entry from the past 10 minutes |
| `today` / `month` | A three-line summary |

Anything else gets one reply with an example. **Never two replies to one
message** — that is a hard rule, both for cost and for not being annoying.

## Local development

No Meta app needed:

```bash
supabase start
supabase functions serve --env-file supabase/.env --no-verify-jwt
curl -X POST http://localhost:3000/api/whatsapp/simulate \
  -H 'content-type: application/json' \
  -d '{"from":"+919999900001","body":"450 tea shop"}'
```

That route signs the payload exactly as Meta would and posts it to the local
webhook. It refuses to run unless `MOCK_WHATSAPP=1`, so it cannot exist in
production. With `MOCK_WHATSAPP=1` the reply is written to `whatsapp_messages`
instead of being sent:

```sql
select direction, body from whatsapp_messages order by created_at desc limit 4;
```

Twilio's WhatsApp sandbox also works for local testing if you prefer a real
phone in the loop; it is never used in production.

## Cost, and why there is exactly one reply

At 100 users making 10 entries a day, that is roughly 30,000 outbound messages a
month — low single-digit dollars at Indian utility rates. That number holds only
because the design refuses to add a greeting, a menu, or a second confirmation.
Adding one extra message per entry doubles the bill and buys nothing.

## When something is wrong

| Symptom | Likely cause |
|---|---|
| Meta will not verify the webhook | `WHATSAPP_VERIFY_TOKEN` differs between Meta and the function secrets |
| Every delivery 403s | `WHATSAPP_APP_SECRET` is wrong; the signature check fails before parsing |
| Entries save, no reply arrives | `MOCK_WHATSAPP=1` still set, or the access token expired |
| The same entry twice | Two different `wa_message_id`s — check whether the sender really sent twice |
| "This number is not linked" | Linking never completed, or the code expired |
| Replies stop after 24 hours of silence | Outside the customer-service window; a template message is required (P1) |
