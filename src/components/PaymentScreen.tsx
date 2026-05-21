import React, { useState, useEffect } from "react";
import { User, signOut } from "firebase/auth";
import { auth, db } from "../firebase";
import {
  doc,
  setDoc,
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
} from "lucide-react";
import axios from "axios";

interface PaymentScreenProps {
  user: User;
  onPaymentSuccess?: () => void;
}

export default function PaymentScreen({
  user,
  onPaymentSuccess,
}: PaymentScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [success, setSuccess] = useState(false);

  // Tabs for the customer view: "paymongo" or "gcash-manual"
  const [paymentMethod, setPaymentMethod] = useState<"paymongo" | "manual">(
    "paymongo",
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
  const [uploadingQr, setUploadingQr] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText("09939170684");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Admin View state
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [adminFilter, setAdminFilter] = useState<"all" | "pending" | "paid" | "unpaid">("all");
  const [adminStatusMsg, setAdminStatusMsg] = useState("");

  const isAdminUser = user.email?.toLowerCase() === "angeloperfecto31@gmail.com";

  useEffect(() => {
    // Listen to real-time changes in the user's Firestore document
    const unsubscribe = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserProfile(data);
        if (data.isActive === true) {
          setSuccess(true);
          if (onPaymentSuccess) {
            onPaymentSuccess();
          }
        }
      } else {
        setUserProfile(null);
      }
    }, (error) => {
      console.error("user profile onSnapshot error:", error);
      try {
        handleFirestoreError(error, OperationType.GET, "users/" + user.uid);
      } catch (e) {}
    });

    return () => unsubscribe();
  }, [user.uid]);

  useEffect(() => {
    // Listen to real-time changes in global GCash payment settings
    const unsubscribe = onSnapshot(doc(db, "settings", "gcash"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.qrCodeDataUrl) {
          setGcashQrUrl(data.qrCodeDataUrl);
        } else {
          setGcashQrUrl("");
        }
      }
    }, (error) => {
      console.error("settings gcash onSnapshot error:", error);
      try {
        handleFirestoreError(error, OperationType.GET, "settings/gcash");
      } catch (e) {}
    });

    return () => unsubscribe();
  }, []);

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 800 * 1024) {
      setAdminStatusMsg("Error: Selected image file is too large. Please select a cropped QR image of less than 800KB.");
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
          { merge: true }
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

  useEffect(() => {
    // Check if we just returned from PayMongo Checkout
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get("session_id");

    if (sessionId) {
      setVerifying(true);
      verifySession(sessionId);
    }
  }, []);

  // Listen to all users if the logged in user is the admin
  useEffect(() => {
    if (!isAdminUser) return;

    const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
      const usersList: any[] = [];
      snapshot.forEach((snapDoc) => {
        usersList.push({ uid: snapDoc.id, ...snapDoc.data() });
      });
      setAllUsers(usersList);
    }, (error) => {
      console.error("users collection onSnapshot error:", error);
      try {
        handleFirestoreError(error, OperationType.LIST, "users");
      } catch (e) {}
    });

    return () => unsubscribe();
  }, [isAdminUser]);

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
      const response = await axios.post("/api/create-checkout", {
        userId: user.uid,
        email: user.email,
        origin,
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
      setError("Please fill in both E-wallet sender name and reference number.");
      return;
    }

    // Reference number must be numeric and preferably 13 digits
    const cleanedRef = manualRefNo.replace(/\s/g, "");
    if (!/^\d+$/.test(cleanedRef)) {
      setError("The reference number must contain digits only.");
      return;
    }

    if (cleanedRef.length < 10 || cleanedRef.length > 15) {
      setError("Please check your reference number. GCash handles 13-digit Reference Numbers.");
      const confirmation = window.confirm(
        "Standard GCash Reference Numbers are usually 13 digits. Are you sure you entered the correct reference number?",
      );
      if (!confirmation) {
        return;
      }
    }

    setSubmittingManual(true);
    setError("");
    setManualMessage("");

    try {
      // Create user record with pending Verification details
      await setDoc(
        doc(db, "users", user.uid),
        {
          email: user.email,
          paymentStatus: "pending_verification",
          isActive: false,
          pendingVerification: {
            senderName: manualName.trim(),
            referenceNo: cleanedRef,
            amount: 1000,
            submittedAt: new Date().toISOString(),
          },
        },
        { merge: true },
      );

      setManualMessage("Your GCash Payment details have been submitted successfully.");
      setManualName("");
      setManualRefNo("");
    } catch (err: any) {
      setError(
        "Failed to submit manual payment details: " + err.message,
      );
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
    const confirmApprove = window.confirm(
      `Approve manually submitted payment and activate account for ${userEmail}?`,
    );
    if (!confirmApprove) return;

    setAdminStatusMsg("");
    try {
      await setDoc(
        doc(db, "users", targetUid),
        {
          isActive: true,
          paymentStatus: "paid",
          approvedBy: user.email,
          approvedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      setAdminStatusMsg(`Successfully activated account for ${userEmail}`);
    } catch (err: any) {
      setAdminStatusMsg("Error activating account: " + err.message);
      try {
        handleFirestoreError(err, OperationType.WRITE, "users/" + targetUid);
      } catch (e) {}
    }
  };

  // Admin action: Reject manual payment
  const handleAdminReject = async (targetUid: string, userEmail: string) => {
    const confirmReject = window.confirm(
      `Reject manual submission for ${userEmail}? This will require the user to resubmit correct reference details.`,
    );
    if (!confirmReject) return;

    setAdminStatusMsg("");
    try {
      await setDoc(
        doc(db, "users", targetUid),
        {
          paymentStatus: "unpaid",
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

  const handleAdminToggleToggleStatus = async (targetUid: string, currentActiveStatus: boolean, userEmail: string) => {
    const action = currentActiveStatus ? "deactivate" : "activate";
    const confirmToggle = window.confirm(`Are you sure you want to ${action} ${userEmail}?`);
    if (!confirmToggle) return;

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

  const handleLogout = () => {
    signOut(auth);
  };

  if (success) {
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
            Your account has been activated. You now have full access to PEC
            PRO. Please wait while we load your dashboard...
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
            Checking your transaction with PayMongo. Please do not close this window.
          </p>
        </div>
      </div>
    );
  }

  // Filter users for the Admin panel view
  const filteredUsers = allUsers.filter((u) => {
    const matchesSearch =
      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.uid?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (adminFilter === "all") return true;
    if (adminFilter === "pending") return u.paymentStatus === "pending_verification";
    if (adminFilter === "paid") return u.isActive === true;
    if (adminFilter === "unpaid") return u.isActive !== true && u.paymentStatus !== "pending_verification";
    return true;
  });

  // Admin Dashboard Mode
  if (isAdminMode && isAdminUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans py-8 px-4 sm:px-6 lg:px-8">
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
                PEC PRO - Transactions Console
              </h1>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsAdminMode(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors shrink-0"
              >
                Go back to Payment Screen
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
              <p className="text-sm text-blue-700 font-bold">{adminStatusMsg}</p>
            </div>
          )}

          {/* QR Code Upload Settings Section for Admin */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-md mb-8">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-2 flex items-center gap-2">
              <QrCode className="w-5 h-5 text-indigo-600" />
              GCash QR Code Image Configuration
            </h2>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Upload your original GCash QR code image (the QR code card screenshot from your GCash app) to replace the system's fallback vector drawing. Regular users will then see and scan your exact original QR code instantly.
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
                      {uploadingQr ? "Processing file..." : "Click or Drag & Drop QR Image to Upload"}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-mono">
                      PNG, JPG, or WEBP up to 800KB
                    </span>
                  </div>
                </div>
                {uploadingQr && (
                  <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing image and saving to Firestore setting...</span>
                  </div>
                )}
              </div>

              {/* Current QR Code Preview */}
              <div className="flex flex-col items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                  Active QR Code Preview
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
                        const confirmReset = window.confirm("Are you sure you want to reset and use the default built-in QR image?");
                        if (!confirmReset) return;
                        try {
                          await setDoc(doc(db, "settings", "gcash"), { qrCodeDataUrl: "" }, { merge: true });
                          setGcashQrUrl("");
                          setAdminStatusMsg("Reset GCash QR to default built-in QR.");
                        } catch (err: any) {
                          setAdminStatusMsg("Error resetting QR: " + err.message);
                          try {
                            handleFirestoreError(err, OperationType.WRITE, "settings/gcash");
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
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Total Users</span>
              <span className="text-2xl font-black text-slate-900 font-mono">{allUsers.length}</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block mb-1">Pending GCash</span>
              <span className="text-2xl font-black text-indigo-600 font-mono">
                {allUsers.filter((u) => u.paymentStatus === "pending_verification").length}
              </span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-sm">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block mb-1">Activated Paid</span>
              <span className="text-2xl font-black text-emerald-600 font-mono">
                {allUsers.filter((u) => u.isActive === true).length}
              </span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-50 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Unpaid List</span>
              <span className="text-2xl font-black text-slate-500 font-mono">
                {allUsers.filter((u) => u.isActive !== true && u.paymentStatus !== "pending_verification").length}
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
                  {mode === "all" ? "All Users" : mode === "pending" ? "Pending Approval" : mode === "paid" ? "Active" : "Unpaid"}
                </button>
              ))}
            </div>
          </div>

          {/* Users List */}
          <div className="bg-white rounded-2xl border border-slate-150 shadow-md divide-y divide-slate-100 overflow-hidden">
            {filteredUsers.length === 0 ? (
              <div className="p-12 text-center bg-white flex flex-col items-center">
                <Users className="w-12 h-12 text-slate-300 mb-3" />
                <h3 className="text-sm font-bold text-slate-700">No matching user accounts</h3>
                <p className="text-xs text-slate-400 mt-1">Change your search terms or filter to see users.</p>
              </div>
            ) : (
              filteredUsers.map((u) => {
                const isPending = u.paymentStatus === "pending_verification";
                const isUserActive = u.isActive === true;

                return (
                  <div key={u.uid} className={`p-6 transition-colors ${isPending ? "bg-amber-50/50" : "hover:bg-slate-50"}`}>
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
                          
                          {/* Badges */}
                          {isUserActive ? (
                            <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 rounded">
                              Active Pro
                            </span>
                          ) : isPending ? (
                            <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 rounded animate-pulse">
                              Pending GCash
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
                            <span className="text-[10px] uppercase font-black tracking-widest text-amber-500 block mb-2">
                              Manual Submission Data
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                                  Submitted On
                                </span>
                                <span className="text-[11px] font-bold text-slate-500">
                                  {new Date(u.pendingVerification.submittedAt).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* If previously approved history */}
                        {!isPending && isUserActive && u.approvedAt && (
                          <p className="text-[10px] text-slate-400 mt-1.5 font-bold uppercase font-sans">
                            ✅ Approved by {u.approvedBy || "Admin"} on {new Date(u.approvedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>

                      {/* Right: Actions */}
                      <div className="flex gap-2 shrink-0 w-full md:w-auto justify-end">
                        {isPending ? (
                          <>
                            <button
                              onClick={() => handleAdminApprove(u.uid, u.email)}
                              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-sm"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Approve
                            </button>
                            <button
                              onClick={() => handleAdminReject(u.uid, u.email)}
                              className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-lg text-xs transition-colors border border-red-100 flex items-center gap-1.5 shadow-sm"
                            >
                              <X className="w-3.5 h-3.5" />
                              Reject
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleAdminToggleToggleStatus(u.uid, isUserActive, u.email)}
                            className={`px-3.5 py-2 font-bold rounded-lg text-xs transition-colors border shadow-sm ${
                              isUserActive
                                ? "bg-red-50 hover:bg-red-100 text-red-600 border-red-100"
                                : "bg-indigo-600 hover:bg-indigo-700 text-white border-transparent"
                            }`}
                          >
                            {isUserActive ? "Revoke Pro Access" : "Direct Activate (Trial)"}
                          </button>
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

  // Active Pending Review State Screen for regular user
  if (userProfile?.paymentStatus === "pending_verification" && !success) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
        <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center mb-6">
          <div className="w-14 h-14 bg-amber-500 rounded-2xl flex items-center justify-center shadow-lg relative animate-pulse">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h2 className="mt-4 text-center text-2xl font-black text-slate-900 uppercase tracking-tight">
            Verification Pending
          </h2>
          <p className="mt-2 text-center text-sm text-slate-500 font-medium max-w-sm">
            We are reviewing your GCash submission details.
          </p>
        </div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-6 shadow-xl sm:rounded-2xl border border-slate-100">
            <div className="flex items-center gap-3 bg-amber-50 border-l-4 border-amber-500 p-4 rounded-lg mb-6 leading-relaxed">
              <Loader2 className="w-6 h-6 text-amber-600 shrink-0 animate-spin" />
              <div className="text-xs text-amber-800 font-bold uppercase tracking-wider space-y-0.5">
                <span className="block">Review process initiated</span>
                <span className="font-normal text-slate-600 tracking-normal normal-case block">
                  Checking reference ledger block against developer (Angelo P.)'s e-wallet account balance.
                </span>
              </div>
            </div>

            {userProfile.pendingVerification && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2 mb-6">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">Account ID</span>
                  <span className="text-slate-700 font-bold font-mono text-[11px] select-all">{user.uid}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">Sender E-Wallet</span>
                  <span className="text-slate-800 font-black uppercase text-[11px]">{userProfile.pendingVerification.senderName}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">Reference Code</span>
                  <span className="text-[#0157E4] font-black font-mono tracking-wider text-[11px]">{userProfile.pendingVerification.referenceNo}</span>
                </div>
                <div className="flex justify-between text-xs pt-1 border-t border-slate-200/50">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">Amount Paid</span>
                  <span className="text-slate-900 font-black text-xs font-mono">₱1,000.00</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-bold uppercase tracking-wider">Submitted On</span>
                  <span className="text-slate-500 font-medium">
                    {new Date(userProfile.pendingVerification.submittedAt).toLocaleTimeString()} {new Date(userProfile.pendingVerification.submittedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            )}

            <p className="text-xs text-slate-400 text-center mb-6 leading-relaxed">
              Verification is usually process-verified in <strong>5 to 10 minutes</strong>. Once the admin (Angelo P.) confirms the transfer on their e-wallet logs, your PRO features will automatically unlock instantly. You may leave this page or close the tab safely.
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
          PEC Engineer Load Schedule Premium Suit
        </p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-lg px-4">
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-3xl border border-slate-100 sm:px-10">
          
          {/* Header Description Price */}
          <div className="mb-6 border-b border-slate-100 pb-6 flex justify-between items-end">
            <div>
              <span className="text-xs bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full font-black uppercase tracking-wider">
                Full Activation
              </span>
              <p className="text-slate-400 font-bold text-[10px] uppercase tracking-wider mt-2">
                Lifetime Single Payment
              </p>
            </div>
            <div className="flex items-end gap-1">
              <span className="text-4xl font-black tracking-tight text-slate-900">₱1,000</span>
              <span className="text-slate-400 font-bold mb-1.5 uppercase text-xs">.00</span>
            </div>
          </div>

          <div className="mb-6">
            <ul className="mb-6 space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <li className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#0157E4] shrink-0" />
                <span className="text-xs text-slate-700 font-bold">
                  Complete Load Schedule Board Generator
                </span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#0157E4] shrink-0" />
                <span className="text-xs text-slate-700 font-bold">
                  Short Circuit & Voltage Drop Calculations (PEC)
                </span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#0157E4] shrink-0" />
                <span className="text-xs text-slate-700 font-bold">
                  Illumination, Layout Floor Plan & Export Reports (Word/Excel)
                </span>
              </li>
            </ul>

            {/* Selector Tabs */}
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-2xl mb-6">
              <button
                type="button"
                onClick={() => setPaymentMethod("paymongo")}
                className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                  paymentMethod === "paymongo"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <CreditCard className="w-4 h-4 shrink-0" />
                Instant Access
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("manual")}
                className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                  paymentMethod === "manual"
                    ? "bg-white text-[#0157E4] shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <QrCode className="w-4 h-4 shrink-0" />
                Direct GCash QR
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-md flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 font-bold leading-relaxed">{error}</p>
            </div>
          )}

          {manualMessage && (
            <div className="mb-6 bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-md flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-700 font-bold leading-relaxed">{manualMessage}</p>
            </div>
          )}

          {/* Conditional View Method */}
          {paymentMethod === "paymongo" ? (
            <div className="space-y-4 font-sans">
              <p className="text-slate-400 text-[10px] uppercase font-bold text-center tracking-wider mb-2">
                Pay with credit card, e-wallet or GCash via PayMongo
              </p>
              <button
                disabled={loading}
                onClick={handlePay}
                className="w-full relative group overflow-hidden rounded-xl border border-transparent shadow-lg text-white font-bold transition-all disabled:opacity-50"
                style={{
                  background: "linear-gradient(to right, #0056D4, #0070FF)",
                }}
              >
                <div className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
                <div className="px-4 py-3.5 flex items-center justify-center gap-2">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                  <span className="tracking-widest uppercase text-xs">Start Automated GCash Payment</span>
                </div>
              </button>
              
              <div className="mt-4 flex justify-center opacity-50 grayscale select-none">
                <img
                  src="https://paymongo.com/assets/img/paymongo-logo.png"
                  alt="Powered by PayMongo"
                  className="h-5 object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
                <span className="ml-1.5 text-[9px] font-black text-slate-400 mt-0.5 uppercase tracking-widest">
                  Secured by PayMongo
                </span>
              </div>
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
                    <span className="text-3xl font-black italic tracking-wider">GCash</span>
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
                    Please transfer exactly <strong className="text-slate-800">₱1,000.00</strong> to the GCash details above.
                  </span>
                </div>
              </div>

              {/* Reference Number Submission Form */}
              <form onSubmit={handleManualSubmit} className="space-y-4 pt-2 border-t border-slate-100">
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
                    Double-check reference ID from your GCash receipt before clicking submit.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={submittingManual}
                  className="w-full flex justify-center py-3 bg-[#0157E4] hover:bg-[#0047C7] text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-colors disabled:opacity-50"
                >
                  {submittingManual ? "Submitting Ledger Details..." : "Activate via Reference ID"}
                </button>
              </form>
            </div>
          )}

          {/* Master Logout Options */}
          <div className="mt-6 border-t border-slate-100 pt-6">
            <button
              onClick={handleLogout}
              className="w-full py-3 px-4 flex items-center justify-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors bg-slate-50 hover:bg-slate-100 rounded-xl"
            >
              <LogOut className="w-4 h-4" />
              Sign out of account
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
