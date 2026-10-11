# Farmstand — Self-Hosted Farm Stand & Pre-Order Drops

A self-hosted replacement for Hotplate built for small makers, home bakers, farm stands, and CSA operators. Designed to run on Unraid or any Docker host with zero open router ports via Cloudflare Tunnels.

---

## Features

- **Weekly Pre-Order Drops**: Configure order windows (e.g., Monday–Wednesday) and multiple pickup slots (e.g., Friday 2–6 PM, Saturday 9 AM–1 PM) with per-drop batch quantity limits.
- **Farmstand Honor Box Kiosk (`/farmstand`)**: Walk-up customers scan a QR code at your stand, choose what they took from live extra inventory, and pay instantly without creating an account.
- **Three Payment Methods for Both Drops & Farmstand**:
  1. **Stripe**: Embedded checkout directly on page (Card, Apple Pay, Google Pay).
  2. **Venmo**: Pre-filled deep link (`venmo.com/...`) with order total and Order ID note.
  3. **PayPal.me**: Pre-filled link (`paypal.me/...`) with pre-calculated amount.
- **Automated & Manual Order Confirmation**:
  - Stripe payments automatically mark orders as `PAID` via webhook and decrement inventory.
  - Venmo / PayPal orders enter an `Awaiting Confirmation` state in the Admin Dashboard with a one-click "Confirm Payment Received" button.
