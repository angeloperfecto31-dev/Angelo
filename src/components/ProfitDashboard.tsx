import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc,
  doc, 
  query, 
  orderBy, 
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  TrendingUp, 
  DollarSign, 
  PiggyBank, 
  LineChart, 
  Calendar, 
  Plus, 
  Trash2, 
  Download, 
  FileSpreadsheet, 
  FileText, 
  Loader2, 
  ChevronRight, 
  Filter, 
  Tag, 
  Clock, 
  AlertCircle, 
  Info,
  Layers,
  ArrowUpRight,
  TrendingDown,
  ArrowUpDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx-js-style';
import { saveAs } from 'file-saver';
import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  HeadingLevel, 
  Table as DocxTable, 
  TableRow as DocxTableRow, 
  TableCell as DocxTableCell, 
  AlignmentType, 
  WidthType, 
  BorderStyle, 
  VerticalAlign 
} from 'docx';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  Legend, 
  BarChart, 
  Bar, 
  Cell 
} from 'recharts';

// Strict Invoice Interface matching the schema from InvoiceManager
export interface Invoice {
  id: string;
  invoiceNo: string;
  userId: string;
  userName: string;
  userEmail: string;
  plan: string;
  billingPeriod: string;
  paymentMethod: string;
  amountPaid: number;
  regPrice: number;
  taxes: number; 
  discounts: number;
  fees: number;
  totalAmount: number;
  paymentStatus: string;
  transactionDate: string; // ISO String
  createdAt: string; // ISO String
  paymentReference: string;
}

// Custom Expense Interface
export interface Expense {
  id: string;
  title: string;
  amount: number;
  category: string;
  date: string; // ISO / YYYY-MM-DD
  description?: string;
  createdAt: string; // ISO
}

interface ProfitDashboardProps {
  user: any;
  isAdmin: boolean;
}

const EXPENSE_CATEGORIES = [
  { value: "hosting_servers", label: "Hosting & Servers", color: "#6366f1" },
  { value: "api_costs", label: "Third-Party APIs (AI, Maps, etc)", color: "#06b6d4" },
  { value: "marketing_ads", label: "Marketing & Advertising", color: "#ec4899" },
  { value: "contractor_dev", label: "Contractor & Dev Wages", color: "#f59e0b" },
  { value: "taxes_compliance", label: "Taxes & Compliance Fees", color: "#ef4444" },
  { value: "software_tools", label: "Software & SaaS Subscriptions", color: "#8b5cf6" },
  { value: "office_supplies", label: "Office Supplies & Equipment", color: "#10b981" },
  { value: "miscellaneous", label: "Miscellaneous", color: "#64748b" }
];

const PRESET_RANGES = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom Range" }
];

