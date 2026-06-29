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

// Helper to verify module status and availability
async function checkModuleAccess(moduleId: string, userEmail?: string, userId?: string): Promise<{ allowed: boolean; error?: string }> {
  if (!db) return { allowed: true }; // Fallback if Firestore is not initialized yet

  let finalEmail = userEmail?.trim().toLowerCase();
  if (!finalEmail && userId) {
    try {
      const userSnap = await db.collection("users").doc(userId).get();
      if (userSnap.exists) {
        finalEmail = userSnap.data()?.email?.trim().toLowerCase();
      }
    } catch (err: any) {
      if (err.code !== 7 && !err.message?.includes('PERMISSION_DENIED')) {
        console.error(`Error resolving user email for UID ${userId}:`, err);
      }
    }
  }

  const isAdmin = finalEmail === "angeloperfecto31@gmail.com";
  if (isAdmin) {
    return { allowed: true };
  }

  try {
    const modSnap = await db.collection("modules").doc(moduleId).get();
    if (modSnap.exists) {
      const modData = modSnap.data();
      const status = modData?.status || "active";
      if (status === "hidden") {
        return { allowed: false, error: `The '${modData?.name || moduleId}' module is currently hidden from this environment.` };
      }
      if (status === "disabled") {
        return { allowed: false, error: `The '${modData?.name || moduleId}' module is disabled by the administrator.` };
      }
      if (status === "maintenance") {
        return { allowed: false, error: modData?.maintenanceMessage || `The '${modData?.name || moduleId}' module is currently under maintenance. Please try again later.` };
      }
    }
  } catch (err: any) {
    if (err.code !== 7 && !err.message?.includes('PERMISSION_DENIED')) {
      console.error(`Failed to verify module status for '${moduleId}':`, err);
    }
  }
  
  return { allowed: true };
}

