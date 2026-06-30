import React, { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx-js-style";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, BorderStyle } from "docx";
import { saveAs } from "file-saver";
import { User, signOut } from "firebase/auth";
import { auth, db } from "../firebase";
import {
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { handleFirestoreError, OperationType } from "../utils/firestoreError";
import { GCASH_DEFAULT_QR_BASE64 } from "./GcashQrAsset";
import {
  ShieldCheck,
  LogOut,
  CheckCircle2,
  Loader2,
  AlertCircle,
  QrCode,
  CreditCard,
  Send,
  Search,
  Users,
  Check,
  X,
  UserCheck,
  ExternalLink,
  Copy,
  ArrowUpRight,
  ArrowRight,
  MoreVertical,
  MoreHorizontal,
  Clock,
  TrendingUp,
  FileSpreadsheet,
  FileText,
  Sparkles,
  Filter,
  Trash2,
  ChevronDown,
  Plus,
  Zap,
  ArrowUpDown,
  CalendarRange,
  Settings,
} from "lucide-react";
import axios from "axios";
import InvoiceManager, { createOrGetInvoiceData } from "./InvoiceManager";
import SubscriptionManager from "./SubscriptionManager";

const getUserName = (u: any) => {
  if (u.name) return u.name;
  if (u.displayName) return u.displayName;
  if (u.senderName) return u.senderName;
  if (u.pendingVerification?.senderName) return u.pendingVerification.senderName;
  
  const email = (u.email || "").trim().toLowerCase();
  if (email === "angeloperfecto.epc@gmail.com") return "Angelo Perfecto";
  if (email === "jeloperfecto@gmail.com") return "Jelo Perfecto";
  if (email === "angeloperfecto31@gmail.com") return "Angelo Perfecto";
  
  if (u.email) {
    const parts = u.email.split('@')[0].split(/[._]/);
    return parts.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }
  return "Unknown User";
};

interface PaymentScreenProps {
  user: User;
  onPaymentSuccess?: () => void;
  forceAdmin?: boolean;
  isUpgrade?: boolean;
  isRenewal?: boolean;
  onClose?: () => void;
}

export default function PaymentScreen({
  user,
  onPaymentSuccess,
  forceAdmin = false,
  isUpgrade = false,
  isRenewal = false,
  onClose,
}: PaymentScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [success, setSuccess] = useState(false);

  // Tabs for the customer view: "maribank", "manual", "paymongo", or "maya"
  const [paymentMethod, setPaymentMethod] = useState<"maribank" | "manual" | "paymongo" | "maya">(
    "maribank"
  );

  // Manual payment inputs
  const [manualName, setManualName] = useState("");
  const [manualRefNo, setManualRefNo] = useState("");
  const [submittingManual, setSubmittingManual] = useState(false);
  const [manualMessage, setManualMessage] = useState("");

  // Firestore user profile state
  const [userProfile, setUserProfile] = useState<any>(null);

  // GCash QR Code configuration settings state
  const [gcashQrUrl, setGcashQrUrl] = useState<string>("");
  const [maribankQrUrl, setMaribankQrUrl] = useState<string>("");
  const [mayaQrUrl, setMayaQrUrl] = useState<string>("");
  const [uploadingQr, setUploadingQr] = useState(false);
  const [uploadingMaribankQr, setUploadingMaribankQr] = useState(false);
  const [uploadingMayaQr, setUploadingMayaQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"basic" | "premium" | "enterprise">("premium");

  // Custom confirmation states to bypass native window.confirm blocks in sandboxed iframes
  const [confirmDeleteReg, setConfirmDeleteReg] = useState(false);
  const [confirmCancelReview, setConfirmCancelReview] = useState(false);
  const [confirmResetGcash, setConfirmResetGcash] = useState(false);
  const [confirmResetMaribank, setConfirmResetMaribank] = useState(false);
  const [confirmResetMaya, setConfirmResetMaya] = useState(false);
  const [confirmClearPromo, setConfirmClearPromo] = useState(false);
  const [adminSubTab, setAdminSubTab] = useState<"verifications" | "invoices" | "subscriptions">("verifications");

  // Feature List Defaults
  const DEFAULT_BASIC_FEATURES = "Access to all design tools\nExport load schedules to Excel\n-Word File Export feature";
  const DEFAULT_PREMIUM_FEATURES = "Everything in Basic Plan\nFull Word File Report Generation\nPremium Support Access";
  const DEFAULT_ENTERPRISE_FEATURES = "Everything in Premium Plan\nAdvanced Admin Analytics\nPriority White-Glove Support\nCustom API Integrations";
  const DEFAULT_UPGRADE_FEATURES = "Full Word File Report Generation\nPremium Support Access";

  // Dynamic Pricing State
  const [pricingSettings, setPricingSettings] = useState({
    basicPrice: 999,
    premiumPrice: 1499,
    enterprisePrice: 2999,
    upgradePrice: 500,
    promoDiscountBasic: 0,
    promoDiscountPremium: 0,
    promoDiscountEnterprise: 0,
    offerTitle: "",
    offerExpiry: "",
    basicFeatures: DEFAULT_BASIC_FEATURES,
    premiumFeatures: DEFAULT_PREMIUM_FEATURES,
    enterpriseFeatures: DEFAULT_ENTERPRISE_FEATURES,
    upgradeFeatures: DEFAULT_UPGRADE_FEATURES,
    enableMaribank: true,
    enableGCash: true,
    enablePayMongo: true,
    enableMaya: true,
  });

  // Admin Pricing Input States
  const [adminBasicPrice, setAdminBasicPrice] = useState<string>("999");
  const [adminPremiumPrice, setAdminPremiumPrice] = useState<string>("1499");
  const [adminEnterprisePrice, setAdminEnterprisePrice] = useState<string>("2999");
  const [adminUpgradePrice, setAdminUpgradePrice] = useState<string>("500");
  const [adminPromoDiscountBasic, setAdminPromoDiscountBasic] = useState<string>("0");
  const [adminPromoDiscountPremium, setAdminPromoDiscountPremium] = useState<string>("0");
  const [adminPromoDiscountEnterprise, setAdminPromoDiscountEnterprise] = useState<string>("0");
  const [adminOfferTitle, setAdminOfferTitle] = useState<string>("");
  const [adminOfferExpiry, setAdminOfferExpiry] = useState<string>("");
  const [adminBasicFeatures, setAdminBasicFeatures] = useState<string>(DEFAULT_BASIC_FEATURES);
  const [adminPremiumFeatures, setAdminPremiumFeatures] = useState<string>(DEFAULT_PREMIUM_FEATURES);
  const [adminEnterpriseFeatures, setAdminEnterpriseFeatures] = useState<string>(DEFAULT_ENTERPRISE_FEATURES);
  const [adminUpgradeFeatures, setAdminUpgradeFeatures] = useState<string>(DEFAULT_UPGRADE_FEATURES);
  const [adminEnableMaribank, setAdminEnableMaribank] = useState<boolean>(true);
  const [adminEnableGCash, setAdminEnableGCash] = useState<boolean>(true);
  const [adminEnablePayMongo, setAdminEnablePayMongo] = useState<boolean>(true);
  const [adminEnableMaya, setAdminEnableMaya] = useState<boolean>(true);
  const [savingPricing, setSavingPricing] = useState<boolean>(false);
  const hasLoadedPricingInputs = useRef(false);
  const hasSelectedInitialPlan = useRef(false);

  // Helper calculations for dynamic values
  const offerExpiryDate = (pricingSettings.offerExpiry && pricingSettings.offerExpiry.trim() !== "" && !isNaN(new Date(pricingSettings.offerExpiry).getTime())) 
    ? new Date(pricingSettings.offerExpiry) 
    : null;
  const hasValidPromo = pricingSettings.promoDiscountBasic > 0 || pricingSettings.promoDiscountPremium > 0 || pricingSettings.promoDiscountEnterprise > 0 || pricingSettings.offerTitle;
  const isOfferActive = !!(hasValidPromo && (!offerExpiryDate || offerExpiryDate > new Date()));
  
  const basicFinalPrice = (isOfferActive && pricingSettings.promoDiscountBasic > 0) 
    ? pricingSettings.promoDiscountBasic 
    : pricingSettings.basicPrice;
  const premiumFinalPrice = (isOfferActive && pricingSettings.promoDiscountPremium > 0) 
    ? pricingSettings.promoDiscountPremium 
    : pricingSettings.premiumPrice;
  const enterpriseFinalPrice = (isOfferActive && pricingSettings.promoDiscountEnterprise > 0) 
    ? pricingSettings.promoDiscountEnterprise 
    : pricingSettings.enterprisePrice;
  
  // Calculate upgrade price safely - upgrade section should not apply any promo/discount campaign rates
  const upgradeFinalPrice = pricingSettings.upgradePrice;

  const copyToClipboard = () => {
    navigator.clipboard.writeText("09939170684");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Admin View state
  const [isAdminMode, setIsAdminMode] = useState(forceAdmin);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [discrepancies, setDiscrepancies] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [adminFilter, setAdminFilter] = useState<
    "all" | "pending" | "paid" | "lifetime" | "unpaid" | "free_trial"
  >("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [planFilter, setPlanFilter] = useState<"all" | "free" | "basic" | "premium" | "enterprise">("all");
  const [adminStatusMsg, setAdminStatusMsg] = useState("");
  const [confirmingAction, setConfirmingAction] = useState<{
    uid: string;
    type: "approve" | "reject" | "toggle" | "delete";
    email: string;
    currentActiveStatus?: boolean;
  } | null>(null);
  
  const [manageSubAction, setManageSubAction] = useState<{
    uid: string;
    email: string;
    plan: string;
    expiresAt: string;
    isActive: boolean;
  } | null>(null);
  const [activeDropdownUid, setActiveDropdownUid] = useState<string | null>(null);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState<{ uid: string; email: string } | null>(null);

  const isAdminUser =
    user?.email?.trim().toLowerCase() === "angeloperfecto31@gmail.com";

  useEffect(() => {
    // Listen to real-time changes in the user's Firestore document
    const unsubscribe = onSnapshot(
      doc(db, "users", user.uid),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserProfile(data);
          
          // Pre-select the user's current plan on initial load so they can choose what subscription to renew
          if (!hasSelectedInitialPlan.current && data.plan && (data.plan === "basic" || data.plan === "premium" || data.plan === "enterprise")) {
            setSelectedPlan(data.plan);
            hasSelectedInitialPlan.current = true;
          }

          let isExpired = false;
          if ((data.plan === "basic" || data.plan === "premium" || data.plan === "free") && data.expiresAt) {
            const expires = new Date(data.expiresAt);
            if (new Date() >= expires) {
              isExpired = true;
            }
          }

          if (isUpgrade) {
            if (!isRenewal && data.plan === "premium") {
              setSuccess(true);
              if (onPaymentSuccess) {
                setTimeout(() => onPaymentSuccess(), 2500);
              }
            }
          } else {
            if (!isRenewal && data.isActive === true && !isExpired) {
              setSuccess(true);
              if (onPaymentSuccess) {
                setTimeout(() => onPaymentSuccess(), 2500);
              }
            }
          }
        } else {
          setUserProfile(null);
        }
      },
      (error) => {
        console.error("user profile onSnapshot error:", error);
        try {
          handleFirestoreError(error, OperationType.GET, "users/" + user.uid);
        } catch (e) {}
      },
    );

    return () => unsubscribe();
  }, [user.uid, isUpgrade]);

  useEffect(() => {
    // If the currently selected method is disabled, switch to another available method
    if (paymentMethod === "maya" && !pricingSettings.enableMaya) {
      if (pricingSettings.enableMaribank) setPaymentMethod("maribank");
      else if (pricingSettings.enableGCash) setPaymentMethod("manual");
      else if (pricingSettings.enablePayMongo) setPaymentMethod("paymongo");
    } else if (paymentMethod === "maribank" && !pricingSettings.enableMaribank) {
      if (pricingSettings.enableMaya) setPaymentMethod("maya");
      else if (pricingSettings.enableGCash) setPaymentMethod("manual");
      else if (pricingSettings.enablePayMongo) setPaymentMethod("paymongo");
    } else if (paymentMethod === "manual" && !pricingSettings.enableGCash) {
      if (pricingSettings.enableMaya) setPaymentMethod("maya");
      else if (pricingSettings.enableMaribank) setPaymentMethod("maribank");
      else if (pricingSettings.enablePayMongo) setPaymentMethod("paymongo");
    } else if (paymentMethod === "paymongo" && !pricingSettings.enablePayMongo) {
      if (pricingSettings.enableMaya) setPaymentMethod("maya");
      else if (pricingSettings.enableMaribank) setPaymentMethod("maribank");
      else if (pricingSettings.enableGCash) setPaymentMethod("manual");
    }
  }, [pricingSettings.enableMaribank, pricingSettings.enableGCash, pricingSettings.enablePayMongo, pricingSettings.enableMaya, paymentMethod]);

  useEffect(() => {
    // Listen to real-time changes in global GCash payment settings
    const unsubscribeGcash = onSnapshot(
      doc(db, "settings", "gcash"),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.qrCodeDataUrl) {
            setGcashQrUrl(data.qrCodeDataUrl);
          } else {
            setGcashQrUrl("");
          }
        }
      },
      (error) => {
        console.error("settings gcash onSnapshot error:", error);
      },
    );

    const unsubscribeMaribank = onSnapshot(
      doc(db, "settings", "maribank"),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.qrCodeDataUrl) {
            setMaribankQrUrl(data.qrCodeDataUrl);
          } else {
            setMaribankQrUrl("");
          }
        }
      },
      (error) => {
        console.error("settings maribank onSnapshot error:", error);
      },
    );

    const unsubscribeMaya = onSnapshot(
      doc(db, "settings", "maya"),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.qrCodeDataUrl) {
            setMayaQrUrl(data.qrCodeDataUrl);
          } else {
            setMayaQrUrl("");
          }
        }
      },
      (error) => {
        console.error("settings maya onSnapshot error:", error);
      },
    );

    const unsubscribePricing = onSnapshot(
      doc(db, "settings", "pricing"),
      async (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const basic = typeof data.basicPrice === 'number' ? data.basicPrice : 999;
          const premium = typeof data.premiumPrice === 'number' ? data.premiumPrice : 1499;
          const enterprise = typeof data.enterprisePrice === 'number' ? data.enterprisePrice : 2999;
          const upgrade = typeof data.upgradePrice === 'number' ? data.upgradePrice : 500;
          const promoBasic = typeof data.promoDiscountBasic === 'number' ? data.promoDiscountBasic : 0;
          const promoPremium = typeof data.promoDiscountPremium === 'number' ? data.promoDiscountPremium : 0;
          const promoEnterprise = typeof data.promoDiscountEnterprise === 'number' ? data.promoDiscountEnterprise : 0;
          const title = data.offerTitle || "";
          const expiry = data.offerExpiry || "";
          const basicFeatures = data.basicFeatures || DEFAULT_BASIC_FEATURES;
          const premiumFeatures = data.premiumFeatures || DEFAULT_PREMIUM_FEATURES;
          const enterpriseFeatures = data.enterpriseFeatures || DEFAULT_ENTERPRISE_FEATURES;
          const upgradeFeatures = data.upgradeFeatures || DEFAULT_UPGRADE_FEATURES;
          const enableMaribank = data.enableMaribank !== false; // defaults to true
          const enableGCash = data.enableGCash !== false;
          const enablePayMongo = data.enablePayMongo !== false;
          const enableMaya = data.enableMaya !== false;

          setPricingSettings({
            basicPrice: basic,
            premiumPrice: premium,
            enterprisePrice: enterprise,
            upgradePrice: upgrade,
            promoDiscountBasic: promoBasic,
            promoDiscountPremium: promoPremium,
            promoDiscountEnterprise: promoEnterprise,
            offerTitle: title,
            offerExpiry: expiry,
            basicFeatures: basicFeatures,
            premiumFeatures: premiumFeatures,
            enterpriseFeatures: enterpriseFeatures,
            upgradeFeatures: upgradeFeatures,
            enableMaribank,
            enableGCash,
            enablePayMongo,
            enableMaya,
          });

          // Prefill admin panels only on first load, to prevent overwriting active admin edits
          if (!hasLoadedPricingInputs.current) {
            setAdminBasicPrice(basic.toString());
            setAdminPremiumPrice(premium.toString());
            setAdminEnterprisePrice(enterprise.toString());
            setAdminUpgradePrice(upgrade.toString());
            setAdminPromoDiscountBasic(promoBasic.toString());
            setAdminPromoDiscountPremium(promoPremium.toString());
            setAdminPromoDiscountEnterprise(promoEnterprise.toString());
            setAdminOfferTitle(title);
            setAdminOfferExpiry(expiry);
            setAdminBasicFeatures(basicFeatures);
            setAdminPremiumFeatures(premiumFeatures);
            setAdminEnterpriseFeatures(enterpriseFeatures);
            setAdminUpgradeFeatures(upgradeFeatures);
            setAdminEnableMaribank(enableMaribank);
            setAdminEnableGCash(enableGCash);
            setAdminEnablePayMongo(enablePayMongo);
            setAdminEnableMaya(enableMaya);
            hasLoadedPricingInputs.current = true;
          }
        } else {
          // If the pricing document doesn't exist, set local state to defaults and auto-seed if admin is logged in
          setPricingSettings({
            basicPrice: 999,
            premiumPrice: 1499,
            enterprisePrice: 2999,
            upgradePrice: 500,
            promoDiscountBasic: 0,
            promoDiscountPremium: 0,
            promoDiscountEnterprise: 0,
            offerTitle: "",
            offerExpiry: "",
            basicFeatures: DEFAULT_BASIC_FEATURES,
            premiumFeatures: DEFAULT_PREMIUM_FEATURES,
            enterpriseFeatures: DEFAULT_ENTERPRISE_FEATURES,
            upgradeFeatures: DEFAULT_UPGRADE_FEATURES,
            enableMaribank: true,
            enableGCash: true,
            enablePayMongo: true,
            enableMaya: true,
          });

          if (isAdminUser) {
            try {
              await setDoc(doc(db, "settings", "pricing"), {
                basicPrice: 999,
                premiumPrice: 1499,
                enterprisePrice: 2999,
                upgradePrice: 500,
                promoDiscountBasic: 0,
                promoDiscountPremium: 0,
                promoDiscountEnterprise: 0,
                offerTitle: "",
                offerExpiry: "",
                basicFeatures: DEFAULT_BASIC_FEATURES,
                premiumFeatures: DEFAULT_PREMIUM_FEATURES,
                enterpriseFeatures: DEFAULT_ENTERPRISE_FEATURES,
                upgradeFeatures: DEFAULT_UPGRADE_FEATURES,
                enableMaribank: true,
                enableGCash: true,
                enablePayMongo: true,
                enableMaya: true,
                updatedBy: "System (Auto-generated)",
                updatedAt: new Date().toISOString()
              });
            } catch (err) {
              console.error("Failed to auto-seed settings/pricing document:", err);
            }
          }
        }
      },
      (error) => {
        console.error("settings pricing onSnapshot error:", error);
      }
    );

    return () => {
      unsubscribeGcash();
      unsubscribeMaribank();
      unsubscribeMaya();
      unsubscribePricing();
    };
  }, []);

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 800 * 1024) {
      setAdminStatusMsg(
        "Error: Selected image file is too large. Please select a cropped QR image of less than 800KB.",
      );
      return;
    }

    setUploadingQr(true);
    setAdminStatusMsg("");
    const reader = new FileReader();

    reader.onload = async (event) => {
      const base64String = event.target?.result as string;
      if (!base64String) {
        setAdminStatusMsg("Error: Failed to process image file.");
        setUploadingQr(false);
        return;
      }

      try {
        await setDoc(
          doc(db, "settings", "gcash"),
          {
            qrCodeDataUrl: base64String,
            updatedBy: user.email || "",
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
        setAdminStatusMsg("GCash QR Code updated successfully!");
      } catch (err: any) {
        setAdminStatusMsg("Failed to update QR Code: " + err.message);
        try {
          handleFirestoreError(err, OperationType.WRITE, "settings/gcash");
        } catch (e) {}
      } finally {
        setUploadingQr(false);
      }
    };

    reader.onerror = () => {
      setAdminStatusMsg("Error reading image file.");
      setUploadingQr(false);
    };

    reader.readAsDataURL(file);
  };

  const handleMaribankQrUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 800 * 1024) {
      setAdminStatusMsg(
        "Error: Selected image file is too large. Please select a cropped QR image of less than 800KB.",
      );
      return;
    }

    setUploadingMaribankQr(true);
    setAdminStatusMsg("");
    const reader = new FileReader();

    reader.onload = async (event) => {
      const base64String = event.target?.result as string;
      if (!base64String) {
        setAdminStatusMsg("Error: Failed to process image file.");
        setUploadingMaribankQr(false);
        return;
      }

      try {
        await setDoc(
          doc(db, "settings", "maribank"),
          {
            qrCodeDataUrl: base64String,
            updatedBy: user.email || "",
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
        setAdminStatusMsg("MariBank QR Code updated successfully!");
      } catch (err: any) {
        setAdminStatusMsg("Failed to update QR Code: " + err.message);
        try {
          handleFirestoreError(err, OperationType.WRITE, "settings/maribank");
        } catch (e) {}
      } finally {
        setUploadingMaribankQr(false);
      }
    };

    reader.onerror = () => {
      setAdminStatusMsg("Error reading image file.");
      setUploadingMaribankQr(false);
    };

    reader.readAsDataURL(file);
  };

  const handleMayaQrUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 800 * 1024) {
      setAdminStatusMsg(
        "Error: Selected image file is too large. Please select a cropped QR image of less than 800KB.",
      );
      return;
    }

    setUploadingMayaQr(true);
    setAdminStatusMsg("");
    const reader = new FileReader();

    reader.onload = async (event) => {
      const base64String = event.target?.result as string;
      if (!base64String) {
        setAdminStatusMsg("Error: Failed to process image file.");
        setUploadingMayaQr(false);
        return;
      }

      try {
        await setDoc(
          doc(db, "settings", "maya"),
          {
            qrCodeDataUrl: base64String,
            updatedBy: user.email || "",
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
        setAdminStatusMsg("Maya QR Code updated successfully!");
      } catch (err: any) {
        setAdminStatusMsg("Failed to update QR Code: " + err.message);
        try {
          handleFirestoreError(err, OperationType.WRITE, "settings/maya");
        } catch (e) {}
      } finally {
        setUploadingMayaQr(false);
      }
    };

    reader.onerror = () => {
      setAdminStatusMsg("Error reading image file.");
      setUploadingMayaQr(false);
    };

    reader.readAsDataURL(file);
  };
  
  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPricing(true);
    setAdminStatusMsg("");
    
    const basicVal = parseFloat(adminBasicPrice || "0");
    const premiumVal = parseFloat(adminPremiumPrice || "0");
    const enterpriseVal = parseFloat(adminEnterprisePrice || "0");
    const upgradeVal = parseFloat(adminUpgradePrice || "0");
    const promoBasicVal = parseFloat(adminPromoDiscountBasic || "0");
    const promoPremiumVal = parseFloat(adminPromoDiscountPremium || "0");
    const promoEnterpriseVal = parseFloat(adminPromoDiscountEnterprise || "0");

    if (isNaN(basicVal) || basicVal < 0 ||
        isNaN(premiumVal) || premiumVal < 0 ||
        isNaN(enterpriseVal) || enterpriseVal < 0 ||
        isNaN(upgradeVal) || upgradeVal < 0 ||
        isNaN(promoBasicVal) || promoBasicVal < 0 ||
        isNaN(promoPremiumVal) || promoPremiumVal < 0 ||
        isNaN(promoEnterpriseVal) || promoEnterpriseVal < 0) {
      setAdminStatusMsg("Error: All price and discount values must be non-negative numbers.");
      setSavingPricing(false);
      return;
    }

    if (adminOfferExpiry) {
      const expDate = new Date(adminOfferExpiry);
      if (isNaN(expDate.getTime())) {
        setAdminStatusMsg("Error: Invalid promo offer expiration date.");
        setSavingPricing(false);
        return;
      }
    }

    if (!adminEnableMaribank && !adminEnableGCash && !adminEnablePayMongo && !adminEnableMaya) {
      setAdminStatusMsg("Error: At least one payment method must remain active to prevent checkout issues.");
      setSavingPricing(false);
      return;
    }

    try {
      await setDoc(
        doc(db, "settings", "pricing"),
        {
          basicPrice: basicVal,
          premiumPrice: premiumVal,
          enterprisePrice: enterpriseVal,
          upgradePrice: upgradeVal,
          promoDiscountBasic: promoBasicVal,
          promoDiscountPremium: promoPremiumVal,
          promoDiscountEnterprise: promoEnterpriseVal,
          offerTitle: adminOfferTitle.trim(),
          offerExpiry: adminOfferExpiry,
          basicFeatures: adminBasicFeatures,
          premiumFeatures: adminPremiumFeatures,
          enterpriseFeatures: adminEnterpriseFeatures,
          upgradeFeatures: adminUpgradeFeatures,
          enableMaribank: adminEnableMaribank,
          enableGCash: adminEnableGCash,
          enablePayMongo: adminEnablePayMongo,
          enableMaya: adminEnableMaya,
          updatedBy: user.email || "",
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );

      // Log the change in Admin Activity Log
      try {
        await addDoc(collection(db, "admin_activity_logs"), {
          action: "update_payment_methods",
          adminEmail: user.email || "Unknown Admin",
          timestamp: new Date().toISOString(),
          paymentMethodsState: {
            maribank: adminEnableMaribank,
            gcash: adminEnableGCash,
            paymongo: adminEnablePayMongo,
            maya: adminEnableMaya,
          },
        });
      } catch (logErr) {
        console.warn("Failed to write to admin activity log:", logErr);
      }

      setAdminStatusMsg("Pricing configurations updated successfully throughout the system!");
      hasLoadedPricingInputs.current = false;

      // Automatically return to the customer view to instantly discover the updated prices and custom promo offers
      setTimeout(() => {
        setIsAdminMode(false);
      }, 1200);
    } catch (err: any) {
      setAdminStatusMsg("Failed to update pricing settings: " + err.message);
      try {
        handleFirestoreError(err, OperationType.WRITE, "settings/pricing");
      } catch (e) {}
    } finally {
      setSavingPricing(false);
    }
  };

  useEffect(() => {
    // Check if we just returned from PayMongo Checkout
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get("session_id");
    const isCancelled = urlParams.get("cancel") === "true";

    if (sessionId) {
      setVerifying(true);
      verifySession(sessionId);
    } else if (isCancelled) {
      handleCancelRegistration(
        "You cancelled the payment process. Your registration was cancelled.",
      );
    }
  }, []);

  const handleCancelRegistration = async (msg?: string) => {
    setLoading(true);
    setError(msg || "Cancelling transaction and deleting account...");
    // Implicitly confirmed when executed (button triggers double-click state confirmation)
    const confirmCancel = true;

    if (confirmCancel) {
      try {
        if (user) {
          try {
            await deleteDoc(doc(db, "users", user.uid));
          } catch (dbErr) {
            // ignore
          }
          await auth.currentUser?.delete();
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname,
          );
          window.location.reload();
        }
      } catch (e: any) {
        console.error(e);
        signOut(auth);
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname,
        );
        window.location.reload();
      }
    } else {
      setLoading(false);
      setError("");
    }
  };

  // Listen to all users if the logged in user is the admin
  useEffect(() => {
    if (!isAdminUser) return;

    const unsubscribeUsers = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const usersList: any[] = [];
        snapshot.forEach((snapDoc) => {
          const uData = snapDoc.data();
          const u = { uid: snapDoc.id, ...uData };
          usersList.push(u);

          // Add auto-correction review check for Lifetime Access Protection:
          // Verified active enterprise subscribers are Lifetime Access and must never have an expiration date key
          if (uData && uData.isActive === true && uData.plan === "enterprise") {
            const keysToCheck = ["expiresAt", "validUntil", "expirationDate", "expiry", "expires"];
            const hasExpiry = keysToCheck.some(k => k in uData && uData[k] !== null && uData[k] !== undefined);
            if (hasExpiry) {
              console.warn(`[Lifetime Access Correction]: Detected expiration fields in active enterprise subscriber (${uData.email || u.uid}). Correcting permanently...`);
              const userRef = doc(db, "users", snapDoc.id);
              setDoc(userRef, {
                expiresAt: null,
                validUntil: null,
                expirationDate: null,
                expiry: null,
                expires: null
              }, { merge: true }).catch((err) => {
                console.error(`[Lifetime Access Correction Error] Failed to correct user ${snapDoc.id}:`, err);
              });
            }
          }
        });
        setAllUsers(usersList);
      },
      (error) => {
        console.error("users collection onSnapshot error:", error);
        try {
          handleFirestoreError(error, OperationType.LIST, "users");
        } catch (e) {}
      },
    );

    const unsubscribeDiscrepancies = onSnapshot(
      collection(db, "payment_discrepancies"),
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((snapDoc) => {
          list.push({ id: snapDoc.id, ...snapDoc.data() });
        });
        setDiscrepancies(list);
      },
      (error) => {
        console.error("payment_discrepancies collection onSnapshot error:", error);
      },
    );

    return () => {
      unsubscribeUsers();
      unsubscribeDiscrepancies();
    };
  }, [isAdminUser, user]);

  const verifySession = async (sessionId: string) => {
    try {
      const response = await axios.post("/api/verify-checkout", { sessionId });
      if (response.data.status === "paid") {
        setSuccess(true);
        // Wipe the session_id from URL
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname,
        );
        alert("Payment Successful! Your account has been upgraded and is now active.");
        if (onPaymentSuccess) {
          onPaymentSuccess();
        }
      } else {
        setError("Payment has not been completed or is still pending.");
      }
    } catch (err: any) {
      setError(
        "Failed to verify payment status. " +
          (err.response?.data?.error || err.message),
      );
    } finally {
      setVerifying(false);
    }
  };

  const handlePay = async () => {
    setLoading(true);
    setError("");
    try {
      const origin = window.location.origin;
      const amount = isUpgrade ? upgradeFinalPrice : (selectedPlan === "enterprise" ? enterpriseFinalPrice : selectedPlan === "premium" ? premiumFinalPrice : basicFinalPrice);
      const response = await axios.post("/api/create-checkout", {
        userId: user.uid,
        email: user.email,
        origin,
        amount,
        plan: isUpgrade ? "premium" : selectedPlan,
        isUpgrade,
      });

      if (response.data.checkoutUrl) {
        window.location.href = response.data.checkoutUrl;
      } else {
        throw new Error("No checkout URL returned.");
      }
    } catch (err: any) {
      setError(
        "Failed to initiate payment. " +
          (err.response?.data?.error || err.message),
      );
      setLoading(false);
    }
  };

  // Submit manual GCash reference details to Firestore
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim() || !manualRefNo.trim()) {
      setError(
        "Please fill in both E-wallet sender name and reference number.",
      );
      return;
    }

    // Reference number must be numeric and preferably 13 digits
    const cleanedRef = manualRefNo.replace(/\s/g, "");
    if (!/^\d+$/.test(cleanedRef)) {
      setError("The reference number must contain digits only.");
      return;
    }

    if (
      paymentMethod === "manual" &&
      (cleanedRef.length < 10 || cleanedRef.length > 15)
    ) {
      // Allow submission without iframe-blocking popup warning modal
      console.warn("Manual payment has a non-standard reference number length.");
    } else if (paymentMethod === "maribank" && cleanedRef.length < 6) {
      console.warn("MariBank reference number length is non-standard.");
    } else if (paymentMethod === "maya" && cleanedRef.length < 6) {
      console.warn("Maya reference number length is non-standard.");
    }

    setSubmittingManual(true);
    setError("");
    setManualMessage("");

    try {
      const updateData: any = {
        email: user.email,
        paymentStatus: "pending_verification",
        pendingVerification: {
          method: paymentMethod === "maribank" ? "MariBank" : paymentMethod === "maya" ? "Maya" : "GCash",
          senderName: manualName.trim(),
          referenceNo: cleanedRef,
          amount: isUpgrade ? upgradeFinalPrice : (selectedPlan === "enterprise" ? enterpriseFinalPrice : selectedPlan === "premium" ? premiumFinalPrice : basicFinalPrice),
          plan: isUpgrade ? "premium" : selectedPlan,
          submittedAt: new Date().toISOString(),
          isUpgrade: isUpgrade, // Keep a record if this was an upgrade explicitly
        },
      };

      if (!isUpgrade && !isRenewal) {
        updateData.isActive = false;
      }

      // Create or update user record with pending Verification details
      await setDoc(doc(db, "users", user.uid), updateData, { merge: true });

      setManualMessage(
        `Your ${paymentMethod === "maribank" ? "MariBank" : paymentMethod === "maya" ? "Maya" : "GCash"} Payment details have been submitted successfully.`,
      );
      setManualName("");
      setManualRefNo("");
    } catch (err: any) {
      setError("Failed to submit manual payment details: " + err.message);
      try {
        handleFirestoreError(err, OperationType.WRITE, "users/" + user.uid);
      } catch (e) {}
    } finally {
      setSubmittingManual(false);
    }
  };

  // Cancel manual payment submission
  const handleCancelManualReview = async () => {
    setLoading(true);
    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          paymentStatus: "unpaid",
          pendingVerification: null,
        },
        { merge: true },
      );
    } catch (err: any) {
      setError("Failed to reset submission: " + err.message);
      try {
        handleFirestoreError(err, OperationType.WRITE, "users/" + user.uid);
      } catch (e) {}
    } finally {
      setLoading(false);
    }
  };

  // Admin action: Resolve payment discrepancy manually
  const handleResolveDiscrepancy = async (discrepancyId: string, targetUid: string, userEmail: string, actualPaid: number, plan: string, isUpgrade: boolean) => {
    setAdminStatusMsg("");
    try {
      // Clear discrepancy audit log
      try {
        await deleteDoc(doc(db, "payment_discrepancies", discrepancyId));
      } catch (err) {
        console.warn("Failed to delete from payment_discrepancies collection:", err);
      }

      const activatedAt = new Date().toISOString();
      const expiresAt = (plan === "basic" || plan === "premium")
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : null;

      // Activate user account and register cleared amount
      await setDoc(
        doc(db, "users", targetUid),
        {
          isActive: true,
          paymentStatus: "paid",
          plan: plan,
          plan_name: plan,
          status: "Active",
          expiresAt: expiresAt,
          expires_at: expiresAt,
          is_lifetime: plan === "enterprise",
          subscription_type: plan === "enterprise" ? "Lifetime" : "Standard",
          amount: actualPaid,
          paymentSource: "PAYMONGO CHECKOUT (RESOLVED)",
          paymentReference: `RECON-${discrepancyId.substring(0, 8).toUpperCase()}`,
          isUpgrade: isUpgrade,
          pendingVerification: null,
          paymentDiscrepancy: null,
          approvedBy: user?.email || "Admin (Reconciliation)",
          approvedAt: activatedAt,
          activatedAt: activatedAt,
        },
        { merge: true },
      );

      // Create proper audited invoice for records
      const userRefObj = {
        email: userEmail,
        isActive: true,
        paymentStatus: "paid",
        plan: plan,
        amount: actualPaid,
        paymentSource: "PAYMONGO CHECKOUT (RESOLVED)",
        paymentReference: `RECON-${discrepancyId.substring(0, 8).toUpperCase()}`,
        isUpgrade: isUpgrade,
        approvedAt: new Date().toISOString()
      };
      await createOrGetInvoiceData(userRefObj, targetUid);

      // Log subscription change to admin activity logs
      try {
        await addDoc(collection(db, "admin_activity_logs"), {
          action: "resolve_payment_discrepancy",
          adminEmail: user.email || "Unknown Admin",
          timestamp: new Date().toISOString(),
          targetUserUid: targetUid,
          targetUserEmail: userEmail,
          details: {
            discrepancyId,
            plan,
            amount: actualPaid,
            isUpgrade,
            verifiedPaidLifetime: true,
            notes: "Manually resolved PayMongo discrepancy and granted lifelong active access."
          }
        });
      } catch (logErr) {
        console.warn("Failed to write to admin activity log:", logErr);
      }

      setAdminStatusMsg("Highly secure reconciliation applied: discrepancy resolved, account upgraded, and clean invoice logged.");
    } catch (err: any) {
      console.error("Failed to reconcile discrepancy:", err);
      setAdminStatusMsg(`Failed to reconcile discrepancy: ${err.message}`);
    }
  };

  // Admin action: Approve manual payment
  const handleAdminApprove = async (targetUid: string, userEmail: string) => {
    setAdminStatusMsg("");
    try {
      const userToApprove = allUsers.find(u => u.uid === targetUid);
      const planToSet = userToApprove?.pendingVerification?.plan || "premium"; // default to premium if missing

      const amountVal = userToApprove?.pendingVerification?.amount || null;
      const paymentSourceVal = userToApprove?.pendingVerification?.method || "None";
      const paymentReferenceVal = userToApprove?.pendingVerification?.referenceNo || "None";
      const senderNameVal = userToApprove?.pendingVerification?.senderName || "None";
      const isUpgradeVal = userToApprove?.pendingVerification?.isUpgrade || false;

      const activatedAt = new Date().toISOString();
      const expiresAt = (planToSet === "basic" || planToSet === "premium")
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : null;

      await setDoc(
        doc(db, "users", targetUid),
        {
          isActive: true,
          paymentStatus: "paid",
          plan: planToSet,
          plan_name: planToSet,
          status: "Active",
          expiresAt: expiresAt,
          expires_at: expiresAt,
          is_lifetime: planToSet === "enterprise",
          subscription_type: planToSet === "enterprise" ? "Lifetime" : "Standard",
          amount: amountVal,
          paymentSource: paymentSourceVal,
          paymentReference: paymentReferenceVal,
          senderName: senderNameVal,
          isUpgrade: isUpgradeVal,
          pendingVerification: null,
          approvedBy: user.email,
          approvedAt: activatedAt,
          activatedAt: activatedAt,
        },
        { merge: true },
      );

      // Automatically generate a deterministic unique invoice for this approved manual payment
      const userRefObj = {
        email: userEmail,
        isActive: true,
        paymentStatus: "paid",
        plan: planToSet,
        amount: amountVal,
        paymentSource: paymentSourceVal,
        paymentReference: paymentReferenceVal,
        senderName: senderNameVal,
        isUpgrade: isUpgradeVal,
        approvedAt: new Date().toISOString()
      };
      await createOrGetInvoiceData(userRefObj, targetUid);

      // Log subscription change to admin activity logs
      try {
        await addDoc(collection(db, "admin_activity_logs"), {
          action: "approve_manual_payment",
          adminEmail: user.email || "Unknown Admin",
          timestamp: new Date().toISOString(),
          targetUserUid: targetUid,
          targetUserEmail: userEmail,
          details: {
            plan: planToSet,
            amount: amountVal,
            paymentSource: paymentSourceVal,
            paymentReference: paymentReferenceVal,
            isUpgrade: isUpgradeVal,
            verifiedPaidLifetime: true,
            notes: "Approved manual payment/verification and successfully granted Lifetime Access."
          }
        });
      } catch (logErr) {
        console.warn("Failed to write to admin activity log:", logErr);
      }

      setAdminStatusMsg(`Successfully activated account for ${userEmail} on ${planToSet} plan and generated invoice.`);
    } catch (err: any) {
      setAdminStatusMsg("Error activating account: " + err.message);
      try {
        handleFirestoreError(err, OperationType.WRITE, "users/" + targetUid);
      } catch (e) {}
    }
  };

  // Admin action: Reject manual payment
  const handleAdminReject = async (targetUid: string, userEmail: string) => {
    setAdminStatusMsg("");
    try {
      const userToReject = allUsers.find(u => u.uid === targetUid);
      const isAlreadyActive = userToReject?.isActive === true;
      
      await setDoc(
        doc(db, "users", targetUid),
        {
          paymentStatus: isAlreadyActive ? "paid" : "unpaid",
          pendingVerification: null,
          rejectedBy: user.email,
          rejectedAt: new Date().toISOString(),
        },
        { merge: true },
      );

      // Log manual payment rejection to admin activity logs
      try {
        await addDoc(collection(db, "admin_activity_logs"), {
          action: "reject_manual_payment",
          adminEmail: user.email || "Unknown Admin",
          timestamp: new Date().toISOString(),
          targetUserUid: targetUid,
          targetUserEmail: userEmail,
          details: {
            isAlreadyActive,
            notes: "Rejected pending manual payment verification details review."
          }
        });
      } catch (logErr) {
        console.warn("Failed to write to admin activity log:", logErr);
      }

      setAdminStatusMsg(`Rejected submission for ${userEmail}`);
    } catch (err: any) {
      setAdminStatusMsg("Error rejecting submission: " + err.message);
      try {
        handleFirestoreError(err, OperationType.WRITE, "users/" + targetUid);
      } catch (e) {}
    }
  };

  const handleAdminToggleToggleStatus = async (
    targetUid: string,
    currentActiveStatus: boolean,
    userEmail: string,
  ) => {
    setAdminStatusMsg("");
    try {
      const nextActive = !currentActiveStatus;
      const targetUser = allUsers.find(u => u.uid === targetUid);
      const plan = targetUser?.plan || "premium";
      const activatedAt = new Date().toISOString();
      const expiresAt = (plan === "basic" || plan === "premium")
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : null;

      await setDoc(
        doc(db, "users", targetUid),
        {
          isActive: nextActive,
          paymentStatus: nextActive ? "paid" : "unpaid",
          status: nextActive ? "Active" : "Expired",
          ...(nextActive ? { 
            activatedAt: activatedAt, 
            expiresAt: expiresAt, 
            expires_at: expiresAt,
            plan_name: plan,
            is_lifetime: plan === "enterprise",
            subscription_type: plan === "enterprise" ? "Lifetime" : "Standard"
          } : {
            expiresAt: null,
            expires_at: null
          })
        },
        { merge: true },
      );

      if (nextActive) {
        // Automatically generate deterministic invoice for offline toggles
        const userRefObj = {
          email: userEmail,
          isActive: true,
          paymentStatus: "paid",
          plan: plan,
          amount: plan === "enterprise" ? pricingSettings.enterprisePrice : (plan === "premium" ? pricingSettings.premiumPrice : pricingSettings.basicPrice),
          paymentSource: "Admin Terminal",
          paymentReference: `MANUAL-ACT-${targetUid.substring(0, 6).toUpperCase()}`,
          senderName: userEmail.split('@')[0],
          activatedAt: activatedAt
        };
        await createOrGetInvoiceData(userRefObj, targetUid);
      }

      // Log interactive direct system activation/revocation toggle
      try {
        await addDoc(collection(db, "admin_activity_logs"), {
          action: nextActive ? "grant_lifetime_access" : "revoke_pro_access",
          adminEmail: user.email || "Unknown Admin",
          timestamp: new Date().toISOString(),
          targetUserUid: targetUid,
          targetUserEmail: userEmail,
          details: {
            previousActiveState: currentActiveStatus,
            newActiveState: nextActive,
            verifiedPaidLifetime: nextActive,
            notes: nextActive
              ? "Manually granted Lifetime Access to subscriber."
              : "Revoked subscriber access/billing level manually."
          }
        });
      } catch (logErr) {
        console.warn("Failed to write to admin activity log:", logErr);
      }

      setAdminStatusMsg(`Updated status for ${userEmail} and triggered auto-generation.`);
    } catch (err: any) {
      setAdminStatusMsg("Error updating status: " + err.message);
      try {
        handleFirestoreError(err, OperationType.WRITE, "users/" + targetUid);
      } catch (e) {}
    }
  };

  const handleAdminDelete = async (targetUid: string, userEmail: string) => {
    setAdminStatusMsg("");
    try {
      await deleteDoc(doc(db, "users", targetUid));

      if (userEmail) {
        try {
          await setDoc(doc(db, "blacklisted_emails", userEmail.toLowerCase()), {
            email: userEmail.toLowerCase(),
            blacklistedAt: new Date().toISOString(),
            reason: "Deleted by Administrator"
          });
        } catch (blErr) {
          console.warn("Failed to write to blacklisted_emails:", blErr);
        }
      }

      // Log user profile deletion to admin activity logs
      try {
        await addDoc(collection(db, "admin_activity_logs"), {
          action: "delete_user",
          adminEmail: user.email || "Unknown Admin",
          timestamp: new Date().toISOString(),
          targetUserUid: targetUid,
          targetUserEmail: userEmail,
          details: {
            notes: "Permanently deleted user account database records."
          }
        });
      } catch (logErr) {
        console.warn("Failed to write to admin activity log:", logErr);
      }

      setAdminStatusMsg(`Deleted user record for ${userEmail}`);
    } catch (err: any) {
      setAdminStatusMsg("Error deleting user: " + err.message);
      try {
        handleFirestoreError(err, OperationType.DELETE, "users/" + targetUid);
      } catch (e) {}
    }
  };

  const handleManageSubscriptionSave = async () => {
    if (!manageSubAction) return;
    setAdminStatusMsg("");
    try {
      await setDoc(
        doc(db, "users", manageSubAction.uid),
        {
          plan: manageSubAction.plan,
          plan_name: manageSubAction.plan,
          expiresAt: manageSubAction.expiresAt || null,
          expires_at: manageSubAction.expiresAt || null,
          isActive: manageSubAction.isActive,
          status: manageSubAction.isActive ? "Active" : "Expired",
          is_lifetime: manageSubAction.plan === "enterprise",
          subscription_type: manageSubAction.plan === "enterprise" ? "Lifetime" : "Standard",
          paymentStatus: manageSubAction.isActive ? "paid" : "unpaid"
        },
        { merge: true }
      );
      setManageSubAction(null);
      setAdminStatusMsg(`Successfully updated subscription for ${manageSubAction.email}`);
    } catch (err: any) {
      setAdminStatusMsg(`Failed to update subscription: ${err.message}`);
    }
  };

  const executeConfirmedAction = async () => {
    if (!confirmingAction) return;
    const { uid, type, email, currentActiveStatus } = confirmingAction;
    setConfirmingAction(null);

    if (type === "approve") {
      await handleAdminApprove(uid, email);
    } else if (type === "reject") {
      await handleAdminReject(uid, email);
    } else if (type === "toggle") {
      await handleAdminToggleToggleStatus(uid, !!currentActiveStatus, email);
    } else if (type === "delete") {
      await handleAdminDelete(uid, email);
    }
  };

  const handleLogout = () => {
    signOut(auth);
  };

  // Helper to determine subscription/registration date for sorting & filtering
  const getSubscriptionDate = (u: any): Date => {
    if (u.approvedAt) {
      return new Date(u.approvedAt);
    }
    if (u.activatedAt) {
      return new Date(u.activatedAt);
    }
    if (u.pendingVerification?.submittedAt) {
      return new Date(u.pendingVerification.submittedAt);
    }
    if (u.createdAt) {
      if (typeof u.createdAt === "object" && u.createdAt.seconds) {
        return new Date(u.createdAt.seconds * 1000);
      }
      return new Date(u.createdAt);
    }
    return new Date(0); // Epoch fallback for safety
  };

  // Filter users for the Admin panel view
  const filteredUsers = allUsers.filter((u) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (u.email || "").toLowerCase().includes(q) ||
      (u.uid || "").toLowerCase().includes(q) ||
      (u.pendingVerification?.referenceNo || "").toLowerCase().includes(q) ||
      (u.pendingVerification?.senderName || "").toLowerCase().includes(q);
    if (!matchesSearch) return false;

    // Filter by Plan
    if (planFilter !== "all") {
      const uPlan = u.plan || "basic";
      if (uPlan !== planFilter) return false;
    }

    // Filter by Admin Status
    if (adminFilter === "pending") {
      if (u.paymentStatus !== "pending_verification") return false;
    } else if (adminFilter === "paid") {
      if (u.isActive !== true || u.paymentStatus === "free_trial") return false;
    } else if (adminFilter === "lifetime") {
      if (u.isActive !== true || u.plan !== "enterprise") return false;
    } else if (adminFilter === "free_trial") {
      if (u.paymentStatus !== "free_trial") return false;
    } else if (adminFilter === "unpaid") {
      if (u.isActive === true || u.paymentStatus === "pending_verification") return false;
    }

    // Filter by Subscription Date Range
    if (startDate || endDate) {
      const subDate = getSubscriptionDate(u);
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (subDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (subDate > end) return false;
      }
    }
    
    return true;
  });

  // Automatically arrange and display all subscribers based on their subscription date
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const dateA = getSubscriptionDate(a).getTime();
    const dateB = getSubscriptionDate(b).getTime();
    return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
  });

  // Unified helper for currency formatting
  const fPHP = (val: number) => "₱" + Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // 1. Unified function to resolve a user's subscription, payment status, amount, and promo calculations
  const getUserFinanceDetails = (u: any) => {
    const rawPlan = (u.plan || u.pendingVerification?.plan || "basic").toLowerCase();
    const isPremiumTier = rawPlan === "premium" || rawPlan === "enterprise";
    const isUpgradeUser = !!(u.pendingVerification?.isUpgrade || u.isUpgrade);
    const formattedPlan = rawPlan === "enterprise" ? "Enterprise Plan" : (isPremiumTier ? "Premium Plan" : "Basic Plan");

    const isPending = u.paymentStatus === "pending_verification";
    const isPaid = u.isActive === true || u.paymentStatus === "paid";

    // Subscription Amount logic
    let amountPaid = 0;
    if (isPaid || isPending) {
      if (typeof u.amount === "number") {
        amountPaid = u.amount;
      } else if (u.amount && !isNaN(Number(u.amount))) {
        amountPaid = Number(u.amount);
      } else if (u.pendingVerification?.amount && !isNaN(Number(u.pendingVerification.amount))) {
        amountPaid = Number(u.pendingVerification.amount);
      } else if (u.paymentAmount && !isNaN(Number(u.paymentAmount))) {
        amountPaid = Number(u.paymentAmount);
      }

      if (amountPaid <= 0) {
        if (rawPlan === "enterprise") {
          amountPaid = (isOfferActive && pricingSettings.promoDiscountEnterprise > 0)
            ? pricingSettings.promoDiscountEnterprise
            : (pricingSettings.enterprisePrice || 2999);
        } else if (isPremiumTier) {
          if (isUpgradeUser) {
            amountPaid = pricingSettings.upgradePrice || 500;
          } else {
            amountPaid = (isOfferActive && pricingSettings.promoDiscountPremium > 0)
              ? pricingSettings.promoDiscountPremium
              : (pricingSettings.premiumPrice || 1499);
          }
        } else {
          amountPaid = (isOfferActive && pricingSettings.promoDiscountBasic > 0)
            ? pricingSettings.promoDiscountBasic
            : (pricingSettings.basicPrice || 999);
        }
      }
    }

    // Default regular (gross) price (for calculating gross/deductions)
    let regPrice = 0;
    if (isPaid || isPending) {
      if (isPremiumTier) {
        if (isUpgradeUser) {
          regPrice = pricingSettings.upgradePrice || 500;
        } else {
          regPrice = pricingSettings.premiumPrice || 1499;
        }
      } else {
        regPrice = pricingSettings.basicPrice || 999;
      }
    }

    const discount = Math.max(0, regPrice - amountPaid);

    return {
      planStr: rawPlan,
      formattedPlan,
      isPremiumTier,
      isUpgradeUser,
      amountPaid,
      regPrice,
      discount,
      isPaid,
      isPending
    };
  };

  // 2. Unified financial performance calculator for consistent totals, taxes, and projections
  const computeFinancialData = (targetUsers: any[]) => {
    const activeUsers = targetUsers.filter(u => u.isActive === true || u.paymentStatus === "paid");
    const pendingUsers = targetUsers.filter(u => u.paymentStatus === "pending_verification");
    const totalActiveCount = activeUsers.length;
    const totalPendingCount = pendingUsers.length;

    let basicActiveCount = 0;
    let premiumActiveCount = 0;
    let upgradeActiveCount = 0;
    
    let basicGrossRev = 0;
    let premiumGrossRev = 0;
    let upgradeGrossRev = 0;
    
    let basicNetRev = 0;
    let premiumNetRev = 0;
    let upgradeNetRev = 0;
    
    let totalDiscountsValue = 0;
    let totalDiscountAppliedCount = 0;

    const historicalByMonth: { [key: string]: { gross: number; net: number; discounts: number; count: number } } = {};

    activeUsers.forEach((u) => {
      const finance = getUserFinanceDetails(u);
      
      if (finance.planStr === "premium") {
        if (finance.isUpgradeUser) {
          upgradeActiveCount++;
          upgradeGrossRev += finance.regPrice;
          upgradeNetRev += finance.amountPaid;
        } else {
          premiumActiveCount++;
          premiumGrossRev += finance.regPrice;
          premiumNetRev += finance.amountPaid;
        }
      } else {
        basicActiveCount++;
        basicGrossRev += finance.regPrice;
        basicNetRev += finance.amountPaid;
      }

      if (finance.discount > 0) {
        totalDiscountAppliedCount++;
        totalDiscountsValue += finance.discount;
      }

      // Timeline sorting helper
      let dateObj: Date | null = null;
      if (u.createdAt?.seconds) {
        dateObj = new Date(u.createdAt.seconds * 1000);
      } else if (u.createdAt) {
        try { dateObj = new Date(u.createdAt); } catch (e) {}
      }
      
      const monthYearStr = dateObj 
        ? dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' })
        : "Historical Inception";

      if (!historicalByMonth[monthYearStr]) {
        historicalByMonth[monthYearStr] = { gross: 0, net: 0, discounts: 0, count: 0 };
      }
      
      historicalByMonth[monthYearStr].gross += finance.regPrice;
      historicalByMonth[monthYearStr].net += finance.amountPaid;
      historicalByMonth[monthYearStr].discounts += finance.discount;
      historicalByMonth[monthYearStr].count += 1;
    });

    const totalGrossRevenue = basicGrossRev + premiumGrossRev + upgradeGrossRev;
    const totalNetRevenue = basicNetRev + premiumNetRev + upgradeNetRev;

    // BIR Tax Compliance calculations
    const calculateGraduatedTax = (taxableIncome: number) => {
      if (taxableIncome <= 250000) return 0;
      if (taxableIncome <= 400000) return (taxableIncome - 250000) * 0.15;
      if (taxableIncome <= 800000) return 22500 + (taxableIncome - 400000) * 0.20;
      if (taxableIncome <= 2000000) return 102500 + (taxableIncome - 800000) * 0.25;
      if (taxableIncome <= 8000000) return 402500 + (taxableIncome - 2000000) * 0.30;
      return 2202500 + (taxableIncome - 8000000) * 0.35;
    };

    // Scenario 1: VAT Registered (12% Output VAT on exclusive netSales, CIT 20% on 60% of exclusive Sales with OSD)
    const vatExclSales = totalNetRevenue / 1.12;
    const outputVatValue = vatExclSales * 0.12;
    const vatCorpExpensesOSD = vatExclSales * 0.40;
    const vatTaxableIncome = vatExclSales * 0.60;
    const vatIncomeTaxCIT = vatTaxableIncome * 0.20;
    const vatTotalTaxesPayable = outputVatValue + vatIncomeTaxCIT;
    const vatFinalNetIncome = vatExclSales - vatIncomeTaxCIT - vatCorpExpensesOSD;

    // Scenario 2: Non-VAT Sole Proprietorship 8% Flat Tax (8% on excess over 250k)
    const nonVatFlatExemption = 250000;
    const nonVatFlatTaxable = Math.max(0, totalNetRevenue - nonVatFlatExemption);
    const nonVatFlatTaxValue = nonVatFlatTaxable * 0.08;
    const nonVatFlatPercentageTax = 0;
    const nonVatFlatFinalNet = totalNetRevenue - nonVatFlatTaxValue;

    // Scenario 3: Non-VAT Graduated Income Tax + 3% Percentage Tax (OSD 40% applied)
    const percentageTaxValue = totalNetRevenue * 0.03;
    const nonVatGradSlsNetPercentage = totalNetRevenue - percentageTaxValue;
    const nonVatGradOSDExpenses = totalNetRevenue * 0.40;
    const nonVatGradTaxable = Math.max(0, totalNetRevenue - percentageTaxValue - nonVatGradOSDExpenses);
    const nonVatStepIncomeTax = calculateGraduatedTax(nonVatGradTaxable);
    const nonVatGradTotalTaxes = percentageTaxValue + nonVatStepIncomeTax;
    const nonVatGradFinalNet = totalNetRevenue - nonVatGradTotalTaxes - nonVatGradOSDExpenses;

    return {
      activeUsers,
      pendingUsers,
      totalActiveCount,
      totalPendingCount,
      basicActiveCount,
      premiumActiveCount,
      upgradeActiveCount,
      basicGrossRev,
      premiumGrossRev,
      upgradeGrossRev,
      basicNetRev,
      premiumNetRev,
      upgradeNetRev,
      totalDiscountsValue,
      totalDiscountAppliedCount,
      historicalByMonth,
      totalGrossRevenue,
      totalNetRevenue,
      vatExclSales,
      outputVatValue,
      vatCorpExpensesOSD,
      vatTaxableIncome,
      vatIncomeTaxCIT,
      vatTotalTaxesPayable,
      vatFinalNetIncome,
      nonVatFlatExemption,
      nonVatFlatTaxable,
      nonVatFlatTaxValue,
      nonVatFlatPercentageTax,
      nonVatFlatFinalNet,
      percentageTaxValue,
      nonVatGradSlsNetPercentage,
      nonVatGradOSDExpenses,
      nonVatGradTaxable,
      nonVatStepIncomeTax,
      nonVatGradTotalTaxes,
      nonVatGradFinalNet,
    };
  };

  const handleExportToExcel = () => {
    // Definining columns headers for professional reporting
    const headers = [
      "User ID (UID)",
      "Full Name",
      "Username",
      "Email Address",
      "Subscription Plan",
      "Subscription Amount",
      "Account Status",
      "Payment Status",
      "Payment Method",
      "Payment Reference",
      "Sender Name",
      "Registration Date",
      "Last Login Date",
      "Approved By",
      "Approved At",
      "Rejected By",
      "Rejected At"
    ];

    // Compute consistent metrics using the dynamic user list currently loaded in grid
    const fin = computeFinancialData(filteredUsers);

    // Map each filtered user to their accurate system records row representation
    const rows = filteredUsers.map((u) => {
      // 1. Registration Date
      let regDate = "N/A";
      if (u.createdAt?.seconds) {
        regDate = new Date(u.createdAt.seconds * 1000).toLocaleString('en-CA', { hour12: false }).replace(',', '');
      } else if (u.createdAt) {
        try {
          regDate = new Date(u.createdAt).toLocaleString('en-CA', { hour12: false }).replace(',', '');
        } catch (e) {}
      }

      // 2. Last Login Date
      let lastLogin = "N/A";
      if (u.lastLoginAt?.seconds) {
        lastLogin = new Date(u.lastLoginAt.seconds * 1000).toLocaleString('en-CA', { hour12: false }).replace(',', '');
      } else if (u.lastLoginAt) {
         try {
          lastLogin = new Date(u.lastLoginAt).toLocaleString('en-CA', { hour12: false }).replace(',', '');
         } catch (e) {}
      }

      // 3. Approved At Date
      let approvedAtStr = "N/A";
      if (u.approvedAt) {
        try {
          approvedAtStr = new Date(u.approvedAt).toLocaleString('en-CA', { hour12: false }).replace(',', '');
        } catch (e) {}
      }

      // 4. Rejected At Date
      let rejectedAtStr = "N/A";
      if (u.rejectedAt) {
        try {
          rejectedAtStr = new Date(u.rejectedAt).toLocaleString('en-CA', { hour12: false }).replace(',', '');
        } catch (e) {}
      }

      const finance = getUserFinanceDetails(u);

      const getPaymentMethodVal = (userObj: any) => {
        if (userObj.paymentSource) return userObj.paymentSource.toUpperCase();
        if (userObj.pendingVerification?.method) return userObj.pendingVerification.method.toUpperCase();
        if (userObj.paymentMethod) return userObj.paymentMethod.toUpperCase();
        if (userObj.isActive) return "ADMIN APPROVED";
        return "NONE";
      };

      const accountStatus = u.isActive ? "Active" : "Inactive";
      
      const getPaymentStatusVal = (userObj: any) => {
        const status = userObj.paymentStatus;
        if (!status) {
          return userObj.isActive ? "Paid" : "Unpaid";
        }
        if (status === "pending_verification") return "Pending Approval";
        if (status === "paid") return "Paid";
        if (status === "unpaid") return "Unpaid";
        return status.charAt(0).toUpperCase() + status.slice(1);
      };

      const username = u.displayName 
        ? u.displayName.toLowerCase().replace(/\s+/g, '') 
        : (u.email ? u.email.split('@')[0] : "Unknown");

      return [
        u.uid || "N/A",
        getUserName(u),
        username,
        u.email || "N/A",
        finance.formattedPlan,
        finance.isPaid || finance.isPending ? fPHP(finance.amountPaid) : "₱0.00",
        accountStatus,
        getPaymentStatusVal(u),
        getPaymentMethodVal(u),
        u.pendingVerification?.referenceNo || u.paymentReference || u.referenceNo || "None",
        u.pendingVerification?.senderName || u.senderName || "None",
        regDate,
        lastLogin,
        u.approvedBy || "N/A",
        approvedAtStr,
        u.rejectedBy || "N/A",
        rejectedAtStr
      ];
    });

    const fileScopeText = filteredUsers.length === allUsers.length 
      ? "Full System Database" 
      : `Filtered System Subset (${filteredUsers.length} of ${allUsers.length} Users)`;

    const workbook = XLSX.utils.book_new();

    // --- SHEET 1: USERS OVERVIEW ---
    const wsData = [headers, ...rows];
    const worksheet = XLSX.utils.aoa_to_sheet(wsData);

    // Decode range to apply responsive layout styles
    const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (!worksheet[cellAddress]) continue;

        // Base styles for clean reading layout
        worksheet[cellAddress].s = {
          font: { name: "Segoe UI", sz: 10, color: { rgb: "334155" } }, // Slate-700
          alignment: { vertical: "center", horizontal: "left" },
          border: {
            top: { style: "thin", color: { rgb: "E2E8F0" } }, // Slate-200
            bottom: { style: "thin", color: { rgb: "E2E8F0" } },
            left: { style: "thin", color: { rgb: "E2E8F0" } },
            right: { style: "thin", color: { rgb: "E2E8F0" } },
          }
        };

        if (R === 0) {
          // Dynamic Header Row styled with deep Indigo branding and subtle shadows
          worksheet[cellAddress].s.font = { name: "Segoe UI", sz: 11, bold: true, color: { rgb: "FFFFFF" } };
          worksheet[cellAddress].s.fill = { fgColor: { rgb: "4F46E5" } }; // Deep Indigo background
          worksheet[cellAddress].s.alignment = { vertical: "center", horizontal: "center", wrapText: true };
          worksheet[cellAddress].s.border = {
            bottom: { style: "medium", color: { rgb: "312E81" } }, // Dark dark indigo border
          };
        } else {
          // Zebra Row Striping for perfect alignment and visual scanning
          if (R % 2 === 0) {
            worksheet[cellAddress].s.fill = { fgColor: { rgb: "F8FAFC" } }; // Slate-50 alternating row background
          }
          
          // Technical / ID Columns: monospace & light gray text color
          if (C === 0) {
            worksheet[cellAddress].s.font.name = "Consolas";
            worksheet[cellAddress].s.font.color = { rgb: "64748B" }; // Slate-500
          }
          
          // Numeric columns: currency-aligned right, darker bold font
          if (C === 5) {
            worksheet[cellAddress].s.alignment = { vertical: "center", horizontal: "right" };
            worksheet[cellAddress].s.font.bold = true;
            worksheet[cellAddress].s.font.color = { rgb: "0F172A" }; // Slate-900
          }

          // User Activation badge-like styles
          if (C === 6) {
            const val = worksheet[cellAddress].v;
            worksheet[cellAddress].s.alignment = { vertical: "center", horizontal: "center" };
            worksheet[cellAddress].s.font.bold = true;
            if (val === "Active") {
              worksheet[cellAddress].s.font.color = { rgb: "047857" }; // Emerald-700
              worksheet[cellAddress].s.fill = { fgColor: { rgb: "D1FAE5" } }; // Emerald-100 bg
            } else {
              worksheet[cellAddress].s.font.color = { rgb: "475569" }; // Slate-600
              worksheet[cellAddress].s.fill = { fgColor: { rgb: "F1F5F9" } }; // Slate-100 bg
            }
          }

          // Payment Status badge-like styles
          if (C === 7) {
            const val = worksheet[cellAddress].v;
            worksheet[cellAddress].s.alignment = { vertical: "center", horizontal: "center" };
            worksheet[cellAddress].s.font.bold = true;
            if (val === "Paid") {
              worksheet[cellAddress].s.font.color = { rgb: "0284C7" }; // Sky-700
              worksheet[cellAddress].s.fill = { fgColor: { rgb: "E0F2FE" } }; // Sky-100 bg
            } else if (val === "Pending Approval") {
              worksheet[cellAddress].s.font.color = { rgb: "D97706" }; // Amber-600
              worksheet[cellAddress].s.fill = { fgColor: { rgb: "FEF3C7" } }; // Amber-100 bg
            } else {
              worksheet[cellAddress].s.font.color = { rgb: "E11D48" }; // Rose-600
              worksheet[cellAddress].s.fill = { fgColor: { rgb: "FFE4E6" } }; // Rose-100 bg
            }
          }
        }
      }
    }

    // Set precise column padding & width computation to avoid truncating cells
    const wscols: any[] = [];
    for (let col = 0; col < headers.length; col++) {
      let maxLen = headers[col].length;
      wsData.forEach((row) => {
        if (row[col] !== undefined && row[col] !== null) {
          const valLen = row[col].toString().length;
          if (valLen > maxLen) {
            maxLen = valLen;
          }
        }
      });
      wscols.push({ wch: Math.max(13, maxLen + 3) });
    }
    worksheet["!cols"] = wscols;

    const wsrows: any[] = [{ hpt: 26 }]; // Header = 26pt height
    for (let r = 1; r <= rows.length; r++) {
      wsrows.push({ hpt: 20 });
    }
    worksheet["!rows"] = wsrows;

    XLSX.utils.book_append_sheet(workbook, worksheet, "Users Overview");


    // --- SHEET 2: FINANCIAL SUMMARY ---
    // Make a beautiful boardroom-ready financial worksheet that replicates the Word structure
    const wsSummaryData: any[][] = [
      ["ELECTRICALPH ENGINEERING PLATFORM - FINANCE LEDGER REPORT"],
      ["Corporate Income Performance Statement & Bureau of Internal Revenue (BIR) Audit Estimate"],
      [],
      ["Data Scope:", fileScopeText],
      ["Report Generated:", new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })],
      ["Prepared for:", "Board of Directors & Administrative Controllers"],
      ["Compiled by Account:", user?.email || "System Account"],
      [],
      ["EXECUTIVE SUMMARY & CORPORATE KEY PERFORMANCE INDICATORS"],
      ["Financial Target Metric Group", "Summary Metrics / Base Record Value"],
      ["Total Confirmed Active Subscribers", `${fin.totalActiveCount} User Accounts`],
      ["Pending Verification Billing Pipeline", `${fin.totalPendingCount} User Accounts`],
      ["Total Regular Subscriptions Sales (Gross Revenue Equivalent)", fPHP(fin.totalGrossRevenue)],
      ["Total Platform Campaign Deductions & Discounts Applied", `(${fPHP(fin.totalDiscountsValue)})`],
      ["Total Realized Cash Subscriptions Collected (Net Sales Revenue)", fPHP(fin.totalNetRevenue)],
      [],
      ["DETAILED BREAKDOWN BY SUBSCRIPTION PLAN AND TIER LEVEL"],
      ["Subscription Plan Tier", "Active Accounts", "Regular Price / Account", "Gross Revenue Base", "Applied Discounts", "Actual Net Revenue Paid"],
      ["Basic Plan", `${fin.basicActiveCount} Active`, fPHP(pricingSettings.basicPrice || 999), fPHP(fin.basicGrossRev), `(${fPHP(fin.basicGrossRev - fin.basicNetRev)})`, fPHP(fin.basicNetRev)],
      ["Premium Plan (Full Sub)", `${fin.premiumActiveCount} Active`, fPHP(pricingSettings.premiumPrice || 1499), fPHP(fin.premiumGrossRev), `(${fPHP(fin.premiumGrossRev - fin.premiumNetRev)})`, fPHP(fin.premiumNetRev)],
      ["Premium Upgrade Paths (Basic -> Premium)", `${fin.upgradeActiveCount} Active`, fPHP(pricingSettings.upgradePrice || 500), fPHP(fin.upgradeGrossRev), `(${fPHP(fin.upgradeGrossRev - fin.upgradeNetRev)})`, fPHP(fin.upgradeNetRev)],
      ["TOTAL CONSOLIDATED AUDIT BASE", `${fin.totalActiveCount} Active`, "N/A", fPHP(fin.totalGrossRevenue), `(${fPHP(fin.totalDiscountsValue)})`, fPHP(fin.totalNetRevenue)],
      [],
      ["HISTORICAL REVENUE SEQUENCE (TIMELINE BY REGISTRATION DATE)"],
      ["Billing Period Calendar Month", "New Registered Paid Units", "Gross Revenue Base", "Total Dynamic Discounts", "Direct Cash Net Revenue"],
      ...Object.keys(fin.historicalByMonth).map(monthName => {
        const item = fin.historicalByMonth[monthName];
        return [monthName, `${item.count} Accounts`, fPHP(item.gross), `(${fPHP(item.discounts)})`, fPHP(item.net)];
      }),
      [],
      ["PHILIPPINE TAX COMPLIANCE & BIR AUDIT ESTIMATIONS"],
      ["Compliance Tax Item Line", "Tax Option A: 12% VAT Entity", "Tax Option B: 8% Flat (Non-VAT)", "Tax Option C: Graduated (Non-VAT)"],
      ["Gross Total Cash Receipts Collected", fPHP(fin.totalNetRevenue), fPHP(fin.totalNetRevenue), fPHP(fin.totalNetRevenue)],
      ["Less: Statutory VAT Adjustment (Inclusive)", `(${fPHP(fin.totalNetRevenue - fin.vatExclSales)})`, "₱0.00 (VAT Exempt)", "₱0.00 (VAT Exempt)"],
      ["Net Taxable Sales Base (Exc. VAT / Adjustments)", fPHP(fin.vatExclSales), fPHP(fin.totalNetRevenue), fPHP(fin.totalNetRevenue)],
      ["Statutory Deductions (OSD @ 40% / flat pt)", `(${fPHP(fin.vatCorpExpensesOSD)})`, fPHP(250000), `(${fPHP(fin.nonVatGradOSDExpenses)})`],
      ["Calculated Taxable Business Income", fPHP(fin.vatTaxableIncome), fPHP(fin.nonVatFlatTaxable), fPHP(fin.nonVatGradTaxable)],
      ["Government Taxes Due (CIT Option / Flat 8% / Grad)", fPHP(fin.vatIncomeTaxCIT), fPHP(fin.nonVatFlatTaxValue), fPHP(fin.nonVatStepIncomeTax)],
      ["Value Added Tax (12%) / Percentage Tax (3% Sec116)", fPHP(fin.outputVatValue), "₱0.00 (Exempt)", fPHP(fin.percentageTaxValue)],
      ["TOTAL ESTIMATED DEDUCTED TAX LIABILITY", fPHP(fin.vatTotalTaxesPayable), fPHP(fin.nonVatFlatTaxValue), fPHP(fin.nonVatGradTotalTaxes)],
      ["ESTIMATED COMPLIANT TAKEOHOME NET PROFIT", fPHP(fin.vatFinalNetIncome), fPHP(fin.nonVatFlatFinalNet), fPHP(fin.nonVatGradFinalNet)],
      [],
      ["REVENUE PROJECTIONS, EVALUATIONS AND RUN-RATE RUNWAYS"],
      ["Run-Rate Extrapolation Cycle", "Projected Gross Billing Sales", "Projected Campaign Discounts", "Projected Net Collections"],
      ["Current Collection (Inception Basis)", fPHP(fin.totalGrossRevenue), `(${fPHP(fin.totalDiscountsValue)})`, fPHP(fin.totalNetRevenue)],
      ["Weekly Realization Run-Rate Baseline", fPHP(fin.totalGrossRevenue / 4.3), `(${fPHP(fin.totalDiscountsValue / 4.3)})`, fPHP(fin.totalNetRevenue / 4.3)],
      ["Monthly Projected Cohort Horizon", fPHP(fin.totalGrossRevenue), `(${fPHP(fin.totalDiscountsValue)})`, fPHP(fin.totalNetRevenue)],
      ["Quarterly Consolidated Projection (90-Day Loop)", fPHP(fin.totalGrossRevenue * 3), `(${fPHP(fin.totalDiscountsValue * 3)})`, fPHP(fin.totalNetRevenue * 3)],
      ["Annual Consolidated Fiscal Outlook (12-Month run)", fPHP(fin.totalGrossRevenue * 12), `(${fPHP(fin.totalDiscountsValue * 12)})`, fPHP(fin.totalNetRevenue * 12)]
    ];

    const worksheet2 = XLSX.utils.aoa_to_sheet(wsSummaryData);

    const range2 = XLSX.utils.decode_range(worksheet2["!ref"] || "A1:A1");
    for (let R2 = range2.s.r; R2 <= range2.e.r; ++R2) {
      for (let C2 = range2.s.c; C2 <= range2.e.c; ++C2) {
        const cellAddr2 = XLSX.utils.encode_cell({ r: R2, c: C2 });
        if (!worksheet2[cellAddr2]) continue;

        // Base styles for Sheet 2
        worksheet2[cellAddr2].s = {
          font: { name: "Segoe UI", sz: 10, color: { rgb: "334155" } },
          alignment: { vertical: "center", horizontal: "left" },
          border: {
            top: { style: "thin", color: { rgb: "F1F5F9" } },
            bottom: { style: "thin", color: { rgb: "F1F5F9" } },
            left: { style: "thin", color: { rgb: "F1F5F9" } },
            right: { style: "thin", color: { rgb: "F1F5F9" } }
          }
        };

        const val = worksheet2[cellAddr2].v;
        const valStr = String(val);

        // Highlight main title blocks
        if (R2 === 0) {
          worksheet2[cellAddr2].s.font = { name: "Segoe UI", sz: 13, bold: true, color: { rgb: "1E1B4B" } };
          worksheet2[cellAddr2].s.fill = { fgColor: { rgb: "EEF2F6" } };
          worksheet2[cellAddr2].s.alignment = { horizontal: "left", vertical: "center" };
        } else if (R2 === 1) {
          worksheet2[cellAddr2].s.font = { name: "Segoe UI", sz: 10, italic: true, color: { rgb: "475569" } };
          worksheet2[cellAddr2].s.fill = { fgColor: { rgb: "EEF2F6" } };
        } else if (valStr.startsWith("Total ") || valStr.startsWith("TOTAL ") || valStr.startsWith("ESTIMATED ") || valStr.startsWith("Annual ")) {
          // Highlight summary totals
          worksheet2[cellAddr2].s.font.bold = true;
          if (valStr.includes("NET PROFIT") || valStr.includes("Net Collections")) {
            worksheet2[cellAddr2].s.fill = { fgColor: { rgb: "F0FDF4" } }; // soft light green
            worksheet2[cellAddr2].s.font.color = { rgb: "166534" }; // dark green text
          } else if (valStr.includes("TAX LIABILITY") || valStr.includes("Discounts Applied")) {
            worksheet2[cellAddr2].s.fill = { fgColor: { rgb: "FEF2F2" } }; // soft light red
            worksheet2[cellAddr2].s.font.color = { rgb: "991B1B" }; // dark red text
          }
        }

        // Section Headers
        if (val === "EXECUTIVE SUMMARY & CORPORATE KEY PERFORMANCE INDICATORS" ||
            val === "DETAILED BREAKDOWN BY SUBSCRIPTION PLAN AND TIER LEVEL" ||
            val === "HISTORICAL REVENUE SEQUENCE (TIMELINE BY REGISTRATION DATE)" ||
            val === "PHILIPPINE TAX COMPLIANCE & BIR AUDIT ESTIMATIONS" ||
            val === "REVENUE PROJECTIONS, EVALUATIONS AND RUN-RATE RUNWAYS") {
          worksheet2[cellAddr2].s.font = { name: "Segoe UI", sz: 11, bold: true, color: { rgb: "FFFFFF" } };
          worksheet2[cellAddr2].s.fill = { fgColor: { rgb: "312E81" } }; // Deep Royal Indigo Navy
          worksheet2[cellAddr2].s.alignment = { horizontal: "center", vertical: "center" };
        }

        // Column subheaders styling
        if (val === "Financial Target Metric Group" || val === "Summary Metrics / Base Record Value" ||
            val === "Subscription Plan Tier" || val === "Billing Period Calendar Month" ||
            val === "Compliance Tax Item Line" || val === "Run-Rate Extrapolation Cycle") {
          worksheet2[cellAddr2].s.font.bold = true;
          worksheet2[cellAddr2].s.fill = { fgColor: { rgb: "E2E8F0" } }; // Slate-200
        }

        // Alignment of currency values
        if (valStr.startsWith("₱") || valStr.startsWith("(₱") || valStr.startsWith("-₱")) {
          worksheet2[cellAddr2].s.alignment = { horizontal: "right", vertical: "center" };
          worksheet2[cellAddr2].s.font.bold = true;
          if (valStr.startsWith("(₱") || valStr.startsWith("-₱")) {
            worksheet2[cellAddr2].s.font.color = { rgb: "B91C1C" }; // Red digits
          }
        }
      }
    }

    // Stretch columns perfectly for the summary worksheet
    const wscolsSummary = [
      { wch: 53 }, // Spacious label column
      { wch: 30 }, // Values / Tax Options
      { wch: 30 },
      { wch: 30 },
      { wch: 30 },
      { wch: 30 }
    ];
    worksheet2["!cols"] = wscolsSummary;

    // Apply some merges on title cells to look stunning
    worksheet2["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, // Title
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }, // Subtitle
      { s: { r: 8, c: 0 }, e: { r: 8, c: 1 } }, // Section 1
      { s: { r: 16, c: 0 }, e: { r: 16, c: 5 } }, // Section 2
      { s: { r: 23, c: 0 }, e: { r: 23, c: 4 } }, // Section 3
      { s: { r: 28, c: 0 }, e: { r: 28, c: 3 } }, // Section 4
      { s: { r: 40, c: 0 }, e: { r: 40, c: 3 } }, // Section 5
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet2, "Financial Summary Statement");

    XLSX.writeFile(workbook, `ElectricalPH_Unified_Registry_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleExportFinancialReportWord = async () => {
    try {
      // 1. Core aggregates - calculated from computeFinancialData
      const fin = computeFinancialData(filteredUsers);
      const {
        activeUsers,
        pendingUsers,
        totalActiveCount,
        totalPendingCount,
        basicActiveCount,
        premiumActiveCount,
        upgradeActiveCount,
        basicGrossRev,
        premiumGrossRev,
        upgradeGrossRev,
        basicNetRev,
        premiumNetRev,
        upgradeNetRev,
        totalDiscountsValue,
        totalDiscountAppliedCount,
        historicalByMonth,
        totalGrossRevenue,
        totalNetRevenue,
        vatExclSales,
        outputVatValue,
        vatCorpExpensesOSD,
        vatTaxableIncome,
        vatIncomeTaxCIT,
        vatTotalTaxesPayable,
        vatFinalNetIncome,
        nonVatFlatExemption,
        nonVatFlatTaxable,
        nonVatFlatTaxValue,
        nonVatFlatPercentageTax,
        nonVatFlatFinalNet,
        percentageTaxValue,
        nonVatGradSlsNetPercentage,
        nonVatGradOSDExpenses,
        nonVatGradTaxable,
        nonVatStepIncomeTax,
        nonVatGradTotalTaxes,
        nonVatGradFinalNet,
      } = fin;

      const dummyPricingAndRecalculateOption = true;
      if (dummyPricingAndRecalculateOption) {
        // Skip redundant local calculations
      }
      /*

      // 2. Pricing configuration
      const isOfferActive = !!(
        (pricingSettings.promoDiscountBasic > 0 || pricingSettings.promoDiscountPremium > 0 || pricingSettings.offerTitle) &&
        (!pricingSettings.offerExpiry || pricingSettings.offerExpiry.trim() === "" || new Date(pricingSettings.offerExpiry) > new Date())
      );

      // 3. User Categorization states
      let basicActiveCount = 0;
      let premiumActiveCount = 0;
      let upgradeActiveCount = 0;
      
      let basicGrossRev = 0;
      let premiumGrossRev = 0;
      let upgradeGrossRev = 0;
      
      let basicNetRev = 0;
      let premiumNetRev = 0;
      let upgradeNetRev = 0;
      
      let totalDiscountsValue = 0;
      let totalDiscountAppliedCount = 0;

      // 4. Group revenue historically
      const historicalByMonth: { [key: string]: { gross: number; net: number; discounts: number; count: number } } = {};

      activeUsers.forEach((u) => {
        const planStr = (u.plan || u.pendingVerification?.plan || "basic").toLowerCase();
        const isUpgradeUser = !!(u.pendingVerification?.isUpgrade || u.isUpgrade);
        
        // Find exact actual amount paid
        let amountPaid = 0;
        if (typeof u.amount === "number") {
          amountPaid = u.amount;
        } else if (u.amount && !isNaN(Number(u.amount))) {
          amountPaid = Number(u.amount);
        } else if (u.pendingVerification?.amount && !isNaN(Number(u.pendingVerification.amount))) {
          amountPaid = Number(u.pendingVerification.amount);
        } else if (u.paymentAmount && !isNaN(Number(u.paymentAmount))) {
          amountPaid = Number(u.paymentAmount);
        }
        
        // Default regular (gross) prices
        let regPrice = 0;
        if (planStr === "premium" || planStr === "enterprise") {
          if (isUpgradeUser) {
            regPrice = pricingSettings.upgradePrice || 500;
          } else {
            regPrice = pricingSettings.premiumPrice || 1499;
          }
        } else {
          regPrice = pricingSettings.basicPrice || 999;
        }
        
        // Fall back to expected amounts if database missing value
        if (amountPaid <= 0) {
          if (planStr === "premium") {
            if (isUpgradeUser) {
              amountPaid = pricingSettings.upgradePrice || 500;
            } else {
              amountPaid = (isOfferActive && pricingSettings.promoDiscountPremium > 0)
                ? pricingSettings.promoDiscountPremium
                : (pricingSettings.premiumPrice || 1499);
            }
          } else {
            amountPaid = (isOfferActive && pricingSettings.promoDiscountBasic > 0)
              ? pricingSettings.promoDiscountBasic
              : (pricingSettings.basicPrice || 999);
          }
        }
        
        // Update categorization numbers
        if (planStr === "premium") {
          if (isUpgradeUser) {
            upgradeActiveCount++;
            upgradeGrossRev += regPrice;
            upgradeNetRev += amountPaid;
          } else {
            premiumActiveCount++;
            premiumGrossRev += regPrice;
            premiumNetRev += amountPaid;
          }
        } else {
          basicActiveCount++;
          basicGrossRev += regPrice;
          basicNetRev += amountPaid;
        }

        const discount = Math.max(0, regPrice - amountPaid);
        if (discount > 0) {
          totalDiscountAppliedCount++;
          totalDiscountsValue += discount;
        }

        // Timeline sorting helper
        let dateObj: Date | null = null;
        if (u.createdAt?.seconds) {
          dateObj = new Date(u.createdAt.seconds * 1000);
        } else if (u.createdAt) {
          try { dateObj = new Date(u.createdAt); } catch (e) {}
        }
        
        const monthYearStr = dateObj 
          ? dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' })
          : "Historical Inception";

        if (!historicalByMonth[monthYearStr]) {
          historicalByMonth[monthYearStr] = { gross: 0, net: 0, discounts: 0, count: 0 };
        }
        
        historicalByMonth[monthYearStr].gross += regPrice;
        historicalByMonth[monthYearStr].net += amountPaid;
        historicalByMonth[monthYearStr].discounts += discount;
        historicalByMonth[monthYearStr].count += 1;
      });

      const totalGrossRevenue = basicGrossRev + premiumGrossRev + upgradeGrossRev;
      const totalNetRevenue = basicNetRev + premiumNetRev + upgradeNetRev;

      // 5. BIR Tax Compliance calculations
      const calculateGraduatedTax = (taxableIncome: number) => {
        if (taxableIncome <= 250000) return 0;
        if (taxableIncome <= 400000) return (taxableIncome - 250000) * 0.15;
        if (taxableIncome <= 800000) return 22500 + (taxableIncome - 400000) * 0.20;
        if (taxableIncome <= 2000000) return 102500 + (taxableIncome - 800000) * 0.25;
        if (taxableIncome <= 8000000) return 402500 + (taxableIncome - 2000000) * 0.30;
        return 2202500 + (taxableIncome - 8000000) * 0.35;
      };

      // Scenario 1: VAT Registered (12% Output VAT on exclusive netSales, CIT 20% on 60% of exclusive Sales with OSD)
      const vatExclSales = totalNetRevenue / 1.12;
      const outputVatValue = vatExclSales * 0.12;
      const vatCorpExpensesOSD = vatExclSales * 0.40;
      const vatTaxableIncome = vatExclSales * 0.60;
      const vatIncomeTaxCIT = vatTaxableIncome * 0.20;
      const vatTotalTaxesPayable = outputVatValue + vatIncomeTaxCIT;
      const vatFinalNetIncome = vatExclSales - vatIncomeTaxCIT - vatCorpExpensesOSD;

      // Scenario 2: Non-VAT Sole Proprietorship 8% Flat Tax (8% on excess over 250k)
      const nonVatFlatExemption = 250000;
      const nonVatFlatTaxable = Math.max(0, totalNetRevenue - nonVatFlatExemption);
      const nonVatFlatTaxValue = nonVatFlatTaxable * 0.08;
      const nonVatFlatPercentageTax = 0;
      const nonVatFlatFinalNet = totalNetRevenue - nonVatFlatTaxValue;

      // Scenario 3: Non-VAT Graduated Income Tax + 3% Percentage Tax (OSD 40% applied)
      const percentageTaxValue = totalNetRevenue * 0.03;
      const nonVatGradSlsNetPercentage = totalNetRevenue - percentageTaxValue;
      const nonVatGradOSDExpenses = totalNetRevenue * 0.40;
      const nonVatGradTaxable = Math.max(0, totalNetRevenue - percentageTaxValue - nonVatGradOSDExpenses);
      const nonVatStepIncomeTax = calculateGraduatedTax(nonVatGradTaxable);
      const nonVatGradTotalTaxes = percentageTaxValue + nonVatStepIncomeTax;
      const nonVatGradFinalNet = totalNetRevenue - nonVatGradTotalTaxes - nonVatGradOSDExpenses;

      */

      // Formatting helper for currency PHP
      const fPHP = (val: number) => "₱" + Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      // Docx Style helpers to avoid repetitive nesting
      const primaryColor = "4F46E5";   // Deep Indigo Indigo-600
      const secondaryColor = "1E1B4B"; // Slate-950 dark text
      const headingColor = "312E81";   // Indigo-900

      // Table cell builder (with border styling and padding options)
      const createCell = (text: string, options: { bold?: boolean; fill?: string; align?: "left" | "right" | "center"; color?: string; italic?: boolean; sz?: number } = {}) => {
        return new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: text,
                  bold: options.bold || false,
                  italics: options.italic || false,
                  color: options.color || "334155", // Slate-700
                  font: "Segoe UI",
                  size: options.sz || 19, // 9.5pt
                }),
              ],
              alignment: options.align === "right" 
                ? AlignmentType.RIGHT 
                : (options.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT),
              spacing: { before: 100, after: 100 }
            }),
          ],
          shading: options.fill ? { fill: options.fill } : undefined,
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
            left: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
            right: { style: BorderStyle.SINGLE, size: 1, color: "E2E8F0" },
          },
        });
      };

      const createRow = (cells: TableCell[]) => new TableRow({ children: cells });

      const headingParagraph = (text: string) => {
        return new Paragraph({
          spacing: { before: 280, after: 100 },
          children: [
            new TextRun({
              text: "▪ " + text,
              bold: true,
              size: 23, // 11.5pt
              color: headingColor,
              font: "Segoe UI",
            }),
          ],
        });
      };

      const normalParagraph = (text: string, italic: boolean = false) => {
        return new Paragraph({
          spacing: { before: 60, after: 80 },
          children: [
            new TextRun({
              text: text,
              font: "Segoe UI",
              size: 20, // 10pt
              color: "334155",
              italics: italic
            })
          ]
        });
      };

      // 6. Build report structure
      const reportChildren: any[] = [
        // COVER HEADER BLOCK
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 120 },
          children: [
            new TextRun({
              text: "ELECTRICALPH ENGINEERING PLATFORM",
              bold: true,
              size: 30, // 15pt
              color: primaryColor,
              font: "Segoe UI",
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 50, after: 200 },
          children: [
            new TextRun({
              text: "CORPORATE FINANCIAL PERFORMANCE & BIR TAX COMPLIANCE REPORT",
              bold: true,
              size: 23, // 11.5pt
              color: "1E293B",
              font: "Segoe UI",
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
          children: [
            new TextRun({
              text: `Data Scope: Full System Database • Authorized Audit Record Only\nReport Generated: ${new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}\nPrepared for: Board & Administrative Review\nCompiled by Server Account: ${user.email}`,
              italics: true,
              size: 17, // 8.5pt
              color: "64748B",
              font: "Segoe UI",
            }),
          ],
        }),

        new Paragraph({
          spacing: { after: 250 },
          children: [
            new TextRun({
              text: "_________________________________________________________________________________",
              color: "CBD5E1",
              size: 14,
            })
          ]
        }),

        // SECTION 1: EXECUTIVE KPIs
        headingParagraph("EXECUTIVE SUMMARY & CORPORATE KEY PERFORMANCE INDICATORS"),
        normalParagraph("The following table shows the comprehensive overview of the platform's financial performance since foundation. Outstanding accounts currently under verification review are classified separate from the actual audited baseline."),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            createRow([
              createCell("Financial Target Metric Group", { bold: true, fill: "F1F5F9", align: "center", font: "Segoe UI" } as any),
              createCell("Summary Metrics / Base Record Value", { bold: true, fill: "F1F5F9", align: "center", font: "Segoe UI" } as any),
            ]),
            createRow([
              createCell("Total Confirmed Active Subscribers", { bold: true }),
              createCell(`${totalActiveCount} User Accounts`, { align: "right" }),
            ]),
            createRow([
              createCell("Pending Verification Billing Pipeline", { bold: false }),
              createCell(`${totalPendingCount} User Accounts`, { align: "right" }),
            ]),
            createRow([
              createCell("Total Regular Subscriptions Sales (Gross Revenue Equivalent)", { bold: true }),
              createCell(fPHP(totalGrossRevenue), { align: "right", color: "1E1B4B", bold: true }),
            ]),
            createRow([
              createCell("Total Platform Campaign Deductions & Discounts Applied", { bold: false }),
              createCell(`(${fPHP(totalDiscountsValue)})`, { align: "right", color: "B91C1C" }),
            ]),
            createRow([
              createCell("Total Realized Cash Subscriptions Collected (Net Sales Revenue)", { bold: true }),
              createCell(fPHP(totalNetRevenue), { align: "right", color: "15803D", bold: true }),
            ]),
          ],
        }),

        // SECTION 2: CATEGORY PLAN BREAKDOWNS
        headingParagraph("DETAILED BREAKDOWN BY SUBSCRIPTION PLAN AND TIER LEVEL"),
        normalParagraph("The table below details subscriber counts, regular price levels, promotional discount amounts, and actual net sales collected per subscription service plan level offered:"),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            createRow([
              createCell("Subscription Plan Tier", { bold: true, fill: "EEF2F6" }),
              createCell("Active Accounts", { bold: true, fill: "EEF2F6", align: "center" }),
              createCell("Regular Price / Account", { bold: true, fill: "EEF2F6", align: "right" }),
              createCell("Gross Revenue Base", { bold: true, fill: "EEF2F6", align: "right" }),
              createCell("Applied Discounts", { bold: true, fill: "EEF2F6", align: "right" }),
              createCell("Actual Net Revenue Paid", { bold: true, fill: "EEF2F6", align: "right" }),
            ]),
            createRow([
              createCell("Basic Plan", { bold: true }),
              createCell(`${basicActiveCount} Active`, { align: "center" }),
              createCell(fPHP(pricingSettings.basicPrice || 999), { align: "right" }),
              createCell(fPHP(basicGrossRev), { align: "right" }),
              createCell(`(${fPHP(basicGrossRev - basicNetRev)})`, { align: "right", color: "B91C1C" }),
              createCell(fPHP(basicNetRev), { align: "right", bold: true }),
            ]),
            createRow([
              createCell("Premium Plan (Full Sub)", { bold: true }),
              createCell(`${premiumActiveCount} Active`, { align: "center" }),
              createCell(fPHP(pricingSettings.premiumPrice || 1499), { align: "right" }),
              createCell(fPHP(premiumGrossRev), { align: "right" }),
              createCell(`(${fPHP(premiumGrossRev - premiumNetRev)})`, { align: "right", color: "B91C1C" }),
              createCell(fPHP(premiumNetRev), { align: "right", bold: true }),
            ]),
            createRow([
              createCell("Premium Upgrade Paths (Basic -> Premium)", { bold: false }),
              createCell(`${upgradeActiveCount} Active`, { align: "center" }),
              createCell(fPHP(pricingSettings.upgradePrice || 500), { align: "right" }),
              createCell(fPHP(upgradeGrossRev), { align: "right" }),
              createCell(`(${fPHP(upgradeGrossRev - upgradeNetRev)})`, { align: "right", color: "B91C1C" }),
              createCell(fPHP(upgradeNetRev), { align: "right", bold: true }),
            ]),
            createRow([
              createCell("TOTAL CONSOLIDATED AUDIT BASE", { bold: true, fill: "F8FAFC" }),
              createCell(`${totalActiveCount} Active`, { bold: true, fill: "F8FAFC", align: "center" }),
              createCell("N/A", { fill: "F8FAFC", align: "right" }),
              createCell(fPHP(totalGrossRevenue), { bold: true, fill: "F8FAFC", align: "right" }),
              createCell(`(${fPHP(totalDiscountsValue)})`, { bold: true, fill: "F8FAFC", align: "right", color: "B91C1C" }),
              createCell(fPHP(totalNetRevenue), { bold: true, fill: "F8FAFC", align: "right", color: "15803D" }),
            ]),
          ],
        }),

        // SECTION 3: HISTORICAL TIMELINE
        headingParagraph("HISTORICAL REVENUE SEQUENCE (TIMELINE BY REGISTRATION DATE)"),
        normalParagraph("The historic trend analysis below compiles registration monthly cohorts along with actual cash revenues recorded within each respective billing month:"),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            createRow([
              createCell("Billing Period Calendar Month", { bold: true, fill: "F1F5F9" }),
              createCell("New Registered Paid Units", { bold: true, fill: "F1F5F9", align: "center" }),
              createCell("Gross Revenue Base", { bold: true, fill: "F1F5F9", align: "right" }),
              createCell("Total Dynamic Discounts", { bold: true, fill: "F1F5F9", align: "right" }),
              createCell("Direct Cash Net Revenue", { bold: true, fill: "F1F5F9", align: "right" }),
            ]),
            ...Object.keys(historicalByMonth).map(monthName => {
              const item = historicalByMonth[monthName];
              return createRow([
                createCell(monthName, { bold: true }),
                createCell(`${item.count} Accounts`, { align: "center" }),
                createCell(fPHP(item.gross), { align: "right" }),
                createCell(`(${fPHP(item.discounts)})`, { align: "right", color: "B91C1C" }),
                createCell(fPHP(item.net), { align: "right", bold: true }),
              ]);
            })
          ],
        }),

        // SECTION 4: PHILIPPINE TAX LAW COMPLIANCE
        headingParagraph("PHILIPPINE TAX COMPLIANCE & BIR AUDIT ESTIMATIONS"),
        normalParagraph("Under standard Bureau of Internal Revenue (BIR) regulations, computing net sales depends on the legal entity structure of the organization. The computations below show detailed estimations comparing VAT Registration versus Non-VAT Schemes (TRAIN Law provisions):"),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            createRow([
              createCell("Compliance Tax Item Line", { bold: true, fill: "EEF2F6" }),
              createCell("Tax Option A: 12% VAT Entity", { bold: true, fill: "EEF2F6", align: "center" }),
              createCell("Tax Option B: 8% Flat (Non-VAT)", { bold: true, fill: "EEF2F6", align: "center" }),
              createCell("Tax Option C: Graduated (Non-VAT)", { bold: true, fill: "EEF2F6", align: "center" }),
            ]),
            createRow([
              createCell("Gross Total Cash Receipts Collected", { bold: false }),
              createCell(fPHP(totalNetRevenue), { align: "right" }),
              createCell(fPHP(totalNetRevenue), { align: "right" }),
              createCell(fPHP(totalNetRevenue), { align: "right" }),
            ]),
            createRow([
              createCell("Less: Statutory VAT Adjustment (Inclusive)", { bold: false }),
              createCell(`(${fPHP(totalNetRevenue - vatExclSales)})`, { align: "right", color: "B91C1C" }),
              createCell("₱0.00 (Exempt)", { align: "right" }),
              createCell("₱0.00 (Exempt)", { align: "right" }),
            ]),
            createRow([
              createCell("Net Taxable Sales Base (Exc. VAT / Adjustments)", { bold: true }),
              createCell(fPHP(vatExclSales), { align: "right", bold: true }),
              createCell(fPHP(totalNetRevenue), { align: "right" }),
              createCell(fPHP(totalNetRevenue), { align: "right" }),
            ]),
            createRow([
              createCell("Statutory Deductions (OSD @ 40% Allowance)", { bold: false }),
              createCell(`(${fPHP(vatCorpExpensesOSD)})`, { align: "right", color: "64748B" }),
              createCell("₱250,000.00 Personal Deduction", { align: "right", color: "64748B" }),
              createCell(`(${fPHP(nonVatGradOSDExpenses)})`, { align: "right", color: "64748B" }),
            ]),
            createRow([
              createCell("Calculated Taxable Business Income", { bold: true }),
              createCell(fPHP(vatTaxableIncome), { align: "right" }),
              createCell(fPHP(nonVatFlatTaxable), { align: "right" }),
              createCell(fPHP(nonVatGradTaxable), { align: "right" }),
            ]),
            createRow([
              createCell("Government Taxes Due (CIT Option / Flat 8% / Grad)", { bold: true, color: "B91C1C" }),
              createCell(fPHP(vatIncomeTaxCIT), { align: "right", color: "B91C1C" }),
              createCell(fPHP(nonVatFlatTaxValue), { align: "right", color: "B91C1C" }),
              createCell(fPHP(nonVatStepIncomeTax), { align: "right", color: "B91C1C" }),
            ]),
            createRow([
              createCell("Value Added Tax (12%) / Percentage Tax (3% Sec116)", { bold: true, color: "B91C1C" }),
              createCell(fPHP(outputVatValue), { align: "right", color: "B91C1C" }),
              createCell("₱0.00 (Exempt)", { align: "right" }),
              createCell(fPHP(percentageTaxValue), { align: "right", color: "B91C1C" }),
            ]),
            createRow([
              createCell("TOTAL ESTIMATED DEDUCTED TAX LIABILITY", { bold: true, color: "991B1B", fill: "FEF2F2" }),
              createCell(fPHP(vatTotalTaxesPayable), { bold: true, align: "right", color: "991B1B", fill: "FEF2F2" }),
              createCell(fPHP(nonVatFlatTaxValue), { bold: true, align: "right", color: "991B1B", fill: "FEF2F2" }),
              createCell(fPHP(nonVatGradTotalTaxes), { bold: true, align: "right", color: "991B1B", fill: "FEF2F2" }),
            ]),
            createRow([
              createCell("ESTIMATED COMPLIANT TAKEOHOME NET PROFIT", { bold: true, color: "166534", fill: "F0FDF4" }),
              createCell(fPHP(vatFinalNetIncome), { bold: true, align: "right", color: "166534", fill: "F0FDF4" }),
              createCell(fPHP(nonVatFlatFinalNet), { bold: true, align: "right", color: "166534", fill: "F0FDF4" }),
              createCell(fPHP(nonVatGradFinalNet), { bold: true, align: "right", color: "166534", fill: "F0FDF4" }),
            ]),
          ],
        }),

        // SECTION 5: FORECAST & EVALUATIONS RUN-RATES
        headingParagraph("REVENUE PROJECTIONS, EVALUATIONS AND RUN-RATE RUNWAYS"),
        normalParagraph("The forecasting block displays immediate annualized projections computed on top of the current active subscriber baseline (extrapolating active core subscriptions value):"),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            createRow([
              createCell("Run-Rate Extrapolation Cycle", { bold: true, fill: "F1F5F9" }),
              createCell("Projected Gross Billing Sales", { bold: true, fill: "F1F5F9", align: "right" }),
              createCell("Projected Campaign Discounts", { bold: true, fill: "F1F5F9", align: "right" }),
              createCell("Projected Net Collections", { bold: true, fill: "F1F5F9", align: "right" }),
            ]),
            createRow([
              createCell("Current Collection (Inception Basis)", { bold: true }),
              createCell(fPHP(totalGrossRevenue), { align: "right" }),
              createCell(`(${fPHP(totalDiscountsValue)})`, { align: "right", color: "B91C1C" }),
              createCell(fPHP(totalNetRevenue), { align: "right", bold: true, color: "15803D" }),
            ]),
            createRow([
              createCell("Weekly Realization Run-Rate Baseline", { bold: false }),
              createCell(fPHP(totalGrossRevenue / 4.3), { align: "right" }),
              createCell(`(${fPHP(totalDiscountsValue / 4.3)})`, { align: "right" }),
              createCell(fPHP(totalNetRevenue / 4.3), { align: "right", bold: true }),
            ]),
            createRow([
              createCell("Monthly Projected Cohort Horizon", { bold: false }),
              createCell(fPHP(totalGrossRevenue), { align: "right" }),
              createCell(`(${fPHP(totalDiscountsValue)})`, { align: "right" }),
              createCell(fPHP(totalNetRevenue), { align: "right", bold: true }),
            ]),
            createRow([
              createCell("Quarterly Consolidated Projection (90-Day Loop)", { bold: false }),
              createCell(fPHP(totalGrossRevenue * 3), { align: "right" }),
              createCell(`(${fPHP(totalDiscountsValue * 3)})`, { align: "right" }),
              createCell(fPHP(totalNetRevenue * 3), { align: "right", bold: true }),
            ]),
            createRow([
              createCell("Annual Consolidated Fiscal Outlook (12-Month run)", { bold: true, fill: "F8FAFC" }),
              createCell(fPHP(totalGrossRevenue * 12), { bold: true, fill: "F8FAFC", align: "right" }),
              createCell(`(${fPHP(totalDiscountsValue * 12)})`, { bold: true, fill: "F8FAFC", align: "right", color: "B91C1C" }),
              createCell(fPHP(totalNetRevenue * 12), { bold: true, fill: "F8FAFC", align: "right", color: "15803D" }),
            ]),
          ],
        }),

        new Paragraph({
          spacing: { before: 200, after: 150 },
          children: [
            new TextRun({
              text: "_________________________________________________________________________________",
              color: "CBD5E1",
              size: 14,
            })
          ]
        }),

        // VERIFICATION FOOTER MARKER
        headingParagraph("DOCUMENT SIGN-OFF & ADMIN CONTROL DELEGATION"),
        normalParagraph("This system compliance document compiles live collections and subscription status directly from the secure Firestore Database. Administrative actions like manually approving pending payment reviews immediately updates the ledger baseline of this document. It is formatted in high compliance to ensure it serves perfectly for management review, taxation filings, audit references, and financial planning."),

        new Paragraph({
          spacing: { before: 260 },
          children: [
            new TextRun({
              text: "Prepared and verified by:\n\n",
              size: 18,
              font: "Segoe UI",
              color: "475569"
            }),
            new TextRun({
              text: `______________________________________________\nSystem Finance & Administrative Controller Office\nAuthorized Digital Stamp ID: ${auth.currentUser?.uid || "N/A"}\nWeb Service Root: ElectricalPH Enterprise Systems`,
              bold: true,
              size: 18,
              font: "Segoe UI",
              color: "0F172A"
            }),
          ],
        }),
      ];

      // 7. Initialize Document in Section
      const doc = new Document({
        sections: [
          {
            properties: {},
            children: reportChildren,
          },
        ],
      });

      // 8. Generate and download file using file-saver
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `ElectricalPH_Financial_Report_${new Date().toISOString().slice(0, 10)}.docx`);
      setAdminStatusMsg("Financial Report (.docx) exported successfully!");
    } catch (err: any) {
      console.error("Error exporting Word report:", err);
      setAdminStatusMsg("Error exporting Financial Report (Word): " + err.message);
    }
  };

  const showAdminDashboard = (forceAdmin || isAdminMode) && isAdminUser;

  if (showAdminDashboard) {
    return (
      <div
        className={`flex flex-col font-sans w-full ${forceAdmin ? "bg-transparent py-2" : "min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8"}`}
      >
        <div className="max-w-6xl w-full mx-auto">
          {/* Admin Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-md mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-1 text-[10px] font-black tracking-wider uppercase bg-red-100 text-red-700 rounded-full">
                  Master Admin
                </span>
                <span className="text-sm font-semibold text-slate-400 font-mono">
                  {user.email}
                </span>
              </div>
              <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                ElectricalPH - Transactions Console
              </h1>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (forceAdmin && onPaymentSuccess) {
                    onPaymentSuccess();
                  } else {
                    setIsAdminMode(false);
                  }
                }}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors shrink-0"
              >
                {forceAdmin ? "Close Panel" : "Go back to Payment Screen"}
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl transition-colors shrink-0 flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </div>
          </div>

          {/* Tab Selection Switcher */}
          <div className="flex border-b border-slate-200 mb-8 pointer-events-auto overflow-x-auto">
            <button
              onClick={() => setAdminSubTab("verifications")}
              className={`py-3 px-6 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${
                adminSubTab === "verifications"
                  ? "border-indigo-600 text-indigo-600 font-extrabold"
                  : "border-transparent text-slate-400 hover:text-slate-600 font-bold"
              }`}
            >
              🔐 Verifications & Pricing
            </button>
            <button
              onClick={() => setAdminSubTab("invoices")}
              className={`py-3 px-6 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
                adminSubTab === "invoices"
                  ? "border-indigo-600 text-indigo-600 font-extrabold"
                  : "border-transparent text-slate-400 hover:text-slate-600 font-bold"
              }`}
            >
              📄 Invoice & Ledger
            </button>
            <button
              onClick={() => setAdminSubTab("subscriptions")}
              className={`py-3 px-6 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
                adminSubTab === "subscriptions"
                  ? "border-indigo-600 text-indigo-600 font-extrabold"
                  : "border-transparent text-slate-400 hover:text-slate-600 font-bold"
              }`}
            >
              <Users className="w-4 h-4" />
              Subscriptions
            </button>
          </div>

          {adminStatusMsg && (
            <div className="mb-6 bg-blue-50 border-l-4 border-blue-500 p-4 rounded-md">
              <p className="text-sm text-blue-700 font-bold">
                {adminStatusMsg}
              </p>
            </div>
          )}

          {adminSubTab === "invoices" ? (
            <InvoiceManager user={user} isAdminPanel={true} />
          ) : adminSubTab === "subscriptions" ? (
            <SubscriptionManager />
          ) : (
            <>
              {/* Flagged Payment Gateway Discrepancies & Audit Panel */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md mb-8">
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-2 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-rose-600" />
                  Gateway Payment Audits & Flagged Discrepancies
                </h2>
                <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                  Below is a real-time ledger of transactions flagged by the backend because the online payment rate processed at checkout diverged from the baseline database plans setup configurations. If a mismatch persists, reviews must be handled to reconcile user status.
                </p>

                {discrepancies.length === 0 ? (
                  <div className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-100 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <p className="text-xs font-black text-emerald-800 uppercase tracking-tight">All Online Gateway Payments Synchronized</p>
                      <p className="text-[11px] text-emerald-600 font-medium">Automatic system scans detected no discrepancies or payment manipulation attempts. Your records are pristine.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="overflow-hidden border border-rose-100 rounded-xl">
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-rose-50/50 border-b border-rose-100">
                              <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-rose-700">Subscriber / Email</th>
                              <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-rose-700">Requested Plan</th>
                              <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-rose-700">Baseline Expected</th>
                              <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-rose-700">Gateway Amount Paid</th>
                              <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-rose-700">Discrepancy Deviation</th>
                              <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-wider text-rose-700 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-rose-100 bg-rose-50/10">
                            {discrepancies.map((disp: any) => {
                              const deviation = (disp.actualAmountPaid || 0) - (disp.expectedAmount || 0);
                              return (
                                <tr key={disp.id} className="text-xxs">
                                  <td className="px-4 py-3">
                                    <div className="font-extrabold text-slate-900">{disp.email}</div>
                                    <div className="text-[9px] text-slate-400 font-mono">ID: {disp.userId?.slice(0, 8)}...</div>
                                    <div className="text-[8px] text-slate-400 font-mono mt-0.5">Session: {disp.sessionId?.slice(0, 15)}...</div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="px-2 py-0.5 font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-100 rounded text-[9px]">
                                      {(disp.plan || "premium").toUpperCase()} {disp.isUpgrade ? "(UPGRADE)" : ""}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 font-mono font-bold text-slate-800">₱{(disp.expectedAmount || 0).toFixed(2)}</td>
                                  <td className="px-4 py-3 font-mono font-bold text-rose-700">₱{(disp.actualAmountPaid || 0).toFixed(2)}</td>
                                  <td className="px-4 py-3 font-mono font-black text-rose-800">
                                    {deviation > 0 ? "+" : ""}{deviation.toFixed(2)}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex justify-end gap-2">
                                      <button
                                        onClick={() => handleResolveDiscrepancy(disp.id, disp.userId, disp.email, disp.actualAmountPaid, disp.plan || "premium", disp.isUpgrade === true)}
                                        className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all text-[9.5px] uppercase tracking-wide cursor-pointer shadow-sm"
                                      >
                                        Reconcile & Force Activate
                                      </button>
                                      <button
                                        onClick={async () => {
                                          if (window.confirm("Dismiss this discrepancy alert log? (This resets the audit warning log, but user's account access will remain locked until manually active.)")) {
                                            await deleteDoc(doc(db, "payment_discrepancies", disp.id));
                                            setAdminStatusMsg("Discrepancy alert log cleared.");
                                          }
                                        }}
                                        className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold transition-all text-[9.5px] uppercase tracking-wide cursor-pointer"
                                      >
                                        Dismiss Log
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile View of Discrepancies */}
                      <div className="block md:hidden divide-y divide-rose-100 bg-rose-50/10">
                        {discrepancies.map((disp: any) => {
                          const deviation = (disp.actualAmountPaid || 0) - (disp.expectedAmount || 0);
                          return (
                            <div key={disp.id} className="p-4 space-y-2 text-xxs">
                              <div className="flex justify-between items-start">
                                <div>
                                  <span className="font-extrabold text-slate-900 block">{disp.email}</span>
                                  <span className="text-slate-400 font-mono text-[9px]">ID: {disp.userId}</span>
                                </div>
                                <span className="px-1.5 py-0.5 bg-rose-100 text-rose-750 font-black rounded uppercase text-[8px]">
                                  Discrepancy
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 bg-rose-50 p-2 rounded-xl text-[10px]">
                                <div>
                                  <span className="text-slate-405 font-semibold text-[8px] uppercase block">Baseline Expected</span>
                                  <span className="font-bold text-slate-800">₱{(disp.expectedAmount || 0).toFixed(2)}</span>
                                </div>
                                <div>
                                  <span className="text-slate-405 font-semibold text-[8px] uppercase block">Gateway Paid</span>
                                  <span className="font-black text-rose-700">₱{(disp.actualAmountPaid || 0).toFixed(2)}</span>
                                </div>
                              </div>
                              <div className="flex items-center justify-end gap-2 pt-2 border-t border-rose-100/30">
                                <button
                                  onClick={() => handleResolveDiscrepancy(disp.id, disp.userId, disp.email, disp.actualAmountPaid, disp.plan || "premium", disp.isUpgrade === true)}
                                  className="px-2 py-1 text-[8px] font-black uppercase tracking-wider bg-indigo-650 hover:bg-indigo-750 text-white rounded cursor-pointer"
                                >
                                  Reconcile
                                </button>
                                <button
                                  onClick={async () => {
                                    if (window.confirm("Dismiss this discrepancy alert?")) {
                                      await deleteDoc(doc(db, "payment_discrepancies", disp.id));
                                      setAdminStatusMsg("Discrepancy alert cleared.");
                                    }
                                  }}
                                  className="px-2 py-1 text-[8px] font-black uppercase tracking-wider bg-slate-100 hover:bg-slate-205 text-slate-600 rounded cursor-pointer"
                                >
                                  Dismiss
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* QR Code Upload Settings Section for Admin */}
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-md mb-8">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-2 flex items-center gap-2">
              <QrCode className="w-5 h-5 text-indigo-600" />
              GCash QR Code Image Configuration
            </h2>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Upload your original GCash QR code image (the QR code card
              screenshot from your GCash app) to replace the system's fallback
              vector drawing. Regular users will then see and scan your exact
              original QR code instantly.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              {/* File Input and Controls */}
              <div className="space-y-4">
                <div className="border border-dashed border-slate-200 hover:border-indigo-500 rounded-xl p-6 transition-all text-center relative cursor-pointer bg-slate-50/50">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleQrUpload}
                    disabled={uploadingQr}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center">
                    <QrCode className="w-8 h-8 text-slate-400 mb-2" />
                    <span className="text-xs font-bold text-slate-600">
                      {uploadingQr
                        ? "Processing file..."
                        : "Click or Drag & Drop GCash QR Image to Upload"}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-mono">
                      PNG, JPG, or WEBP up to 800KB
                    </span>
                  </div>
                </div>
                {uploadingQr && (
                  <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      Processing image and saving to Firestore setting...
                    </span>
                  </div>
                )}
              </div>

              {/* Current QR Code Preview */}
              <div className="flex flex-col items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                  Active GCash QR Code Preview
                </span>
                {gcashQrUrl ? (
                  <div className="relative flex flex-col items-center">
                    <img
                      src={gcashQrUrl}
                      alt="Active GCash QR Code"
                      referrerPolicy="no-referrer"
                      className="w-40 h-40 object-contain rounded-lg shadow-sm border border-slate-200 bg-white p-1"
                    />
                    <span className="text-[9px] text-[#0057E7] font-bold mt-1 uppercase tracking-wider">
                      ★ Active Overridden Custom QR
                    </span>
                    <button
                      onClick={async () => {
                        if (!confirmResetGcash) {
                          setConfirmResetGcash(true);
                          setTimeout(() => setConfirmResetGcash(false), 4000);
                          return;
                        }
                        setConfirmResetGcash(false);
                        try {
                          await setDoc(
                            doc(db, "settings", "gcash"),
                            { qrCodeDataUrl: "" },
                            { merge: true },
                          );
                          setGcashQrUrl("");
                          setAdminStatusMsg(
                            "Reset GCash QR to default built-in QR.",
                          );
                        } catch (err: any) {
                          setAdminStatusMsg(
                            "Error resetting QR: " + err.message,
                          );
                          try {
                            handleFirestoreError(
                              err,
                              OperationType.WRITE,
                              "settings/gcash",
                            );
                          } catch (e) {}
                        }
                      }}
                      className={`absolute -top-2 -right-3 border font-bold text-[10px] p-1.5 rounded-full transition-all shadow-sm ${
                        confirmResetGcash
                          ? "bg-red-600 border-red-700 text-white animate-pulse"
                          : "bg-red-100 border-red-200 text-red-600 hover:bg-red-200"
                      }`}
                      title={confirmResetGcash ? "Click again to confirm reset" : "Reset to default"}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <img
                      src={GCASH_DEFAULT_QR_BASE64}
                      alt="Default GCash QR Code"
                      referrerPolicy="no-referrer"
                      className="w-40 h-40 object-contain rounded-lg shadow-sm border border-slate-200 bg-white p-1 opacity-80"
                    />
                    <span className="text-[9px] text-slate-400 font-bold mt-1 uppercase tracking-wider">
                      ✔ Using Built-in System Default QR
                    </span>
                  </div>
                )}
              </div>
            </div>

            <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-2 flex items-center gap-2 mt-8">
              <QrCode className="w-5 h-5 text-orange-600" />
              MariBank QR Code Image Configuration
            </h2>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Upload your original MariBank QR code image to display it for the
              Direct MariBank option.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              {/* File Input and Controls */}
              <div className="space-y-4">
                <div className="border border-dashed border-slate-200 hover:border-orange-500 rounded-xl p-6 transition-all text-center relative cursor-pointer bg-slate-50/50">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleMaribankQrUpload}
                    disabled={uploadingMaribankQr}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center">
                    <QrCode className="w-8 h-8 text-slate-400 mb-2" />
                    <span className="text-xs font-bold text-slate-600">
                      {uploadingMaribankQr
                        ? "Processing file..."
                        : "Click or Drag & Drop MariBank QR Image to Upload"}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-mono">
                      PNG, JPG, or WEBP up to 800KB
                    </span>
                  </div>
                </div>
                {uploadingMaribankQr && (
                  <div className="flex items-center gap-2 text-orange-600 font-bold text-xs">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      Processing image and saving to Firestore setting...
                    </span>
                  </div>
                )}
              </div>

              {/* Current QR Code Preview */}
              <div className="flex flex-col items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                  Active MariBank QR Code Preview
                </span>
                {maribankQrUrl ? (
                  <div className="relative flex flex-col items-center">
                    <img
                      src={maribankQrUrl}
                      alt="Active MariBank QR Code"
                      referrerPolicy="no-referrer"
                      className="w-40 h-40 object-contain rounded-lg shadow-sm border border-slate-200 bg-white p-1"
                    />
                    <span className="text-[9px] text-[#F36B21] font-bold mt-1 uppercase tracking-wider">
                      ★ Active Overridden Custom QR
                    </span>
                    <button
                      onClick={async () => {
                        if (!confirmResetMaribank) {
                          setConfirmResetMaribank(true);
                          setTimeout(() => setConfirmResetMaribank(false), 4000);
                          return;
                        }
                        setConfirmResetMaribank(false);
                        try {
                          await setDoc(
                            doc(db, "settings", "maribank"),
                            { qrCodeDataUrl: "" },
                            { merge: true },
                          );
                          setMaribankQrUrl("");
                          setAdminStatusMsg("Removed MariBank QR.");
                        } catch (err: any) {
                          setAdminStatusMsg(
                            "Error resetting QR: " + err.message,
                          );
                          try {
                            handleFirestoreError(
                              err,
                              OperationType.WRITE,
                              "settings/maribank",
                            );
                          } catch (e) {}
                        }
                      }}
                      className={`absolute -top-2 -right-3 border font-bold text-[10px] p-1.5 rounded-full transition-all shadow-sm ${
                        confirmResetMaribank
                          ? "bg-red-600 border-red-700 text-white animate-pulse"
                          : "bg-red-100 border-red-200 text-red-600 hover:bg-red-200"
                      }`}
                      title={confirmResetMaribank ? "Click again to confirm reset" : "Reset to default"}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-40 h-40 flex items-center justify-center bg-slate-200 rounded-lg shadow-sm border border-slate-200">
                      <QrCode className="w-10 h-10 text-slate-400" />
                    </div>
                    <span className="text-[9px] text-slate-400 font-bold mt-1 uppercase tracking-wider">
                      No Image Uploaded
                    </span>
                  </div>
                )}
              </div>
            </div>

            <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-2 flex items-center gap-2 mt-8">
              <QrCode className="w-5 h-5 text-emerald-600" />
              Maya QR Code Image Configuration
            </h2>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Upload your original Maya QR code image to display it for the Direct Maya option.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              {/* File Input and Controls */}
              <div className="space-y-4">
                <div className="border border-dashed border-slate-200 hover:border-emerald-500 rounded-xl p-6 transition-all text-center relative cursor-pointer bg-slate-50/50">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleMayaQrUpload}
                    disabled={uploadingMayaQr}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center">
                    <QrCode className="w-8 h-8 text-slate-400 mb-2" />
                    <span className="text-xs font-bold text-slate-600">
                      {uploadingMayaQr
                        ? "Processing file..."
                        : "Click or Drag & Drop Maya QR Image to Upload"}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-mono">
                      PNG, JPG, or WEBP up to 800KB
                    </span>
                  </div>
                </div>
                {uploadingMayaQr && (
                  <div className="flex items-center gap-2 text-emerald-600 font-bold text-xs">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      Processing image and saving to Firestore setting...
                    </span>
                  </div>
                )}
              </div>

              {/* Current QR Code Preview */}
              <div className="flex flex-col items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                  Active Maya QR Code Preview
                </span>
                {mayaQrUrl ? (
                  <div className="relative flex flex-col items-center">
                    <img
                      src={mayaQrUrl}
                      alt="Active Maya QR Code"
                      referrerPolicy="no-referrer"
                      className="w-40 h-40 object-contain rounded-lg shadow-sm border border-slate-200 bg-white p-1"
                    />
                    <span className="text-[9px] text-[#00C27C] font-bold mt-1 uppercase tracking-wider">
                      ★ Active Overridden Custom QR
                    </span>
                    <button
                      onClick={async () => {
                        if (!confirmResetMaya) {
                          setConfirmResetMaya(true);
                          setTimeout(() => setConfirmResetMaya(false), 4000);
                          return;
                        }
                        setConfirmResetMaya(false);
                        try {
                          await setDoc(
                            doc(db, "settings", "maya"),
                            { qrCodeDataUrl: "" },
                            { merge: true },
                          );
                          setMayaQrUrl("");
                          setAdminStatusMsg("Removed Maya QR.");
                        } catch (err: any) {
                          setAdminStatusMsg(
                            "Error resetting QR: " + err.message,
                          );
                          try {
                            handleFirestoreError(
                              err,
                              OperationType.WRITE,
                              "settings/maya",
                            );
                          } catch (e) {}
                        }
                      }}
                      className={`absolute -top-2 -right-3 border font-bold text-[10px] p-1.5 rounded-full transition-all shadow-sm ${
                        confirmResetMaya
                          ? "bg-red-600 border-red-700 text-white animate-pulse"
                          : "bg-red-100 border-red-200 text-red-600 hover:bg-red-200"
                      }`}
                      title={confirmResetMaya ? "Click again to confirm reset" : "Reset to default"}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-40 h-40 flex items-center justify-center bg-slate-200 rounded-lg shadow-sm border border-slate-200">
                      <QrCode className="w-10 h-10 text-slate-400" />
                    </div>
                    <span className="text-[9px] text-slate-400 font-bold mt-1 uppercase tracking-wider">
                      No Image Uploaded
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Dynamic Pricing Management Panel */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md mb-8">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4 select-none">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                  Admin Pricing & Promo Control Center
                </h2>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  Adjust plan subscription prices and manage limited-time campaigns
                </p>
              </div>
            </div>

            <form onSubmit={handleSavePricing} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Basic price */}
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                    Basic Plan Default Price (₱)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2 py-0.5 text-xs text-slate-400 font-bold">₱</span>
                    <input
                      type="number"
                      required
                      min="0"
                      value={adminBasicPrice || 0}
                      onChange={(e) => setAdminBasicPrice(e.target.value)}
                      placeholder="999"
                      className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-all font-mono"
                    />
                  </div>
                </div>

                {/* Premium price */}
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                    Premium Plan Default Price (₱)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2 py-0.5 text-xs text-slate-400 font-bold">₱</span>
                    <input
                      type="number"
                      required
                      min="0"
                      value={adminPremiumPrice || 0}
                      onChange={(e) => setAdminPremiumPrice(e.target.value)}
                      placeholder="1499"
                      className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-all font-mono"
                    />
                  </div>
                </div>

                {/* Enterprise price */}
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                    Enterprise Plan Default Price (₱)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2 py-0.5 text-xs text-slate-400 font-bold">₱</span>
                    <input
                      type="number"
                      required
                      min="0"
                      value={adminEnterprisePrice || 0}
                      onChange={(e) => setAdminEnterprisePrice(e.target.value)}
                      placeholder="2999"
                      className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-all font-mono"
                    />
                  </div>
                </div>

                {/* Upgrade price */}
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                    Plan Upgrade Cost (₱)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2 py-0.5 text-xs text-slate-400 font-bold">₱</span>
                    <input
                      type="number"
                      required
                      min="0"
                      value={adminUpgradePrice || 0}
                      onChange={(e) => setAdminUpgradePrice(e.target.value)}
                      placeholder="500"
                      className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-all font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Editable Plan Features Section */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 flex justify-between">
                    <span>Basic Plan Features</span>
                    <span className="text-[10px] text-slate-400 font-normal">One per line. Start line with "-" for disabled.</span>
                  </label>
                  <textarea
                    rows={4}
                    value={adminBasicFeatures}
                    onChange={(e) => setAdminBasicFeatures(e.target.value)}
                    placeholder={DEFAULT_BASIC_FEATURES}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-all font-sans leading-relaxed resize-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 flex justify-between">
                    <span>Premium Plan Features</span>
                    <span className="text-[10px] text-slate-400 font-normal">One per line. Start line with "-" for disabled.</span>
                  </label>
                  <textarea
                    rows={4}
                    value={adminPremiumFeatures}
                    onChange={(e) => setAdminPremiumFeatures(e.target.value)}
                    placeholder={DEFAULT_PREMIUM_FEATURES}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-all font-sans leading-relaxed resize-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 flex justify-between">
                    <span>Enterprise Plan Features</span>
                    <span className="text-[10px] text-slate-400 font-normal">One per line. Start line with "-" for disabled.</span>
                  </label>
                  <textarea
                    rows={4}
                    value={adminEnterpriseFeatures}
                    onChange={(e) => setAdminEnterpriseFeatures(e.target.value)}
                    placeholder={DEFAULT_ENTERPRISE_FEATURES}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-all font-sans leading-relaxed resize-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 flex justify-between">
                    <span>Upgrade Promo Features</span>
                    <span className="text-[10px] text-slate-400 font-normal">One per line. Start line with "-" for disabled.</span>
                  </label>
                  <textarea
                    rows={4}
                    value={adminUpgradeFeatures}
                    onChange={(e) => setAdminUpgradeFeatures(e.target.value)}
                    placeholder={DEFAULT_UPGRADE_FEATURES}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-all font-sans leading-relaxed resize-none"
                  />
                </div>
              </div>

              {/* Promo section */}
              <div className="p-4 bg-indigo-50/40 rounded-xl border border-indigo-100/50 space-y-4">
                <span className="text-[10px] uppercase font-black tracking-widest text-indigo-700 block select-none">
                  🛡 Limited-Time Campaign Promotion & Offers
                </span>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Campaign offer title */}
                  <div>
                    <label className="block text-[10px] font-black text-indigo-500 uppercase tracking-wider mb-1.5">
                      Campaign Title / Promo Label
                    </label>
                    <input
                      type="text"
                      value={adminOfferTitle || ""}
                      onChange={(e) => setAdminOfferTitle(e.target.value)}
                      placeholder="e.g. FLASH 20% DISCOUNT, INTRODUCTORY RATE"
                      className="w-full px-3 py-2 border border-indigo-100 rounded-xl text-xs font-semibold text-indigo-950 focus:outline-none focus:ring-2 focus:ring-indigo-600 transition-all"
                    />
                  </div>

                  {/* Campaign expiry date */}
                  <div>
                    <label className="block text-[10px] font-black text-indigo-500 uppercase tracking-wider mb-1.5">
                      Campaign Offer Expiry Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={adminOfferExpiry ? (adminOfferExpiry.includes("T") ? adminOfferExpiry.substring(0, 16) : adminOfferExpiry) : ""}
                      onChange={(e) => setAdminOfferExpiry(e.target.value)}
                      className="w-full px-3 py-2 border border-indigo-100 rounded-xl text-xs font-semibold text-indigo-950 focus:outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                  {/* Basic discount deductions */}
                  <div>
                    <label className="block text-[10px] font-black text-indigo-400 uppercase tracking-wider mb-1.5">
                      Basic Plan Promo Final Price (₱)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-2 py-0.5 text-xs text-indigo-400 font-bold">₱</span>
                      <input
                        type="number"
                        min="0"
                        value={adminPromoDiscountBasic || 0}
                        onChange={(e) => setAdminPromoDiscountBasic(e.target.value)}
                        placeholder="0"
                        className="w-full pl-8 pr-3 py-2 border border-indigo-100 bg-white rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-all font-mono"
                      />
                    </div>
                  </div>

                  {/* Premium discount deductions */}
                  <div>
                    <label className="block text-[10px] font-black text-indigo-400 uppercase tracking-wider mb-1.5">
                      Premium Plan Promo Final Price (₱)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-2 py-0.5 text-xs text-indigo-400 font-bold">₱</span>
                      <input
                        type="number"
                        min="0"
                        value={adminPromoDiscountPremium || 0}
                        onChange={(e) => setAdminPromoDiscountPremium(e.target.value)}
                        placeholder="0"
                        className="w-full pl-8 pr-3 py-2 border border-indigo-100 bg-white rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-all font-mono"
                      />
                    </div>
                  </div>

                  {/* Enterprise discount deductions */}
                  <div>
                    <label className="block text-[10px] font-black text-indigo-400 uppercase tracking-wider mb-1.5">
                      Enterprise Plan Promo Final Price (₱)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-2 py-0.5 text-xs text-indigo-400 font-bold">₱</span>
                      <input
                        type="number"
                        min="0"
                        value={adminPromoDiscountEnterprise || 0}
                        onChange={(e) => setAdminPromoDiscountEnterprise(e.target.value)}
                        placeholder="0"
                        className="w-full pl-8 pr-3 py-2 border border-indigo-100 bg-white rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-all font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment Methods Section */}
              <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-200 mt-6 space-y-4">
                <span className="text-[10px] uppercase font-black tracking-widest text-slate-800 block select-none">
                  💳 Payment Method Settings
                </span>
                <p className="text-xs text-slate-500 mb-2 leading-relaxed">
                  Toggle the switches below to activate or deactivate available payment methods globally. Disabled options will be instantly hidden from customers during checkout. At least one must remain enabled.
                </p>

                <div className="flex flex-col gap-3">
                  <label className="flex items-center gap-3 cursor-pointer p-3 bg-white border border-slate-100 rounded-lg shadow-sm hover:border-slate-300 transition-all">
                    <input
                      type="checkbox"
                      className="w-5 h-5 accent-indigo-600 rounded bg-slate-100 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                      checked={adminEnableMaribank}
                      onChange={(e) => setAdminEnableMaribank(e.target.checked)}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900">MariBank QR (InstaPay)</span>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Enable or disable direct MariBank transfers</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer p-3 bg-white border border-slate-100 rounded-lg shadow-sm hover:border-slate-300 transition-all">
                    <input
                      type="checkbox"
                      className="w-5 h-5 accent-[#0157E4] rounded bg-slate-100 border-slate-300 focus:ring-[#0157E4] cursor-pointer"
                      checked={adminEnableGCash}
                      onChange={(e) => setAdminEnableGCash(e.target.checked)}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-[#0157E4]">GCash QR</span>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Enable or disable GCash direct wallet payments</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer p-3 bg-white border border-slate-100 rounded-lg shadow-sm hover:border-slate-300 transition-all">
                    <input
                      type="checkbox"
                      className="w-5 h-5 accent-emerald-500 rounded bg-slate-100 border-slate-300 focus:ring-emerald-400 cursor-pointer"
                      checked={adminEnableMaya}
                      onChange={(e) => setAdminEnableMaya(e.target.checked)}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900">Maya QR</span>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Enable or disable Direct Maya transfers</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer p-3 bg-white border border-slate-100 rounded-lg shadow-sm hover:border-slate-300 transition-all">
                    <input
                      type="checkbox"
                      className="w-5 h-5 accent-emerald-600 rounded bg-slate-100 border-slate-300 focus:ring-emerald-500 cursor-pointer"
                      checked={adminEnablePayMongo}
                      onChange={(e) => setAdminEnablePayMongo(e.target.checked)}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900">PayMongo (Credit/Debit/E-wallets/Online Banking)</span>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Enable or disable automated GCash/Card checkout limits</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Inline feedback status message */}
              {adminStatusMsg && (
                <div className="mt-4 bg-indigo-50 border-l-4 border-indigo-600 p-3 rounded-xl animate-fade-in">
                  <p className="text-xs text-indigo-900 font-bold select-all">
                    {adminStatusMsg}
                  </p>
                </div>
              )}

              {/* Actions footer */}
              <div className="flex flex-col sm:flex-row justify-end items-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={savingPricing}
                  onClick={async () => {
                    if (!confirmClearPromo) {
                      setConfirmClearPromo(true);
                      setTimeout(() => setConfirmClearPromo(false), 5000);
                      return;
                    }
                    setConfirmClearPromo(false);
                    setSavingPricing(true);
                    setAdminStatusMsg("");
                    
                    setAdminOfferTitle("");
                    setAdminOfferExpiry("");
                    setAdminPromoDiscountBasic("0");
                    setAdminPromoDiscountPremium("0");
                    setAdminPromoDiscountEnterprise("0");

                    try {
                      const basicVal = parseFloat(adminBasicPrice || "999");
                      const premiumVal = parseFloat(adminPremiumPrice || "1499");
                      const enterpriseVal = parseFloat(adminEnterprisePrice || "2999");
                      const upgradeVal = parseFloat(adminUpgradePrice || "500");

                      await setDoc(
                        doc(db, "settings", "pricing"),
                        {
                          basicPrice: basicVal,
                          premiumPrice: premiumVal,
                          enterprisePrice: enterpriseVal,
                          upgradePrice: upgradeVal,
                          promoDiscountBasic: 0,
                          promoDiscountPremium: 0,
                          promoDiscountEnterprise: 0,
                          offerTitle: "",
                          offerExpiry: "",
                          updatedBy: user.email || "",
                          updatedAt: new Date().toISOString()
                        },
                        { merge: true }
                      );
                      setAdminStatusMsg("Active promotion cleared and changes have been published system-wide successfully!");
                      hasLoadedPricingInputs.current = false;

                      // Automatically return to standard customer view so the rates update is instantly shown
                      setTimeout(() => {
                        setIsAdminMode(false);
                      }, 1200);
                    } catch (err: any) {
                      setAdminStatusMsg("Failed to clear promotion database-side: " + err.message);
                    } finally {
                      setSavingPricing(false);
                    }
                  }}
                  className={`w-full sm:w-auto px-4 py-2 border disabled:opacity-50 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all select-none ${
                    confirmClearPromo 
                      ? "bg-rose-600 border-rose-700 text-white hover:bg-rose-700" 
                      : "border-rose-200 text-rose-600 hover:bg-rose-50"
                  }`}
                >
                  {savingPricing 
                    ? "Processing..." 
                    : confirmClearPromo 
                      ? "⚠️ Click again to confirm clear" 
                      : "Clear Active Promotion"
                  }
                </button>
                <button
                  type="submit"
                  disabled={savingPricing}
                  className="w-full sm:w-auto px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-wider rounded-xl shadow-md transition-all disabled:opacity-50 select-none flex items-center justify-center gap-1.5"
                >
                  {savingPricing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Publishing Rates...
                    </>
                  ) : (
                    "Apply & Publish Rates System-wide"
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {/* KPI Card 1: Total Users */}
            <div className="bg-white rounded-2xl border border-slate-200/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_28px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between group min-h-[120px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                  Total Users
                </span>
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-100 transition-colors">
                  <span className="shrink-0"><Users className="w-4 h-4" /></span>
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900 tracking-tight font-sans">
                  {allUsers.length}
                </span>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" />
                  +12.4%
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-semibold mt-1 uppercase tracking-wider">
                Platform Account Base
              </p>
            </div>

            {/* KPI Card 2: Pending Approval */}
            <div className="bg-white rounded-2xl border border-slate-200/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_28px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between group min-h-[120px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                  Pending Approval
                </span>
                <div className="p-2 bg-amber-50 text-amber-655 rounded-xl group-hover:bg-amber-100 transition-colors">
                  <Clock className="w-4 h-4 text-amber-500" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className={`text-3xl font-black tracking-tight font-sans ${allUsers.filter((u) => u.paymentStatus === "pending_verification").length > 0 ? "text-amber-550" : "text-slate-900"}`}>
                  {allUsers.filter((u) => u.paymentStatus === "pending_verification").length}
                </span>
                {allUsers.filter((u) => u.paymentStatus === "pending_verification").length > 0 ? (
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md animate-pulse">
                    Action Required
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-md">
                    No backlog
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 font-semibold mt-1 uppercase tracking-wider">
                Awaiting Verification
              </p>
            </div>

            {/* KPI Card 3: Active Subscribers */}
            <div className="bg-white rounded-2xl border border-slate-200/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_28px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between group min-h-[120px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                  Active Subscribers
                </span>
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl group-hover:bg-emerald-100 transition-colors">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black text-emerald-600 tracking-tight font-sans font-extrabold">
                  {allUsers.filter((u) => u.isActive === true).length}
                </span>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                  {allUsers.length > 0 ? ((allUsers.filter((u) => u.isActive === true).length / allUsers.length) * 100).toFixed(0) : 0}% ratio
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-semibold mt-1 uppercase tracking-wider">
                Pro Active Licenses
              </p>
            </div>

            {/* KPI Card 4: Lifetime Subscribers */}
            <div className="bg-white rounded-2xl border border-slate-200/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_28px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between group min-h-[120px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-widest">
                  Lifetime Subscribers
                </span>
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-100 transition-colors">
                  <UserCheck className="w-4 h-4 text-indigo-500" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black text-indigo-600 tracking-tight font-sans font-extrabold">
                  {allUsers.filter((u) => u.isActive === true).length}
                </span>
                <span className="text-[10px] font-bold text-indigo-605 bg-indigo-50 px-1.5 py-0.5 rounded text-indigo-750 font-black">
                  100% Secure
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-semibold mt-1 uppercase tracking-wider">
                Permanent Access Tier
              </p>
            </div>

            {/* KPI Card 5: Unpaid Accounts */}
            <div className="bg-white rounded-2xl border border-slate-200/60 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_28px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between group min-h-[120px]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                  Unpaid Users
                </span>
                <div className="p-2 bg-slate-100 text-slate-600 rounded-xl group-hover:bg-slate-200 transition-colors">
                  <CreditCard className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-705 tracking-tight font-sans">
                  {
                    allUsers.filter(
                      (u) =>
                        u.isActive !== true &&
                        u.paymentStatus !== "pending_verification",
                    ).length
                  }
                </span>
                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">
                  {allUsers.length > 0 ? ((allUsers.filter((u) => u.isActive !== true && u.paymentStatus !== "pending_verification").length / allUsers.length) * 100).toFixed(0) : 0}% base
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-semibold mt-1 uppercase tracking-wider">
                Trial / Free Tier Base
              </p>
            </div>
          </div>

          {/* Controls Bar / Sticky Unified Toolbar */}
          <div className="sticky top-0 z-[30] bg-slate-50/95 backdrop-blur-md pb-4 pt-2 mb-6 border-b border-slate-200/50 flex flex-col gap-4 no-print -mx-6 px-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Left group: Search in unified display */}
              <div className="relative flex-1 max-w-lg w-full">
                <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by Email, UID, Ref No, or Name..."
                  value={searchQuery || ""}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 text-xs font-semibold bg-white border border-slate-200 hover:border-slate-300 focus:border-indigo-600 rounded-xl transition-all font-sans text-slate-900 shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-600"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3.5 top-[14px] text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-full hover:bg-slate-100 cursor-pointer"
                    title="Clear Search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Right group: Clean Action Panel */}
              <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-end lg:self-center">
                {/* Export Excel with icon */}
                <button
                  onClick={handleExportToExcel}
                  className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/60 font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm active:scale-[0.98] flex items-center gap-2 hover:shadow text-xxs cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  Export to Excel
                </button>

                {/* Word Financial Report with icon */}
                <button
                  onClick={handleExportFinancialReportWord}
                  className="px-4 py-2.5 bg-indigo-550 hover:bg-indigo-600 active:bg-indigo-750 text-white font-extrabold uppercase tracking-wider rounded-xl transition-all shadow-[0_4px_12px_rgba(79,70,229,0.15)] hover:shadow-[0_6px_16px_rgba(79,70,229,0.25)] active:scale-[0.98] flex items-center gap-2 text-xxs cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Word Financial Report
                </button>

                {/* Clean inline Indicator helper */}
                {(searchQuery || planFilter !== "all" || adminFilter !== "all" || startDate || endDate || sortOrder !== "newest") && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setPlanFilter("all");
                      setAdminFilter("all");
                      setStartDate("");
                      setEndDate("");
                      setSortOrder("newest");
                    }}
                    className="px-3.5 py-2.5 border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-xl text-xxs font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer"
                    title="Clear all active filters"
                  >
                    <X className="w-3.5 h-3.5" />
                    Reset Filters
                  </button>
                )}
              </div>
            </div>

            {/* Bottom Row: Segmented Filters, Sorting, and Date Range */}
            <div className="flex flex-col gap-4 pt-4 border-t border-slate-200/30">
              <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Plan Tier Segmented Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 select-none">
                    Plan
                  </span>
                  <div className="flex gap-0.5 bg-slate-200/60 p-0.5 rounded-xl border border-slate-200/40">
                    {(["all", "free", "basic", "premium", "enterprise"] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setPlanFilter(mode)}
                        className={`px-3 py-1.5 rounded-lg text-xxs font-black uppercase tracking-wider transition-all select-none cursor-pointer ${
                          planFilter === mode
                            ? "bg-white shadow-sm text-indigo-600 font-black border border-slate-200"
                            : "text-slate-500 hover:text-slate-800 font-bold"
                        }`}
                      >
                        {mode === "all" ? "All Plans" : mode === "free" ? "Free Trial" : mode}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Status Group Segmented Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 select-none">
                    Status
                  </span>
                  <div className="flex gap-0.5 bg-slate-200/60 p-0.5 rounded-xl border border-slate-200/40 flex-wrap">
                    {(["all", "pending", "paid", "lifetime", "free_trial", "unpaid"] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setAdminFilter(mode)}
                        className={`px-3 py-1.5 rounded-lg text-xxs font-black uppercase tracking-wider transition-all select-none cursor-pointer ${
                          adminFilter === mode
                            ? "bg-white shadow-sm text-indigo-600 font-black border border-slate-200"
                            : "text-slate-500 hover:text-slate-800 font-bold"
                        }`}
                      >
                        {mode === "all"
                          ? "All Status"
                          : mode === "pending"
                            ? "Pending"
                            : mode === "paid"
                              ? "Active"
                              : mode === "lifetime"
                                ? "Lifetime"
                                : mode === "free_trial"
                                  ? "Free Trial"
                                  : "Unpaid"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sorted Options: Subscription Date */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 select-none flex items-center gap-1">
                    <ArrowUpDown className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                    Sort
                  </span>
                  <div className="flex gap-0.5 bg-slate-200/60 p-0.5 rounded-xl border border-slate-200/40">
                    {(["newest", "oldest"] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setSortOrder(mode)}
                        className={`px-3 py-1.5 rounded-lg text-xxs font-black uppercase tracking-wider transition-all select-none cursor-pointer flex items-center gap-1 ${
                          sortOrder === mode
                            ? "bg-white shadow-sm text-indigo-600 font-black border border-slate-200"
                            : "text-slate-500 hover:text-slate-800 font-bold"
                        }`}
                      >
                        {mode === "newest" ? "Newest to Oldest" : "Oldest to Newest"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Row 3: Subscription Date Range Calendar pickers */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-200/20">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 select-none flex items-center gap-1">
                    <CalendarRange className="w-3 h-3 text-slate-400 shrink-0" />
                    Sub Date Range
                  </span>
                  
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-200 focus:border-indigo-600 rounded-xl outline-none shadow-sm transition-all text-center select-none cursor-pointer"
                        title="Start registration/subscription date"
                      />
                    </div>
                    <span className="text-slate-350 text-xs font-bold font-mono">to</span>
                    <div className="relative">
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-200 focus:border-indigo-600 rounded-xl outline-none shadow-sm transition-all text-center select-none cursor-pointer"
                        title="End registration/subscription date"
                      />
                    </div>

                    {(startDate || endDate) && (
                      <button
                        onClick={() => {
                          setStartDate("");
                          setEndDate("");
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Clear Date Filters"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Status Indicator counter */}
                <div className="text-right text-[10px] font-bold text-slate-400 font-mono select-none uppercase tracking-wider">
                  Showing {sortedUsers.length} of {allUsers.length} Users
                </div>
              </div>
            </div>
          </div>

          {/* User List Dropdown Click Closer Mask */}
          {activeDropdownUid && (
            <div 
              className="fixed inset-0 z-40 bg-transparent no-print" 
              onClick={() => setActiveDropdownUid(null)} 
            />
          )}

          {/* Compact Modern SaaS Table/List container */}
          <div className="bg-white rounded-2xl border border-slate-200/75 shadow-[0_8px_24px_rgba(0,0,0,0.04)] md:overflow-visible overflow-hidden animate-fade-in no-print">
            {sortedUsers.length === 0 ? (
              <div className="py-16 px-6 text-center bg-white rounded-2xl flex flex-col items-center">
                <Users className="w-10 h-10 text-slate-300 mb-2.5" />
                <h3 className="text-xs font-black text-slate-700 uppercase tracking-tight">
                  No matching user accounts
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Try adjusting search terms, plan tier or status filters.
                </p>
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setPlanFilter("all");
                    setAdminFilter("all");
                    setStartDate("");
                    setEndDate("");
                    setSortOrder("newest");
                  }}
                  className="mt-4 px-4 py-2 bg-slate-105 hover:bg-slate-200 text-slate-700 text-xxs font-black uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                >
                  Reset parameters
                </button>
              </div>
            ) : (
              <>
                {/* Desktop and Tablet Responsive Table */}
                <div className="hidden md:block md:overflow-visible">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/85 border-b border-slate-200/60 select-none">
                        <th className="px-5 py-3 text-[10px] font-black uppercase text-slate-450 tracking-wider first:rounded-tl-2xl">
                          Subscriber
                        </th>
                        <th className="px-5 py-3 text-[10px] font-black uppercase text-slate-450 tracking-wider">
                          Plan Tier
                        </th>
                        <th className="px-5 py-3 text-[10px] font-black uppercase text-slate-450 tracking-wider">
                          State Status
                        </th>
                        <th className="px-5 py-3 text-[10px] font-black uppercase text-slate-450 tracking-wider">
                          Approval & Reference
                        </th>
                        <th className="px-5 py-3 text-[10px] font-black uppercase text-slate-455 tracking-wider text-right w-[80px] last:rounded-tr-2xl">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedUsers.map((u, idx) => {
                        const isPending = u.paymentStatus === "pending_verification";
                        const isUserActive = u.isActive === true;
                        const finance = getUserFinanceDetails(u);
                        const initials = getUserName(u) ? getUserName(u).split(" ").map((w: string) => w[0]).join("").substring(0,2).toUpperCase() : "EE";

                        // Aesthetic background coloring based on status
                        const avatarColors = [
                          "bg-indigo-100 text-indigo-700",
                          "bg-emerald-100 text-emerald-700",
                          "bg-purple-100 text-purple-700",
                          "bg-blue-100 text-blue-700",
                          "bg-amber-100 text-amber-700"
                        ];
                        const colorClass = avatarColors[idx % avatarColors.length];

                        return (
                          <tr 
                            key={u.uid} 
                            className={`hover:bg-slate-50/50 transition-colors duration-150 ${isPending ? "bg-amber-50/10" : ""} ${activeDropdownUid === u.uid ? "relative z-50 pointer-events-auto" : ""}`}
                          >
                            {/* USER COLUMN */}
                            <td className="px-5 py-3 max-w-sm">
                              <div className="flex items-center gap-3">
                                {/* Compact Custom Avatar */}
                                <div className={`w-8 h-8 rounded-xl ${colorClass} flex items-center justify-center text-xs font-black tracking-tighter shrink-0 shadow-sm`}>
                                  {initials}
                                </div>
                                <div className="min-w-0 flex flex-col gap-0.5">
                                  <span className="font-extrabold text-slate-950 text-xs tracking-tight truncate leading-tight">
                                    {getUserName(u)}
                                  </span>
                                  <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                                    <span className="text-[10px] text-slate-400 font-medium truncate max-w-[150px]" title={u.email}>
                                      {u.email || "No email"}
                                    </span>
                                    <button
                                      onClick={() => {
                                        if (u.email) {
                                          navigator.clipboard.writeText(u.email);
                                          setAdminStatusMsg(`Copied email to clipboard: ${u.email}`);
                                        }
                                      }}
                                      className="text-slate-400 hover:text-indigo-600 transition-colors p-0.5 rounded cursor-pointer"
                                      title="Copy email address"
                                    >
                                      <Copy className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-[9px] font-mono font-bold text-slate-350 tracking-wider uppercase">
                                      uid: {u.uid.slice(0, 8)}...
                                    </span>
                                    <span className="text-[9px] font-bold text-slate-450 tracking-tight flex items-center gap-1">
                                      <Clock className="w-2.5 h-2.5 text-slate-300 shrink-0" />
                                      Sub Date: {getSubscriptionDate(u).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                    </span>
                                    {isUserActive && u.plan !== "enterprise" && (
                                      <span className="text-[9px] font-black uppercase text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100/50 self-start mt-0.5">
                                        {u.expiresAt ? `Expires: ${new Date(u.expiresAt).toLocaleDateString()}` : `Subscription: 30 DAYS`}
                                      </span>
                                    )}
                                    {isUserActive && u.plan === "enterprise" && (
                                      <span className="text-[9px] font-black uppercase text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100/50 self-start mt-0.5">
                                        Lifetime Access
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* PLAN COLUMN */}
                            <td className="px-5 py-3">
                              <div className="flex flex-col items-start gap-1">
                                {finance.planStr === "enterprise" ? (
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-indigo-550/10 text-indigo-700 border border-indigo-255/15 rounded-md flex items-center gap-1 shadow-sm">
                                    <Sparkles className="w-2.5 h-2.5 text-indigo-650" />
                                    Enterprise
                                  </span>
                                ) : finance.planStr === "premium" ? (
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-purple-550/10 text-purple-700 border border-purple-255/15 rounded-md flex items-center gap-1 shadow-sm">
                                    <Sparkles className="w-2.5 h-2.5 text-purple-650" />
                                    Premium Pro
                                  </span>
                                ) : finance.planStr === "free" ? (
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-slate-50 text-slate-700 border border-slate-200 rounded-md shadow-sm">
                                    Free Trial
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 rounded-md shadow-sm">
                                    Basic Tier
                                  </span>
                                )}
                                <span className="text-[11px] font-bold text-slate-900 font-mono mt-0.5">
                                  {u.isActive ? fPHP(finance.amountPaid) : "—"}
                                </span>
                              </div>
                            </td>

                            {/* STATUS COLUMN */}
                            <td className="px-5 py-3">
                              {isUserActive ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/50 shadow-sm">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                                  Active Paid
                                </span>
                              ) : isPending ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200/50 shadow-sm animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                  Pending Review
                                </span>
                              ) : u.paymentStatus === "flagged_discrepancy" ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-250 shadow-sm animate-pulse font-extrabold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-bounce" />
                                  🚩 Audit Discrepancy
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200/60 shadow-sm">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                  Unpaid
                                </span>
                              )}
                            </td>

                            {/* APPROVAL & TRANSACTION INFO COLUMN */}
                            <td className="px-5 py-3">
                              {isPending && u.pendingVerification ? (() => {
                                const isUpgrade = u.pendingVerification?.isUpgrade === true;
                                const plan = u.pendingVerification?.plan || "premium";
                                const expectedVal = isUpgrade ? upgradeFinalPrice : (plan === "enterprise" ? enterpriseFinalPrice : (plan === "basic" ? basicFinalPrice : premiumFinalPrice));
                                const actualVal = typeof u.pendingVerification?.amount === 'number' ? u.pendingVerification.amount : (parseFloat(u.pendingVerification?.amount) || 0);
                                const isManualMismatch = actualVal > 0 && Math.abs(actualVal - expectedVal) > 0.01;

                                return (
                                  <div className="bg-slate-50 border border-slate-200/60 p-2.5 rounded-xl text-[10px] space-y-1 max-w-xs shadow-sm">
                                    <div className="flex justify-between font-bold">
                                      <span className="text-slate-400 uppercase text-[9px] tracking-wide">Method/Name:</span>
                                      <span className="text-slate-800 uppercase font-black text-right truncate max-w-[120px]">
                                        {u.pendingVerification.method || "GCash"} ({u.pendingVerification.senderName || "Unknown"})
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wide">Ref ID:</span>
                                      <span className="text-indigo-600 font-mono font-extrabold tracking-wider bg-indigo-50/50 px-1 rounded">
                                        {u.pendingVerification.referenceNo || "—"}
                                      </span>
                                    </div>
                                    <div className="flex justify-between text-[9px] text-slate-500">
                                      <span>Date:</span>
                                      <span className="font-semibold">
                                        {new Date(u.pendingVerification.submittedAt).toLocaleDateString()}
                                      </span>
                                    </div>
                                    {isManualMismatch && (
                                      <div className="mt-1.5 p-1 px-2 rounded bg-rose-50 border border-rose-100 flex flex-col gap-0.5">
                                        <div className="flex justify-between items-center text-[9px] font-black text-rose-700">
                                          <span>VALUE MISMATCH</span>
                                          <span>Claimed ₱{actualVal}</span>
                                        </div>
                                        <div className="text-[8px] text-rose-500 font-medium">
                                          Baseline price for {plan.toUpperCase()} is ₱{expectedVal}.
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })() : u.paymentStatus === "flagged_discrepancy" && u.paymentDiscrepancy ? (
                                <div className="bg-rose-50 border border-rose-100 p-2.5 rounded-xl text-[10px] space-y-1 max-w-xs shadow-sm">
                                  <div className="flex justify-between font-bold text-rose-700">
                                    <span>SUSPECT PAYMONGO MISMATCH:</span>
                                    <span>Flagged</span>
                                  </div>
                                  <div className="flex justify-between text-slate-500">
                                    <span>Baseline Expected:</span>
                                    <span className="font-mono font-bold text-slate-800">₱{u.paymentDiscrepancy.expectedAmount}</span>
                                  </div>
                                  <div className="flex justify-between text-slate-500">
                                    <span>Gateway Paid:</span>
                                    <span className="font-mono font-bold text-rose-600">₱{u.paymentDiscrepancy.actualAmountPaid}</span>
                                  </div>
                                  <div className="flex justify-between text-[9px] text-slate-400">
                                    <span>Checked At:</span>
                                    <span>{new Date(u.paymentDiscrepancy.checkedAt).toLocaleDateString()}</span>
                                  </div>
                                </div>
                              ) : u.approvedAt ? (
                                <div className="text-[10px] shrink-0">
                                  <div className="font-extrabold text-slate-800 flex items-center gap-1">
                                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                                    APPROVED SYSTEM
                                  </div>
                                  <div className="text-slate-400 mt-0.5 font-semibold text-[9px] uppercase tracking-wider">
                                    By {u.approvedBy || "Admin"} • {new Date(u.approvedAt).toLocaleDateString()}
                                  </div>
                                  {u.expiresAt && (
                                    <div className={`mt-0.5 font-bold text-[9px] uppercase tracking-wider ${new Date(u.expiresAt) < new Date() ? 'text-red-500' : 'text-amber-500'}`}>
                                      Expires: {new Date(u.expiresAt).toLocaleDateString()}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-350 italic font-medium select-none">
                                  No transaction log
                                </span>
                              )}
                            </td>

                            {/* COMPACT CLERK-STYLE ACTIONS DROPDOWN */}
                            <td className="px-5 py-3 text-right">
                              <div className="relative inline-block text-left">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveDropdownUid(activeDropdownUid === u.uid ? null : u.uid);
                                  }}
                                  className="p-1 px-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                  title="Expand Options Menu"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>

                                {activeDropdownUid === u.uid && (
                                  <div className="absolute right-0 mt-1.5 w-48 bg-white border border-slate-200 rounded-2xl shadow-xl z-55 py-2 overflow-hidden animate-scale-up text-left">
                                    <p className="px-3.5 py-1.5 text-[8px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 mb-1 select-none">
                                      System Actions
                                    </p>
                                    
                                    {isPending ? (
                                      <>
                                        <button
                                          onClick={() => {
                                            setActiveDropdownUid(null);
                                            setConfirmingAction({
                                              uid: u.uid,
                                              type: "approve",
                                              email: u.email,
                                            });
                                          }}
                                          className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-emerald-600 transition-colors flex items-center gap-2 cursor-pointer"
                                        >
                                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                                          Approve Payment
                                        </button>
                                        <button
                                          onClick={() => {
                                            setActiveDropdownUid(null);
                                            setConfirmingAction({
                                              uid: u.uid,
                                              type: "reject",
                                              email: u.email,
                                            });
                                          }}
                                          className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-red-500 transition-colors flex items-center gap-2 cursor-pointer"
                                        >
                                          <X className="w-3.5 h-3.5 text-red-500" />
                                          Reject Submission
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setActiveDropdownUid(null);
                                          setConfirmingAction({
                                            uid: u.uid,
                                            type: "toggle",
                                            email: u.email,
                                            currentActiveStatus: isUserActive,
                                          });
                                        }}
                                        className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors flex items-center gap-2 cursor-pointer"
                                      >
                                        <Zap className="w-3.5 h-3.5 text-indigo-500" />
                                        {isUserActive ? "Revoke Pro Access" : "Direct Activate (Trial)"}
                                      </button>
                                    )}

                                    <button
                                      onClick={() => {
                                        setActiveDropdownUid(null);
                                        setManageSubAction({
                                          uid: u.uid,
                                          email: u.email,
                                          plan: u.plan || "premium",
                                          expiresAt: u.expiresAt || "",
                                          isActive: u.isActive || false
                                        });
                                      }}
                                      className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-amber-600 transition-colors flex items-center gap-2 cursor-pointer"
                                    >
                                      <Settings className="w-3.5 h-3.5 text-amber-500" />
                                      Manage Subscription
                                    </button>

                                    <div className="h-px bg-slate-100 my-1" />
                                    
                                    <button
                                      onClick={() => {
                                        setActiveDropdownUid(null);
                                        setShowDeleteConfirmModal({ uid: u.uid, email: u.email });
                                      }}
                                      className="w-full px-3.5 py-2 text-xs font-bold text-red-650 hover:bg-red-50 transition-colors flex items-center gap-2 cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      Delete Account
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View: High density visual cards layout */}
                <div className="block md:hidden divide-y divide-slate-100">
                  {sortedUsers.map((u) => {
                    const isPending = u.paymentStatus === "pending_verification";
                    const isUserActive = u.isActive === true;
                    const finance = getUserFinanceDetails(u);

                    return (
                      <div key={u.uid} className="p-4 bg-white hover:bg-slate-50 transition-all">
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0 flex-1">
                            {/* Profile head */}
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-extrabold text-slate-900 text-sm truncate">
                                {getUserName(u)}
                              </span>
                              
                              {/* Tier Badge */}
                              {finance.planStr === "enterprise" ? (
                                <span className="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 rounded border border-indigo-205/15">
                                  ENTERPRISE
                                </span>
                              ) : finance.planStr === "premium" ? (
                                <span className="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 rounded border border-purple-205/15">
                                  PREMIUM
                                </span>
                              ) : finance.planStr === "free" ? (
                                <span className="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider bg-slate-50 text-slate-700 rounded border border-slate-200">
                                  FREE
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 rounded border border-blue-200">
                                  BASIC
                                </span>
                              )}
                            </div>
                            
                            <p className="text-[10px] text-slate-400 font-mono truncate">{u.email}</p>
                            <div className="flex flex-col gap-0.5 mt-0.5">
                              <span className="text-[9px] font-mono text-slate-350 tracking-wider">UID: {u.uid.slice(0, 10)}...</span>
                              <span className="text-[9px] font-bold text-slate-400">Sub Date: {getSubscriptionDate(u).toLocaleDateString()}</span>
                              {isUserActive && u.plan !== "enterprise" && (
                                <span className="text-[9px] font-black uppercase text-amber-600">
                                  {u.expiresAt ? `Expires: ${new Date(u.expiresAt).toLocaleDateString()}` : `Subscription: 30 DAYS`}
                                </span>
                              )}
                              {isUserActive && u.plan === "enterprise" && (
                                <span className="text-[9px] font-black uppercase text-emerald-600">Subscription Type: Lifetime Access</span>
                              )}
                            </div>
                          </div>

                          {/* Status Badge */}
                          <div className="shrink-0">
                            {isUserActive ? (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100">
                                ACTIVE
                              </span>
                            ) : isPending ? (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-100 animate-pulse">
                                PENDING
                              </span>
                            ) : u.paymentStatus === "flagged_discrepancy" ? (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-100 animate-pulse font-extrabold">
                                🚩 FLAG
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-205">
                                UNPAID
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Transaction sub-details box for mobile */}
                        {isPending && u.pendingVerification ? (() => {
                          const isUpgrade = u.pendingVerification?.isUpgrade === true;
                          const plan = u.pendingVerification?.plan || "premium";
                          const expectedVal = isUpgrade ? upgradeFinalPrice : (plan === "enterprise" ? enterpriseFinalPrice : (plan === "basic" ? basicFinalPrice : premiumFinalPrice));
                          const actualVal = typeof u.pendingVerification?.amount === 'number' ? u.pendingVerification.amount : (parseFloat(u.pendingVerification?.amount) || 0);
                          const isManualMismatch = actualVal > 0 && Math.abs(actualVal - expectedVal) > 0.01;

                          return (
                            <div className="mt-3 bg-slate-50 border border-slate-200/60 p-3 rounded-xl text-[10px] space-y-1.5 shadow-inner">
                              <p className="font-extrabold text-slate-500 uppercase text-[8px] tracking-widest border-b border-slate-200 pb-1">
                                Submission Details
                              </p>
                              <div className="grid grid-cols-2 gap-2 mt-1">
                                <div>
                                  <span className="text-slate-400 font-bold block text-[8px] uppercase">Sender / Channel:</span>
                                  <span className="font-black text-slate-800 uppercase line-clamp-1">{u.pendingVerification.senderName || "Unknown"} ({u.pendingVerification.method})</span>
                                </div>
                                <div>
                                  <span className="text-slate-400 font-bold block text-[8px] uppercase">Ref ID Number:</span>
                                  <span className="font-mono font-extrabold text-indigo-600 tracking-wide bg-indigo-50 px-1 rounded truncate block">{u.pendingVerification.referenceNo}</span>
                                </div>
                              </div>
                              {isManualMismatch && (
                                <div className="mt-2 p-1.5 rounded bg-rose-50 border border-rose-100 flex flex-col gap-0.5">
                                  <div className="flex justify-between items-center text-[9px] font-black text-rose-700">
                                    <span>VALUE MISMATCH DETECTED</span>
                                    <span>Paid: ₱{actualVal}</span>
                                  </div>
                                  <p className="text-[8px] text-rose-500 font-medium">
                                    Plan price: ₱{expectedVal}. There is a discrepancy between baseline and paid credit.
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })() : u.paymentStatus === "flagged_discrepancy" && u.paymentDiscrepancy ? (
                          <div className="mt-3 bg-rose-50/50 border border-rose-100 p-3 rounded-xl text-[10px] space-y-1.5 shadow-inner">
                            <p className="font-extrabold text-rose-700 uppercase text-[8px] tracking-widest border-b border-rose-150 pb-1">
                              ⚠️ GATEWAY MISMATCH FLAG
                            </p>
                            <div className="grid grid-cols-2 gap-2 mt-1">
                              <div>
                                <span className="text-slate-400 font-medium block text-[8px] uppercase">System Expected:</span>
                                <span className="font-mono font-black text-slate-800">₱{u.paymentDiscrepancy.expectedAmount}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 font-medium block text-[8px] uppercase">Gateway Received:</span>
                                <span className="font-mono font-black text-rose-600">₱{u.paymentDiscrepancy.actualAmountPaid}</span>
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {/* User action options for mobile */}
                        <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-slate-100/60">
                          {isPending ? (
                            <>
                              <button
                                onClick={() =>
                                  setConfirmingAction({
                                    uid: u.uid,
                                    type: "reject",
                                    email: u.email,
                                  })
                                }
                                className="px-2.5 py-1.5 border border-red-200 text-red-600 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer bg-red-white hover:bg-red-50"
                              >
                                Reject
                              </button>
                              <button
                                onClick={() =>
                                  setConfirmingAction({
                                    uid: u.uid,
                                    type: "approve",
                                    email: u.email,
                                  })
                                }
                                className="px-3.5 py-1.5 bg-emerald-600 font-black text-white rounded-lg text-[10px] uppercase tracking-wider hover:bg-emerald-700 cursor-pointer shadow-sm shadow-emerald-500/10"
                              >
                                Approve
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() =>
                                  setConfirmingAction({
                                    uid: u.uid,
                                    type: "toggle",
                                    email: u.email,
                                    currentActiveStatus: isUserActive,
                                  })
                                }
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-colors cursor-pointer border ${
                                  isUserActive
                                    ? "bg-red-50 hover:bg-red-100 text-red-600 border-red-150"
                                    : "bg-indigo-50 border-indigo-200 text-indigo-700"
                                }`}
                              >
                                {isUserActive ? "Revoke Access" : "Direct Activate"}
                              </button>
                              <button
                                onClick={() =>
                                  setManageSubAction({
                                    uid: u.uid,
                                    email: u.email,
                                    plan: u.plan || "premium",
                                    expiresAt: u.expiresAt || "",
                                    isActive: u.isActive || false
                                  })
                                }
                                className="p-1 px-1.5 text-amber-500 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-amber-100"
                                title="Manage Subscription"
                              >
                                <Settings className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() =>
                                  setShowDeleteConfirmModal({ uid: u.uid, email: u.email })
                                }
                                className="p-1 px-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete user"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {manageSubAction && (
            <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 no-print animate-fade-in">
              <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl max-w-md w-full p-6 animate-scale-up">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 shadow-sm bg-amber-100 text-amber-600">
                  <Settings className="w-6 h-6" />
                </div>
                <h3 className="text-base font-black text-slate-900 uppercase tracking-tight mb-2">
                  Manage Subscription
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed font-semibold mb-6">
                  Edit subscription details for <span className="font-extrabold text-slate-800">{manageSubAction.email}</span>.
                </p>
                
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="text-xxs font-black text-slate-400 uppercase tracking-wider block mb-1">Plan</label>
                    <select
                      value={manageSubAction.plan}
                      onChange={(e) => setManageSubAction({...manageSubAction, plan: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-amber-500 cursor-pointer text-slate-700"
                    >
                      <option value="basic">Basic (30 Days)</option>
                      <option value="premium">Premium (30 Days)</option>
                      <option value="enterprise">Enterprise (Lifetime)</option>
                      <option value="free">Free Trial</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xxs font-black text-slate-400 uppercase tracking-wider block mb-1">Active Status</label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox"
                        checked={manageSubAction.isActive}
                        onChange={(e) => setManageSubAction({...manageSubAction, isActive: e.target.checked})}
                        className="w-4 h-4 text-amber-500 border-slate-300 rounded focus:ring-amber-500"
                      />
                      <span className="text-xs font-bold text-slate-700">Account is Active</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xxs font-black text-slate-400 uppercase tracking-wider block mb-1">Expiration Date</label>
                    <input 
                      type="datetime-local" 
                      value={manageSubAction.expiresAt ? (() => {
                        try {
                          const d = new Date(manageSubAction.expiresAt);
                          if (isNaN(d.getTime())) return "";
                          const offset = d.getTimezoneOffset();
                          const localDate = new Date(d.getTime() - offset * 60000);
                          return localDate.toISOString().slice(0,16);
                        } catch (e) {
                          return "";
                        }
                      })() : ""}
                      onChange={(e) => {
                        if (!e.target.value) {
                          setManageSubAction({...manageSubAction, expiresAt: ""});
                          return;
                        }
                        try {
                          const d = new Date(e.target.value);
                          if (!isNaN(d.getTime())) {
                            setManageSubAction({...manageSubAction, expiresAt: d.toISOString()});
                          }
                        } catch (err) {
                          console.error("Invalid date selected:", err);
                        }
                      }}
                      disabled={manageSubAction.plan === "enterprise"}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-amber-500 text-slate-700 disabled:opacity-50 disabled:bg-slate-100"
                    />
                    {manageSubAction.plan === "enterprise" && (
                      <p className="text-[9px] text-slate-400 mt-1 font-medium">Enterprise plans do not expire.</p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setManageSubAction(null)}
                    className="px-4 py-2 border border-slate-200 text-slate-650 hover:text-slate-800 text-xxs font-black uppercase tracking-wider rounded-xl transition-all hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleManageSubscriptionSave}
                    className="px-5 py-2 text-slate-900 bg-amber-500 hover:bg-amber-400 text-xxs font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-amber-500/20 cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Action Confirming Modal Overlay for Approve, Reject, and Toggle operations */}
          {confirmingAction && (
            <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 no-print animate-fade-in">
              <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl max-w-md w-full p-6 animate-scale-up">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 shadow-sm ${
                  confirmingAction.type === "approve" || (confirmingAction.type === "toggle" && !confirmingAction.currentActiveStatus)
                    ? "bg-emerald-100 text-emerald-600"
                    : "bg-red-100 text-red-600"
                }`}>
                  {confirmingAction.type === "approve" || (confirmingAction.type === "toggle" && !confirmingAction.currentActiveStatus) ? (
                    <CheckCircle2 className="w-6 h-6" />
                  ) : (
                    <AlertCircle className="w-6 h-6" />
                  )}
                </div>
                <h3 className="text-base font-black text-slate-900 uppercase tracking-tight mb-2">
                  Confirm Account Action
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed font-semibold mb-6">
                  Are you absolutely sure you want to proceed with{" "}
                  <span className="font-extrabold text-slate-800 uppercase">
                    {confirmingAction.type === "approve"
                      ? "APPROVAL & SYSTEM ACTIVATION"
                      : confirmingAction.type === "reject"
                        ? "REJECTION"
                        : confirmingAction.type === "delete"
                          ? "PERMANENT DELETION"
                          : confirmingAction.currentActiveStatus
                            ? "ACCESS DEACTIVATION"
                            : "MANUAL TRIAL ACTIVATION"}
                  </span>{" "}
                  for the subscriber account: <span className="font-extrabold text-slate-800">{confirmingAction.email}</span>?
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setConfirmingAction(null)}
                    className="px-4 py-2 border border-slate-200 text-slate-650 hover:text-slate-800 text-xxs font-black uppercase tracking-wider rounded-xl transition-all hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={executeConfirmedAction}
                    className={`px-5 py-2 text-white text-xxs font-black uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer ${
                      confirmingAction.type === "approve" || (confirmingAction.type === "toggle" && !confirmingAction.currentActiveStatus)
                        ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/10"
                        : "bg-red-600 hover:bg-red-500 shadow-red-600/10"
                    }`}
                  >
                    Yes, Proceed
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delete Account Dedicated Confirming Modal Overlay */}
          {showDeleteConfirmModal && (
            <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 no-print animate-fade-in">
              <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl max-w-md w-full p-6 animate-scale-up">
                <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center text-red-605 mb-4 shadow-sm">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-base font-black text-slate-900 uppercase tracking-tight mb-2">
                  Permanently Delete User Record?
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed font-semibold mb-6">
                  Are you absolutely sure you want to permanently delete <span className="font-extrabold text-slate-800">{showDeleteConfirmModal.email}</span>'s account from the database? This action is <span className="text-red-600 font-extrabold">IRREVERSIBLE</span> and the user will lose all saved calculations, compliance reports, and invoices.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowDeleteConfirmModal(null)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 hover:text-slate-800 text-xxs font-black uppercase tracking-wider rounded-xl transition-all hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      const { uid, email } = showDeleteConfirmModal;
                      setShowDeleteConfirmModal(null);
                      await handleAdminDelete(uid, email);
                    }}
                    className="px-5 py-2 bg-red-600 hover:bg-red-550 text-white text-xxs font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-red-600/10 cursor-pointer"
                  >
                    Confirm Delete
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Floating Clerk-style dismissible System Notifications Toast */}
          {adminStatusMsg && (
            <div className="fixed bottom-6 right-6 z-[9999] max-w-md bg-slate-900 text-white rounded-2xl shadow-2xl shadow-slate-955/20 border border-slate-800 p-4 flex gap-3 items-start animate-fade-in no-print">
              <div className="p-1 text-emerald-450 bg-emerald-500/15 rounded-lg shrink-0">
                <Sparkles className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-400">System Notification</p>
                <p className="text-xs text-slate-300 mt-1 font-semibold leading-relaxed">
                  {adminStatusMsg}
                </p>
              </div>
              <button
                onClick={() => setAdminStatusMsg("")}
                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          </>
          )}
        </div>
      </div>
    );
  }

  if (success && !forceAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
        <div className="sm:mx-auto sm:w-full sm:max-w-md bg-white py-12 px-4 shadow-xl sm:rounded-2xl border border-slate-100 flex flex-col items-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2 uppercase">
            Payment Successful!
          </h2>
          <p className="text-slate-500 text-center mb-8">
            {isUpgrade 
              ? "Your account has been upgraded to Premium. You now have full access to ElectricalPH's premium features. Please wait while we load your dashboard..."
              : "Your account has been activated. You now have full access to ElectricalPH. Please wait while we load your dashboard..."}
          </p>
          <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
        </div>
      </div>
    );
  }

  if (verifying) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
        <div className="sm:mx-auto sm:w-full sm:max-w-md bg-white py-12 px-4 shadow-xl sm:rounded-2xl border border-slate-100 flex flex-col items-center">
          <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-6" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            Verifying Payment...
          </h2>
          <p className="text-sm text-slate-500 text-center">
            Checking your transaction with PayMongo. Please do not close this
            window.
          </p>
        </div>
      </div>
    );
  }

  // Active Pending Review State Screen for regular user
  if (userProfile?.paymentStatus === "pending_verification" && !success) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
        {isAdminUser && (
          <div className="sm:mx-auto sm:w-full sm:max-w-md px-4 mb-4">
            <button
              onClick={() => setIsAdminMode(true)}
              className="w-full py-2 px-4 flex items-center justify-center gap-2 text-xs font-bold text-white bg-indigo-600 hover:bg-[#0057E7] border border-transparent rounded-xl shadow-lg transition-all transform hover:scale-[1.01]"
            >
              <ShieldCheck className="w-4 h-4 animate-bounce" />
              🔧 Open Transactions Monitor Panel
            </button>
          </div>
        )}
        <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center mb-6 relative">
          {onClose && (
            <button onClick={onClose} className="absolute -top-4 right-0 p-2 text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full">
              <X className="w-5 h-5" />
            </button>
          )}
          <div className="w-14 h-14 bg-amber-500 rounded-2xl flex items-center justify-center shadow-lg relative animate-pulse">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h2 className="mt-4 text-center text-2xl font-black text-slate-900 uppercase tracking-tight">
            Verification Pending
          </h2>
          <p className="mt-2 text-center text-sm text-slate-500 font-medium max-w-sm">
            We are reviewing your {isUpgrade ? "upgrade" : "payment"} verification details.
          </p>
        </div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-6 shadow-xl sm:rounded-2xl border border-slate-100">
            <div className="flex items-center gap-3 bg-amber-50 border-l-4 border-amber-500 p-4 rounded-lg mb-6 leading-relaxed">
              <Loader2 className="w-6 h-6 text-amber-600 shrink-0 animate-spin" />
              <div className="text-xs text-amber-800 font-bold uppercase tracking-wider space-y-0.5">
                <span className="block">Review process initiated</span>
                <span className="font-normal text-slate-600 tracking-normal normal-case block">
                  Checking reference ledger block against developer (Angelo
                  P.)'s e-wallet account balance.
                </span>
              </div>
            </div>

            {userProfile.pendingVerification && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2 mb-6">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">
                    Account ID
                  </span>
                  <span className="text-slate-700 font-bold font-mono text-[11px] select-all">
                    {user.uid}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">
                    Payment Method
                  </span>
                  <span className="text-slate-800 font-black uppercase text-[11px]">
                    {userProfile.pendingVerification.method || "GCash"}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">
                    Sender Account Name
                  </span>
                  <span className="text-slate-800 font-black uppercase text-[11px]">
                    {userProfile.pendingVerification.senderName}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">
                    Reference Code
                  </span>
                  <span className="text-[#0157E4] font-black font-mono tracking-wider text-[11px]">
                    {userProfile.pendingVerification.referenceNo}
                  </span>
                </div>
                <div className="flex justify-between text-xs pt-1 border-t border-slate-200/50">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">
                    Amount Paid
                  </span>
                  <span className="text-slate-900 font-black text-xs font-mono">
                    ₱{userProfile.pendingVerification.amount?.toLocaleString() || "1,000"}.00
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">
                    Submitted On
                  </span>
                  <span className="text-slate-500 font-medium">
                    {new Date(
                      userProfile.pendingVerification.submittedAt,
                    ).toLocaleTimeString()}{" "}
                    {new Date(
                      userProfile.pendingVerification.submittedAt,
                    ).toLocaleDateString()}
                  </span>
                </div>
              </div>
            )}

            <p className="text-xs text-slate-400 text-center mb-6 leading-relaxed">
              Verification is usually process-verified in{" "}
              <strong>5 to 10 minutes</strong>. Once the admin (Angelo P.)
              confirms the transfer on their e-wallet logs, your PRO features
              will automatically unlock instantly. You may leave this page or
              close the tab safely.
            </p>

            <div className="space-y-3">
              <button
                onClick={() => {
                  if (!confirmCancelReview) {
                    setConfirmCancelReview(true);
                    setTimeout(() => setConfirmCancelReview(false), 5000);
                  } else {
                    handleCancelManualReview();
                    setConfirmCancelReview(false);
                  }
                }}
                className={`w-full py-3 px-4 flex items-center justify-center gap-2 text-xs font-bold transition-colors border rounded-xl bg-slate-50 ${
                  confirmCancelReview
                    ? "bg-red-600 text-white hover:bg-red-700 border-transparent animate-pulse"
                    : "text-red-500 hover:text-red-700 hover:bg-red-50 border-transparent hover:border-red-100"
                }`}
              >
                {confirmCancelReview ? "⚠️ Click again to confirm cancel" : "Cancel and edit reference details"}
              </button>
              <button
                onClick={handleLogout}
                className="w-full py-3 px-4 flex items-center justify-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors bg-slate-50 rounded-xl"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Feature renderer helper
  const renderFeatures = (featuresStr: string, activeTextClass: string = "text-slate-600") => {
    if (!featuresStr) return null;
    const lines = featuresStr.split('\n').filter(l => l.trim().length > 0);
    return lines.map((line, idx) => {
      const isDisabled = line.trim().startsWith('-');
      const text = isDisabled ? line.substring(1).trim() : line.trim();
      return (
        <li key={idx} className={`flex items-start gap-1.5 ${isDisabled ? 'opacity-40' : ''}`}>
          {isDisabled ? (
            <X className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          ) : (
            <Check className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
          )}
          <span className={`text-[10px] font-bold leading-tight ${isDisabled ? 'text-slate-500 line-through' : activeTextClass}`}>
            {text}
          </span>
        </li>
      );
    });
  };

  // General Customer View Screen
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      {/* If current user is Admin, provide direct bypass switch */}
      {isAdminUser && (
        <div className="sm:mx-auto sm:w-full sm:max-w-md px-4 mb-4">
          <button
            onClick={() => setIsAdminMode(true)}
            className="w-full py-2 px-4 flex items-center justify-center gap-2 text-xs font-bold text-white bg-indigo-600 hover:bg-[#0057E7] border border-transparent rounded-xl shadow-lg transition-all transform hover:scale-[1.01]"
          >
            <ShieldCheck className="w-4 h-4 animate-bounce" />
            🔧 Open Transactions Monitor Panel
          </button>
        </div>
      )}

      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center mb-8 px-4">
        <div className="w-14 h-14 bg-[#0157E4] rounded-2xl flex items-center justify-center shadow-lg mb-6 relative">
          <ShieldCheck className="w-8 h-8 text-white" />
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-slate-900 rounded-full flex items-center justify-center border-2 border-slate-50">
            <span className="text-white text-[10px] font-bold">PRO</span>
          </div>
        </div>
        <h2 className="text-center text-3xl font-black tracking-tight text-slate-900 uppercase">
          Unlock Features
        </h2>
        <p className="mt-2 text-center text-xs text-slate-500 font-bold max-w-sm uppercase tracking-wider">
          ElectricalPH Premium Suite
        </p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-lg px-4 relative">
        {onClose && (
          <button onClick={onClose} className="absolute -top-12 right-4 p-2 text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full shadow-sm">
            <X className="w-5 h-5" />
          </button>
        )}
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-3xl border border-slate-100 sm:px-10">
          {/* Real-time Promo Offer Banner */}
          {isOfferActive && !isUpgrade && (
            <div className="mb-6 bg-gradient-to-r from-pink-500 via-indigo-600 to-indigo-700 text-white p-4 rounded-2xl shadow-md border border-indigo-500/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 select-none">
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase bg-rose-100 text-rose-700 animate-pulse">
                    PROMO ACTIVE
                  </span>
                  <span className="text-xs font-black uppercase tracking-wide">{pricingSettings.offerTitle || "SPECIAL DISCOUNT"}</span>
                </div>
                <p className="text-[10px] text-white/80 mt-1 leading-snug">Premium promo rates have been applied dynamically below.</p>
              </div>
              {pricingSettings.offerExpiry && (
                <div className="text-[9px] font-black tracking-wider uppercase font-mono bg-white/10 px-2.5 py-1 rounded-lg self-stretch sm:self-auto flex items-center justify-center">
                  Expiry: {new Date(pricingSettings.offerExpiry).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          )}

          <div className="mb-6 border-b border-slate-100 pb-6">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-3 block">1. Select Your Subscription Plan</h3>
            {isUpgrade ? (
               <button
               className={`w-full text-left p-4 rounded-2xl border-2 transition-all relative border-indigo-600 bg-indigo-50/50 scale-[1.02] shadow-md z-10 cursor-default`}
             >
               <div className="absolute top-3 right-3 text-indigo-600">
                 <CheckCircle2 className="w-5 h-5" />
               </div>
               <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Upgrade to Premium Plan</span>
               <div className="mt-1 flex items-end gap-1">
                 <span className="text-2xl font-black tracking-tight text-indigo-700">₱{upgradeFinalPrice.toLocaleString()}</span>
                 {isOfferActive && pricingSettings.promoDiscountPremium > 0 && (
                   null
                 )}
               </div>
               <ul className="mt-3 space-y-1.5">
                 {renderFeatures(pricingSettings.upgradeFeatures, "text-slate-900")}
               </ul>
             </button>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <button
                  onClick={() => setSelectedPlan('basic')}
                  className={`text-left p-4 rounded-2xl border-2 transition-all relative ${
                    selectedPlan === 'basic' 
                    ? 'border-indigo-600 bg-indigo-50/50 scale-[1.02] shadow-md z-10' 
                    : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {selectedPlan === 'basic' && (
                    <div className="absolute top-3 right-3 text-indigo-600">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  )}
                  <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Basic Plan</span>
                  <div className="mt-1 flex items-end gap-1 flex-wrap">
                    <span className={`text-2xl font-black tracking-tight ${selectedPlan === 'basic' ? 'text-indigo-700' : 'text-slate-900'}`}>₱{basicFinalPrice.toLocaleString()}</span>
                    {isOfferActive && pricingSettings.promoDiscountBasic > 0 && (
                      <span className="text-[11px] text-red-500 font-bold line-through ml-1.5 align-middle">₱{pricingSettings.basicPrice.toLocaleString()}</span>
                    )}
                  </div>
                  <ul className="mt-3 space-y-1.5 min-h-[60px]">
                    {renderFeatures(pricingSettings.basicFeatures, "text-slate-600")}
                  </ul>
                </button>
                
                <button
                  onClick={() => setSelectedPlan('premium')}
                  className={`text-left p-4 rounded-2xl border-2 transition-all relative ${
                    selectedPlan === 'premium' 
                    ? 'border-indigo-600 bg-indigo-50/50 scale-[1.02] shadow-md z-10' 
                    : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm">
                    Recommended
                  </div>
                  {selectedPlan === 'premium' && (
                    <div className="absolute top-3 right-3 text-indigo-600">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  )}
                  <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Premium Plan</span>
                  <div className="mt-1 flex items-end gap-1 flex-wrap">
                    <span className={`text-2xl font-black tracking-tight ${selectedPlan === 'premium' ? 'text-indigo-700' : 'text-slate-900'}`}>₱{premiumFinalPrice.toLocaleString()}</span>
                    {isOfferActive && pricingSettings.promoDiscountPremium > 0 && (
                      <span className="text-[11px] text-red-500 font-bold line-through ml-1.5 align-middle">₱{pricingSettings.premiumPrice.toLocaleString()}</span>
                    )}
                  </div>
                  <ul className="mt-3 space-y-1.5 min-h-[60px]">
                    {renderFeatures(pricingSettings.premiumFeatures, "text-slate-900")}
                  </ul>
                </button>

                <button
                  onClick={() => setSelectedPlan('enterprise')}
                  className={`text-left p-4 rounded-2xl border-2 transition-all relative ${
                    selectedPlan === 'enterprise' 
                    ? 'border-indigo-600 bg-indigo-50/50 scale-[1.02] shadow-md z-10' 
                    : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="absolute -top-2.5 right-4 bg-slate-800 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm">
                    Business
                  </div>
                  {selectedPlan === 'enterprise' && (
                    <div className="absolute top-3 right-3 text-indigo-600">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  )}
                  <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Enterprise Plan</span>
                  <div className="mt-1 flex items-end gap-1 flex-wrap">
                    <span className={`text-2xl font-black tracking-tight ${selectedPlan === 'enterprise' ? 'text-indigo-700' : 'text-slate-900'}`}>₱{enterpriseFinalPrice.toLocaleString()}</span>
                    {isOfferActive && pricingSettings.promoDiscountEnterprise > 0 && (
                      <span className="text-[11px] text-red-500 font-bold line-through ml-1.5 align-middle">₱{pricingSettings.enterprisePrice.toLocaleString()}</span>
                    )}
                  </div>
                  <ul className="mt-3 space-y-1.5 min-h-[60px]">
                    {renderFeatures(pricingSettings.enterpriseFeatures, "text-slate-900")}
                  </ul>
                </button>
              </div>
            )}
          </div>

          <div className="mb-6">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-3 block">2. Select Payment Method</h3>
            {/* Selector Tabs */}
            <div className={`grid gap-2 bg-slate-100 p-1.5 rounded-2xl mb-6 ${
              [pricingSettings.enableMaribank, pricingSettings.enableGCash, pricingSettings.enablePayMongo, pricingSettings.enableMaya].filter(Boolean).length === 4
                ? 'grid-cols-2 md:grid-cols-4'
                : [pricingSettings.enableMaribank, pricingSettings.enableGCash, pricingSettings.enablePayMongo, pricingSettings.enableMaya].filter(Boolean).length === 3 
                  ? 'grid-cols-3' 
                  : [pricingSettings.enableMaribank, pricingSettings.enableGCash, pricingSettings.enablePayMongo, pricingSettings.enableMaya].filter(Boolean).length === 2 
                    ? 'grid-cols-2' 
                    : 'grid-cols-1'
            }`}>
              {pricingSettings.enableMaya && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod("maya")}
                  className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                    paymentMethod === "maya"
                      ? "bg-white text-emerald-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5 shrink-0" />
                  Maya QR
                </button>
              )}
              {pricingSettings.enableMaribank && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod("maribank")}
                  className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                    paymentMethod === "maribank"
                      ? "bg-white text-orange-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5 shrink-0" />
                  MariBank QR
                </button>
              )}
              {pricingSettings.enableGCash && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod("manual")}
                  className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                    paymentMethod === "manual"
                      ? "bg-white text-[#0157E4] shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5 shrink-0" />
                  GCash QR
                </button>
              )}
              {pricingSettings.enablePayMongo && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod("paymongo")}
                  className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                    paymentMethod === "paymongo"
                      ? "bg-white text-emerald-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5 shrink-0" />
                  Cards / E-Wallets
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-md flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 font-bold leading-relaxed">
                {error}
              </p>
            </div>
          )}

          {manualMessage && (
            <div className="mb-6 bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-md flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-700 font-bold leading-relaxed">
                {manualMessage}
              </p>
            </div>
          )}

          {/* Conditional View Method */}
          {paymentMethod === "maya" ? (
            <div className="space-y-6">
              {/* Maya QR Card Visualization */}
              <div className="flex justify-center flex-col items-center">
                <div className="w-full max-w-sm bg-emerald-600 rounded-3xl p-6 shadow-2xl border border-emerald-500 flex flex-col items-center select-none font-sans relative overflow-hidden text-white">
                  {/* Maya Wave Background Decors */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full scale-150 -translate-y-12 translate-x-12"></div>
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full scale-150 translate-y-12 -translate-x-12"></div>

                  {/* Header */}
                  <div className="flex items-center gap-2 mb-5 justify-center">
                    <span className="text-3xl font-black tracking-tight">
                      Maya
                    </span>
                    <span className="text-[10px] bg-white text-emerald-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      InstaPay
                    </span>
                  </div>

                  {/* QR Card Container */}
                  <div className="bg-white rounded-2xl p-5 w-full shadow-inner border border-slate-100 flex flex-col items-center">
                    {/* QR code itself */}
                    <div className="bg-white rounded-2xl p-4 w-44 h-44 flex items-center justify-center relative shadow-sm overflow-hidden border border-slate-100">
                      {mayaQrUrl ? (
                        <img
                          src={mayaQrUrl}
                          alt="Maya Scan QR"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain rounded-lg select-none"
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-100 flex items-center justify-center rounded-lg border border-dashed border-slate-300">
                          <span className="text-[10px] text-slate-400 font-bold uppercase text-center px-2">
                            Image not uploaded
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Transfer fees text */}
                    <span className="text-[10px] font-bold text-slate-400 mt-4 uppercase tracking-wide">
                      Free InstaPay Transfers
                    </span>

                    {/* Payee Name */}
                    <span className="text-lg font-black text-emerald-600 tracking-tight mt-1 uppercase text-center leading-tight">
                      ANGELO PERFECTO
                    </span>

                    {/* Bank Account */}
                    <div className="flex flex-col items-center gap-1 mt-1.5">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                        Maya
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-center leading-relaxed">
                  <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                    Please transfer exactly{" "}
                    <strong className="text-slate-800">₱{(isUpgrade ? upgradeFinalPrice : (selectedPlan === 'enterprise' ? enterpriseFinalPrice : selectedPlan === 'premium' ? premiumFinalPrice : basicFinalPrice)).toLocaleString()}.00</strong> via
                    Maya QR.
                  </span>
                </div>
              </div>

              {/* Reference Number Submission Form */}
              <form
                onSubmit={handleManualSubmit}
                className="space-y-4 pt-2 border-t border-slate-100"
              >
                <span className="text-[10px] uppercase tracking-widest font-black text-emerald-600 block text-center">
                  Submit Proof of Bank Transfer
                </span>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                    Your Bank Account Name
                  </label>
                  <input
                    type="text"
                    required
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="e.g. JUAN DELA CRUZ"
                    className="appearance-none block w-full px-3 py-2 border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-bold uppercase tracking-wider transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 animate-pulse">
                    InstaPay / Bank Reference No.
                  </label>
                  <input
                    type="text"
                    required
                    value={manualRefNo}
                    onChange={(e) => setManualRefNo(e.target.value)}
                    placeholder="e.g. 20240529..."
                    className="appearance-none block w-full px-3 py-2 border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-black tracking-widest font-mono transition-all"
                  />
                  <span className="text-[9px] text-slate-400 mt-1 block">
                    Double-check reference ID from your transfer receipt.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={submittingManual}
                  className="w-full flex justify-center py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-colors disabled:opacity-50"
                >
                  {submittingManual
                    ? "Submitting Ledger Details..."
                    : "Activate via Reference ID"}
                </button>
              </form>
            </div>
          ) : paymentMethod === "maribank" ? (
            <div className="space-y-6">
              {/* MariBank QR Card Visualization */}
              <div className="flex justify-center flex-col items-center">
                <div className="w-full max-w-sm bg-orange-600 rounded-3xl p-6 shadow-2xl border border-orange-500 flex flex-col items-center select-none font-sans relative overflow-hidden text-white">
                  {/* MariBank Wave Background Decors */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full scale-150 -translate-y-12 translate-x-12"></div>
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full scale-150 translate-y-12 -translate-x-12"></div>

                  {/* Header */}
                  <div className="flex items-center gap-2 mb-5 justify-center">
                    <span className="text-3xl font-black tracking-tight">
                      MariBank
                    </span>
                    <span className="text-[10px] bg-white text-orange-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      InstaPay
                    </span>
                  </div>

                  {/* QR Card Container */}
                  <div className="bg-white rounded-2xl p-5 w-full shadow-inner border border-slate-100 flex flex-col items-center">
                    {/* QR code itself - styled elegantly with SVG */}
                    <div className="bg-white rounded-2xl p-4 w-44 h-44 flex items-center justify-center relative shadow-sm overflow-hidden border border-slate-100">
                      {maribankQrUrl ? (
                        <img
                          src={maribankQrUrl}
                          alt="MariBank Scan QR"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain rounded-lg select-none"
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-100 flex items-center justify-center rounded-lg border border-dashed border-slate-300">
                          <span className="text-[10px] text-slate-400 font-bold uppercase text-center px-2">
                            Image not uploaded
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Transfer fees text */}
                    <span className="text-[10px] font-bold text-slate-400 mt-4 uppercase tracking-wide">
                      Free InstaPay Transfers
                    </span>

                    {/* Payee Name */}
                    <span className="text-lg font-black text-orange-600 tracking-tight mt-1 uppercase text-center leading-tight">
                      ANGELO PERFECTO
                    </span>

                    {/* Bank Account */}
                    <div className="flex flex-col items-center gap-1 mt-1.5">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                        MariBank (****3228)
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-center leading-relaxed">
                  <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                    Please transfer exactly{" "}
                    <strong className="text-slate-800">₱{(isUpgrade ? upgradeFinalPrice : (selectedPlan === 'enterprise' ? enterpriseFinalPrice : selectedPlan === 'premium' ? premiumFinalPrice : basicFinalPrice)).toLocaleString()}.00</strong> via
                    MariBank QR.
                  </span>
                </div>
              </div>

              {/* Reference Number Submission Form */}
              <form
                onSubmit={handleManualSubmit}
                className="space-y-4 pt-2 border-t border-slate-100"
              >
                <span className="text-[10px] uppercase tracking-widest font-black text-orange-600 block text-center">
                  Submit Proof of Bank Transfer
                </span>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                    Your Bank Account Name
                  </label>
                  <input
                    type="text"
                    required
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="e.g. JUAN DELA CRUZ"
                    className="appearance-none block w-full px-3 py-2 border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 text-xs font-bold uppercase tracking-wider transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 animate-pulse">
                    InstaPay / Bank Reference No.
                  </label>
                  <input
                    type="text"
                    required
                    value={manualRefNo}
                    onChange={(e) => setManualRefNo(e.target.value)}
                    placeholder="e.g. 20240529..."
                    className="appearance-none block w-full px-3 py-2 border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 text-xs font-black tracking-widest font-mono transition-all"
                  />
                  <span className="text-[9px] text-slate-400 mt-1 block">
                    Double-check reference ID from your transfer receipt.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={submittingManual}
                  className="w-full flex justify-center py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-colors disabled:opacity-50"
                >
                  {submittingManual
                    ? "Submitting Ledger Details..."
                    : "Activate via Reference ID"}
                </button>
              </form>
            </div>
          ) : paymentMethod === "manual" ? (
            <div className="space-y-6">
              {/* GCash QR Card Visualization */}
              <div className="flex justify-center flex-col items-center">
                <div className="w-full max-w-sm bg-[#0057E7] rounded-3xl p-6 shadow-2xl border border-[#0047C7] flex flex-col items-center select-none font-sans relative overflow-hidden text-white">
                  {/* GCash Wave Background Decors */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full scale-150 -translate-y-12 translate-x-12"></div>
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full scale-150 translate-y-12 -translate-x-12"></div>

                  {/* Header */}
                  <div className="flex items-center gap-1.5 mb-5 justify-center">
                    <span className="text-3xl font-black italic tracking-wider">
                      GCash
                    </span>
                    <span className="w-2.5 h-2.5 rounded-full bg-white relative animate-ping"></span>
                  </div>

                  {/* QR Card Container */}
                  <div className="bg-white rounded-2xl p-5 w-full shadow-inner border border-slate-100 flex flex-col items-center">
                    {/* QR code itself - styled elegantly with SVG */}
                    <div className="bg-white rounded-2xl p-4 w-44 h-44 flex items-center justify-center relative shadow-sm overflow-hidden border border-slate-100">
                      {gcashQrUrl ? (
                        <img
                          src={gcashQrUrl}
                          alt="GCash Scan QR"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain rounded-lg select-none"
                        />
                      ) : (
                        <img
                          src={GCASH_DEFAULT_QR_BASE64}
                          alt="Default GCash Scan QR"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain rounded-lg select-none"
                        />
                      )}
                    </div>

                    {/* Transfer fees text */}
                    <span className="text-[10px] font-bold text-slate-400 mt-4 uppercase tracking-wide">
                      Transfer fees may apply.
                    </span>

                    {/* Payee Name */}
                    <span className="text-lg font-black text-[#0157E4] tracking-tight mt-1 uppercase">
                      AN***O P.
                    </span>

                    {/* Mobile Number with Copy option */}
                    <div className="flex flex-col items-center gap-1 mt-1.5">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                        Tap/Click Number to Copy
                      </span>
                      <button
                        type="button"
                        onClick={copyToClipboard}
                        className="group flex items-center gap-2 focus:outline-none transition-all active:scale-95 bg-slate-50 hover:bg-slate-100 rounded-xl px-3.5 py-1.5 border border-slate-200/60 shadow-sm"
                        title="Copy GCash Number"
                      >
                        <span className="text-xs font-black text-slate-700 tracking-wider font-mono">
                          +63 993 917 0684
                        </span>
                        {copied ? (
                          <Check className="w-3.5 h-3.5 text-green-600 animate-bounce" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#0157E4] transition-colors" />
                        )}
                      </button>
                    </div>

                    {/* User ID */}
                    <span className="text-[9px] font-bold text-slate-400 mt-0.5 font-mono tracking-wider uppercase">
                      User ID: ............4IM8EP
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-center leading-relaxed">
                  <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                    Please transfer exactly{" "}
                    <strong className="text-slate-800">₱{(isUpgrade ? upgradeFinalPrice : (selectedPlan === 'enterprise' ? enterpriseFinalPrice : selectedPlan === 'premium' ? premiumFinalPrice : basicFinalPrice)).toLocaleString()}.00</strong> to the
                    GCash details above.
                  </span>
                </div>
              </div>

              {/* Reference Number Submission Form */}
              <form
                onSubmit={handleManualSubmit}
                className="space-y-4 pt-2 border-t border-slate-100"
              >
                <span className="text-[10px] uppercase tracking-widest font-black text-[#0157E4] block text-center">
                  Submit Proof of E-wallet Transfer
                </span>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                    Your GCash Account Name
                  </label>
                  <input
                    type="text"
                    required
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="e.g. ANGELO PERFECTO"
                    className="appearance-none block w-full px-3 py-2 border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0157E4] text-xs font-bold uppercase tracking-wider transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 animate-pulse">
                    13-digit Transaction Reference No.
                  </label>
                  <input
                    type="text"
                    required
                    value={manualRefNo}
                    onChange={(e) => setManualRefNo(e.target.value)}
                    placeholder="e.g. 5013 4602 1234 5"
                    className="appearance-none block w-full px-3 py-2 border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0157E4] text-xs font-black tracking-widest font-mono transition-all"
                  />
                  <span className="text-[9px] text-slate-400 mt-1 block">
                    Double-check reference ID from your GCash receipt before
                    clicking submit.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={submittingManual}
                  className="w-full flex justify-center py-3 bg-[#0157E4] hover:bg-[#0047C7] text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-colors disabled:opacity-50"
                >
                  {submittingManual
                    ? "Submitting Ledger Details..."
                    : "Activate via Reference ID"}
                </button>
              </form>
            </div>
          ) : paymentMethod === "paymongo" ? (
            <div className="space-y-6 animate-fade-in origin-top">
              <div className="flex flex-col items-center justify-center p-8 bg-emerald-50/50 rounded-3xl border border-emerald-100 shadow-inner">
                <CreditCard className="w-16 h-16 text-emerald-500 mb-5" />
                <h4 className="text-xl font-black text-slate-800 mb-2 tracking-tight uppercase">Automated Checkout</h4>
                <p className="text-xs text-slate-500 text-center mb-6 leading-relaxed max-w-sm">
                  Click the button below to proceed. You will be redirected to our secure payment gateway where you can safely use your Credit Card, Debit Card, GCash, or Maya.
                </p>
                <button
                  onClick={handlePay}
                  disabled={loading}
                  className="w-full max-w-xs flex items-center justify-center gap-2 py-4 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      Processing Checkout...
                    </>
                  ) : (
                    <>
                      Proceed to PayMongo
                      <ArrowRight className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : null}

          {/* Master Logout Options */}
          <div className="mt-6 border-t border-slate-100 pt-6">
            <button
              onClick={() => {
                if (!confirmDeleteReg) {
                  setConfirmDeleteReg(true);
                  setTimeout(() => setConfirmDeleteReg(false), 5000);
                } else {
                  handleCancelRegistration();
                  setConfirmDeleteReg(false);
                }
              }}
              className={`w-full py-3 px-4 flex items-center justify-center gap-2 text-xs font-bold transition-all border rounded-xl ${
                confirmDeleteReg
                  ? "bg-red-600 border-red-700 text-white animate-pulse hover:bg-red-700 font-extrabold"
                  : "text-red-500 hover:text-red-700 hover:bg-red-50 bg-slate-50 border-transparent hover:border-red-100"
              }`}
            >
              <LogOut className="w-4 h-4" />
              {confirmDeleteReg 
                ? "⚠️ Click again to Permanently Cancel & Delete Registration" 
                : "Cancel Transaction (Delete Registration)"
              }
            </button>
            <button
              onClick={handleLogout}
              className="w-full mt-2 py-3 px-4 flex items-center justify-center gap-2 text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors bg-transparent hover:bg-slate-50 rounded-xl"
            >
              Log out and verify later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
