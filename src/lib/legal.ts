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
  return `This Privacy Policy explains how ${name} ("we", "us") collects, uses, maintains and discloses information collected from users ("you") of this website. It applies to this website and all products and services offered by ${name}.

## Information we collect
We collect personal information when you place an order, buy or use a gift card, sign in, or contact us. This may include:
- Your name, email address and phone number
- What you ordered, your pickup day and time, and any notes you add
- Discount or gift card codes you use
- Payment confirmation details (card payments are handled by our payment processor; we never see or store your full card number)
- Information related to questions or support requests you send us
- Basic technical information your browser sends, such as your IP address, and a sign-in cookie if you sign in

## How we use your information
- To process and fulfill your orders and arrange pickup
- To send order confirmations, pickup reminders and updates by email or text message
- To respond to your questions and requests
- To keep records of our sales for our business and tax purposes
- To keep this website secure and working properly
- To comply with legal and regulatory obligations

## Emails and text messages
We use your email address to send information about your order and to reply to your questions. If you give us your phone number, we may text you about your order (confirmations and pickup reminders). Message and data rates may apply; reply STOP at any time to stop texts. If you choose to join a mailing list, you can unsubscribe at any time using the link in our emails or by contacting us.

## Sharing your information
We do not sell, trade or rent your personal information to anyone. We share it only with trusted service providers that help us run our business, such as our payment processors (Stripe, Venmo, PayPal) and the email and text message services we use to contact you, and only as needed for them to do that work. We may also disclose information if required by law or to protect our rights, property or customers.

## Payments
Card payments are processed by Stripe, and Venmo and PayPal payments by those companies. Their own privacy policies apply to the information you give them.

## Third-party websites
This website may link to other websites, such as our social media pages or payment providers. Those websites have their own privacy policies, and we are not responsible for their content or practices.

## How long we keep information
We keep order records for as long as we need them for our business and tax records. You can ask us to delete your account and contact details at any time; we keep order amounts for our records without your contact information.

## Your choices
You can ask to see, correct or delete the personal information we have about you by contacting us at ${contact(site)}.

## Changes to this policy
We may update this Privacy Policy at any time. Changes will be posted on this page with an updated date at the top. We encourage you to check this page periodically.

## Your acceptance of this policy
By using this website, you agree to this Privacy Policy. If you do not agree, please do not use the website. Continuing to use the website after changes are posted means you accept those changes.

## Contact us
If you have any questions about this Privacy Policy, please contact us at ${contact(site)}.`;
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