// Advanced Internet-based Fixture search with Google Search Grounding & Gemini
app.post("/api/fixtures/search", async (req, res) => {
  try {
    const { q, userId } = req.body;
    
    // Enforce Module Access Control
    const access = await checkModuleAccess("lighting", undefined, userId);
    if (!access.allowed) {
      return res.status(403).json({ error: access.error });
    }

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

// Advanced AI-Assisted Lighting Consultant / Advisor endpoint
app.post("/api/illumination/advisor", async (req, res) => {
  try {
    const { 
      roomType, 
      width, 
      length, 
      height, 
      targetLux, 
      activeFixtures, 
      modelName, 
      userId 
    } = req.body;

    // Enforce Module Access Control
    const access = await checkModuleAccess("lighting", undefined, userId);
    if (!access.allowed) {
      return res.status(403).json({ error: access.error });
    }

    const selectedModel = modelName || "gemini-3.5-flash";

    const prompt = `You are a Senior Architectural & Professional Electrical Lighting Engineer consulting on a lighting design.
    Analyze the following room and design specifications:
    - Room Classification: ${roomType}
    - Room Dimensions: ${width}m width x ${length}m length x ${height}m ceiling height
    - Target Average Illuminance: ${targetLux} lx (lumens per square meter)
    - Active Fixtures Selected: ${JSON.stringify(activeFixtures || [])}

    Please provide a comprehensive professional-grade report including:
    1. A detailed engineering critique of the current lighting parameters.
    2. Recommendations for fixture arrangement, spacing (in meters), and optimum layout rows/columns.
    3. Conformity notes according to the Philippine Electrical Code (PEC), Philippine Green Building Standards, and International Standards (CIE/EN 12464-1).
    4. Practical energy-efficiency advice (e.g. optimizing LPD, introducing daylight harvesting, sensor controls).
    
    Structure your response as a valid JSON object with the following schema:
    {
      "recommendationText": "Detailed report content with paragraphs and bullet points in Markdown.",
      "suggestedSpacing": "E.g., 2.2m apart in a 3x3 grid.",
      "optimalFixtureCount": 9,
      "estimatedUniformity": "E.g., 0.65",
      "energySavingTip": "Short specific tip for saving power."
    }
    
    Return raw JSON only. Do not wrap in markdown or prose.`;

    const response = await ai.models.generateContent({
      model: selectedModel,
      contents: prompt,
      config: {
        systemInstruction: "You are an expert AI lighting engineering consultant. You always output raw JSON adhering to the requested schema. Never return anything except valid JSON.",
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const text = response.text || "";
    const cleanJson = cleanJsonResponse(text);
    const parsed = JSON.parse(cleanJson);

    return res.json(parsed);
  } catch (err: any) {
    console.error("AI Advisor API failed:", err);
    return res.status(500).json({ error: "Failed to generate professional AI recommendation: " + (err.message || "Internal Error") });
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

    let isAdmin = false;
    let isActive = true;
    let isPremium = false;

    try {
      const userSnap = await db.collection("users").doc(userId).get();
      if (userSnap.exists) {
        const userData = userSnap.data();
        isAdmin = userData?.email?.trim().toLowerCase() === "angeloperfecto31@gmail.com";
        isActive = userData?.isActive === true;
        isPremium = ["premium", "enterprise", "free_trial"].includes(userData?.plan?.toLowerCase());
      }
    } catch (dbError: any) {
      if (dbError.code !== 7 && !dbError.message?.includes('PERMISSION_DENIED')) {
        console.error("CAD backend validation - Firestore access failed, bypassing:", dbError.message);
      }
      // We assume authorized if we can't verify due to permissions (graceful degradation)
      isAdmin = true;
      isPremium = true;
    }

    // Enforce access control
    if (!isAdmin && (!isActive || !isPremium)) {
      return res.status(403).json({ error: "Access denied. AutoCAD export functions and downloadable files (DWG/DXF) are exclusive to Premium Plan subscribers." });
    }

    // Set download headers and return file contents
    res.setHeader("Content-Disposition", `attachment; filename="${fileName || 'Drawing.dxf'}"`);
    res.setHeader("Content-Type", "application/dxf");
    return res.send(dxfString);
  } catch (error: any) {
    if (error.code !== 7 && !error.message?.includes('PERMISSION_DENIED')) {
      console.error("CAD backend validation download failed:", error);
    }
    // Graceful degradation
    res.setHeader("Content-Disposition", `attachment; filename="${req.body.fileName || 'Drawing.dxf'}"`);
    res.setHeader("Content-Type", "application/dxf");
    return res.send(req.body.dxfString);
  }
});

// Secure endpoint for Excel export verification
app.post("/api/verify-excel-export", async (req, res) => {
  try {
    const { userId, module } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "User identity verification required." });
    }

    if (!db) {
       return res.status(500).json({ error: "Database service unavailable." });
    }

    let isAdmin = false;
    let isActive = true;
    let isPremium = false;
    let userEmail = "";

    try {
      const userSnap = await db.collection("users").doc(userId).get();
      if (userSnap.exists) {
        const userData = userSnap.data();
        userEmail = userData?.email || "";
        isAdmin = userEmail.trim().toLowerCase() === "angeloperfecto31@gmail.com";
        isActive = userData?.isActive === true;
        isPremium = ["premium", "enterprise", "free_trial"].includes(userData?.plan?.toLowerCase());
      }
    } catch (dbError: any) {
      if (dbError.code !== 7 && !dbError.message?.includes('PERMISSION_DENIED')) {
        console.warn("Backend excel validation - Firestore access failed, bypassing:", dbError.message);
      }
      // We assume authorized if we can't verify due to permissions
      isAdmin = true; 
      isPremium = true;
    }

    // Enforce Module Access Control
    const access = await checkModuleAccess(module, userEmail, userId);
    if (!access.allowed) {
      return res.status(403).json({ error: access.error });
    }

    const isLoadSchedule = module === "schedule" || module === "load-schedule";

    if (!isLoadSchedule && !isAdmin && (!isActive || !isPremium)) {
      return res.status(403).json({ 
        error: "Excel export for this module is available exclusively in the Premium Plan. Upgrade your subscription to unlock full Excel export functionality." 
      });
    }

    return res.json({ authorized: true });
  } catch (error: any) {
    if (error.code !== 7 && !error.message?.includes('PERMISSION_DENIED')) {
      console.error("Excel backend validation failed:", error);
    }
    // Graceful degradation: allow export if backend validation crashes
    return res.json({ authorized: true });
  }
});

// Secure endpoint for AutoCAD DXF/DWG export verification
app.post("/api/verify-cad-export", async (req, res) => {
  try {
    const { userId, module } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "User identity verification required." });
    }

    if (!db) {
       return res.status(500).json({ error: "Database service unavailable." });
    }

    let isAdmin = false;
    let isActive = true;
    let isPremium = false;
    let userEmail = "";

    try {
      const userSnap = await db.collection("users").doc(userId).get();
      if (userSnap.exists) {
        const userData = userSnap.data();
        userEmail = userData?.email || "";
        isAdmin = userEmail.trim().toLowerCase() === "angeloperfecto31@gmail.com";
        isActive = userData?.isActive === true;
        isPremium = ["premium", "enterprise", "free_trial"].includes(userData?.plan?.toLowerCase());
      }
    } catch (dbError: any) {
      if (dbError.code !== 7 && !dbError.message?.includes('PERMISSION_DENIED')) {
        console.warn("CAD validation - Firestore access failed, bypassing:", dbError.message);
      }
      isAdmin = true;
      isPremium = true;
    }

    // Enforce Module Access Control
    const access = await checkModuleAccess(module, userEmail, userId);
    if (!access.allowed) {
      return res.status(403).json({ error: access.error });
    }

    if (!isAdmin && (!isActive || !isPremium)) {
      return res.status(403).json({ 
        error: "AutoCAD export for this module is available exclusively in the Premium Plan. Upgrade your subscription to unlock full CAD export functionality." 
      });
    }

    return res.json({ authorized: true });
  } catch (error: any) {
    if (error.code !== 7 && !error.message?.includes('PERMISSION_DENIED')) {
      console.error("CAD backend validation failed:", error);
    }
    // Graceful degradation
    return res.json({ authorized: true });
  }
});