export default function ProfitDashboard({ user, isAdmin }: ProfitDashboardProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingExpense, setSubmittingExpense] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'expenses' | 'transactions'>('overview');
  
  // Date filter controls
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  // New Expense Form State
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    title: "",
    amount: "",
    category: "api_costs",
    date: new Date().toISOString().substring(0, 10),
    description: ""
  });
  const [formError, setFormError] = useState("");

  const fPHP = (amount: number) => {
    return "₱" + Number(amount || 0).toLocaleString("en-US", { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  // Real-time Firestore synchronization
  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);

    // Stream Invoices
    const invoicesQuery = query(collection(db, "invoices"), orderBy("transactionDate", "desc"));
    const unsubInvoices = onSnapshot(invoicesQuery, (shot) => {
      const docs: Invoice[] = [];
      shot.forEach((docSnap) => {
        docs.push({ id: docSnap.id, ...docSnap.data() } as Invoice);
      });
      setInvoices(docs);
    }, (error) => {
      console.error("Error fetching invoices for analytics:", error);
    });

    // Stream Expenses
    const expensesQuery = query(collection(db, "expenses"), orderBy("date", "desc"));
    const unsubExpenses = onSnapshot(expensesQuery, (shot) => {
      const docs: Expense[] = [];
      shot.forEach((docSnap) => {
        docs.push({ id: docSnap.id, ...docSnap.data() } as Expense);
      });
      setExpenses(docs);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching expenses:", error);
      setLoading(false);
    });

    return () => {
      unsubInvoices();
      unsubExpenses();
    };
  }, [isAdmin]);

  // Handle Adding Expense
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.title.trim() || !expenseForm.amount || Number(expenseForm.amount) <= 0) {
      setFormError("Please enter a valid title and positive numeric amount.");
      return;
    }
    setSubmittingExpense(true);
    setFormError("");

    try {
      const newExpense = {
        title: expenseForm.title.trim(),
        amount: Number(expenseForm.amount),
        category: expenseForm.category,
        date: expenseForm.date || new Date().toISOString().substring(0, 10),
        description: expenseForm.description.trim(),
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, "expenses"), newExpense);
      setShowAddExpenseModal(false);
      setExpenseForm({
        title: "",
        amount: "",
        category: "api_costs",
        date: new Date().toISOString().substring(0, 10),
        description: ""
      });
    } catch (err: any) {
      setFormError(`Failed to save expense: ${err.message}`);
    } finally {
      setSubmittingExpense(false);
    }
  };

  // Handle Deleting Expense
  const handleDeleteExpense = async (expenseId: string) => {
    if (!window.confirm("Are you sure you want to delete this expense record?")) return;
    try {
      await deleteDoc(doc(db, "expenses", expenseId));
    } catch (err: any) {
      alert(`Error deleting expense: ${err.message}`);
    }
  };

  // Date Filtering Helper
  const filterByDateRange = (itemDateStr: string) => {
    if (!itemDateStr) return false;
    const itemDate = new Date(itemDateStr);
    const now = new Date();
    
    // Normalize hours for accurate day-to-day comparison
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    switch (dateFilter) {
      case "today":
        return itemDate >= startOfToday && itemDate <= endOfToday;
      case "week": {
        const dayOfWeek = now.getDay(); // 0 is Sunday, 1 is Monday...
        const diffToMonday = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const startOfWeek = new Date(now.setDate(diffToMonday));
        startOfWeek.setHours(0,0,0,0);
        return itemDate >= startOfWeek;
      }
      case "month": {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return itemDate >= startOfMonth;
      }
      case "year": {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        return itemDate >= startOfYear;
      }
      case "custom": {
        if (!customStartDate) return true;
        const start = new Date(customStartDate);
        start.setHours(0,0,0,0);
        const end = customEndDate ? new Date(customEndDate) : new Date();
        end.setHours(23,59,59,999);
        return itemDate >= start && itemDate <= end;
      }
      case "all":
      default:
        return true;
    }
  };

  // Filtered lists
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => filterByDateRange(inv.transactionDate));
  }, [invoices, dateFilter, customStartDate, customEndDate]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => filterByDateRange(exp.date));
  }, [expenses, dateFilter, customStartDate, customEndDate]);

  // Overall calculations (Unconditional of dateFilter for lifetime summary cards)
  const statsOverview = useMemo(() => {
    const totalRev = invoices.reduce((sum, item) => sum + (item.amountPaid || 0), 0);
    const totalExp = expenses.reduce((sum, item) => sum + (item.amount || 0), 0);
    const netProf = totalRev - totalExp;
    const grossProf = totalRev;
    const profitMarg = totalRev > 0 ? (netProf / totalRev) * 100 : 0;

    // Time-based stats regardless of main filters
    const now = new Date();
    const todayStr = now.toISOString().substring(0, 10);
    
    // Weekly bounds
    const dayOfWeek = now.getDay();
    const diffToMonday = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), diffToMonday);
    startOfWeek.setHours(0,0,0,0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Revenues
    const revToday = invoices.filter(inv => inv.transactionDate.startsWith(todayStr)).reduce((s, i) => s + i.amountPaid, 0);
    const revWeek = invoices.filter(inv => new Date(inv.transactionDate) >= startOfWeek).reduce((s, i) => s + i.amountPaid, 0);
    const revMonth = invoices.filter(inv => new Date(inv.transactionDate) >= startOfMonth).reduce((s, i) => s + i.amountPaid, 0);
    const revYear = invoices.filter(inv => new Date(inv.transactionDate) >= startOfYear).reduce((s, i) => s + i.amountPaid, 0);

    // Expenses
    const expToday = expenses.filter(exp => exp.date === todayStr).reduce((s, i) => s + i.amount, 0);
    const expWeek = expenses.filter(exp => new Date(exp.date) >= startOfWeek).reduce((s, i) => s + i.amount, 0);
    const expMonth = expenses.filter(exp => new Date(exp.date) >= startOfMonth).reduce((s, i) => s + i.amount, 0);
    const expYear = expenses.filter(exp => new Date(exp.date) >= startOfYear).reduce((s, i) => s + i.amount, 0);

    return {
      lifetimeRevenue: totalRev,
      lifetimeExpenses: totalExp,
      lifetimeNetProfit: netProf,
      lifetimeGrossProfit: grossProf,
      lifetimeProfitMargin: profitMarg,
      profitToday: revToday - expToday,
      profitWeek: revWeek - expWeek,
      profitMonth: revMonth - expMonth,
      profitYear: revYear - expYear,
    };
  }, [invoices, expenses]);

  // Current active range calculations
  const activeRangeStats = useMemo(() => {
    const revenue = filteredInvoices.reduce((sum, item) => sum + (item.amountPaid || 0), 0);
    const expensesSum = filteredExpenses.reduce((sum, item) => sum + (item.amount || 0), 0);
    const netProfit = revenue - expensesSum;
    const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return {
      revenue,
      expenses: expensesSum,
      netProfit,
      profitMargin
    };
  }, [filteredInvoices, filteredExpenses]);

  // Chart Data Aggregation (Current Year Months)
  const chartData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const currentYear = new Date().getFullYear();
    
    return months.map((monthName, idx) => {
      // Invoices in this month of current year
      const monthRev = invoices
        .filter(inv => {
          const d = new Date(inv.transactionDate);
          return d.getFullYear() === currentYear && d.getMonth() === idx;
        })
        .reduce((sum, item) => sum + item.amountPaid, 0);

      // Expenses in this month of current year
      const monthExp = expenses
        .filter(exp => {
          const d = new Date(exp.date);
          return d.getFullYear() === currentYear && d.getMonth() === idx;
        })
        .reduce((sum, item) => sum + item.amount, 0);

      return {
        name: monthName,
        Revenue: Math.round(monthRev),
        Expenses: Math.round(monthExp),
        Profit: Math.round(monthRev - monthExp)
      };
    });
  }, [invoices, expenses]);

  // Expense Category breakdown for charts
  const categoryBreakdownData = useMemo(() => {
    return EXPENSE_CATEGORIES.map(cat => {
      const sum = filteredExpenses
        .filter(exp => exp.category === cat.value)
        .reduce((sum, item) => sum + item.amount, 0);
      return {
        name: cat.label,
        value: Math.round(sum),
        color: cat.color
      };
    }).filter(c => c.value > 0);
  }, [filteredExpenses]);

  // Combined Merged Chronological Transactions List (Revenue & Expenses)
  const mergedTransactions = useMemo(() => {
    const revs = filteredInvoices.map(inv => ({
      id: inv.id,
      type: 'revenue',
      title: `${inv.plan} Subscription (${inv.userName})`,
      category: 'Subscription Income',
      amount: inv.amountPaid,
      date: inv.transactionDate,
      reference: inv.paymentReference || "N/A",
      email: inv.userEmail,
      method: inv.paymentMethod
    }));

    const exps = filteredExpenses.map(exp => {
      const label = EXPENSE_CATEGORIES.find(c => c.value === exp.category)?.label || "Other Expense";
      return {
        id: exp.id,
        type: 'expense',
        title: exp.title,
        category: label,
        amount: exp.amount,
        date: exp.date,
        reference: "EXP-REF",
        email: exp.description || "N/A",
        method: "Corporate Ledger"
      };
    });

    return [...revs, ...exps].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredInvoices, filteredExpenses]);

  // 1. Export Excel Report using xlsx-js-style
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Financial Overview Summary
    const summaryData = [
      ["FINANCIAL ANALYTICS REPORT", "", ""],
      ["Export Date:", new Date().toLocaleDateString('en-US'), ""],
      ["Filter Range:", dateFilter.toUpperCase(), ""],
      [],
      ["FINANCIAL SUMMARY", "CURRENT FILTERED PERIOD", "LIFETIME STATISTICS"],
      ["Total Gross Revenue", activeRangeStats.revenue, statsOverview.lifetimeRevenue],
      ["Total Operating Expenses", activeRangeStats.expenses, statsOverview.lifetimeExpenses],
      ["Net Profit", activeRangeStats.netProfit, statsOverview.lifetimeNetProfit],
      ["Gross Profit Margin (%)", `${activeRangeStats.profitMargin.toFixed(2)}%`, `${statsOverview.lifetimeProfitMargin.toFixed(2)}%`],
      [],
      ["PERIODIC PROFIT INSIGHTS", "PROFIT / LOSS AMOUNT", ""],
      ["Daily Profit (Today)", statsOverview.profitToday, ""],
      ["Weekly Profit (This Week)", statsOverview.profitWeek, ""],
      ["Monthly Profit (This Month)", statsOverview.profitMonth, ""],
      ["Yearly Profit (This Year)", statsOverview.profitYear, ""]
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    
    // Stylize Sheet 1 cells
    wsSummary['!cols'] = [{ wch: 28 }, { wch: 28 }, { wch: 28 }];
    const rangeSummary = XLSX.utils.decode_range(wsSummary["!ref"] || "A1:C15");
    for (let R = rangeSummary.s.r; R <= rangeSummary.e.r; ++R) {
      for (let C = rangeSummary.s.c; C <= rangeSummary.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!wsSummary[addr]) continue;
        const cell = wsSummary[addr];
        cell.s = {
          font: { name: "Segoe UI", sz: 10, color: { rgb: "334155" } },
          alignment: { vertical: "center", horizontal: "left" },
          border: {
            top: { style: "thin", color: { rgb: "E2E8F0" } },
            bottom: { style: "thin", color: { rgb: "E2E8F0" } },
            left: { style: "thin", color: { rgb: "E2E8F0" } },
            right: { style: "thin", color: { rgb: "E2E8F0" } }
          }
        };

        if (R === 0) {
          cell.s.font.bold = true;
          cell.s.font.sz = 14;
          cell.s.font.color = { rgb: "0F172A" };
          cell.s.fill = { fgColor: { rgb: "F1F5F9" } };
        } else if (R === 4 || R === 10) {
          cell.s.font.bold = true;
          cell.s.font.color = { rgb: "1E3A8A" };
          cell.s.fill = { fgColor: { rgb: "DBEAFE" } };
        } else if (C > 0 && typeof cell.v === "number") {
          cell.z = "₱#,##0.00";
          cell.s.alignment.horizontal = "right";
        }
      }
    }
    XLSX.utils.book_append_sheet(wb, wsSummary, "Overview Summary");

    // Sheet 2: Revenue Invoices
    const flatRevenue = filteredInvoices.map(item => ({
      "Invoice Number": item.invoiceNo,
      "User Name": item.userName,
      "Email": item.userEmail,
      "Date": item.transactionDate.substring(0, 10),
      "Plan Purchased": item.plan,
      "Taxes Paid (12%)": item.taxes,
      "Total Amount Paid (PHP)": item.totalAmount,
      "Payment Method": item.paymentMethod,
      "Payment Status": item.paymentStatus,
      "Reference Number": item.paymentReference
    }));
    const wsRevenue = XLSX.utils.json_to_sheet(flatRevenue);
    wsRevenue['!cols'] = [
      { wch: 22 }, { wch: 18 }, { wch: 26 }, { wch: 12 }, { wch: 24 },
      { wch: 15 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(wb, wsRevenue, "Revenue Ledger");

    // Sheet 3: Expenses
    const flatExpenses = filteredExpenses.map(exp => ({
      "Expense Title": exp.title,
      "Category": EXPENSE_CATEGORIES.find(c => c.value === exp.category)?.label || exp.category,
      "Date": exp.date,
      "Amount Paid (PHP)": exp.amount,
      "Description / Details": exp.description || "N/A"
    }));
    const wsExpenses = XLSX.utils.json_to_sheet(flatExpenses);
    wsExpenses['!cols'] = [
      { wch: 24 }, { wch: 28 }, { wch: 12 }, { wch: 18 }, { wch: 38 }
    ];
    XLSX.utils.book_append_sheet(wb, wsExpenses, "Expenses Ledger");

    XLSX.writeFile(wb, `Profit_Analytics_Report_${new Date().toISOString().substring(0,10)}.xlsx`);
  };

  // 2. Export high-fidelity PDF Report using jsPDF
  const handleExportPDF = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const fFormat = (val: number) => {
      return "PHP " + Number(val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Style Swatches
    const PRIMARY_COLOR = [15, 23, 42]; 
    const ACCENT_COLOR = [245, 158, 11]; 
    const TEXT_MUTED = [100, 116, 139]; 
    const BG_LIGHT = [248, 250, 252]; 

    // Header Background
    doc.setFillColor(BG_LIGHT[0], BG_LIGHT[1], BG_LIGHT[2]);
    doc.rect(0, 0, 210, 48, 'F');

    // Accent line
    doc.setFillColor(ACCENT_COLOR[0], ACCENT_COLOR[1], ACCENT_COLOR[2]);
    doc.rect(15, 12, 1.5, 12, 'F');

    // Title Block
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
    doc.text("ELECTRICALPH", 20, 21);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    doc.text("ADMINISTRATOR FINANCIAL & PROFIT ANALYTICS REPORT", 20, 26);

    // Generation Info (Top Right)
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    doc.text(`Export Date: ${new Date().toLocaleDateString('en-US')}`, 145, 18);
    doc.text(`Active Filter: ${dateFilter.toUpperCase()}`, 145, 22);
    doc.text(`Generated By: Platform Administrator`, 145, 26);

    // Financial Metrics Section
    doc.setFillColor(BG_LIGHT[0], BG_LIGHT[1], BG_LIGHT[2]);
    doc.rect(15, 45, 180, 45, 'F');

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
    doc.text("FINANCIAL SUMMARY & MARGINS", 20, 52);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
    
    doc.text(`Total Gross Revenue:`, 20, 60);
    doc.text(fFormat(activeRangeStats.revenue), 75, 60);

    doc.text(`Total Operating Expenses:`, 20, 66);
    doc.text(fFormat(activeRangeStats.expenses), 75, 66);

    doc.setFont("Helvetica", "bold");
    doc.text(`Net Operating Profit:`, 20, 72);
    doc.text(fFormat(activeRangeStats.netProfit), 75, 72);

    doc.text(`Net Profit Margin:`, 20, 78);
    doc.text(`${activeRangeStats.profitMargin.toFixed(2)} %`, 75, 78);

    // Lifetime Performance Benchmarks
    doc.setFont("Helvetica", "bold");
    doc.text("LIFETIME METRICS", 115, 52);
    
    doc.setFont("Helvetica", "normal");
    doc.text(`Gross Revenue:`, 115, 60);
    doc.text(fFormat(statsOverview.lifetimeRevenue), 158, 60);

    doc.text(`Total Expenses:`, 115, 66);
    doc.text(fFormat(statsOverview.lifetimeExpenses), 158, 66);

    doc.setFont("Helvetica", "bold");
    doc.text(`Net Profit:`, 115, 72);
    doc.text(fFormat(statsOverview.lifetimeNetProfit), 158, 72);

    doc.text(`Margin:`, 115, 78);
    doc.text(`${statsOverview.lifetimeProfitMargin.toFixed(2)} %`, 158, 78);

    // Historical Period profit breakdowns
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.text("PERIODIC PROFIT INSIGHTS", 15, 100);

    // Grid details
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
    
    doc.text("Daily Profit (Today):", 15, 108);
    doc.text(fFormat(statsOverview.profitToday), 75, 108);

    doc.text("Weekly Profit (This Week):", 15, 114);
    doc.text(fFormat(statsOverview.profitWeek), 75, 114);

    doc.text("Monthly Profit (This Month):", 110, 108);
    doc.text(fFormat(statsOverview.profitMonth), 165, 108);

    doc.text("Yearly Profit (This Year):", 110, 114);
    doc.text(fFormat(statsOverview.profitYear), 165, 114);

    // Line separator
    doc.setDrawColor(226, 232, 240);
    doc.line(15, 120, 195, 120);

    // Merged Transactions Ledger
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.text("CHRONOLOGICAL LEDGER (REVENUE & EXPENSES)", 15, 128);

    // Table headers
    let y = 136;
    doc.setFillColor(15, 23, 42);
    doc.rect(15, y, 180, 6, 'F');
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text("DATE", 18, y + 4.5);
    doc.text("TRANSACTION DETAILS", 40, y + 4.5);
    doc.text("CATEGORY", 102, y + 4.5);
    doc.text("TYPE", 145, y + 4.5);
    doc.text("AMOUNT", 172, y + 4.5);

    doc.setFont("Helvetica", "normal");
    doc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);

    const txToShow = mergedTransactions.slice(0, 12);
    txToShow.forEach((tx) => {
      y += 7;
      if (y > 275) return; // limit to first page

      // Background alternating zebra rows
      doc.setFillColor(BG_LIGHT[0], BG_LIGHT[1], BG_LIGHT[2]);
      doc.rect(15, y, 180, 6.5, 'F');

      const dateStr = tx.date.substring(0, 10);
      doc.text(dateStr, 18, y + 4.5);

      const titleShort = tx.title.length > 32 ? tx.title.substring(0, 32) + "..." : tx.title;
      doc.text(titleShort, 40, y + 4.5);
      
      const catShort = tx.category.length > 22 ? tx.category.substring(0, 22) + "..." : tx.category;
      doc.text(catShort, 102, y + 4.5);

      if (tx.type === 'revenue') {
        doc.setFont("Helvetica", "bold");
        doc.setTextColor(16, 185, 129); // emerald Green
        doc.text("INCOME", 145, y + 4.5);
      } else {
        doc.setFont("Helvetica", "bold");
        doc.setTextColor(239, 68, 68); // Red
        doc.text("EXPENSE", 145, y + 4.5);
      }

      doc.setFont("Helvetica", "normal");
      doc.setTextColor(PRIMARY_COLOR[0], PRIMARY_COLOR[1], PRIMARY_COLOR[2]);
      doc.text(fPHP(tx.amount), 172, y + 4.5);
    });

    if (mergedTransactions.length > 12) {
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      doc.text(`* Showing first 12 records of ${mergedTransactions.length} total transactions in this period. See Excel sheets for full raw data logs.`, 15, y + 12);
    }

    doc.save(`Profit_Analytics_Report_${new Date().toISOString().substring(0,10)}.pdf`);
  };

  // 3. Export formal Word document report using docx
  const handleExportWord = async () => {
    const docxChildren: any[] = [];

    // Title Paragraph
    docxChildren.push(
      new Paragraph({
        text: "ELECTRICALPH Platform",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 120, after: 120 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "ADMINISTRATOR PROFIT & FINANCIAL ANALYTICS REPORT", bold: true, size: 28, color: "1E3A8A" })
        ],
        spacing: { after: 240 }
      })
    );

    // Meta Parameters
    docxChildren.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Report Date: `, bold: true }),
          new TextRun({ text: `${new Date().toLocaleDateString('en-US')} ` }),
          new TextRun({ text: `| Filter Period: `, bold: true }),
          new TextRun({ text: `${dateFilter.toUpperCase()} ` }),
          new TextRun({ text: `| Author: `, bold: true }),
          new TextRun({ text: `Platform Admin Service` })
        ],
        spacing: { after: 360 }
      })
    );

    // Financial Metrics Section Heading
    docxChildren.push(
      new Paragraph({
        text: "1. Period Performance & Profit Margins",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 }
      })
    );

    // Overview Table
    const tableHeader = new DocxTableRow({
      children: [
        new DocxTableCell({ width: { size: 40, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "Metric Indicator", bold: true })] })] }),
        new DocxTableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "Filtered Period Sum", bold: true })] })] }),
        new DocxTableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "Lifetime Accrued Sum", bold: true })] })] })
      ]
    });

    const formatCurrency = (val: number) => "PHP " + Number(val).toLocaleString('en-US', { minimumFractionDigits: 2 });

    const tableRows = [
      new DocxTableRow({
        children: [
          new DocxTableCell({ children: [new Paragraph({ text: "Total Gross Revenue" })] }),
          new DocxTableCell({ children: [new Paragraph({ text: formatCurrency(activeRangeStats.revenue) })] }),
          new DocxTableCell({ children: [new Paragraph({ text: formatCurrency(statsOverview.lifetimeRevenue) })] })
        ]
      }),
      new DocxTableRow({
        children: [
          new DocxTableCell({ children: [new Paragraph({ text: "Total Operating Expenses" })] }),
          new DocxTableCell({ children: [new Paragraph({ text: formatCurrency(activeRangeStats.expenses) })] }),
          new DocxTableCell({ children: [new Paragraph({ text: formatCurrency(statsOverview.lifetimeExpenses) })] })
        ]
      }),
      new DocxTableRow({
        children: [
          new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Net Operating Profit", bold: true })] })] }),
          new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(activeRangeStats.netProfit), bold: true })] })] }),
          new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(statsOverview.lifetimeNetProfit), bold: true })] })] })
        ]
      }),
      new DocxTableRow({
        children: [
          new DocxTableCell({ children: [new Paragraph({ text: "Profit Margin (%)" })] }),
          new DocxTableCell({ children: [new Paragraph({ text: `${activeRangeStats.profitMargin.toFixed(2)}%` })] }),
          new DocxTableCell({ children: [new Paragraph({ text: `${statsOverview.lifetimeProfitMargin.toFixed(2)}%` })] })
        ]
      })
    ];

    docxChildren.push(
      new DocxTable({
        rows: [tableHeader, ...tableRows],
        width: { size: 100, type: WidthType.PERCENTAGE }
      }),
      new Paragraph({ text: "", spacing: { after: 240 } })
    );

    // Periodic Profit Insights
    docxChildren.push(
      new Paragraph({
        text: "2. Periodic Profits Benchmarking",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 }
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `• Daily Profit (Today): `, bold: true }),
          new TextRun({ text: formatCurrency(statsOverview.profitToday) + "\n" }),
          new TextRun({ text: `• Weekly Profit (This Week): `, bold: true }),
          new TextRun({ text: formatCurrency(statsOverview.profitWeek) + "\n" }),
          new TextRun({ text: `• Monthly Profit (This Month): `, bold: true }),
          new TextRun({ text: formatCurrency(statsOverview.profitMonth) + "\n" }),
          new TextRun({ text: `• Yearly Profit (This Year): `, bold: true }),
          new TextRun({ text: formatCurrency(statsOverview.profitYear) })
        ],
        spacing: { after: 240 }
      })
    );

    // List of recent transactions
    docxChildren.push(
      new Paragraph({
        text: "3. Recent Transaction Logs Summary",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 }
      })
    );

    const txHeaders = new DocxTableRow({
      children: [
        new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Date", bold: true })] })] }),
        new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Description", bold: true })] })] }),
        new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Type", bold: true })] })] }),
        new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Amount", bold: true })] })] })
      ]
    });

    const txRows = mergedTransactions.slice(0, 20).map(tx => {
      return new DocxTableRow({
        children: [
          new DocxTableCell({ children: [new Paragraph({ text: tx.date.substring(0, 10) })] }),
          new DocxTableCell({ children: [new Paragraph({ text: tx.title })] }),
          new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: tx.type.toUpperCase(), bold: true, color: tx.type === 'revenue' ? "10B981" : "EF4444" })] })] }),
          new DocxTableCell({ children: [new Paragraph({ text: formatCurrency(tx.amount) })] })
        ]
      });
    });

    docxChildren.push(
      new DocxTable({
        rows: [txHeaders, ...txRows],
        width: { size: 100, type: WidthType.PERCENTAGE }
      })
    );

    // Build the doc
    const doc = new Document({
      sections: [{
        properties: {},
        children: docxChildren
      }]
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Profit_Analytics_Report_${new Date().toISOString().substring(0,10)}.docx`);
  };

  return (
    <div className="w-full font-sans text-slate-800 dark:text-slate-100" id="profit-dashboard-container">
      {/* Date Filters & Header Actions row */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-8">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-3">
            <span className="p-2.5 bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-2xl">
              <TrendingUp className="w-6 h-6" />
            </span>
            Profit & Financial Analytics
          </h2>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1.5 ml-1">
            Real-time tracking of user subscriptions, operation expenses, and profit margin statistics.
          </p>
        </div>

        {/* Filters and export actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-200/50 dark:border-slate-700/50">
            {PRESET_RANGES.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setDateFilter(preset.value)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  dateFilter === preset.value
                    ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowAddExpenseModal(true)}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl text-xs font-black flex items-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Log Expense
          </button>
        </div>
      </div>

      {/* Custom Range Inputs */}
      {dateFilter === "custom" && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-50 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-700/60 rounded-3xl p-5 mb-8 flex flex-wrap items-center gap-4"
        >
          <div className="flex items-center gap-3">
            <span className="text-xs font-black text-slate-400 uppercase tracking-wider">Start Date</span>
            <input 
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-700 dark:text-slate-300"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-black text-slate-400 uppercase tracking-wider">End Date</span>
            <input 
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-700 dark:text-slate-300"
            />
          </div>
          <p className="text-xs font-medium text-slate-400 italic">Showing data from {customStartDate || "start"} to {customEndDate || "now"}</p>
        </motion.div>
      )}

      {loading ? (
        <div className="w-full h-96 flex flex-col items-center justify-center gap-3 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xl">
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
          <p className="text-sm font-semibold text-slate-500">Loading financial ledger data...</p>
        </div>
      ) : (
        <>
          {/* TOP SUMMARY CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
            {/* Total Revenue */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-100/50 dark:shadow-none flex flex-col justify-between h-36">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Total Revenue</span>
                <span className="p-2 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <ArrowUpRight className="w-4 h-4" />
                </span>
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight leading-none">
                  {fPHP(activeRangeStats.revenue)}
                </h3>
                <p className="text-[11px] font-bold text-slate-500 mt-2">Active Filter Range Sum</p>
              </div>
            </div>

            {/* Total Expenses */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-100/50 dark:shadow-none flex flex-col justify-between h-36">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Total Expenses</span>
                <span className="p-2 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-xl">
                  <TrendingDown className="w-4 h-4" />
                </span>
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight leading-none">
                  {fPHP(activeRangeStats.expenses)}
                </h3>
                <p className="text-[11px] font-bold text-slate-500 mt-2">Manual + Cloud Outlays</p>
              </div>
            </div>

            {/* Net Profit */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-100/50 dark:shadow-none flex flex-col justify-between h-36 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[4px] bg-gradient-to-r from-emerald-500 to-teal-500" />
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Net Profit</span>
                <span className="p-2 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <PiggyBank className="w-4 h-4" />
                </span>
              </div>
              <div>
                <h3 className={`text-xl font-black tracking-tight leading-none ${activeRangeStats.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                  {fPHP(activeRangeStats.netProfit)}
                </h3>
                <p className="text-[11px] font-bold text-slate-500 mt-2">Revenue minus Expenses</p>
              </div>
            </div>

            {/* Gross Profit */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-100/50 dark:shadow-none flex flex-col justify-between h-36">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Gross Profit</span>
                <span className="p-2 bg-sky-50 dark:bg-sky-950/20 text-sky-600 dark:text-sky-400 rounded-xl">
                  <DollarSign className="w-4 h-4" />
                </span>
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight leading-none">
                  {fPHP(activeRangeStats.revenue)}
                </h3>
                <p className="text-[11px] font-bold text-slate-500 mt-2">Accrued Invoiced Value</p>
              </div>
            </div>

            {/* Profit Margin */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-100/50 dark:shadow-none flex flex-col justify-between h-36">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Profit Margin</span>
                <span className="p-2 bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 rounded-xl">
                  <LineChart className="w-4 h-4" />
                </span>
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight leading-none">
                  {activeRangeStats.profitMargin.toFixed(1)}%
                </h3>
                <p className="text-[11px] font-bold text-slate-500 mt-2">Margin Percentage</p>
              </div>
            </div>
          </div>

          {/* PERIODIC PROFIT SUMMARY ROW */}
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 rounded-3xl mb-8">
            <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
              Real-time Profit Benchmark Summary (Lifetime Periods)
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="border-r border-slate-200/50 dark:border-slate-800 pr-4">
                <p className="text-xs font-bold text-slate-400">Daily Profit (Today)</p>
                <p className={`text-lg font-black mt-1 ${statsOverview.profitToday >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                  {fPHP(statsOverview.profitToday)}
                </p>
              </div>
              <div className="border-r border-slate-200/50 dark:border-slate-800 pr-4">
                <p className="text-xs font-bold text-slate-400">Weekly Profit (This Week)</p>
                <p className={`text-lg font-black mt-1 ${statsOverview.profitWeek >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                  {fPHP(statsOverview.profitWeek)}
                </p>
              </div>
              <div className="border-r border-slate-200/50 dark:border-slate-800 pr-4">
                <p className="text-xs font-bold text-slate-400">Monthly Profit (This Month)</p>
                <p className={`text-lg font-black mt-1 ${statsOverview.profitMonth >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                  {fPHP(statsOverview.profitMonth)}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400">Yearly Profit (This Year)</p>
                <p className={`text-lg font-black mt-1 ${statsOverview.profitYear >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                  {fPHP(statsOverview.profitYear)}
                </p>
              </div>
            </div>
          </div>

          {/* VIEW TAB SELECTOR */}
          <div className="flex border-b border-slate-100 dark:border-slate-800 mb-8 gap-6">
            {[
              { id: 'overview', label: 'Financial Overview & Charts' },
              { id: 'expenses', label: 'Expenses Outlay Management' },
              { id: 'transactions', label: 'General Transaction Ledger' }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`pb-3 text-xs font-black transition-all relative cursor-pointer ${
                  activeTab === t.id
                    ? "text-slate-800 dark:text-slate-100"
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                }`}
              >
                {t.label}
                {activeTab === t.id && (
                  <motion.div 
                    layoutId="activeProfitTabLine" 
                    className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-emerald-500 rounded-full" 
                  />
                )}
              </button>
            ))}
          </div>

          {/* TAB CONTENTS */}
          <div className="space-y-8">
            {/* OVERVIEW & CHARTS TAB */}
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Revenue vs Expenses Trend Chart */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 tracking-tight">Revenue vs Profit Trend ({new Date().getFullYear()})</h3>
                      <p className="text-xs text-slate-400 mt-1">Accrued income vs calculated profit margin of current fiscal year.</p>
                    </div>
                  </div>
                  
                  <div className="w-full h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.5} />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: '#0f172a', 
                            borderRadius: '12px', 
                            border: 'none', 
                            color: '#fff',
                            fontSize: '11px',
                            fontWeight: 'bold'
                          }} 
                        />
                        <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                        <Area type="monotone" dataKey="Revenue" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRevenue)" name="Gross Revenue" />
                        <Area type="monotone" dataKey="Profit" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#colorProfit)" name="Net Profit" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Expense Breakdown Categories chart */}
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 tracking-tight">Operating Expense Breakdown</h3>
                    <p className="text-xs text-slate-400 mt-1">Expenses distributed by functional category for the filtered period.</p>
                  </div>

                  {categoryBreakdownData.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12">
                      <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-full text-slate-400">
                        <Info className="w-8 h-8" />
                      </div>
                      <p className="text-xs font-bold text-slate-400">No registered expenses in this range.</p>
                    </div>
                  ) : (
                    <div className="flex-1 py-4 flex flex-col justify-center">
                      <div className="space-y-4">
                        {categoryBreakdownData.map((cat, idx) => {
                          const percentage = activeRangeStats.expenses > 0 ? (cat.value / activeRangeStats.expenses) * 100 : 0;
                          return (
                            <div key={idx}>
                              <div className="flex justify-between items-center text-xs font-bold mb-1">
                                <span className="text-slate-600 dark:text-slate-300 truncate max-w-[160px]">{cat.name}</span>
                                <span className="text-slate-800 dark:text-slate-100 font-mono">{fPHP(cat.value)} ({percentage.toFixed(1)}%)</span>
                              </div>
                              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                                <div 
                                  className="h-full rounded-full transition-all duration-500" 
                                  style={{ backgroundColor: cat.color, width: `${percentage}%` }} 
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-slate-100 dark:border-slate-800 pt-4 mt-2 flex justify-between items-center text-xs font-black">
                    <span className="text-slate-400 uppercase tracking-wider text-[10px]">Total Expenses Out</span>
                    <span className="text-rose-600 dark:text-rose-400 font-mono">{fPHP(activeRangeStats.expenses)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* EXPENSES MANAGEMENT TAB */}
            {activeTab === 'expenses' && (
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-xl">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                  <div>
                    <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 tracking-tight">Platform Operating Outlays</h3>
                    <p className="text-xs text-slate-400 mt-1">Manage, record, or delete custom hosting, development, advertising, and compliance outlays.</p>
                  </div>
                  <button
                    onClick={() => setShowAddExpenseModal(true)}
                    className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow"
                  >
                    <Plus className="w-4 h-4" />
                    Record New Outlay
                  </button>
                </div>

                {filteredExpenses.length === 0 ? (
                  <div className="w-full py-16 flex flex-col items-center justify-center gap-4 text-center">
                    <div className="p-4 bg-rose-50 dark:bg-rose-950/20 text-rose-500 rounded-full">
                      <AlertCircle className="w-10 h-10" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">No Expense Outlays Found</h4>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm">No operational expense reports match the active filters or dates. Create one by clicking Record Outlay.</p>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase tracking-wider font-extrabold text-[10px]">
                          <th className="py-3 px-4">OUTLAY DETAILS</th>
                          <th className="py-3 px-4">CATEGORY</th>
                          <th className="py-3 px-4">DATE</th>
                          <th className="py-3 px-4 text-right">AMOUNT</th>
                          <th className="py-3 px-4 text-right">ACTION</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredExpenses.map((exp) => {
                          const catObj = EXPENSE_CATEGORIES.find(c => c.value === exp.category);
                          return (
                            <tr key={exp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all">
                              <td className="py-4 px-4 font-bold">
                                <div>
                                  <p className="text-slate-800 dark:text-slate-200">{exp.title}</p>
                                  {exp.description && <p className="text-[11px] text-slate-400 mt-0.5 font-medium">{exp.description}</p>}
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black border" style={{ borderColor: `${catObj?.color || '#cbd5e1'}30`, backgroundColor: `${catObj?.color || '#cbd5e1'}12`, color: catObj?.color || '#64748b' }}>
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: catObj?.color || '#64748b' }} />
                                  {catObj?.label || exp.category}
                                </span>
                              </td>
                              <td className="py-4 px-4 font-medium text-slate-500 font-mono">
                                {new Date(exp.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                              </td>
                              <td className="py-4 px-4 text-right font-black text-rose-600 dark:text-rose-400 font-mono">
                                - {fPHP(exp.amount)}
                              </td>
                              <td className="py-4 px-4 text-right">
                                <button
                                  onClick={() => handleDeleteExpense(exp.id)}
                                  className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg transition-all cursor-pointer"
                                  title="Delete outlay record"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* GENERAL TRANSACTIONS LEDGER TAB */}
            {activeTab === 'transactions' && (
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-xl">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                  <div>
                    <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 tracking-tight">Accrued Invoices & Expense Outlays</h3>
                    <p className="text-xs text-slate-400 mt-1">Chronological directory of incoming subscription revenues and outgoing business expenses.</p>
                  </div>
                  <span className="text-[10px] font-black font-mono text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200/40 dark:border-slate-700/40">
                    MATCHED ENTRIES: {mergedTransactions.length}
                  </span>
                </div>

                {mergedTransactions.length === 0 ? (
                  <div className="w-full py-16 flex flex-col items-center justify-center gap-4 text-center">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-full">
                      <Clock className="w-10 h-10" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">No Transactions in Range</h4>
                      <p className="text-xs text-slate-400 mt-1">Try selecting a broader date filter preset or adjusting custom ranges.</p>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase tracking-wider font-extrabold text-[10px]">
                          <th className="py-3 px-4">TRANSACTION DATE</th>
                          <th className="py-3 px-4">TRANSACTION DETAILS</th>
                          <th className="py-3 px-4">CATEGORY</th>
                          <th className="py-3 px-4">METHOD / REFERENCE</th>
                          <th className="py-3 px-4 text-right">AMOUNT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {mergedTransactions.map((tx, idx) => (
                          <tr key={tx.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all">
                            <td className="py-4 px-4 font-medium text-slate-500 font-mono">
                              {new Date(tx.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                            </td>
                            <td className="py-4 px-4">
                              <div>
                                <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider mr-2 ${tx.type === 'revenue' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'}`}>
                                  {tx.type === 'revenue' ? 'REV' : 'EXP'}
                                </span>
                                <span className="font-black text-slate-800 dark:text-slate-200">{tx.title}</span>
                                {tx.email && <p className="text-[10px] text-slate-400 mt-0.5 font-semibold font-sans">{tx.email}</p>}
                              </div>
                            </td>
                            <td className="py-4 px-4 font-bold text-slate-500">
                              {tx.category}
                            </td>
                            <td className="py-4 px-4 font-medium text-slate-400">
                              <p className="font-semibold text-slate-600 dark:text-slate-300">{tx.method}</p>
                              <p className="text-[10px] font-mono mt-0.5">{tx.reference}</p>
                            </td>
                            <td className={`py-4 px-4 text-right font-black font-mono text-sm ${tx.type === 'revenue' ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {tx.type === 'revenue' ? `+ ${fPHP(tx.amount)}` : `- ${fPHP(tx.amount)}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* REPORT EXPORT ACTIONS FOOTER BLOCK */}
          <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Export Financial Statements</p>
              <p className="text-[11px] text-slate-500 mt-1">Export transaction schedules, profit margins, and tax-scenarios for local accounting and audits.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleExportExcel}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow transition-all cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Export Excel Sheet
              </button>
              <button
                onClick={handleExportPDF}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow transition-all cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                Export PDF Report
              </button>
              <button
                onClick={handleExportWord}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-black flex items-center gap-2 shadow transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Export Word Document
              </button>
            </div>
          </div>
        </>
      )}

      {/* RECORD NEW OUTLAY MODAL */}
      <AnimatePresence>
        {showAddExpenseModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddExpenseModal(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />

            {/* Modal Body */}
            <motion.div 
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-8 rounded-3xl shadow-2xl z-10 font-sans"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
                <Tag className="w-5 h-5 text-rose-500 animate-pulse-slow" />
                Record Operation Expense
              </h3>
              <p className="text-xs text-slate-400 mt-1.5">Enter details of the operating cost incurred. This will instantly deduct from accrued gross revenue.</p>

              {formError && (
                <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200/50 rounded-xl text-xs font-bold text-rose-600 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleAddExpense} className="mt-6 space-y-4">
                {/* Title */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Outlay Title / Vendor</label>
                  <input
                    type="text"
                    required
                    value={expenseForm.title}
                    onChange={(e) => setExpenseForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g., Cloud Run Container Cluster hosting"
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 rounded-xl text-xs font-bold focus:outline-none text-slate-800 dark:text-slate-200"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Amount */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Amount Paid (PHP)</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={expenseForm.amount}
                      onChange={(e) => setExpenseForm(prev => ({ ...prev, amount: e.target.value }))}
                      placeholder="e.g., 2500"
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 rounded-xl text-xs font-bold focus:outline-none text-slate-800 dark:text-slate-200"
                    />
                  </div>

                  {/* Date */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Outlay Date</label>
                    <input
                      type="date"
                      required
                      value={expenseForm.date}
                      onChange={(e) => setExpenseForm(prev => ({ ...prev, date: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 rounded-xl text-xs font-bold focus:outline-none text-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>

                {/* Category */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Functional Category</label>
                  <select
                    value={expenseForm.category}
                    onChange={(e) => setExpenseForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 rounded-xl text-xs font-bold focus:outline-none text-slate-700 dark:text-slate-300"
                  >
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Outlay Memo / Description</label>
                  <textarea
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Optional details, invoice references or receipt details..."
                    rows={3}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 rounded-xl text-xs font-bold focus:outline-none text-slate-800 dark:text-slate-200"
                  />
                </div>

                {/* Footer Buttons */}
                <div className="pt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddExpenseModal(false)}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingExpense}
                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow transition-all"
                  >
                    {submittingExpense ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving Outlay...
                      </>
                    ) : (
                      <>
                        Record Outlay
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