- **Notifications via n8n, SMS Gate & SMTP**: an importable n8n workflow sends order confirmations, payment instructions, cancellations, gift cards, drop alerts and review requests by email, and texts through an Android phone running **SMS Gate** (throttled, with STOP/START handling). See [n8n & SMS Gate Automation](#n8n--sms-gate-automation).
- **Text inbox (Admin → Messages)**: customers' texts to the shop phone appear as conversations (with their names), and you reply from the admin.
- **Mix & match boxes and add-ons**: e.g. a 12-cookie box where customers pick flavors (choices can change each drop), and per-item extras like "Extra icing +$1". The drop page shows a "what to make" tally.
- **Drop Alerts**: a "Never miss a drop" sign-up (email or phone); everyone is notified once when a drop opens.
- **Gift cards, discount codes and personal codes**: codes can be limited to specific customers.
- **Customer reviews**: a review request after pickup, reviews tagged with what they ordered, owner approval, and an optional first-review discount.
- **Customers (Admin → Customers)**: everyone who signed up, ordered or was imported (CSV import from Hotplate and others, including order history and phone-only customers), editable, with old emails/numbers kept so history stays together. Customers can sign in to see **My Orders** and their reviews.
- **First-Run Setup Wizard (`/setup`)**: Seamless onboarding for anyone pulling the repo from GitHub to set admin credentials and API keys without modifying code.
- **No-code customization (Admin → Site / Settings)**: business name, logo, cover photo, brand and button text colors, socials, privacy policy and terms, website address, payment and notification keys. **Text & buttons** lets you reword every label and button customers see, and the walk-up page can be renamed and given its own address (e.g. `/porch-pickup`; `/farmstand` keeps working for printed QR codes).

---

## Project Structure

```
farmstand/
├── prisma/
│   └── schema.prisma         # Postgres schema (Drops, Products, Farmstand, Orders)
├── src/
│   ├── app/
│   │   ├── (customer)/       # Public home page and weekly drop preorders
│   │   ├── farmstand/        # QR code walk-up honor box kiosk
│   │   ├── admin/            # Admin dashboard, drops, farmstand extras & catalog
│   │   ├── setup/            # First-run onboarding wizard
│   │   └── api/              # REST routes & Stripe webhook handler
│   ├── components/           # Universal CheckoutModal (Stripe + Venmo + PayPal)
│   └── lib/                  # Prisma client, Stripe SDK, notifications, settings
├── n8n/
│   └── shop-notifications-workflow.json   # importable n8n workflow (SMTP email + SMS Gate)
├── unraid/
│   └── farmstand-template.xml             # Unraid Community App template
├── docker-compose.yml        # Multi-container stack (Next.js app + Postgres 16)
└── Dockerfile                # Production multi-stage container
```

---

## Quickstart (Docker Compose on Unraid or Local)

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Fill in the database password, `AUTH_SECRET` and `ADMIN_EMAIL` (your email — only it can become admin) in `.env` (email, payments and notifications can be set later in Admin → Settings).
3. Launch the container stack:
   ```bash
   docker compose up -d
   ```
4. Visit `http://your-server-ip:3000/setup` to run the first-time setup wizard. Stripe is optional; everything can be changed later in Admin → Settings.

---

## Privacy Policy & Terms — review yours

The site includes `/privacy` and `/terms` pages, linked at the bottom of every page, with **starter templates** filled in with your business name and contact details. They are general templates, **not legal advice** and not written for your specific business. Before going live, review and edit them in **Admin → Site → Legal pages** so they match how you collect information, take payments, handle refunds and pickups, and the laws where you operate — or paste in your own.

---

## Admin App (Android APK & iPhone)

The admin panel installs as a phone app — no app store or developer account. It needs the site on a public **https** domain (see Cloudflare Tunnel below).

**iPhone / any phone (no download):** open `https://your-domain/admin` in Safari → Share → **Add to Home Screen**. On Android Chrome, the admin pages offer an **Install** button.

**Android APK:**
1. On GitHub: **Actions → Build Android admin app (APK) → Run workflow**, enter your domain (e.g. `shop.example.com`).
2. When it finishes, the APK is attached to a new **Release**. Open that page on your phone, download the `.apk`, and open it (allow "install unknown apps" for your browser once).
3. Copy the **package** and **SHA-256 fingerprint** from the run's summary into **Admin → Settings → Android app**, so the app opens without a browser bar.
4. **Keep the same signing key** so future APKs update the installed one: the first run (without secrets) offers a `SAVE-THIS-android-signing-key` artifact. Add its contents as repository secrets (**Settings → Secrets and variables → Actions**):
   - `ANDROID_KEYSTORE_BASE64` — contents of `keystore-base64.txt`
   - `ANDROID_KEYSTORE_PASSWORD` — contents of `keystore-password.txt`

Your logo, name and brand color are read from the live site when the APK is built; site changes (products, text, settings) show in the app instantly without rebuilding.

---

## Cloudflare Tunnel Setup (Zero Open Router Ports)

1. In the Cloudflare Zero Trust dashboard, create a new Tunnel pointing to:
   - **Service**: `HTTP`
   - **URL**: `localhost:3000` (or `unraid-ip:3000`)
   - **Hostname**: `farmstand.yourdomain.net`
2. In Cloudflare Zero Trust > Access > Applications, you can optionally protect `farmstand.yourdomain.net/admin*` with an email PIN code so only your email can reach the admin area.

---

## n8n & SMS Gate Automation

All emails and texts go out through one n8n workflow: `n8n/shop-notifications-workflow.json`. The shop never stores your SMTP or SMS passwords; those live in n8n.

**What it does**

| When | Email | Text (SMS Gate) |
| --- | --- | --- |
| Order paid (card, or Venmo/PayPal marked Paid), walk-up purchase | Confirmation with items, pickup time and exact address | Confirmation (skipped if they replied STOP) |
| Venmo/PayPal order placed | Customer: "how to pay" with a pay link · Owner: "check for payment" | Owner: new order |
| Card order paid | Owner: new paid order | Owner: new order |
| Order cancelled / refunded | Customer | — |
| Gift card activated | Code to the recipient, receipt to the buyer | — |
| Drop opens (once per drop) | Everyone on Drop Alerts with an email (with unsubscribe link) | Phone-only subscribers, **one text every 8 seconds** so carriers don't block you |
| Order picked up | "How was it?" review request (at most once per customer every N days; "don't ask me" link) | — |
| First review | Single-use thank-you discount code | — |
| Customer texts the shop phone | Shows up in **Admin → Messages**; you reply from there | STOP/START handled automatically, with confirmation |

### 1. Import and secure the workflow

1. In n8n: **Workflows → Import from File** → `n8n/shop-notifications-workflow.json`.
2. Make up a long random secret, e.g. `openssl rand -hex 32`. Replace every `CHANGE_ME` with it:
   - on each webhook node except **Incoming Text (SMS Gate)**: **Options → Only Run If**
   - on **Check STOP / START (shop)**: the `x-webhook-secret` header
3. In the shop: **Admin → Settings → Notifications**, set the n8n URL to `https://YOUR-N8N-DOMAIN/webhook` and paste the same secret.

### 2. Email

1. Create an **SMTP** credential in n8n (Zoho, Gmail app password, etc.). Use the same mailbox as your domain's SPF/DKIM so mail doesn't land in spam.
2. On every **Email …** node, choose that credential and set **From**, e.g. `Your Shop <hello@yourdomain.com>`.

### 3. Texting with SMS Gate (optional)

[SMS Gate for Android](https://sms-gate.app) turns an Android phone with a SIM into your shop's texting number.

1. Install SMS Gate on the phone and set it up (cloud, private server or local server). Note its **API address** and **username/password**.
   - Private server example: `https://sms.yourdomain.com/api/3rdparty/v1/messages`
   - Local server example: `http://PHONE-IP:8080/message` (give the phone a fixed IP in your router)
2. In n8n, create an **HTTP Basic Auth** credential with the SMS Gate username/password, and pick it on every SMS Gate node (**Text …**, **Send Reply Text**, **Register Webhook In SMS Gate**).
3. Replace `YOUR-SMS-GATE-SERVER` in those nodes with your address (keep the `/api/3rdparty/v1/...` part for cloud/private server).
4. On **Text Owners: New Order**, replace the example numbers with the owners' cell numbers (`+1` and 10 digits).
5. On **Incoming Text (SMS Gate)**, change the path `sms-in-CHANGE-ME` to something long and random. Use the same path inside **Register Webhook In SMS Gate**, along with your n8n domain. On **Check STOP / START (shop)**, replace `YOUR-SHOP-DOMAIN`.
6. In the SMS Gate app, consider a sending limit (e.g. 10/minute) as a backstop.

### 4. Turn it on

1. **Publish/activate** the workflow.
2. Open **Run Once: Connect Incoming Texts** and click **Execute step** (one time). This tells SMS Gate to forward incoming texts to n8n.
3. Test: place an order, text the shop phone (it appears in Admin → Messages), reply from Admin, then text STOP and START.

**Events the app sends** (each to `<n8n URL>/<event>`, with the `x-webhook-secret` header): `order.confirmed`, `farmstand.purchased`, `order.awaiting_payment`, `order.cancelled`, `gift.activated`, `drop.announced`, `review.requested`, `review.thanks`, `sms.send` (a reply from Admin → Messages). Incoming texts come back to the shop at `POST /api/sms/inbound` (same secret).

**Texting rules built in:** a STOP reply blocks all texts to that number (order texts, drop alerts and replies) until they reply START, removes phone-only people from Drop Alerts, and re-imports never add them back.