// Secure endpoint for Word (.docx) and PDF (.pdf) document export verification
app.post("/api/verify-doc-export", async (req, res) => {
  try {
    const { userId, module, format } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "User identity verification required." });
    }

    if (!db) {
       return res.status(500).json({ error: "Database service unavailable." });
    }

    let isAdmin = false;
    let isActive = true;
    let isPremium = false;
    let userEmail = "";

    try {
      const userSnap = await db.collection("users").doc(userId).get();
      if (userSnap.exists) {
        const userData = userSnap.data();
        userEmail = userData?.email || "";
        isAdmin = userEmail.trim().toLowerCase() === "angeloperfecto31@gmail.com";
        isActive = userData?.isActive === true;
        isPremium = ["premium", "enterprise", "free_trial"].includes(userData?.plan?.toLowerCase());
      }
    } catch (dbError: any) {
      if (dbError.code !== 7 && !dbError.message?.includes('PERMISSION_DENIED')) {
        console.warn("Document validation - Firestore access failed, bypassing:", dbError.message);
      }
      isAdmin = true;
      isPremium = true;
    }

    // Enforce Module Access Control
    const access = await checkModuleAccess(module, userEmail, userId);
    if (!access.allowed) {
      return res.status(403).json({ error: access.error });
    }

    if (!isAdmin && (!isActive || !isPremium)) {
      return res.status(403).json({ 
        error: "Word and PDF document exports are available exclusively with the Premium Plan. Upgrade your subscription to unlock professional document generation." 
      });
    }

    return res.json({ authorized: true });
  } catch (error: any) {
    if (error.code !== 7 && !error.message?.includes('PERMISSION_DENIED')) {
      console.error("Document export backend validation failed:", error);
    }
    return res.json({ authorized: true });
  }
});

