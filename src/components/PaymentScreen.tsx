import React, { useState, useEffect } from "react";
import { User, signOut } from "firebase/auth";
import { auth, db } from "../firebase";
import {
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  collection,
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
} from "lucide-react";
import axios from "axios";

interface PaymentScreenProps {
  user: User;
  onPaymentSuccess?: () => void;
  forceAdmin?: boolean;
  isUpgrade?: boolean;
  onClose?: () => void;
}

export default function PaymentScreen({
  user,
  onPaymentSuccess,
  forceAdmin = false,
  isUpgrade = false,
  onClose,
}: PaymentScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [success, setSuccess] = useState(false);

  // Tabs for the customer view: "maribank", or "manual"
  const [paymentMethod, setPaymentMethod] = useState<"maribank" | "manual">(
    "maribank",
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
  const [uploadingQr, setUploadingQr] = useState(false);
  const [uploadingMaribankQr, setUploadingMaribankQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"basic" | "premium">("premium");

  const copyToClipboard = () => {
    navigator.clipboard.writeText("09939170684");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Admin View state
  const [isAdminMode, setIsAdminMode] = useState(forceAdmin);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [adminFilter, setAdminFilter] = useState<
    "all" | "pending" | "paid" | "unpaid"
  >("all");
  const [adminStatusMsg, setAdminStatusMsg] = useState("");
  const [confirmingAction, setConfirmingAction] = useState<{
    uid: string;
    type: "approve" | "reject" | "toggle" | "delete";
    email: string;
    currentActiveStatus?: boolean;
  } | null>(null);

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
          if (isUpgrade) {
            if (data.plan === "premium") {
              setSuccess(true);
              if (onPaymentSuccess) {
                setTimeout(() => onPaymentSuccess(), 2500);
              }
            }
          } else {
            if (data.isActive === true) {
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

    return () => {
      unsubscribeGcash();
      unsubscribeMaribank();
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
            updatedBy: user.email,
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
            updatedBy: user.email,
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
    const confirmCancel = msg
      ? true
      : window.confirm(
          "Are you sure you want to cancel your transaction? This will permanently delete your registration data.",
        );

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

    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const usersList: any[] = [];
        snapshot.forEach((snapDoc) => {
          usersList.push({ uid: snapDoc.id, ...snapDoc.data() });
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

    return () => unsubscribe();
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
        alert("Payment Successful! Please log in to your account to continue.");
        signOut(auth).catch(console.error);
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
      const amount = isUpgrade ? 500 : (selectedPlan === "premium" ? 1499 : 999);
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
      setError(
        "Please check your reference number. GCash handles 13-digit Reference Numbers.",
      );
      const confirmation = window.confirm(
        "Standard GCash Reference Numbers are usually 13 digits. Are you sure you entered the correct reference number?",
      );
      if (!confirmation) {
        return;
      }
    } else if (paymentMethod === "maribank" && cleanedRef.length < 6) {
      setError(
        "Please verify your MariBank reference number. It looks too short.",
      );
      const confirmation = window.confirm(
        "Are you sure you entered the correct MariBank reference number?",
      );
      if (!confirmation) {
        return;
      }
    }

    setSubmittingManual(true);
    setError("");
    setManualMessage("");

    try {
      const updateData: any = {
        email: user.email,
        paymentStatus: "pending_verification",
        pendingVerification: {
          method: paymentMethod === "maribank" ? "MariBank" : "GCash",
          senderName: manualName.trim(),
          referenceNo: cleanedRef,
          amount: isUpgrade ? 500 : (selectedPlan === "premium" ? 1499 : 999),
          plan: isUpgrade ? "premium" : selectedPlan,
          submittedAt: new Date().toISOString(),
          isUpgrade: isUpgrade, // Keep a record if this was an upgrade explicitly
        },
      };

      if (!isUpgrade) {
        updateData.isActive = false;
      }

      // Create or update user record with pending Verification details
      await setDoc(doc(db, "users", user.uid), updateData, { merge: true });

      setManualMessage(
        `Your ${paymentMethod === "maribank" ? "MariBank" : "GCash"} Payment details have been submitted successfully.`,
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
    const confirmCancel = window.confirm(
      "Are you sure you want to cancel the review process? You can then choose to try again or make an automated payment.",
    );
    if (!confirmCancel) return;

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

  // Admin action: Approve manual payment
  const handleAdminApprove = async (targetUid: string, userEmail: string) => {
    setAdminStatusMsg("");
    try {
      const userToApprove = allUsers.find(u => u.uid === targetUid);
      const planToSet = userToApprove?.pendingVerification?.plan || "premium"; // default to premium if missing

      await setDoc(
        doc(db, "users", targetUid),
        {
          isActive: true,
          paymentStatus: "paid",
          plan: planToSet,
          pendingVerification: null,
          approvedBy: user.email,
          approvedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      setAdminStatusMsg(`Successfully activated account for ${userEmail} on ${planToSet} plan`);
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
      await setDoc(
        doc(db, "users", targetUid),
        {
          isActive: !currentActiveStatus,
          paymentStatus: !currentActiveStatus ? "paid" : "unpaid",
        },
        { merge: true },
      );
      setAdminStatusMsg(`Updated status for ${userEmail}`);
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
      setAdminStatusMsg(`Deleted user record for ${userEmail}`);
    } catch (err: any) {
      setAdminStatusMsg("Error deleting user: " + err.message);
      try {
        handleFirestoreError(err, OperationType.DELETE, "users/" + targetUid);
      } catch (e) {}
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

  // Filter users for the Admin panel view
  const filteredUsers = allUsers.filter((u) => {
    const matchesSearch =
      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.uid?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (adminFilter === "all") return true;
    if (adminFilter === "pending")
      return u.paymentStatus === "pending_verification";
    if (adminFilter === "paid") return u.isActive === true;
    if (adminFilter === "unpaid")
      return u.isActive !== true && u.paymentStatus !== "pending_verification";
    return true;
  });

  // Admin Dashboard Mode
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

          {adminStatusMsg && (
            <div className="mb-6 bg-blue-50 border-l-4 border-blue-500 p-4 rounded-md">
              <p className="text-sm text-blue-700 font-bold">
                {adminStatusMsg}
              </p>
            </div>
          )}

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
                        const confirmReset = window.confirm(
                          "Are you sure you want to reset and use the default built-in QR image?",
                        );
                        if (!confirmReset) return;
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
                      className="absolute -top-2 -right-3 bg-red-100 border border-red-200 text-red-600 hover:bg-red-200 font-bold text-[10px] p-1.5 rounded-full transition-colors shadow-sm"
                      title="Reset to default"
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
                        const confirmReset = window.confirm(
                          "Are you sure you want to remove the MariBank QR image?",
                        );
                        if (!confirmReset) return;
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
                      className="absolute -top-2 -right-3 bg-red-100 border border-red-200 text-red-600 hover:bg-red-200 font-bold text-[10px] p-1.5 rounded-full transition-colors shadow-sm"
                      title="Reset to default"
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

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Total Users
              </span>
              <span className="text-2xl font-black text-slate-900 font-mono">
                {allUsers.length}
              </span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block mb-1">
                Pending Approval
              </span>
              <span className="text-2xl font-black text-indigo-600 font-mono">
                {
                  allUsers.filter(
                    (u) => u.paymentStatus === "pending_verification",
                  ).length
                }
              </span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-sm">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block mb-1">
                Activated Paid
              </span>
              <span className="text-2xl font-black text-emerald-600 font-mono">
                {allUsers.filter((u) => u.isActive === true).length}
              </span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-50 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Unpaid List
              </span>
              <span className="text-2xl font-black text-slate-500 font-mono">
                {
                  allUsers.filter(
                    (u) =>
                      u.isActive !== true &&
                      u.paymentStatus !== "pending_verification",
                  ).length
                }
              </span>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm mb-6 flex flex-col md:flex-row gap-4 justify-between items-center">
            {/* Search */}
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by Email or User ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs font-medium border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-mono"
              />
            </div>

            {/* Filter */}
            <div className="flex overflow-x-auto gap-1 bg-slate-50 p-1 rounded-xl shrink-0">
              {(["all", "pending", "paid", "unpaid"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setAdminFilter(mode)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all select-none ${
                    adminFilter === mode
                      ? "bg-white shadow-sm text-indigo-600"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {mode === "all"
                    ? "All Users"
                    : mode === "pending"
                      ? "Pending Approval"
                      : mode === "paid"
                        ? "Active"
                        : "Unpaid"}
                </button>
              ))}
            </div>
          </div>

          {/* Users List */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-md divide-y divide-slate-100 overflow-hidden">
            {filteredUsers.length === 0 ? (
              <div className="p-12 text-center bg-white flex flex-col items-center">
                <Users className="w-12 h-12 text-slate-300 mb-3" />
                <h3 className="text-sm font-bold text-slate-700">
                  No matching user accounts
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Change your search terms or filter to see users.
                </p>
              </div>
            ) : (
              filteredUsers.map((u) => {
                const isPending = u.paymentStatus === "pending_verification";
                const isUserActive = u.isActive === true;

                return (
                  <div
                    key={u.uid}
                    className={`p-6 transition-colors ${isPending ? "bg-amber-50/50" : "hover:bg-slate-50"}`}
                  >
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      {/* Left: Metadata */}
                      <div className="w-full md:w-3/5">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="font-bold text-slate-800 text-sm font-mono truncate max-w-[240px] md:max-w-none">
                            {u.email || "No Email"}
                          </span>
                          <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded font-mono text-slate-400 shrink-0">
                            ID: {u.uid.slice(0, 8)}...
                          </span>
                          
                          {u.plan && (
                            <span className="text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded font-bold uppercase tracking-wider shrink-0">
                              {u.plan === 'premium' ? "Premium ₱1499" : "Basic ₱999"}
                            </span>
                          )}

                          {/* Badges */}
                          {isUserActive ? (
                            <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 rounded">
                              Active Pro
                            </span>
                          ) : isPending ? (
                            <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 rounded animate-pulse">
                              Pending Review
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 rounded">
                              Inactive
                            </span>
                          )}
                        </div>

                        {/* If pending manual verification, render detail box */}
                        {isPending && u.pendingVerification && (
                          <div className="mt-3 p-4 bg-white border border-amber-200 rounded-xl leading-relaxed shadow-sm">
                            <span className="text-[10px] uppercase font-black tracking-widest text-amber-500 mb-2 flex items-center gap-2">
                              Manual Submission Data
                              {u.pendingVerification.plan && (
                                <span className={`px-1.5 py-0.5 rounded font-black tracking-wider text-[9px] ${u.pendingVerification.plan === 'premium' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                                  {u.pendingVerification.plan === 'premium' ? "PREMIUM" : "BASIC"}
                                </span>
                              )}
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">
                                  Method
                                </span>
                                <span className="text-xs font-black text-slate-700 uppercase">
                                  {u.pendingVerification.method || "GCash"}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">
                                  Sender Name
                                </span>
                                <span className="text-xs font-black text-slate-700 uppercase">
                                  {u.pendingVerification.senderName}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">
                                  Reference ID
                                </span>
                                <span className="text-xs font-black text-indigo-600 font-mono tracking-wider">
                                  {u.pendingVerification.referenceNo}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">
                                  Amount
                                </span>
                                <span className="text-xs font-black text-emerald-600 font-mono tracking-wider">
                                  ₱{u.pendingVerification.amount || (u.pendingVerification.plan === 'premium' ? 1499 : 999)}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">
                                  Submitted On
                                </span>
                                <span className="text-[11px] font-bold text-slate-500">
                                  {new Date(
                                    u.pendingVerification.submittedAt,
                                  ).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* If previously approved history */}
                        {!isPending && isUserActive && u.approvedAt && (
                          <p className="text-[10px] text-slate-400 mt-1.5 font-bold uppercase font-sans">
                            ✅ Approved by {u.approvedBy || "Admin"} on{" "}
                            {new Date(u.approvedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>

                      {/* Right: Actions */}
                      <div className="flex gap-2 shrink-0 w-full md:w-auto justify-end">
                        {confirmingAction?.uid === u.uid ? (
                          <div className="flex flex-col items-end gap-2 bg-amber-50 p-3 rounded-xl border border-amber-200 shadow-sm max-w-[280px]">
                            <span className="text-[10px] font-black text-amber-900 leading-normal text-right">
                              Confirm{" "}
                              {confirmingAction.type === "approve"
                                ? "APPROVAL & ACTIVATION"
                                : confirmingAction.type === "reject"
                                  ? "REJECTION"
                                  : confirmingAction.type === "delete"
                                    ? "DELETION"
                                    : confirmingAction.currentActiveStatus
                                      ? "DEACTIVATION"
                                      : "ACTIVATION"}
                              ?
                            </span>
                            <div className="flex gap-1.5">
                              <button
                                onClick={executeConfirmedAction}
                                className={`px-2.5 py-1 text-white font-black rounded-md text-[10px] uppercase shadow-sm transition-transform active:scale-95 cursor-pointer ${
                                  confirmingAction.type === "approve" ||
                                  (confirmingAction.type === "toggle" &&
                                    !confirmingAction.currentActiveStatus)
                                    ? "bg-emerald-600 hover:bg-emerald-700"
                                    : "bg-red-600 hover:bg-red-700"
                                }`}
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setConfirmingAction(null)}
                                className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-black rounded-md text-[10px] uppercase cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : isPending ? (
                          <>
                            <button
                              onClick={() =>
                                setConfirmingAction({
                                  uid: u.uid,
                                  type: "approve",
                                  email: u.email,
                                })
                              }
                              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Approve
                            </button>
                            <button
                              onClick={() =>
                                setConfirmingAction({
                                  uid: u.uid,
                                  type: "reject",
                                  email: u.email,
                                })
                              }
                              className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-lg text-xs transition-all border border-red-100 flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              Reject
                            </button>
                          </>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                setConfirmingAction({
                                  uid: u.uid,
                                  type: "toggle",
                                  email: u.email,
                                  currentActiveStatus: isUserActive,
                                })
                              }
                              className={`px-3.5 py-2 font-bold rounded-lg text-xs transition-all border shadow-sm active:scale-95 cursor-pointer ${
                                isUserActive
                                  ? "bg-red-50 hover:bg-red-100 text-red-600 border-red-100"
                                  : "bg-indigo-600 hover:bg-indigo-700 text-white border-transparent"
                              }`}
                            >
                              {isUserActive
                                ? "Revoke Pro Access"
                                : "Direct Activate (Trial)"}
                            </button>
                            {!isUserActive && (
                              <button
                                onClick={() =>
                                  setConfirmingAction({
                                    uid: u.uid,
                                    type: "delete",
                                    email: u.email,
                                  })
                                }
                                className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs transition-all border border-transparent shadow-sm active:scale-95 cursor-pointer"
                              >
                                Delete User
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
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
          {isUpgrade && onClose && (
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
                onClick={handleCancelManualReview}
                className="w-full py-3 px-4 flex items-center justify-center gap-2 text-xs font-bold text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors border border-transparent hover:border-red-100 rounded-xl bg-slate-50"
              >
                Cancel and edit reference details
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
        {isUpgrade && onClose && (
          <button onClick={onClose} className="absolute -top-12 right-4 p-2 text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full shadow-sm">
            <X className="w-5 h-5" />
          </button>
        )}
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-3xl border border-slate-100 sm:px-10">
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
                 <span className="text-2xl font-black tracking-tight text-indigo-700">₱500</span>
               </div>
               <ul className="mt-3 space-y-1.5">
                 <li className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" /><span className="text-[10px] font-bold text-slate-900 leading-tight">Full Word File Report Generation</span></li>
                 <li className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" /><span className="text-[10px] font-bold text-slate-900 leading-tight">Premium Support Access</span></li>
               </ul>
             </button>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
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
                  <div className="mt-1 flex items-end gap-1">
                    <span className={`text-2xl font-black tracking-tight ${selectedPlan === 'basic' ? 'text-indigo-700' : 'text-slate-900'}`}>₱999</span>
                  </div>
                  <ul className="mt-3 space-y-1.5 min-h-[60px]">
                    <li className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" /><span className="text-[10px] font-bold text-slate-600 leading-tight">Access to all design tools</span></li>
                    <li className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" /><span className="text-[10px] font-bold text-slate-600 leading-tight">Export load schedules to Excel</span></li>
                    <li className="flex items-start gap-1.5 opacity-40"><X className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" /><span className="text-[10px] font-bold text-slate-500 line-through leading-tight">Word File Export feature</span></li>
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
                  <div className="mt-1 flex items-end gap-1">
                    <span className={`text-2xl font-black tracking-tight ${selectedPlan === 'premium' ? 'text-indigo-700' : 'text-slate-900'}`}>₱1,499</span>
                  </div>
                  <ul className="mt-3 space-y-1.5 min-h-[60px]">
                    <li className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" /><span className="text-[10px] font-bold text-slate-600 leading-tight">Everything in Basic Plan</span></li>
                    <li className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" /><span className="text-[10px] font-bold text-slate-900 leading-tight">Full Word File Report Generation</span></li>
                    <li className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" /><span className="text-[10px] font-bold text-slate-900 leading-tight">Premium Support Access</span></li>
                  </ul>
                </button>
              </div>
            )}
          </div>

          <div className="mb-6">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-3 block">2. Select Payment Method</h3>
            {/* Selector Tabs */}
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-2xl mb-6">
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
          {paymentMethod === "maribank" ? (
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
                    <strong className="text-slate-800">₱{isUpgrade ? '500' : (selectedPlan === 'premium' ? '1,499' : '999')}.00</strong> via
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
          ) : (
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
                    <strong className="text-slate-800">₱{isUpgrade ? '500' : (selectedPlan === 'premium' ? '1,499' : '999')}.00</strong> to the
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
          )}

          {/* Master Logout Options */}
          <div className="mt-6 border-t border-slate-100 pt-6">
            <button
              onClick={() => handleCancelRegistration()}
              className="w-full py-3 px-4 flex items-center justify-center gap-2 text-xs font-bold text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors bg-slate-50 border border-transparent hover:border-red-100 rounded-xl"
            >
              <LogOut className="w-4 h-4" />
              Cancel Transaction (Delete Registration)
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
