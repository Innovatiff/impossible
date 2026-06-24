const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret }                  = require("firebase-functions/params");
const { initializeApp }                 = require("firebase-admin/app");
const { getFirestore, FieldValue }      = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

const stripeSecret  = defineSecret("STRIPE_SECRET_KEY");
const webhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

// ── REPLACE THESE with your actual Stripe Price IDs ─────────────────────────
// Find them in Stripe Dashboard → Products → click the product → copy Price ID
const PRICES = {
  full_monthly: "price_REPLACE_FULL_DOSSIER_14_99",  // Full Dossier $14.99/month (recurring)
  single_file:  "price_REPLACE_SINGLE_FILE_4_99",    // Single File  $4.99 (one-time)
  clues_5:      "price_REPLACE_CLUES_5_PACK",         // 5 credits    $4.99 (one-time)
  clues_12:     "price_REPLACE_CLUES_12_PACK",        // 12 credits   $9.99 (one-time)
  clues_25:     "price_REPLACE_CLUES_25_PACK",        // 25 credits   $17.99 (one-time)
};

const CLUE_CREDITS = {
  clues_5:  5,
  clues_12: 12,
  clues_25: 25,
};

// Hunts unlocked by Full Dossier subscription (not including free hunts 1 & 2)
const SUBSCRIPTION_HUNTS = ["hunt-2", "hunt-3", "hunt-4", "hunt-5", "hunt-6"];

// ── REPLACE with your production domain before going live ────────────────────
const BASE_URL = "https://impossible-hunt.com";

// ── createCheckoutSession ────────────────────────────────────────────────────
// Called from the frontend via httpsCallable.
// data: { type: 'subscription' | 'hunt' | 'clues', huntId?: string, priceKey?: string }
exports.createCheckoutSession = onCall(
  { secrets: [stripeSecret] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to purchase.");
    }

    const { type, huntId, priceKey } = request.data;
    const uid    = request.auth.uid;
    const stripe = require("stripe")(stripeSecret.value());

    let lineItems, mode, metadata, subscriptionData;

    if (type === "subscription") {
      lineItems        = [{ price: PRICES.full_monthly, quantity: 1 }];
      mode             = "subscription";
      metadata         = { type: "subscription", uid };
      subscriptionData = { metadata: { uid } };

    } else if (type === "hunt") {
      if (!huntId) throw new HttpsError("invalid-argument", "huntId is required.");
      lineItems = [{ price: PRICES.single_file, quantity: 1 }];
      mode      = "payment";
      metadata  = { type: "hunt", uid, huntId };

    } else if (type === "clues") {
      if (!PRICES[priceKey]) throw new HttpsError("invalid-argument", "Invalid clue pack.");
      lineItems = [{ price: PRICES[priceKey], quantity: 1 }];
      mode      = "payment";
      metadata  = { type: "clues", uid, priceKey };

    } else {
      throw new HttpsError("invalid-argument", "Invalid purchase type.");
    }

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: lineItems,
      metadata,
      ...(subscriptionData ? { subscription_data: subscriptionData } : {}),
      client_reference_id: uid,
      success_url: BASE_URL + "/account.html?payment=success",
      cancel_url:  BASE_URL + "/account.html?payment=cancelled",
    });

    return { url: session.url };
  }
);

// ── stripeWebhook ────────────────────────────────────────────────────────────
// Stripe sends events here. Verify signature, then update Firestore.
// Webhook URL after deploy: shown in `firebase deploy` output, or in Cloud Console.
// Register it in Stripe Dashboard → Developers → Webhooks → Add endpoint.
// Events to listen for: checkout.session.completed, customer.subscription.deleted
exports.stripeWebhook = onRequest(
  { secrets: [stripeSecret, webhookSecret] },
  async (req, res) => {
    if (req.method !== "POST") return res.sendStatus(405);

    const sig    = req.headers["stripe-signature"];
    const stripe = require("stripe")(stripeSecret.value());
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret.value());
    } catch (err) {
      console.error("Webhook signature failed:", err.message);
      return res.status(400).send("Webhook Error: " + err.message);
    }

    try {
      if (event.type === "checkout.session.completed") {
        await handleCheckoutCompleted(event.data.object);
      } else if (event.type === "customer.subscription.deleted") {
        await handleSubscriptionDeleted(event.data.object);
      }
    } catch (err) {
      console.error("Handler error:", err);
      return res.status(500).send("Internal error.");
    }

    res.sendStatus(200);
  }
);

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session) {
  const meta = session.metadata || {};
  const uid  = meta.uid || session.client_reference_id;
  if (!uid) { console.warn("No uid in completed session:", session.id); return; }

  if (meta.type === "subscription") {
    // Grant full plan + add all subscription hunts to library
    await db.doc(`users/${uid}`).update({
      plan:                 "full",
      stripeCustomerId:     session.customer,
      stripeSubscriptionId: session.subscription,
      planUpdatedAt:        FieldValue.serverTimestamp(),
    });
    const batch = db.batch();
    for (const huntId of SUBSCRIPTION_HUNTS) {
      batch.set(
        db.doc(`users/${uid}/library/${huntId}`),
        { huntId, type: "subscription", addedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    }
    await batch.commit();

  } else if (meta.type === "hunt") {
    // Permanently add one hunt to library
    await db.doc(`users/${uid}/library/${meta.huntId}`).set({
      huntId:    meta.huntId,
      type:      "purchased",
      addedAt:   FieldValue.serverTimestamp(),
      sessionId: session.id,
    }, { merge: true });

  } else if (meta.type === "clues") {
    // Add credits to user account
    const credits = CLUE_CREDITS[meta.priceKey] || 0;
    if (credits > 0) {
      await db.doc(`users/${uid}`).update({
        clueCredits: FieldValue.increment(credits),
      });
    }
  }
}

async function handleSubscriptionDeleted(subscription) {
  // Try to get uid from subscription metadata first
  let uid = subscription.metadata?.uid;

  if (!uid) {
    // Fall back: find user by stripeCustomerId
    const snap = await db.collection("users")
      .where("stripeCustomerId", "==", subscription.customer)
      .limit(1).get();
    if (snap.empty) {
      console.warn("No user found for Stripe customer:", subscription.customer);
      return;
    }
    uid = snap.docs[0].id;
  }

  // Downgrade plan back to free
  await db.doc(`users/${uid}`).update({
    plan:                 "free",
    stripeSubscriptionId: null,
    planUpdatedAt:        FieldValue.serverTimestamp(),
  });

  // Remove only subscription-based library entries — keep purchased ones
  const libSnap = await db.collection(`users/${uid}/library`)
    .where("type", "==", "subscription").get();
  if (!libSnap.empty) {
    const batch = db.batch();
    libSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}