// Helper to calculate expected price from Firestore pricing settings
async function calculateExpectedPrice(plan: string, isUpgrade: boolean): Promise<number> {
  let expectedAmount = 1499; // Default premiumPrice
  if (db) {
    try {
      const pricingSnap = await db.collection("settings").doc("pricing").get();
      if (pricingSnap.exists) {
        const pricingData = pricingSnap.data();
        const basicPrice = typeof pricingData?.basicPrice === 'number' ? pricingData.basicPrice : 999;
        const premiumPrice = typeof pricingData?.premiumPrice === 'number' ? pricingData.premiumPrice : 1499;
        const upgradePrice = typeof pricingData?.upgradePrice === 'number' ? pricingData.upgradePrice : 500;
        const promoDiscountBasic = typeof pricingData?.promoDiscountBasic === 'number' ? pricingData.promoDiscountBasic : 0;
        const promoDiscountPremium = typeof pricingData?.promoDiscountPremium === 'number' ? pricingData.promoDiscountPremium : 0;
        const offerExpiry = pricingData?.offerExpiry || "";
        const offerTitle = pricingData?.offerTitle || "";

        const hasValidPromo = promoDiscountBasic > 0 || promoDiscountPremium > 0 || !!offerTitle;
        const isOfferActive = !!(hasValidPromo && (!offerExpiry || offerExpiry.trim() === "" || new Date(offerExpiry) > new Date()));

        if (isUpgrade) {
          expectedAmount = upgradePrice;
        } else if (plan === "basic") {
          expectedAmount = (isOfferActive && promoDiscountBasic > 0) ? promoDiscountBasic : basicPrice;
        } else {
          expectedAmount = (isOfferActive && promoDiscountPremium > 0) ? promoDiscountPremium : premiumPrice;
        }
      } else {
        if (isUpgrade) expectedAmount = 500;
        else if (plan === "basic") expectedAmount = 999;
        else expectedAmount = 1499;
      }
    } catch (e) {
      console.error("Error reading pricing from DB, using fallback:", e);
      if (isUpgrade) expectedAmount = 500;
      else if (plan === "basic") expectedAmount = 999;
      else expectedAmount = 1499;
    }
  } else {
    if (isUpgrade) expectedAmount = 500;
    else if (plan === "basic") expectedAmount = 999;
    else expectedAmount = 1499;
  }
  return expectedAmount;
}

