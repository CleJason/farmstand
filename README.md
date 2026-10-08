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
- **Notifications via n8n, SMS Gate & SMTP**:
  - App dispatches webhook payloads on order creation, confirmation, and cancellation.
  - Included importable n8n workflow sends automated texts to customer phones via an old Android phone running **SMS Gate** and emails via SMTP (e.g. Zoho or Gmail).
- **First-Run Setup Wizard (`/setup`)**: Seamless onboarding for anyone pulling the repo from GitHub to set admin credentials and API keys without modifying code.
- **No-code customization (Admin → Settings)**: business name, tagline, homepage and farmstand text, pickup/contact info, social links, logo, brand color, favicon, and payment/notification keys.
- **Customers (Admin → Customers)**: everyone who signed up or ordered, with order history and CSV export.

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
│   └── order-notifications-workflow.json  # n8n workflow for SMS Gate + SMTP email
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

1. Import `n8n/order-notifications-workflow.json` into your self-hosted n8n instance.
2. In the n8n webhook node, ensure the webhook path matches `order.confirmed`.
3. Update the SMS Gate IP address to point to your Android phone on your local network (e.g. `http://192.168.1.X:8080/v1/message`).
