import type { SiteSettings } from "@/lib/site-defaults";

/*
 * Starter Privacy Policy and Terms, filled in with the shop's details. Owners
 * can replace them in Admin → Site. Plain text: "## " starts a heading,
 * "- " a bullet, blank lines separate paragraphs.
 */

function contact(site: SiteSettings) {
  return [site.SITE_CONTACT_EMAIL, site.SITE_CONTACT_PHONE].filter(Boolean).join(" or ") || "the contact details on our home page";
}

export function defaultPrivacy(site: SiteSettings) {
  const name = site.SITE_NAME;
  return `${name} ("we", "us") runs this website to take orders for pickup. This policy explains what we collect and how we use it.

## What we collect
- Your name, email address and phone number when you place an order, sign in, or buy a gift card.
- What you ordered, your pickup time, any notes you add, and discount or gift card codes you use.
- Basic technical information your browser sends (like your IP address) and a sign-in cookie if you sign in.

## How we use it
- To take, prepare and confirm your order and arrange pickup.
- To send order confirmations, pickup reminders and updates by email or text message.
- To answer your questions and keep records of our sales.

We do not sell your personal information, and we don't use it for advertising.

## Text messages
If you give us your phone number, we may text you about your order (confirmations and pickup reminders). Message and data rates may apply. Reply STOP to opt out at any time, or contact us.

## Payments
Card payments are handled by Stripe, and Venmo and PayPal payments by those companies. We never see or store your full card number. Their own privacy policies apply to the information you give them.

## Who we share it with
Only the services that help us run the shop, such as our payment processors and the email and text message services we use to contact you, and only as needed to do that. We may also share information if the law requires it.

## How long we keep it
We keep order records for as long as we need them for our business and tax records. You can ask us to delete your account and contact details at any time; we keep the order amounts for our records without your contact information.

## Your choices
You can ask to see, correct or delete the personal information we have about you by contacting us at ${contact(site)}.

## Changes
We may update this policy. The latest version is always on this page.`;
}

export function defaultTerms(site: SiteSettings) {
  const name = site.SITE_NAME;
  const area = site.SITE_PICKUP_AREA ? ` in ${site.SITE_PICKUP_AREA}` : "";
  return `These terms apply when you order from ${name}${area} through this website. By placing an order you agree to them.

## Orders
- Pre-orders can be placed while a drop is open and close at the cutoff shown.
- Quantities are limited. Your order is confirmed once payment is received (Venmo and PayPal orders are confirmed when we see your payment).
- Prices are shown at checkout. Discount codes and gift cards apply as shown before you pay.

## Pickup
- Please pick up during the time you chose. Orders are made fresh and can't be held indefinitely.
- The exact pickup address is shared after your order is paid.
- If you can't make your pickup time, contact us as soon as possible and we'll try to help.

## Cancellations and refunds
Because items are made to order, please contact us right away if you need to cancel. We'll do our best to help, but we may not be able to refund orders once preparation has started or for orders that aren't picked up. If something is wrong with your order, let us know and we'll make it right.

## Allergies and ingredients
Our items may be made in a kitchen that also handles common allergens such as wheat, milk, eggs, soy and nuts. Ask us if you have questions about ingredients.

## Gift cards
Gift cards can be used on this website until the balance is used up. They can't be exchanged for cash except where the law requires. Treat the code like cash — we can't replace a code that someone else has used.

## Contact
Questions? Reach us at ${contact(site)}.

## Changes
We may update these terms. The version on this page when you order is the one that applies.`;
}