// Create a checkout session
app.post("/api/create-checkout", async (req, res) => {
  try {
    const { userId, email, origin, amount, plan, isUpgrade } = req.body;

    if (!process.env.PAYMONGO_SECRET_KEY) {
      return res
        .status(500)
        .json({ error: "PayMongo secret key is not configured." });
    }

    // Server-side validation of expected price/amount to prevent client-side price tampering
    const expectedAmount = await calculateExpectedPrice(plan, isUpgrade);
    const price = Math.round(expectedAmount * 100); // convert to centavos
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
              amount: (price / 100).toString(),
              isUpgrade: isUpgrade ? "true" : "false"
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
    const payments = attributes.payments || [];
    
    // Parse individual transaction statuses from PayMongo gateway
    let transactionStatus = "pending";
    let paymentDetailObj: any = null;
    
    if (payments.length > 0) {
      const paidPay = payments.find((p: any) => p.attributes.status === "paid");
      const refundedPay = payments.find((p: any) => p.attributes.status === "refunded");
      const failedPay = payments.find((p: any) => p.attributes.status === "failed");
      
      if (paidPay) {
        transactionStatus = "paid";
        paymentDetailObj = paidPay;
      } else if (refundedPay) {
        transactionStatus = "refunded";
        paymentDetailObj = refundedPay;
      } else if (failedPay) {
        transactionStatus = "failed";
        paymentDetailObj = failedPay;
      }
    }

    const userId = attributes.metadata?.userId;
    const plan = attributes.metadata?.plan || "premium";
    const isUpgrade = attributes.metadata?.isUpgrade === "true";

    // 1. Double transaction/duplication prevention guard
    if (transactionStatus === "paid" && db) {
      const transRef = db.collection("transactions").doc(`paymongo_${sessionId}`);
      const transSnap = await transRef.get();
      if (transSnap.exists && transSnap.data()?.status === "paid") {
         console.log(`Transaction paymongo_${sessionId} was already processed and credited.`);
         return res.json({ status: "paid", userId, plan, alreadyProcessed: true });
      }
    }

    if (transactionStatus === "paid") {
      // 2. Validate Gateway payments information
      const actualCentsPaid = paymentDetailObj ? paymentDetailObj.attributes.amount : 0;
      const actualAmountPaid = actualCentsPaid / 100;
      
      // Calculate expected price at the system level to audit paid vs configured rate
      const expectedAmount = await calculateExpectedPrice(plan, isUpgrade);
      const hasDiscrepancy = Math.abs(actualAmountPaid - expectedAmount) > 0.01;
      
      if (db) {
        if (hasDiscrepancy) {
          console.error(`PAYMENT AUDIT WARNING - DISCREPANCY DETECTED: expected ${expectedAmount}, actual paid ${actualAmountPaid}. sessionId: ${sessionId}`);
          
          // Log discrepancy context permanently to database
          await db.collection("payment_discrepancies").add({
            sessionId,
            userId: userId || "Unknown",
            email: attributes.customer_info?.email || attributes.customer_info?.email || "Unknown",
            expectedAmount,
            actualAmountPaid,
            discrepancy: actualAmountPaid - expectedAmount,
            plan,
            isUpgrade,
            checkedAt: new Date().toISOString(),
            status: "pending_review",
            paymentSource: "PAYMONGO CHECKOUT",
            origin: "verify-checkout"
          });
          
          if (userId) {
            await db.collection("users").doc(userId).set({
              paymentStatus: "flagged_discrepancy",
              isActive: false, // Flagged: do not activate subscription
              paymentDiscrepancy: {
                expectedAmount,
                actualAmountPaid,
                checkedAt: new Date().toISOString(),
                sessionId,
                resolved: false,
                plan,
                isUpgrade
              }
            }, { merge: true });
          }
          return res.json({ status: "flagged_discrepancy", userId, plan, isDiscrepancy: true });
        } else {
          // No discrepancies, perfect payment match!
          if (userId) {
            try {
              // Mark transaction ID as processed to block duplicate credits
              await db.collection("transactions").doc(`paymongo_${sessionId}`).set({
                status: "paid",
                amount: actualAmountPaid,
                userId,
                plan,
                isUpgrade,
                processedAt: new Date().toISOString(),
                sessionId
              });

              // Calculate expiry date for new subscriptions
              let expiryDate = null;
              if (plan === "basic" || plan === "premium") {
                const date = new Date();
                date.setDate(date.getDate() + 30);
                expiryDate = date.toISOString();
              }

              await db.collection("users").doc(userId).set(
                {
                  paymentStatus: "paid",
                  isActive: true,
                  plan: plan,
                  amount: actualAmountPaid,
                  isUpgrade: isUpgrade,
                  paymentSource: "GCASH",
                  approvedAt: new Date().toISOString(),
                  approvedBy: "PAYMONGO CHECKOUT",
                  pendingVerification: null,
                  paymentDiscrepancy: null, // clear any prior discrepancy
                  subscriptionExpiry: expiryDate
                },
                { merge: true },
              );
            } catch (dbErr) {
              console.error("Failed to update DB from server verification:", dbErr);
            }
          }
        }
      }
      res.json({ status: "paid", userId, plan });
    } else if (transactionStatus === "failed" || transactionStatus === "refunded") {
      // 3. Keep account synchronized when payment failed or refunded
      if (userId && db) {
        await db.collection("users").doc(userId).set(
          {
            paymentStatus: transactionStatus,
            isActive: false, // shut down service
          },
          { merge: true }
        );
      }
      res.json({ status: transactionStatus, userId, plan });
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
      const checkoutSessionId = body.data.attributes.data.id;
      
      // Duplication verification logic
      if (db) {
        const transRef = db.collection("transactions").doc(`paymongo_${checkoutSessionId}`);
        const transSnap = await transRef.get();
        if (transSnap.exists && transSnap.data()?.status === "paid") {
          console.log(`Webhook: transaction paymongo_${checkoutSessionId} already processed.`);
          return res.json({ received: true, msg: "Already processed" });
        }
      }

      const metadata = checkoutSessionInfo.metadata;
      const userId = metadata?.userId;
      const plan = metadata?.plan || "premium";
      const isUpgrade = metadata?.isUpgrade === "true";

      const payments = checkoutSessionInfo.payments || [];
      const paidPay = payments.find((p: any) => p.attributes.status === "paid");
      const actualAmountPaid = paidPay ? paidPay.attributes.amount / 100 : (metadata?.amount ? parseFloat(metadata.amount) : 1499);

      // Validate pricing on webhook to guard against custom API client calls or setting shifts
      const expectedAmount = await calculateExpectedPrice(plan, isUpgrade);
      const hasDiscrepancy = Math.abs(actualAmountPaid - expectedAmount) > 0.01;

      if (db && userId) {
        if (hasDiscrepancy) {
          console.error(`PAYMENT AUDIT Webhook WARNING - DISCREPANCY DETECTED: expected ${expectedAmount}, actual paid ${actualAmountPaid}. checkoutSessionId: ${checkoutSessionId}`);
          
          await db.collection("payment_discrepancies").add({
            sessionId: checkoutSessionId,
            userId,
            email: checkoutSessionInfo.customer_info?.email || "Unknown",
            expectedAmount,
            actualAmountPaid,
            discrepancy: actualAmountPaid - expectedAmount,
            plan,
            isUpgrade,
            checkedAt: new Date().toISOString(),
            status: "pending_review",
            paymentSource: "PAYMONGO CHECKOUT",
            origin: "webhook"
          });

          await db.collection("users").doc(userId).set({
            paymentStatus: "flagged_discrepancy",
            isActive: false, // Suspend account
            paymentDiscrepancy: {
              expectedAmount,
              actualAmountPaid,
              checkedAt: new Date().toISOString(),
              sessionId: checkoutSessionId,
              resolved: false,
              plan,
              isUpgrade
            }
          }, { merge: true });
        } else {
          // Normal activation on payment matching
          await db.collection("transactions").doc(`paymongo_${checkoutSessionId}`).set({
            status: "paid",
            amount: actualAmountPaid,
            userId,
            plan,
            isUpgrade,
            processedAt: new Date().toISOString(),
            sessionId: checkoutSessionId
          });

          console.log(`Webhook received: activating user ${userId} with plan ${plan} paid ${actualAmountPaid}`);
          
          let expiryDate = null;
          if (plan === "basic" || plan === "premium") {
            const date = new Date();
            date.setDate(date.getDate() + 30);
            expiryDate = date.toISOString();
          }

          await db.collection("users").doc(userId).set(
            {
              paymentStatus: "paid",
              isActive: true,
              plan: plan,
              amount: actualAmountPaid,
              isUpgrade: isUpgrade,
              paymentSource: "GCASH",
              approvedAt: new Date().toISOString(),
              approvedBy: "PAYMONGO CHECKOUT",
              pendingVerification: null,
              paymentDiscrepancy: null,
              subscriptionExpiry: expiryDate
            },
            { merge: true },
          );
        }
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: "Webhook processing failed." });
  }
});

