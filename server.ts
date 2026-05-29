import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import axios from "axios";
import { db } from "./src/server/firebaseAdmin";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

// Need raw body for PayMongo webhook signature verification (optional but good practice)
app.use(express.json());
app.use(cors());

// The basic auth token for PayMongo is the base64 encoded secret key
const getPayMongoHeaders = () => {
  const secretKey = process.env.PAYMONGO_SECRET_KEY || "";
  const base64Key = Buffer.from(`${secretKey}:`).toString("base64");
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Basic ${base64Key}`,
  };
};

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Create a checkout session
app.post("/api/create-checkout", async (req, res) => {
  try {
    const { userId, email, origin, amount, plan, isUpgrade } = req.body;

    if (!process.env.PAYMONGO_SECRET_KEY) {
      return res
        .status(500)
        .json({ error: "PayMongo secret key is not configured." });
    }

    const price = amount ? parseInt(amount, 10) * 100 : 100000;
    const name = isUpgrade 
      ? "Applet Premium Upgrade" 
      : `Applet ${plan === 'basic' ? 'Basic' : 'Premium'} Plan Activation`;

    const options = {
      method: "POST",
      url: "https://api.paymongo.com/v1/checkout_sessions",
      headers: getPayMongoHeaders(),
      data: {
        data: {
          attributes: {
            send_email_receipt: true,
            show_description: true,
            show_line_items: true,
            line_items: [
              {
                currency: "PHP",
                amount: price,
                name: name,
                quantity: 1,
              },
            ],
            payment_method_types: ["gcash"],
            success_url: `${origin}/?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/?cancel=true`,
            description: "AIStudio Build Website Access",
            customer_info: {
              email: email,
            },
            metadata: {
              userId: userId,
              plan: isUpgrade ? "premium" : plan || "premium",
            },
          },
        },
      },
    };

    const response = await axios.request(options);
    res.json({ checkoutUrl: response.data.data.attributes.checkout_url });
  } catch (error: any) {
    console.error(
      "PayMongo checkout error:",
      error.response?.data || error.message,
    );
    res.status(500).json({ error: "Failed to create checkout session." });
  }
});

// Verify a checkout session
app.post("/api/verify-checkout", async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: "Session ID is missing." });
    }

    const options = {
      method: "GET",
      url: `https://api.paymongo.com/v1/checkout_sessions/${sessionId}`,
      headers: getPayMongoHeaders(),
    };

    const response = await axios.request(options);
    const attributes = response.data.data.attributes;
    const isPaid =
      attributes.payments &&
      attributes.payments.length > 0 &&
      attributes.payments.some((p: any) => p.attributes.status === "paid");

    if (isPaid) {
      // Opportunistically update the user's status using Firebase Admin if available
      const userId = attributes.metadata?.userId;
      const plan = attributes.metadata?.plan || "premium";
      if (userId && db) {
        try {
          await db.collection("users").doc(userId).set(
            {
              paymentStatus: "paid",
              isActive: true,
              plan: plan,
              pendingVerification: null,
            },
            { merge: true },
          );
        } catch (dbErr) {
          console.error("Failed to update DB from server verification:", dbErr);
        }
      }
      res.json({ status: "paid", userId, plan });
    } else {
      res.json({ status: "pending" });
    }
  } catch (error: any) {
    console.error(
      "PayMongo verify error:",
      error.response?.data || error.message,
    );
    res.status(500).json({ error: "Failed to verify checkout session." });
  }
});

// Webhook for PayMongo
app.post("/api/paymongo-webhook", async (req, res) => {
  try {
    const body = req.body;
    const type = body?.data?.attributes?.type;

    // Process the checkout_session.payment.paid event
    if (type === "checkout_session.payment.paid") {
      const checkoutSessionInfo = body.data.attributes.data.attributes;
      const metadata = checkoutSessionInfo.metadata;
      const userId = metadata?.userId;
      const plan = metadata?.plan || "premium";

      if (userId && db) {
        // Find the user and update access
        console.log(`Webhook received: activating user ${userId} with plan ${plan}`);
        await db.collection("users").doc(userId).set(
          {
            paymentStatus: "paid",
            isActive: true,
            plan: plan,
            pendingVerification: null,
          },
          { merge: true },
        );
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: "Webhook processing failed." });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
