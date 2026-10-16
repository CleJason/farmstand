/**
 * Every piece of customer-facing text and button label, editable in
 * Admin → Site → Text & buttons. The owner's changes are stored as one JSON
 * object (setting SITE_COPY); anything not changed uses the default here.
 * {curly} words are filled in by the page (e.g. {count}, {shop}, {total}).
 * Safe for client code.
 */

type Entry = { group: string; label: string; default: string; long?: boolean };

export const COPY = {
  // ── Site menu & footer
  "nav.giftCard": { group: "Menu & footer", label: "Gift card button", default: "Gift Card" },
  "nav.share": { group: "Menu & footer", label: "Share button", default: "Share" },
  "nav.shareCopied": { group: "Menu & footer", label: "Share: link copied", default: "Link copied!" },
  "nav.signIn": { group: "Menu & footer", label: "Sign in button", default: "Sign In" },
  "nav.myOrders": { group: "Menu & footer", label: "My orders link", default: "My Orders" },
  "nav.admin": { group: "Menu & footer", label: "Admin button", default: "Admin" },
  "nav.signOut": { group: "Menu & footer", label: "Sign out", default: "Sign out" },
  "inapp.text": {
    group: "Menu & footer",
    label: "Facebook/Instagram banner",
    default: "For the smoothest checkout, open this page in your browser.",
  },
  "inapp.safari": { group: "Menu & footer", label: "iPhone screen: button", default: "Open in Safari" },
  "inapp.gateTitle": { group: "Menu & footer", label: "iPhone screen: title", default: "Open in Safari to order" },
  "inapp.gateText": {
    group: "Menu & footer",
    label: "iPhone screen: text",
    default: "Ordering and checkout work best in Safari, not inside Facebook or Instagram.",
  },
  "inapp.gateHelp": {
    group: "Menu & footer",
    label: "iPhone screen: if the button doesn't work",
    default: "Button not working? Tap ••• (top right) and choose \"Open in external browser\", or copy the link and paste it into Safari.",
    long: true,
  },
  "inapp.copy": { group: "Menu & footer", label: "iPhone screen: copy link", default: "Copy link" },
  "inapp.stay": { group: "Menu & footer", label: "iPhone screen: stay anyway", default: "Continue here anyway" },
  "inapp.chrome": { group: "Menu & footer", label: "Banner button (Android)", default: "Open in Chrome" },
  "footer.home": { group: "Menu & footer", label: "Footer: home link", default: "Home" },
  "footer.privacy": { group: "Menu & footer", label: "Privacy policy link / title", default: "Privacy Policy" },
  "footer.terms": { group: "Menu & footer", label: "Terms link / title", default: "Terms" },
  "legal.back": { group: "Menu & footer", label: "Back link on policy pages", default: "← Back to the shop" },

  // ── Home page
  "home.viewDrops": { group: "Home page", label: "Main button (to the drops)", default: "View This Week's Drop" },
  "home.loadingDrops": { group: "Home page", label: "Loading drops", default: "Loading drops..." },
  "home.noDropsTitle": { group: "Home page", label: "No drops: title", default: "No active drops right now" },
  "home.noDropsText": {
    group: "Home page",
    label: "No drops: text",
    default: "The next drop will be posted soon. Check {stand} for what's available now!",
    long: true,
  },
  "home.visitStand": { group: "Home page", label: "No drops: walk-up button", default: "Visit {stand} →" },
  "home.alertsLink": { group: "Home page", label: "No drops: alerts link", default: "Get an alert when the next drop opens" },
  "home.badgeOpen": { group: "Home page", label: "Drop badge: open", default: "Ordering Open" },
  "home.badgeSoon": { group: "Home page", label: "Drop badge: coming soon", default: "Coming Soon" },
  "home.opens": { group: "Home page", label: "Drop: opens (coming soon)", default: "Opens" },
  "home.badgeClosed": { group: "Home page", label: "Drop badge: closed", default: "Closed" },
  "home.closes": { group: "Home page", label: "Drop: closes", default: "Closes" },
  "home.itemsAvailable": { group: "Home page", label: "Drop: item count", default: "{count} items available" },
  "home.orderNow": { group: "Home page", label: "Drop button (open)", default: "Order Now →" },
  "home.viewMenu": { group: "Home page", label: "Drop button (coming soon)", default: "View Menu →" },
  "home.reviewCount": { group: "Home page", label: "Rating under the headline", default: "({count} reviews)" },
  "reviews.heading": { group: "Home page", label: "Reviews: heading", default: "What customers say" },
  "reviews.summary": { group: "Home page", label: "Reviews: summary", default: "{average} from {count} reviews" },
  "reviews.seeAll": { group: "Home page", label: "Reviews: see all button", default: "See all {count} reviews" },
  "reviews.panelTitle": { group: "Home page", label: "Reviews: side panel title", default: "Reviews" },
  "alerts.heading": { group: "Home page", label: "Alerts sign-up: heading", default: "Never miss a drop" },
  "alerts.intro": { group: "Home page", label: "Alerts sign-up: text", default: "Get a heads-up as soon as ordering opens." },
  "alerts.viaText": { group: "Home page", label: "Alerts sign-up: Text choice", default: "Text" },
  "alerts.viaEmail": { group: "Home page", label: "Alerts sign-up: Email choice", default: "Email" },
  "alerts.viaBoth": { group: "Home page", label: "Alerts sign-up: Both choice", default: "Both" },
  "alerts.phonePlaceholder": { group: "Home page", label: "Alerts sign-up: phone box", default: "Phone number" },
  "alerts.button": { group: "Home page", label: "Alerts sign-up: button", default: "Notify me" },
  "alerts.sending": { group: "Home page", label: "Alerts sign-up: sending", default: "Signing up…" },
  "alerts.done": {
    group: "Home page",
    label: "Alerts sign-up: thank you",
    default: "You're on the list! We'll let you know when the next drop opens. 🎉",
  },
  "alerts.doneSpam": {
    group: "Home page",
    label: "Alerts sign-up: spam tip",
    default: 'Alerts can land in spam or promotions at first. If you find one there, mark it "Not spam" so you don\'t miss the next drop.',
    long: true,
  },
  "alerts.fineprint": {
    group: "Home page",
    label: "Alerts sign-up: fine print",
    default:
      "Unsubscribe anytime from any alert. If you choose texts, you agree to get texts about new drops, pickup days and shop news; msg & data rates may apply, reply STOP to opt out. See our",
    long: true,
  },

  // ── Drop (pre-order) page
  "drop.loading": { group: "Pre-order page", label: "Loading", default: "Loading Drop Menu..." },
  "drop.notFound": { group: "Pre-order page", label: "Not found", default: "Drop not found." },
  "drop.back": { group: "Pre-order page", label: "Back link", default: "← Back to All Drops" },
  "drop.closes": { group: "Pre-order page", label: "Order cutoff", default: "Pre-orders close:" },
  "drop.opensAt": {
    group: "Pre-order page",
    label: "Not open yet",
    default: "Ordering opens {date}. Have a look at the menu, and come back then to order!",
    long: true,
  },
  "drop.closedNote": { group: "Pre-order page", label: "Ordering closed", default: "Ordering for this drop has closed." },
  "drop.step1": { group: "Pre-order page", label: "Step 1 heading", default: "1. Choose Your Pickup Time" },
  "drop.fullyBooked": { group: "Pre-order page", label: "Pickup day full", default: "Fully booked" },
  "drop.pickTime": { group: "Pre-order page", label: "Pick a time", default: "Pick a time" },
  "drop.step2": { group: "Pre-order page", label: "Step 2 heading", default: "2. Choose Your Items" },
  "drop.details": { group: "Pre-order page", label: "Item: details link", default: "Details" },
  "drop.soldOut": { group: "Pre-order page", label: "Sold out", default: "Sold out" },
  "drop.left": { group: "Pre-order page", label: "Stock left", default: "{count} left" },
  "drop.mixMatch": { group: "Pre-order page", label: "Box label", default: "Mix & match {count}" },
  "drop.buildBox": { group: "Pre-order page", label: "Box button", default: "Build a box" },
  "drop.anotherBox": { group: "Pre-order page", label: "Box button (again)", default: "+ Another box" },
  "drop.add": { group: "Pre-order page", label: "Add button (items with add-ons)", default: "Add" },
  "drop.addMore": { group: "Pre-order page", label: "Add button (again)", default: "+ Add more" },
  "drop.regular": { group: "Pre-order page", label: "Line with no add-ons", default: "Regular" },
  "drop.step3": { group: "Pre-order page", label: "Step 3 heading", default: "3. Payment" },
  "drop.discountLabel": { group: "Pre-order page", label: "Discount code label", default: "Discount Code" },
  "drop.giftLabel": { group: "Pre-order page", label: "Gift card label", default: "Gift Card" },
  "drop.paymentLabel": { group: "Pre-order page", label: "Payment method label", default: "Select Payment Method" },
  "drop.agree": { group: "Pre-order page", label: "Terms note", default: "By placing an order you agree to our" },
  "drop.selected": { group: "Pre-order page", label: "Bottom bar: count", default: "{count} selected" },
  "drop.checkout": { group: "Pre-order page", label: "Bottom bar: checkout button", default: "Proceed to Checkout →" },
  "drop.needPickup": { group: "Pre-order page", label: "Missing pickup time", default: "Please choose a pickup day and time!" },
  "drop.doneTitle": { group: "Pre-order page", label: "Order placed: title", default: "Pre-Order Confirmed!" },
  "drop.doneText": {
    group: "Pre-order page",
    label: "Order placed: text",
    default: "Thank you! Your order and pickup time have been saved. We'll have it ready for you.",
    long: true,
  },
  "drop.addressTitle": { group: "Pre-order page", label: "Order placed: address title", default: "Pickup address" },
  "drop.addressNote": {
    group: "Pre-order page",
    label: "Order placed: address note",
    default: "📧 The exact pickup address will be in your confirmation email.",
  },
  "drop.backHome": { group: "Pre-order page", label: "Order placed: button", default: "Back to Home" },

  // ── Walk-up (porch pickup) page
  "stand.hoursTitle": { group: "Walk-up page", label: "Open hours: heading", default: "Open" },
  "stand.openNow": { group: "Walk-up page", label: "Open hours: heading while open", default: "Open now" },
  "stand.noHours": {
    group: "Walk-up page",
    label: "Open hours: none scheduled",
    default: "No {stand} scheduled right now. Check back soon!",
  },
  "stand.alertsTitle": { group: "Walk-up page", label: "Alert sign-up: heading", default: "Get notified when {stand} is open" },
  "stand.viaText": { group: "Walk-up page", label: "Alert sign-up: Text choice", default: "Text" },
  "stand.viaEmail": { group: "Walk-up page", label: "Alert sign-up: Email choice", default: "Email" },
  "stand.viaBoth": { group: "Walk-up page", label: "Alert sign-up: Both choice", default: "Both" },
  "stand.phonePlaceholder": { group: "Walk-up page", label: "Alert sign-up: phone box", default: "Phone number" },
  "stand.emailPlaceholder": { group: "Walk-up page", label: "Alert sign-up: email box", default: "Email" },
  "stand.alertsButton": { group: "Walk-up page", label: "Alert sign-up: button", default: "Notify me" },
  "stand.alertsDone": {
    group: "Walk-up page",
    label: "Alert sign-up: thank you",
    default: "You're on the list! We'll let you know when {stand} is open and when new drops open.",
  },
  "stand.alertsFine": {
    group: "Walk-up page",
    label: "Alert sign-up: fine print",
    default: "You'll also get new drop alerts. Unsubscribe anytime. For texts, msg & data rates may apply; reply STOP to opt out.",
  },
  "checkout.standOptIn": { group: "Checkout", label: "Walk-up: alert checkbox", default: "Let me know when {stand} is open" },
  "stand.back": { group: "Walk-up page", label: "Back link", default: "← Back to the shop" },
  "stand.loading": { group: "Walk-up page", label: "Loading", default: "Loading..." },
  "stand.empty": { group: "Walk-up page", label: "Nothing out: title", default: "No extras out right now." },
  "stand.emptyHint": { group: "Walk-up page", label: "Nothing out: text", default: "Check back soon!" },
  "stand.soldOut": { group: "Walk-up page", label: "Sold out", default: "Sold out" },
  "stand.available": { group: "Walk-up page", label: "Stock left", default: "{count} available" },
  "stand.agree": { group: "Walk-up page", label: "Terms note", default: "By paying you agree to our" },
  "stand.pay": { group: "Walk-up page", label: "Pay button", default: "Pay for {count}" },
  "stand.doneTitle": { group: "Walk-up page", label: "Paid: title", default: "Thank you for supporting {shop}!" },
  "stand.doneText": { group: "Walk-up page", label: "Paid: text", default: "Your order was received. Enjoy!" },
  "stand.receipt": { group: "Walk-up page", label: "Paid: receipt note", default: "A receipt is on its way to your email." },
  "stand.again": { group: "Walk-up page", label: "Paid: button", default: "Start New Purchase" },

  // ── Checkout (both pages)
  "pay.card": { group: "Checkout", label: "Card button", default: "💳 Card / Apple Pay" },
  "pay.venmo": { group: "Checkout", label: "Venmo button", default: "Venmo" },
  "pay.paypal": { group: "Checkout", label: "PayPal button", default: "PayPal" },
  "checkout.detailsTitle": { group: "Checkout", label: "Details step: title", default: "Your details" },
  "checkout.detailsIntro": {
    group: "Checkout",
    label: "Details step: text",
    default: "So we know whose order it is and where to send your confirmation.",
  },
  "checkout.nameLabel": { group: "Checkout", label: "Name label", default: "Your name" },
  "checkout.namePlaceholder": { group: "Checkout", label: "Name placeholder", default: "First and last name" },
  "checkout.emailLabel": { group: "Checkout", label: "Email label", default: "Email (for your confirmation)" },
  "checkout.phoneLabel": { group: "Checkout", label: "Phone label", default: "Phone (optional, for text updates)" },
  "checkout.smsConsent": {
    group: "Checkout",
    label: "Phone fine print",
    default: "If you add a phone number, you agree to get texts about this order. Msg & data rates may apply. Reply STOP to opt out.",
    long: true,
  },
  "checkout.notesLabel": { group: "Checkout", label: "Notes label", default: "Special notes / requests" },
  "checkout.notesPlaceholder": { group: "Checkout", label: "Notes placeholder", default: "Anything we should know?" },
  "checkout.continue": { group: "Checkout", label: "Details step: button", default: "Continue to payment →" },
  "checkout.submitting": { group: "Checkout", label: "Details step: working", default: "One moment…" },
  "checkout.needName": { group: "Checkout", label: "Missing name", default: "Please add your name so we know whose order it is!" },
  "checkout.needEmail": { group: "Checkout", label: "Missing email", default: "Please add your email for your order confirmation!" },
  "checkout.title": { group: "Checkout", label: "Payment step: title", default: "Complete Your Order" },
  "checkout.orderLine": { group: "Checkout", label: "Payment step: order line", default: "Order #{order} · Total: {total}" },
  "checkout.payCard": { group: "Checkout", label: "Card: pay button", default: "Pay {total}" },
  "checkout.cardLoading": { group: "Checkout", label: "Card: form loading", default: "Loading the secure card form…" },
  "checkout.cardTrouble": {
    group: "Checkout",
    label: "Card: form didn't load",
    default:
      "The card form didn't load on this phone. Tap the button below to pay on Stripe's secure page instead, or close this and pay with Venmo or PayPal.",
    long: true,
  },
  "checkout.hosted": { group: "Checkout", label: "Card: backup link", default: "Trouble with the card form? Pay on Stripe's secure page instead" },
  "checkout.hostedGo": { group: "Checkout", label: "Card: backup button", default: "Pay on Stripe's secure page →" },
  "paid.checking": { group: "Checkout", label: "Back from Stripe: checking", default: "Confirming your payment…" },
  "paid.title": { group: "Checkout", label: "Back from Stripe: title", default: "Payment received!" },
  "paid.text": {
    group: "Checkout",
    label: "Back from Stripe: text",
    default: "Thank you! Your order is confirmed, and a confirmation is on its way.",
  },
  "paid.notYet": {
    group: "Checkout",
    label: "Back from Stripe: not confirmed yet",
    default:
      "Stripe hasn't confirmed your payment yet. You'll get a confirmation as soon as it does. If you were charged, there's nothing else you need to do.",
    long: true,
  },
  "checkout.processing": { group: "Checkout", label: "Card: processing", default: "Processing..." },
  "checkout.venmoText": {
    group: "Checkout",
    label: "Venmo: instructions",
    default: "Click below to send {total} on Venmo to @{handle}. Put Order #{order} in the note!",
    long: true,
  },
  "checkout.venmoButton": { group: "Checkout", label: "Venmo: button", default: "Open Venmo ({total}) →" },
  "checkout.paypalText": {
    group: "Checkout",
    label: "PayPal: instructions",
    default: "Click below to send {total} to PayPal. Include your Order ID #{order} in the note!",
    long: true,
  },
  "checkout.paypalButton": { group: "Checkout", label: "PayPal: button", default: "Open PayPal.me ({total}) →" },
  "checkout.sent": { group: "Checkout", label: "Venmo/PayPal: done button", default: "I have sent the payment" },
  "discount.placeholder": { group: "Checkout", label: "Discount box", default: "Discount code" },
  "discount.emailPrompt": {
    group: "Checkout",
    label: "Personal code: email box",
    default: "This code is for a specific customer. Enter the email it was sent to:",
  },
  "gift.placeholder": { group: "Checkout", label: "Gift card box", default: "Gift card code" },
  "gift.left": { group: "Checkout", label: "Gift card: balance left", default: "{amount} will be left on the card" },
  "apply": { group: "Checkout", label: "Apply button", default: "Apply" },
  "remove": { group: "Checkout", label: "Remove link", default: "Remove" },
  "spam.hint": {
    group: "Checkout",
    label: "Check your spam tip",
    default: 'Don\'t see it in a few minutes? Check your spam or promotions folder, and mark it "Not spam" so the next one lands in your inbox.',
    long: true,
  },

  // ── Boxes & add-ons
  "box.choose": { group: "Boxes & add-ons", label: "Box: how many", default: "Choose {count}" },
  "box.chooseMore": { group: "Boxes & add-ons", label: "Box: still to pick", default: "Choose {count} more" },
  "box.add": { group: "Boxes & add-ons", label: "Box / add-ons: add button", default: "Add to order · {price}" },
  "addon.title": { group: "Boxes & add-ons", label: "Add-ons heading", default: "Add-ons (per item)" },
  "addon.free": { group: "Boxes & add-ons", label: "Free add-on", default: "free" },
  "addon.each": { group: "Boxes & add-ons", label: "Price each", default: "{price} each" },
  "addon.howMany": { group: "Boxes & add-ons", label: "How many", default: "How many" },

  // ── Gift card page
  "giftPage.title": { group: "Gift card page", label: "Title", default: "Gift Cards" },
  "giftPage.intro": {
    group: "Gift card page",
    label: "Intro",
    default: "Give someone a treat from {shop}. They can use it on pre-orders or at {stand}.",
    long: true,
  },
  "giftPage.amount": { group: "Gift card page", label: "Amount label", default: "Amount" },
  "giftPage.custom": { group: "Gift card page", label: "Other amount box", default: "Or another amount ($5–$500)" },
  "giftPage.recipientName": { group: "Gift card page", label: "Recipient name label", default: "Recipient's name" },
  "giftPage.recipientEmail": { group: "Gift card page", label: "Recipient email label", default: "Recipient's email" },
  "giftPage.recipientEmailHint": { group: "Gift card page", label: "Recipient email box", default: "We'll email them the code" },
  "giftPage.from": { group: "Gift card page", label: "From label", default: "From" },
  "giftPage.fromHint": { group: "Gift card page", label: "From box", default: "Your name" },
  "giftPage.message": { group: "Gift card page", label: "Message label", default: "Message (optional)" },
  "giftPage.yourEmail": { group: "Gift card page", label: "Buyer email label", default: "Your email * (for the receipt)" },
  "giftPage.payWith": { group: "Gift card page", label: "Pay with label", default: "Pay with" },
  "giftPage.agree": { group: "Gift card page", label: "Terms note", default: "By buying you agree to our" },
  "giftPage.buy": { group: "Gift card page", label: "Buy button", default: "Buy {amount} gift card" },
  "giftPage.doneTitle": { group: "Gift card page", label: "Bought: title", default: "Thank you!" },
  "giftPage.donePaid": { group: "Gift card page", label: "Bought (card): text", default: "Your gift card is paid." },
  "giftPage.doneManual": {
    group: "Gift card page",
    label: "Bought (Venmo/PayPal): text",
    default: "Once we confirm your payment, the gift card is activated.",
  },
  "giftPage.doneTo": { group: "Gift card page", label: "Bought: who gets the code", default: "The code will be emailed to {who}." },
  "giftPage.back": { group: "Gift card page", label: "Bought: button", default: "Back to {shop}" },

  // ── Sign in & My orders
  "login.title": { group: "Sign in & My orders", label: "Sign in: title", default: "Welcome back" },
  "login.subtitle": { group: "Sign in & My orders", label: "Sign in: subtitle", default: "Sign in to {shop}" },
  "login.emailLabel": { group: "Sign in & My orders", label: "Sign in: email label", default: "Email address" },
  "login.button": { group: "Sign in & My orders", label: "Sign in: button", default: "Send Magic Link" },
  "login.sending": { group: "Sign in & My orders", label: "Sign in: sending", default: "Sending..." },
  "login.note": {
    group: "Sign in & My orders",
    label: "Sign in: note",
    default: "No password needed. New customers are registered automatically.",
  },
  "login.sentTitle": { group: "Sign in & My orders", label: "Link sent: title", default: "Check your email" },
  "login.sentText": { group: "Sign in & My orders", label: "Link sent: text", default: "We sent a magic link to {email}" },
  "login.expires": { group: "Sign in & My orders", label: "Link sent: expiry", default: "The link expires in 24 hours." },
  "orders.title": { group: "Sign in & My orders", label: "My orders: title", default: "My Orders" },
  "orders.empty": { group: "Sign in & My orders", label: "My orders: none yet", default: "No orders on this site yet." },
  "orders.browse": { group: "Sign in & My orders", label: "My orders: browse button", default: "See what's available" },
  "orders.regular": {
    group: "Sign in & My orders",
    label: "My orders: imported history",
    default: "Before our new website you'd ordered with us {count} times. Thank you for being a regular! 💛",
    long: true,
  },
  "orders.total": { group: "Sign in & My orders", label: "My orders: total", default: "Total" },
  "orders.pickup": { group: "Sign in & My orders", label: "My orders: pickup", default: "Pickup:" },
  "status.AWAITING_CONFIRM": { group: "Sign in & My orders", label: "Status: waiting for payment", default: "Waiting for payment" },
  "status.PAID": { group: "Sign in & My orders", label: "Status: confirmed", default: "Confirmed" },
  "status.READY": { group: "Sign in & My orders", label: "Status: ready", default: "Ready for pickup" },
  "status.PICKED_UP": { group: "Sign in & My orders", label: "Status: picked up", default: "Picked up" },
  "status.CANCELLED": { group: "Sign in & My orders", label: "Status: cancelled", default: "Cancelled" },
  "status.REFUNDED": { group: "Sign in & My orders", label: "Status: refunded", default: "Refunded" },
  "orders.reviews": { group: "Sign in & My orders", label: "My orders: reviews heading", default: "My Reviews" },
  "orders.questions": {
    group: "Sign in & My orders",
    label: "My orders: questions note",
    default: "Questions about an order? Just reply to your confirmation email.",
  },

  // ── Reviews (customer form)
  "review.title": { group: "Review form", label: "Title", default: "How was everything?" },
  "review.offer": { group: "Review form", label: "First-review offer", default: "🎁 Leave your first review and get {percent}% off your next order." },
  "review.rating": { group: "Review form", label: "Rating label", default: "Your rating" },
  "review.text": { group: "Review form", label: "Review label", default: "Your review" },
  "review.textHint": { group: "Review form", label: "Review box", default: "What did you love?" },
  "review.products": { group: "Review form", label: "Products label", default: "What you're reviewing" },
  "review.photos": { group: "Review form", label: "Photos label", default: "Add photos (optional)" },
  "review.name": { group: "Review form", label: "Name label", default: "Name to show" },
  "review.send": { group: "Review form", label: "Send button", default: "Send review" },
  "review.note": {
    group: "Review form",
    label: "Fine print",
    default: "Your review may appear on our website with the name above. Your email is never shown.",
  },
  "review.thanks": { group: "Review form", label: "Thank you: title", default: "Thank you!" },
  "review.thanksText": { group: "Review form", label: "Thank you: text", default: "Your review means a lot to {shop}." },
  "review.code": { group: "Review form", label: "Thank you: discount", default: "Here's {percent}% off your next order:" },
  "review.codeHint": {
    group: "Review form",
    label: "Thank you: how to use the code",
    default: "Enter it in the Discount Code box at checkout. We emailed it to you too (check spam if you don't see it).",
    long: true,
  },
  "review.back": { group: "Review form", label: "Back button", default: "Back to {shop}" },
} satisfies Record<string, Entry>;

export type CopyKey = keyof typeof COPY;
export type CopyOverrides = Partial<Record<CopyKey, string>>;

/** The owner's saved changes (JSON in SITE_COPY), ignoring anything malformed. */
export function parseCopy(json: string | null | undefined): CopyOverrides {
  try {
    const v = JSON.parse(json || "{}");
    if (!v || typeof v !== "object") return {};
    const out: CopyOverrides = {};
    for (const [k, val] of Object.entries(v)) {
      if (k in COPY && typeof val === "string" && val.trim()) out[k as CopyKey] = val;
    }
    return out;
  } catch {
    return {};
  }
}

/** Text for a key: the owner's version if set, else the default, with {words} filled in. */
export function copyText(overrides: CopyOverrides, key: CopyKey, vars?: Record<string, string | number>): string {
  let text = overrides[key] ?? COPY[key].default;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  return text;
}

/** Server pages: a text() function from the site settings. */
export function textFor(site: { SITE_COPY?: string }) {
  const overrides = parseCopy(site.SITE_COPY);
  return (key: CopyKey, vars?: Record<string, string | number>) => copyText(overrides, key, vars);
}