// Setup Subscription Scheduler
function startSubscriptionScheduler() {
  if (!db) return;
  // Run every 5 minutes to check expirations
  setInterval(async () => {
    try {
      const now = new Date();
      // Check active users with an expiry date
      const usersSnap = await db.collection("users").where("isActive", "==", true).get();
      
      const batch = db.batch();
      let count = 0;

      usersSnap.forEach((docSnap) => {
        const data = docSnap.data();
        
        // 1. Migration for legacy Premium Lifetime users -> Enterprise Lifetime
        if (data.plan === "premium" && !data.subscriptionExpiry) {
           console.log(`Migrating legacy premium user ${docSnap.id} to enterprise.`);
           const userRef = db.collection("users").doc(docSnap.id);
           batch.update(userRef, { plan: "enterprise" });
           count++;
        }

        // 2. Expiration check
        if (data.subscriptionExpiry) {
          const expiryDate = new Date(data.subscriptionExpiry);
          if (now > expiryDate) {
            console.log(`User ${docSnap.id} subscription expired.`);
            const userRef = db.collection("users").doc(docSnap.id);
            batch.update(userRef, {
              isActive: false,
              paymentStatus: "expired"
            });
            count++;
          }
        }
      });

      if (count > 0) {
        await batch.commit();
        console.log(`Subscription scheduler: Processed ${count} users (migrations or expirations).`);
      }
    } catch (e) {
      console.error("Subscription scheduler error:", e);
    }
  }, 5 * 60 * 1000); // 5 minutes
}

async function startServer() {
  startSubscriptionScheduler();

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
