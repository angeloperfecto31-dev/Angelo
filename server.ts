import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import axios from "axios";
import { db } from "./src/server/firebaseAdmin";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

// Initialize GoogleGenAI
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Need raw body for PayMongo webhook signature verification (optional but good practice)
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));
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

// Helper to sanitize and extract JSON array from Gemini response
function cleanJsonResponse(text: string): string {
  if (!text) return "[]";
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    const startIdx = cleaned.indexOf("[");
    const endIdx = cleaned.lastIndexOf("]");
    if (startIdx !== -1 && endIdx !== -1) {
      cleaned = cleaned.substring(startIdx, endIdx + 1);
    }
  }
  return cleaned;
}

// Advanced Internet-based Fixture search with Google Search Grounding & Gemini
app.post("/api/fixtures/search", async (req, res) => {
  try {
    const { q } = req.body;
    if (!q || !q.trim()) {
      return res.json({ fixtures: [] });
    }

    const query = q.trim();
    const prompt = `Find 4 to 6 real-world commercial or residential lighting fixtures with verified specifications matching: "${query}".
For each fixture on the web, discover direct manufacturer data (such as Philips, Cree, Lithonia, Cooper, GE, Hubbell, etc.) including:
1. "id" (unique string slug e.g. "philips-coreline-led-panel" or "cree-zr24-troffer")
2. "brands" (brand or manufacturer, e.g. "Philips" or "Cree")
3. "lightType" (descriptive model name or type, e.g. "CoreLine LED Panel RC132V" or "ZR24 LED Troffer")
4. "modelNumber" (verified model catalog code e.g. "RC132V" or "ZR24-40L-40K-10V")
5. "description" (brief details about its usage, optics, or spec sheet description)
6. "category" (either "Indoor", "Outdoor", or "Special")
7. "wattage" (exact operating power as a positive integer or float, e.g., 36)
8. "lumens" (exact lumen output as a positive integer, e.g., 3600)
9. "wattageRange" (standard string range e.g. "30W–45W")
10. "lumensRange" (standard string range e.g. "3000–5000 lm")

Your response MUST be an array of JSON objects following this structure. Provide NO other text, conversational intro/outro, or prose:
[
  {
    "id": "philips-coreline-led-panel",
    "brands": "Philips",
    "lightType": "CoreLine LED Panel",
    "modelNumber": "RC132V",
    "description": "High-efficiency commercial LED panel for office ceilings.",
    "category": "Indoor",
    "wattage": 36,
    "lumens": 3600,
    "wattageRange": "30W–40W",
    "lumensRange": "3000–4500 lm"
  }
]`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are a professional architectural and electrical lighting library assistant. You must output raw JSON ONLY. Never return anything except a valid JSON array of lighting fixtures.",
        responseMimeType: "application/json",
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
      },
    });

    const text = response.text || "";
    const cleanJson = cleanJsonResponse(text);
    const parsed = JSON.parse(cleanJson);

    return res.json({ fixtures: Array.isArray(parsed) ? parsed : [] });
  } catch (err: any) {
    const errorString = JSON.stringify(err);
    const isRateLimit = err.status === 429 || err?.message?.includes("429") || err?.message?.includes("quota") || errorString.includes("429") || errorString.includes("quota");
    
    if (isRateLimit) {
      console.warn("Fixture search API rate limited (429).");
      return res.status(429).json({ error: "API quota exceeded. Please try again later.", code: 429 });
    }
    
    console.error("Fixture search API failed:", err.message || errorString);
    return res.status(500).json({ error: "Failed to search online fixtures database" });
  }
});

// Secure endpoint for AutoCAD DXF/DWG file download with backend verification of subscription plan
app.post("/api/download-cad", async (req, res) => {
  try {
    const { userId, dxfString, fileName } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "User identity verification required." });
    }

    if (!db) {
       return res.status(500).json({ error: "Database service unavailable." });
    }

    const userSnap = await db.collection("users").doc(userId).get();
    if (!userSnap.exists) {
      return res.status(404).json({ error: "User record not found." });
    }

    const userData = userSnap.data();
    const isAdmin = userData?.email?.trim().toLowerCase() === "angeloperfecto31@gmail.com";
    const isActive = userData?.isActive === true;
    const isPremium = userData?.plan === "premium" || userData?.plan === "Premium" || userData?.plan === "PREMIUM";

    // Enforce access control
    if (!isAdmin && (!isActive || !isPremium)) {
      return res.status(403).json({ error: "Access denied. AutoCAD export functions and downloadable files (DWG/DXF) are exclusive to Premium Plan subscribers." });
    }

    // Set download headers and return file contents
    res.setHeader("Content-Disposition", `attachment; filename="${fileName || 'Drawing.dxf'}"`);
    res.setHeader("Content-Type", "application/dxf");
    return res.send(dxfString);
  } catch (error: any) {
    console.error("CAD backend validation download failed:", error);
    return res.status(500).json({ error: "An error occurred during AutoCAD download verification." });
  }
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

    const price = amount ? Math.round(parseFloat(amount) * 100) : 149900;
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
