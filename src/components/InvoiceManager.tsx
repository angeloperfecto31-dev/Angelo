import React, { useState, useEffect } from 'react';
import { 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  getDoc
} from 'firebase/firestore';
import { db, auth } from '../firebase';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}
import { 
  Receipt, 
  Search, 
  Filter, 
  Download, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  ArrowUpDown, 
  FileSpreadsheet, 
  FileText, 
  Loader2,
  Trash2,
  Check
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

// Strict Invoice Interface matching the schema
export interface Invoice {
  id: string; // matches invoiceNo
  invoiceNo: string;
  userId: string;
  userName: string;
  userEmail: string;
  plan: string;
  billingPeriod: string;
  paymentMethod: string;
  amountPaid: number;
  regPrice: number;
  taxes: number; // 12% VAT
  discounts: number;
  fees: number;
  totalAmount: number;
  paymentStatus: string;
  transactionDate: string; // ISO String
  createdAt: string; // ISO String
  paymentReference: string;
}

// Global helper to create a deterministic, descriptive Invoice ID/No
export const generateInvoiceId = (paymentReference: string, userId: string, dateStr: string) => {
  let cleanRef = (paymentReference || "BYPASS").replace(/[^a-zA-Z0-9]/g, "").substring(0, 15).toUpperCase();
  if (cleanRef === "NONE" || cleanRef === "") cleanRef = "BYPASS";
  const rawDate = new Date(dateStr);
  const year = rawDate.getFullYear().toString().substring(2);
  const month = String(rawDate.getMonth() + 1).padStart(2, '0');
  const day = String(rawDate.getDate()).padStart(2, '0');
  return `INV-${year}${month}${day}-${cleanRef}-${userId.substring(0, 5).toUpperCase()}`;
};

// Background safe helper to sync a single invoice record
export const createOrGetInvoiceData = async (userObj: any, uid: string): Promise<Invoice | null> => {
  if (!userObj || !userObj.email) return null;
  const isActive = userObj.isActive === true || userObj.paymentStatus === "paid";
  if (!isActive) return null;

  const email = userObj.email;
  const rawPlan = (userObj.plan || userObj.pendingVerification?.plan || "basic").toLowerCase();
  const isPremium = rawPlan === "premium";
  
  let basicPrice = 999;
  let premiumPrice = 1499;
  let upgradePrice = 500;
  
  try {
    const pricingRef = doc(db, "settings", "pricing");
    const pricingSnap = await getDoc(pricingRef);
    if (pricingSnap.exists()) {
      const data = pricingSnap.data();
      if (typeof data.basicPrice === 'number') basicPrice = data.basicPrice;
      if (typeof data.premiumPrice === 'number') premiumPrice = data.premiumPrice;
      if (typeof data.upgradePrice === 'number') upgradePrice = data.upgradePrice;
    }
  } catch (err) {
    console.warn("Could not fetch pricing settings for invoice generation, using defaults:", err);
  }

  // Resolve amount and payment details
  let amountPaid = Number(userObj.amount || userObj.paymentAmount || userObj.pendingVerification?.amount || 0);
  if (amountPaid <= 0) {
    amountPaid = userObj.isUpgrade ? upgradePrice : (isPremium ? premiumPrice : basicPrice);
  }

  let regPrice = isPremium ? premiumPrice : basicPrice;
  if (userObj.isUpgrade) {
    regPrice = upgradePrice;
  }

  const discount = Math.max(0, regPrice - amountPaid);
  const taxes = Number((amountPaid - amountPaid / 1.12).toFixed(2)); // 12% VAT included
  
  const paymentMethod = userObj.paymentSource || userObj.pendingVerification?.method || "Manual Verification";
  const paymentReference = userObj.paymentReference || userObj.pendingVerification?.referenceNo || "BYPASS-MGR";
  const userName = userObj.senderName || userObj.pendingVerification?.senderName || email.split('@')[0];
  
  const transactionDate = userObj.approvedAt || userObj.activatedAt || new Date().toISOString();
  
  const invoiceNo = generateInvoiceId(paymentReference, uid, transactionDate);

  // Billing period calculation (1 month after transaction date)
  const startDate = new Date(transactionDate);
  const endDate = new Date(transactionDate);
  endDate.setMonth(endDate.getMonth() + 1);
  const opt: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
  const billingPeriod = `${startDate.toLocaleDateString('en-US', opt)} - ${endDate.toLocaleDateString('en-US', opt)}`;

  const invoiceData: Invoice = {
    id: invoiceNo,
    invoiceNo,
    userId: uid,
    userName,
    userEmail: email,
    plan: userObj.isUpgrade ? "Premium (Upgrade)" : (isPremium ? "Premium (Standard)" : "Basic (Standard)"),
    billingPeriod,
    paymentMethod,
    amountPaid,
    regPrice,
    taxes,
    discounts: discount,
    fees: 0,
    totalAmount: amountPaid,
    paymentStatus: "Paid",
    transactionDate,
    createdAt: new Date().toISOString(),
    paymentReference
  };

  try {
    const docRef = doc(db, "invoices", invoiceNo);
    await setDoc(docRef, invoiceData, { merge: true });
    
    // Gratefully wrap admin activity log write so non-admins or update restrictions won't stop the invoice creation
    try {
      await setDoc(doc(db, "admin_activity_logs", `invoice_${invoiceNo}_${Date.now()}`), {
        action: "INVOICE_GENERATION",
        invoiceNo,
        userEmail: email,
        timestamp: new Date().toISOString(),
        performedBy: "SYSTEM_AUTO"
      });
    } catch (auditErr) {
      console.warn("Skipped write to admin_activity_logs (expected for non-admins or duplicates):", auditErr);
    }

    return invoiceData;
  } catch (err) {
    console.error("Error creating system invoice automator:", err);
    return null;
  }
};

// High-fidelity clientside PDF Generative function
export const downloadSingleInvoicePDF = (item: Invoice) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Color Swatches
  const PRIMARY = [15, 23, 42]; // Slate 900
  const SECONDARY = [79, 70, 229]; // Indigo 600
  const TEXT_MUTED = [100, 116, 139]; // Slate 500
  const BG_LIGHT = [248, 250, 252]; // Slate 50

  // Header background block (clean styling)
  doc.setFillColor(BG_LIGHT[0], BG_LIGHT[1], BG_LIGHT[2]);
  doc.rect(0, 0, 210, 50, 'F');

  // Blue vertical banner accent
  doc.setFillColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
  doc.rect(15, 12, 1.5, 12, 'F');

  // Brand Header
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.text("ELECTRICALPH", 20, 21);

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text("PEC COMPLIANT DESIGN & AUDIT PLATFORM", 20, 26);

  // Invoice Text (Top Right)
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
  doc.text("INVOICE", 145, 22);

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.text(`Invoice No: ${item.invoiceNo}`, 145, 29);
  doc.text(`Date: ${new Date(item.transactionDate).toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' })}`, 145, 34);

  // Business Address block
  doc.setFontSize(8.5);
  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text("ElectricalPH Technology Corp.", 15, 60);
  doc.text("Manila, Metro Manila, Philippines", 15, 64);
  doc.text("support@electricalph.com", 15, 68);

  // Billing details
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.text("BILLED TO:", 115, 60);

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Name: ${item.userName}`, 115, 65);
  doc.text(`Email: ${item.userEmail}`, 115, 69);
  doc.text(`Reference No: ${item.paymentReference}`, 115, 73);

  // Horizontal divider
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.setLineWidth(0.4);
  doc.line(15, 82, 195, 82);

  // Payment status metadata banner
  doc.setFillColor(BG_LIGHT[0], BG_LIGHT[1], BG_LIGHT[2]);
  doc.rect(15, 87, 180, 12, 'F');
  
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text("PAYMENT STATUS:", 18, 95);
  doc.setTextColor(16, 185, 129); // Emerald 500
  doc.text("FULLY PAID", 48, 95);

  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text("METHOD:", 75, 95);
  doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.text(item.paymentMethod.toUpperCase(), 92, 95);

  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text("BILLING RANGE:", 125, 95);
  doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.setFontSize(7.5);
  doc.text(item.billingPeriod, 192, 95, { align: 'right' });

  // Columns Header
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(9);
  doc.setFillColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.rect(15, 110, 180, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text("ITEM DESCRIPTION", 20, 115);
  doc.text("REG. PRICE", 115, 115);
  doc.text("DISCOUNT", 145, 115);
  doc.text("TOTAL PAID", 175, 115);

  // Row Content
  doc.setFont("Helvetica", "normal");
  doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  doc.text(`ElectricalPH Portal Access - ${item.plan}`, 20, 127);
  doc.text(`₱${item.regPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 115, 127);
  doc.text(`₱${item.discounts.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 145, 127);
  doc.text(`₱${item.amountPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 175, 127);

  doc.line(15, 133, 195, 133);

  // Breakdown Totals Section
  const yStart = 145;
  doc.setFontSize(8.5);
  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text("Subtotal (excl. Tax):", 125, yStart);
  doc.text("Value Added Tax (12% VAT):", 125, yStart + 5);
  doc.text("Processing Fees:", 125, yStart + 10);

  doc.setTextColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
  const subtotal = item.amountPaid - item.taxes;
  doc.text(`₱${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 175, yStart);
  doc.text(`₱${item.taxes.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 175, yStart + 5);
  doc.text(`₱${item.fees.toFixed(2)}`, 175, yStart + 10);

  // Complete Total block
  doc.setFillColor(BG_LIGHT[0], BG_LIGHT[1], BG_LIGHT[2]);
  doc.rect(120, yStart + 15, 75, 10, 'F');
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(SECONDARY[0], SECONDARY[1], SECONDARY[2]);
  doc.text("TOTAL AMOUNT:", 125, yStart + 21);
  doc.text(`₱${item.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 175, yStart + 21);

  // Footer terms
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
  doc.text("In compliance with Philippine Taxation Laws, this serves as official", 15, 235);
  doc.text("electronic invoice documentation. Calculated in structural accordance", 15, 239);
  doc.text("with standards in PEC 2017. No further hardware purchases or on-site", 15, 243);
  doc.text("inspections are represented in this standard digital support plan.", 15, 247);

  // Sign-off signature footer
  doc.setLineWidth(0.2);
  doc.line(135, 260, 185, 260);
  doc.text("Authorized Platform Representative", 160, 265, { align: 'center' });
  doc.setFont("Helvetica", "bold");
  doc.text("Angelo Perfecto", 160, 257, { align: 'center' });

  // Save PDF
  doc.save(`${item.invoiceNo}.pdf`);
};

export default function InvoiceManager({ 
  user, 
  isAdminPanel = false 
}: { 
  user: any; 
  isAdminPanel?: boolean 
}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [usersList, setUsersList] = useState<any[]>([]);

  // Filtering / Search controls
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Grid Controls
  const [sortBy, setSortBy] = useState<"date" | "amount" | "user" | "invoiceNo">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [actionMsg, setActionMsg] = useState("");

  const isAdmin = user?.email?.trim().toLowerCase() === "angeloperfecto31@gmail.com";

  useEffect(() => {
    setLoading(true);
    let invoicesQuery = collection(db, "invoices");

    // If regular user, restrict onSnapshot listener structurally to only retrieve their own.
    // However, Firestore rules also lock this down. We apply the query directly to comply with rule constraints.
    if (!isAdmin) {
      invoicesQuery = query(collection(db, "invoices"), where("userId", "==", user.uid)) as any;
    }

    const unsubscribe = onSnapshot(invoicesQuery, (shot) => {
      const docs: Invoice[] = [];
      shot.forEach((docSnap) => {
        docs.push({ id: docSnap.id, ...docSnap.data() } as Invoice);
      });
      setInvoices(docs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "invoices");
      setLoading(false);
    });

    // Load active users list for healing & backend sync checks if Admin
    if (isAdmin) {
      const unsubUsers = onSnapshot(collection(db, "users"), (shot) => {
        const uList: any[] = [];
        shot.forEach((docSnap) => {
          uList.push({ uid: docSnap.id, ...docSnap.data() });
        });
        setUsersList(uList);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, "users");
      });
      return () => {
        unsubscribe();
        unsubUsers();
      };
    }

    return () => unsubscribe();
  }, [user, isAdmin]);

  // Bulk scan to heal invoices for subscription transactions that don't have invoices
  const handleSyncDatabaseInvoices = async () => {
    if (!isAdmin || !usersList.length) return;
    setSyncing(true);
    setActionMsg("");
    let healedCount = 0;
    try {
      for (const u of usersList) {
        const isActive = u.isActive === true || u.paymentStatus === "paid";
        if (isActive) {
          // Check if an invoice already exists for this user
          const paymentRef = u.paymentReference || u.pendingVerification?.referenceNo || "BYPASS-MGR";
          const transactionDate = u.approvedAt || u.activatedAt || new Date().toISOString();
          const targetInvNo = generateInvoiceId(paymentRef, u.uid, transactionDate);
          
          const matching = invoices.find(inv => inv.invoiceNo === targetInvNo || inv.userId === u.uid);
          if (!matching) {
            await createOrGetInvoiceData(u, u.uid);
            healedCount++;
          }
        }
      }
      setActionMsg(`Database synchronization finished successfully! Processed and generated ${healedCount} missing invoices.`);
    } catch (err: any) {
      setActionMsg(`Error occurred during synchronization: ${err.message}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setActionMsg(""), 6000);
    }
  };

  // Helper sorting & filtering logic
  const filteredInvoices = invoices.filter((item) => {
    // 1. Search Query
    const q = searchQuery.toLowerCase();
    const queryMatch = 
      item.invoiceNo.toLowerCase().includes(q) ||
      (item.userName || "").toLowerCase().includes(q) ||
      item.userEmail.toLowerCase().includes(q) ||
      (item.plan || "").toLowerCase().includes(q) ||
      (item.paymentReference || "").toLowerCase().includes(q);
    
    if (!queryMatch) return false;

    // 2. Status Filter
    if (statusFilter !== "all" && item.paymentStatus.toLowerCase() !== statusFilter.toLowerCase()) {
      return false;
    }

    // 3. Plan Filter
    if (planFilter !== "all") {
      const isPremium = item.plan.toLowerCase().includes("premium");
      if (planFilter === "premium" && !isPremium) return false;
      if (planFilter === "basic" && isPremium) return false;
    }

    // 4. Method Filter
    if (methodFilter !== "all" && !item.paymentMethod.toLowerCase().includes(methodFilter.toLowerCase())) {
      return false;
    }

    // 5. Date Range Filter
    if (startDate) {
      const sDate = new Date(startDate);
      const tDate = new Date(item.transactionDate);
      if (tDate < sDate) return false;
    }
    if (endDate) {
      const eDate = new Date(endDate);
      eDate.setHours(23, 59, 59, 999);
      const tDate = new Date(item.transactionDate);
      if (tDate > eDate) return false;
    }

    return true;
  });

  // Sorting
  const sortedInvoices = [...filteredInvoices].sort((a, b) => {
    let checkA: any = "";
    let checkB: any = "";

    if (sortBy === "date") {
      checkA = new Date(a.transactionDate).getTime();
      checkB = new Date(b.transactionDate).getTime();
    } else if (sortBy === "amount") {
      checkA = a.totalAmount;
      checkB = b.totalAmount;
    } else if (sortBy === "user") {
      checkA = a.userEmail.toLowerCase();
      checkB = b.userEmail.toLowerCase();
    } else {
      checkA = a.invoiceNo.toLowerCase();
      checkB = b.invoiceNo.toLowerCase();
    }

    if (checkA < checkB) return sortOrder === "asc" ? -1 : 1;
    if (checkA > checkB) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const handleSelectInvoice = (id: string) => {
    setSelectedInvoices(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedInvoices(sortedInvoices.map(x => x.id));
    } else {
      setSelectedInvoices([]);
    }
  };

  // Multiple Excel export using xlsx
  const handleExportExcel = (items: Invoice[], label: string) => {
    if (!items.length) return;
    
    // Transform data flat for direct high compatibility spreadsheet row rendering
    const flatData = items.map(item => ({
      "Invoice Number": item.invoiceNo,
      "Name": item.userName,
      "Email Address": item.userEmail,
      "Date": new Date(item.transactionDate).toLocaleDateString(),
      "Billing Period": item.billingPeriod,
      "Plan Purchased": item.plan,
      "Subtotal (PHP)": item.amountPaid - item.taxes,
      "Taxes (VAT 12%)": item.taxes,
      "Discounts / Promos (PHP)": item.discounts,
      "Total Amount Paid (PHP)": item.totalAmount,
      "Payment Method": item.paymentMethod,
      "Payment Status": item.paymentStatus,
      "Reference Number": item.paymentReference
    }));

    const worksheet = XLSX.utils.json_to_sheet(flatData);
    const workbook = XLSX.utils.book_new();
    
    // Clean column widths configuration
    const maxCols = [
      { wch: 18 }, // No
      { wch: 22 }, // Name
      { wch: 28 }, // Email
      { wch: 12 }, // Date
      { wch: 35 }, // Range
      { wch: 25 }, // Plan
      { wch: 15 }, // Sub
      { wch: 15 }, // Tax
      { wch: 15 }, // Disc
      { wch: 18 }, // Total
      { wch: 18 }, // Method
      { wch: 15 }, // Status
      { wch: 20 }  // Ref
    ];
    worksheet['!cols'] = maxCols;

    XLSX.utils.book_append_sheet(workbook, worksheet, "Financial Ledger");
    XLSX.writeFile(workbook, `Historical_Invoices_${label}_${new Date().toISOString().substring(0, 10)}.xlsx`);
  };

  // Multiple CSV export
  const handleExportCSV = (items: Invoice[], label: string) => {
    if (!items.length) return;

    const headers = [
      "Invoice Number", "User Name", "Email", "Transaction Date", 
      "Billing range", "Plan", "Base Price", "VAT Deducted", "Promotional Discount", 
      "Amount Paid", "Method", "Payment Status", "Transaction Reference"
    ];

    const rows = items.map(x => [
      x.invoiceNo,
      `"${(x.userName || '').replace(/"/g, '""')}"`,
      x.userEmail,
      new Date(x.transactionDate).toISOString(),
      `"${x.billingPeriod}"`,
      `"${x.plan}"`,
      x.regPrice,
      x.taxes,
      x.discounts,
      x.totalAmount,
      x.paymentMethod,
      x.paymentStatus,
      `="${x.paymentReference}"` // protect preceding zero in Excel csv import
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Invoices_Export_${label}_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm min-h-[300px]">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
        <p className="text-sm font-semibold text-slate-500">Loading Billing Ledger...</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Synchronization Banner for Master Admin */}
      {isAdmin && (
        <div className="p-4 bg-slate-900 text-slate-100 rounded-2xl border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[9px] font-black tracking-wider uppercase bg-yellow-400 text-slate-950 rounded-full animate-pulse">
                Auto Sync Active
              </span>
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">
                Invoices Ledger Health Console
              </h4>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 max-w-xl">
              Compare payment records with active subscriptions in real-time. Missing invoices are detected automatically. Click Synchronize to run a full database diagnostics check.
            </p>
          </div>
          <button
            onClick={handleSyncDatabaseInvoices}
            disabled={syncing}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold font-mono border border-indigo-500/30 shadow-md transition-all shrink-0 flex items-center gap-2"
          >
            {syncing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                Synchronize Invoices
              </>
            )}
          </button>
        </div>
      )}

      {actionMsg && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          {actionMsg}
        </div>
      )}

      {/* Main Core Invoice Dashboard */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-md">
        
        {/* Search, Filter controls */}
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-stretch justify-between">
            {/* Search Input */}
            <div className="flex-1 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search invoices by No., sender email, transaction ref..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 pointer-events-auto shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Date Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] uppercase font-black text-slate-400 mr-1">Start:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
                />
              </div>
              
              <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] uppercase font-black text-slate-400 mr-1">End:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
                />
              </div>

              {(startDate || endDate || searchQuery || statusFilter !== "all" || planFilter !== "all" || methodFilter !== "all") && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setStartDate("");
                    setEndDate("");
                    setStatusFilter("all");
                    setPlanFilter("all");
                    setMethodFilter("all");
                  }}
                  className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                  title="Clear all filters"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Multidimensional Filters dropdown Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Status */}
            <div>
              <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider block mb-1">Payment Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                <option value="all">⭐ All Statuses</option>
                <option value="paid">✅ Fully Paid</option>
                <option value="pending">⏳ Pending Review</option>
              </select>
            </div>

            {/* Plan tier */}
            <div>
              <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider block mb-1">License Plan</label>
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                <option value="all">⚡ All License Plans</option>
                <option value="premium">Premium Pro License</option>
                <option value="basic">Basic License</option>
              </select>
            </div>

            {/* Payment Method */}
            <div>
              <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider block mb-1">Billing Channel</label>
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                <option value="all">🏦 All Channels</option>
                <option value="gcash">GCash E-Wallet</option>
                <option value="maribank">MariBank Direct</option>
                <option value="bypass">Bypass Admin Activation</option>
              </select>
            </div>
          </div>
        </div>

        {/* Global Export actions block */}
        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <span className="text-[11px] font-bold text-slate-500 font-mono">
            {selectedInvoices.length > 0
              ? `SELECTED: ${selectedInvoices.length} invoices`
              : `LIVESTREAM VIEW: ${sortedInvoices.length} transactions match filters`}
          </span>

          <div className="flex flex-wrap gap-2">
            {selectedInvoices.length > 0 ? (
              <>
                <button
                  onClick={() => handleExportExcel(
                    invoices.filter(x => selectedInvoices.includes(x.id)),
                    "Selected"
                  )}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Excel Selected
                </button>
                <button
                  onClick={() => handleExportCSV(
                    invoices.filter(x => selectedInvoices.includes(x.id)),
                    "Selected"
                  )}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
                >
                  <FileText className="w-3.5 h-3.5" />
                  CSV Selected
                </button>
                <button
                  onClick={() => {
                    const sell = invoices.filter(x => selectedInvoices.includes(x.id));
                    sell.forEach(it => downloadSingleInvoicePDF(it));
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download PDFs ({selectedInvoices.length})
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleExportExcel(sortedInvoices, "Filtered")}
                  className="px-3 py-1.5 bg-[#107C41]/10 text-[#107C41] border border-[#107C41]/20 hover:bg-[#107C41]/20 rounded-xl text-xs font-bold flex items-center gap-1.5"
                  title="Export currently visible invoices matching filters to Excel format"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Export All (Excel)
                </button>
                <button
                  onClick={() => handleExportCSV(sortedInvoices, "Filtered")}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5"
                  title="Export results to structured CSV"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Export All (CSV)
                </button>
              </>
            )}
          </div>
        </div>

        {/* Invoices Table */}
        <div className="mt-6 overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-2xl">
          <table className="w-full text-left border-collapse min-w-[800px] pointer-events-auto">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800">
                {isAdmin && (
                  <th className="p-4 w-12 text-center">
                    <input
                      type="checkbox"
                      onChange={handleSelectAll}
                      checked={sortedInvoices.length > 0 && selectedInvoices.length === sortedInvoices.length}
                      className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-slate-300 cursor-pointer"
                    />
                  </th>
                )}
                <th 
                  onClick={() => toggleSort("invoiceNo")}
                  className="p-4 text-xs font-black uppercase text-slate-400 tracking-wider cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
                >
                  <div className="flex items-center gap-1">
                    Invoice No.
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th 
                  onClick={() => toggleSort("user")}
                  className="p-4 text-xs font-black uppercase text-slate-400 tracking-wider cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
                >
                  <div className="flex items-center gap-1">
                    Customer Account
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="p-4 text-xs font-black uppercase text-slate-400 tracking-wider">Plan Access</th>
                <th 
                  onClick={() => toggleSort("date")}
                  className="p-4 text-xs font-black uppercase text-slate-400 tracking-wider cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
                >
                  <div className="flex items-center gap-1">
                    Transaction Date
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="p-4 text-xs font-black uppercase text-slate-400 tracking-wider">Method</th>
                <th 
                  onClick={() => toggleSort("amount")}
                  className="p-4 text-xs font-black uppercase text-slate-400 tracking-wider cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/50 text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    Total Paid
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="p-4 text-xs font-black uppercase text-slate-400 tracking-wider text-center">Status</th>
                <th className="p-4 text-xs font-black uppercase text-slate-400 tracking-wider text-center">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 font-medium">
              {sortedInvoices.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 9 : 8} className="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900">
                    <Receipt className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
                    No transactions or invoice history available.
                  </td>
                </tr>
              ) : (
                sortedInvoices.map((item) => {
                  const isS = selectedInvoices.includes(item.id);
                  return (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/25 transition-colors ${isS ? "bg-indigo-50/30 dark:bg-indigo-950/15" : "bg-white dark:bg-slate-900"}`}
                    >
                      {isAdmin && (
                        <td className="p-4 text-center">
                          <input
                            type="checkbox"
                            checked={isS}
                            onChange={() => handleSelectInvoice(item.id)}
                            className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-slate-300 cursor-pointer"
                          />
                        </td>
                      )}
                      
                      {/* Invoice No */}
                      <td className="p-4 text-xs font-bold font-mono text-slate-900 dark:text-slate-100 uppercase">
                        {item.invoiceNo}
                      </td>

                      {/* Account email */}
                      <td className="p-4">
                        <div className="flex flex-col min-w-[150px]">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{item.userName}</span>
                          <span className="text-[10px] text-slate-400 font-semibold font-mono truncate mt-0.5">{item.userEmail}</span>
                        </div>
                      </td>

                      {/* Plan */}
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{item.plan}</span>
                          <span className="text-[9px] text-slate-400 mt-0.5">{item.billingPeriod}</span>
                        </div>
                      </td>

                      {/* Date */}
                      <td className="p-4 text-xs font-bold text-slate-500 font-mono">
                        {new Date(item.transactionDate).toLocaleDateString("en-US", {
                          year: 'numeric',
                          month: 'short',
                          day: '2-digit',
                        })} at {new Date(item.transactionDate).toLocaleTimeString("en-US", { hour12: false, hour: '2-digit', minute: '2-digit' })}
                      </td>

                      {/* Method */}
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black uppercase text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 rounded-md inline-block w-fit">{item.paymentMethod}</span>
                          <span className="text-[9px] font-mono text-slate-400 mt-0.5 max-w-[140px] truncate" title={item.paymentReference}>Ref: {item.paymentReference}</span>
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="p-4 text-right text-xs font-black font-mono text-slate-900 dark:text-slate-100">
                        ₱{item.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Status */}
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" />
                          Paid
                        </span>
                      </td>

                      {/* Download */}
                      <td className="p-4 text-center">
                        <button
                          onClick={() => downloadSingleInvoicePDF(item)}
                          className="p-1 px-2.5 bg-slate-100 hover:bg-indigo-600 hover:text-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-extrabold flex items-center gap-1 transition-all mx-auto shadow-sm"
                          title="Generate official digital PDF invoice"
                        >
                          <Download className="w-3.5 h-3.5" />
                          PDF
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
