import {
  SolarDesignConfig,
  SolarCalculationResults,
  SolarQuotationConfig,
  SolarQuotationItem,
  SolarQuotationScopeItem,
} from "../types/solar";
import { generateSolarBOM } from "./solarEngine";

/**
 * Standard Scope of Work Checklist for Solar EPC & Contractor Installations
 */
export const DEFAULT_SOLAR_SCOPE_ITEMS: SolarQuotationScopeItem[] = [
  {
    id: "scope-1",
    title: "Engineering & System Design",
    description: "Detailed system sizing, PV array layout, string calculation, single line diagram (SLD), and Philippine Electrical Code (PEC 2017 Art 6.90) compliance dossier.",
    included: true,
  },
  {
    id: "scope-2",
    title: "Supply & Delivery of Major Equipment",
    description: "Supply and on-site delivery of Tier-1 certified PV modules, grid-tie/hybrid inverters, and certified DC/AC balance of system components.",
    included: true,
  },
  {
    id: "scope-3",
    title: "Civil & Structural Mounting System",
    description: "Supply and installation of corrosion-resistant anodized aluminum mounting rails, stainless steel mid/end clamps, L-feet/hanger bolts with watertight EPDM roof flashings.",
    included: true,
  },
  {
    id: "scope-4",
    title: "DC Electrical Installation",
    description: "Supply and installation of 1000V/1500V UV-resistant PV wire homeruns, heavy-duty uPVC/EMT raceways, string combiner boxes with gPV fuses, and rotary DC isolator disconnects.",
    included: true,
  },
  {
    id: "scope-5",
    title: "AC Electrical & Protection Integration",
    description: "Supply and installation of inverter AC output cabling, molded case circuit breaker (MCCB) backfeed protection, and lockable visible-blade external safety switch adjacent to metering.",
    included: true,
  },
  {
    id: "scope-6",
    title: "System Grounding & Bonding",
    description: "Installation of dedicated copper-clad ground electrode rod (16mm dia x 2.4m) and green THHN equipment grounding conductors (EGC) for module frames, mounting rails, and inverter chassis.",
    included: true,
  },
  {
    id: "scope-7",
    title: "Testing, Commissioning & Energization",
    description: "Conducting pre-energization open-circuit voltage (Voc) verification, string short-circuit current (Isc) test, megger insulation resistance check, and cloud monitoring portal configuration.",
    included: true,
  },
  {
    id: "scope-8",
    title: "Net-Metering Documentation & Utility Assistance",
    description: "Preparation of signed and sealed electrical as-built plans and technical documents for Distribution Utility (DU / Meralco) Net-Metering interconnection application.",
    included: true,
  },
];

export const DEFAULT_INCLUSIONS: string[] = [
  "Turnkey supply and delivery of all listed photovoltaic modules, inverters, and balance of system components.",
  "Complete mechanical mounting, racking, clamp installation, and watertight roof penetrations.",
  "Complete electrical wiring from PV array to inverter and inverter to customer main distribution panelboard (MDP).",
  "Dedicated system grounding electrode and equipment bonding complying with PEC 2017 Article 2.50.",
  "Pre-commissioning testing: Voc, Isc, Polarity, and Insulation Resistance checks.",
  "Wi-Fi / Ethernet real-time mobile and web solar generation cloud monitoring setup.",
  "Turnover of comprehensive O&M manual, equipment manufacturer warranties, and as-built single line diagram.",
];

export const DEFAULT_EXCLUSIONS: string[] = [
  "Roof civil repairs, roof sheet replacement, or structural reinforcing of building framing (unless specified).",
  "Distribution utility official fees, bi-directional meter deposit, or external grid interconnection charges by DU/Meralco.",
  "Tree trimming, landscape clearing, or physical building modifications outside the immediate solar array footprint.",
  "High-voltage transformer upgrades or primary service entrance capacity expansion by utility.",
  "Internet service provider subscription fees or local LAN network hardware cabling to router.",
];

export const DEFAULT_TERMS_AND_CONDITIONS: string[] = [
  "Validity: This quotation proposal is valid for 30 calendar days from the proposal date, subject to equipment market availability.",
  "Payment Milestone Schedule: 30% Downpayment upon contract signing; 50% Progress payment upon delivery of modules & inverters to site; 20% Final payment upon complete installation, testing, and system commissioning.",
  "Project Timeline: Expected physical execution duration is 15 to 30 working days from receipt of downpayment, material delivery, and site turnover.",
  "Warranty Coverage: 25-Year Linear Power Performance Warranty for Solar Modules; 5-Year Standard Manufacturer Warranty for Inverters; 1-Year Comprehensive Workmanship & Service Warranty by Contractor.",
  "Site Access & Safety: Client shall provide unimpeded access to the installation area, roof access point, electrical rooms, and utility power for testing.",
  "Change Orders: Any customer-requested modifications, additions to equipment scope, or unforeseen site structural obstacles will be billed via mutual written change order.",
];

/**
 * Converts BOM items into editable Quotation line items with selling prices
 */
export function convertBOMToQuotationItems(
  config: SolarDesignConfig,
  calc: SolarCalculationResults
): SolarQuotationItem[] {
  const bomList =
    config.bomItems && config.bomItems.length > 0
      ? config.bomItems
      : generateSolarBOM(config, calc);

  return bomList.map((item, idx) => {
    const unitCost = typeof item.unitCostPhp === "number" ? item.unitCostPhp : Number(item.unitCostPhp) || 0;
    const markup = typeof item.markupPercent === "number" ? item.markupPercent : Number(item.markupPercent) || 15;
    const sellingPrice = Math.round(unitCost * (1 + markup / 100));
    const qty = typeof item.quantity === "number" ? item.quantity : Number(item.quantity) || 1;
    const totalCost = Math.round(qty * sellingPrice);

    return {
      id: item.id || `quote-item-${idx + 1}-${Date.now()}`,
      category: item.category || "General",
      itemDescription: item.itemDescription || "Solar Equipment",
      manufacturer: item.manufacturer || "Standard",
      model: item.model || "N/A",
      quantity: qty,
      unit: item.unit || "pcs",
      unitCostPhp: unitCost,
      markupPercent: markup,
      sellingPricePhp: sellingPrice,
      laborCostPhp: 0,
      discountPhp: 0,
      totalCostPhp: totalCost,
    };
  });
}

/**
 * Generates an initial or refreshed Solar Quotation / Proposal configuration
 */
export function generateDefaultSolarQuotation(
  config: SolarDesignConfig,
  calc: SolarCalculationResults,
  projectInfo?: {
    projectName?: string;
    projectLocation?: string;
    clientName?: string;
    designerName?: string;
  }
): SolarQuotationConfig {
  const today = new Date();
  const validUntil = new Date(today);
  validUntil.setDate(today.getDate() + 30);

  const year = today.getFullYear();
  const randNum = Math.floor(100 + Math.random() * 900);
  const quotationNumber = `EP-SOLAR-${year}-${randNum}`;

  const items = convertBOMToQuotationItems(config, calc);

  // Suggested baseline installation and services based on system capacity
  const capacityKwp = calc.totalDcCapacityKwp || 5;
  const engineeringFee = Math.max(8000, Math.round(capacityKwp * 1200));
  const laborCost = Math.max(15000, Math.round(capacityKwp * 2500));
  const commissioningCost = Math.max(5000, Math.round(capacityKwp * 800));
  const mobilizationCost = Math.max(4000, Math.round(capacityKwp * 500));

  const resolvedProjectName =
    projectInfo?.projectName || config.projectName || "Solar PV Installation";
  const resolvedLocation =
    projectInfo?.projectLocation || config.projectLocation || "Philippines";
  const resolvedClient =
    projectInfo?.clientName || config.clientName || "Valued Client";
  const resolvedDesigner =
    projectInfo?.designerName || config.designerName || "Lead Electrical Engineer";

  return {
    quotationNumber,
    revision: "Rev. 00",
    quotationDate: today.toISOString().split("T")[0],
    validUntilDate: validUntil.toISOString().split("T")[0],

    clientName: resolvedClient,
    clientCompany: "",
    clientAddress: resolvedLocation,
    contactPerson: resolvedClient,
    contactPhone: "",
    contactEmail: "",

    preparedBy: resolvedDesigner,
    preparedByTitle: "Solar EPC Project Engineer",
    preparedByCompany: "ElectricalPH Engineering Solutions",
    preparedByPhone: "+63 (02) 8800-SOLAR",
    preparedByEmail: "engineering@electricalph.com",
    preparedByAddress: "Metro Manila, Philippines",
    checkedBy: "Professional Electrical Engineer (PEE)",
    checkedByTitle: "Licensed PEE (PRC Reg. No. 00000)",

    paymentTerms: "30% Downpayment • 50% Delivery Milestone • 20% Commissioning & Handover",
    projectDuration: "15 to 30 Working Days upon receipt of downpayment and site readiness",
    warrantyTerms: "25-Yr PV Module Performance • 5-Yr Inverter • 10-Yr Mounting • 1-Yr Workmanship",
    inclusions: [...DEFAULT_INCLUSIONS],
    exclusions: [...DEFAULT_EXCLUSIONS],
    termsAndConditions: [...DEFAULT_TERMS_AND_CONDITIONS],
    generalNotes: `Turnkey Solar Photovoltaic EPC Proposal for ${resolvedProjectName}. Compliant with PEC 2017 Article 6.90, Republic Act 9513, and ERC Net-Metering rules.`,

    scopeOfWork: [...DEFAULT_SOLAR_SCOPE_ITEMS],
    items,
    pricingDisplayMode: "detailed",
    submissionMode: "client",

    engineeringDesignFeePhp: engineeringFee,
    installationLaborCostPhp: laborCost,
    testingCommissioningCostPhp: commissioningCost,
    permittingUtilityFeePhp: 0,
    mobilizationDeliveryPhp: mobilizationCost,
    otherChargesPhp: 0,
    discountPhp: 0,
    taxRatePercent: 0,
    applyTax: false,

    history: [
      {
        revision: "Rev. 00",
        date: today.toISOString().split("T")[0],
        totalAmountPhp: 0, // will be calculated below
        savedBy: resolvedDesigner,
        notes: "Initial Proposal Generation",
      },
    ],
  };
}

export interface QuotationFinancialSummary {
  materialsSubtotalPhp: number;
  lineItemsLaborPhp: number;
  generalLaborPhp: number;
  totalLaborPhp: number;
  engineeringDesignFeePhp: number;
  testingCommissioningCostPhp: number;
  permittingUtilityFeePhp: number;
  mobilizationDeliveryPhp: number;
  otherChargesPhp: number;
  grossProjectCostPhp: number;
  discountAmountPhp: number;
  netBeforeTaxPhp: number;
  taxAmountPhp: number;
  grandTotalContractPricePhp: number;
  costPerWattDcPhp: number;
}

/**
 * Calculates comprehensive financial breakdown for a solar quotation
 */
export function calculateQuotationTotals(
  quote: SolarQuotationConfig,
  calc: SolarCalculationResults
): QuotationFinancialSummary {
  let materialsSubtotal = 0;
  let lineItemsLabor = 0;

  quote.items.forEach((item) => {
    const qty = typeof item.quantity === "number" ? item.quantity : Number(item.quantity) || 1;
    const sellPrice =
      typeof item.sellingPricePhp === "number"
        ? item.sellingPricePhp
        : Math.round((Number(item.unitCostPhp) || 0) * (1 + (Number(item.markupPercent) || 0) / 100));
    const itemTotal = qty * sellPrice;
    materialsSubtotal += itemTotal;
    lineItemsLabor += Number(item.laborCostPhp) || 0;
  });

  const generalLabor = Number(quote.installationLaborCostPhp) || 0;
  const totalLabor = lineItemsLabor + generalLabor;
  const engineering = Number(quote.engineeringDesignFeePhp) || 0;
  const testing = Number(quote.testingCommissioningCostPhp) || 0;
  const permitting = Number(quote.permittingUtilityFeePhp) || 0;
  const mobilization = Number(quote.mobilizationDeliveryPhp) || 0;
  const other = Number(quote.otherChargesPhp) || 0;
  const discount = Number(quote.discountPhp) || 0;

  const grossProjectCost =
    materialsSubtotal + totalLabor + engineering + testing + permitting + mobilization + other;

  const netBeforeTax = Math.max(0, grossProjectCost - discount);

  const taxAmount = quote.applyTax
    ? Math.round(netBeforeTax * ((Number(quote.taxRatePercent) || 0) / 100))
    : 0;

  const grandTotalContractPrice = netBeforeTax + taxAmount;

  const costPerWatt =
    calc.totalDcCapacityW > 0
      ? Number((grandTotalContractPrice / calc.totalDcCapacityW).toFixed(2))
      : 0;

  return {
    materialsSubtotalPhp: materialsSubtotal,
    lineItemsLaborPhp: lineItemsLabor,
    generalLaborPhp: generalLabor,
    totalLaborPhp: totalLabor,
    engineeringDesignFeePhp: engineering,
    testingCommissioningCostPhp: testing,
    permittingUtilityFeePhp: permitting,
    mobilizationDeliveryPhp: mobilization,
    otherChargesPhp: other,
    grossProjectCostPhp: grossProjectCost,
    discountAmountPhp: discount,
    netBeforeTaxPhp: netBeforeTax,
    taxAmountPhp: taxAmount,
    grandTotalContractPricePhp: grandTotalContractPrice,
    costPerWattDcPhp: costPerWatt,
  };
}

/**
 * Re-synchronizes quotation items with latest Solar BOM items while preserving custom price adjustments
 */
export function syncQuotationWithBOM(
  quote: SolarQuotationConfig,
  config: SolarDesignConfig,
  calc: SolarCalculationResults
): SolarQuotationConfig {
  const freshItems = convertBOMToQuotationItems(config, calc);

  // Preserve user overrides for items that already existed
  const existingMap = new Map<string, SolarQuotationItem>();
  quote.items.forEach((it) => {
    existingMap.set(it.itemDescription.toLowerCase().trim(), it);
  });

  const mergedItems = freshItems.map((fItem) => {
    const match = existingMap.get(fItem.itemDescription.toLowerCase().trim());
    if (match) {
      return {
        ...fItem,
        unitCostPhp: match.unitCostPhp !== undefined ? match.unitCostPhp : fItem.unitCostPhp,
        markupPercent: match.markupPercent !== undefined ? match.markupPercent : fItem.markupPercent,
        sellingPricePhp: match.sellingPricePhp !== undefined ? match.sellingPricePhp : fItem.sellingPricePhp,
        laborCostPhp: match.laborCostPhp || 0,
        discountPhp: match.discountPhp || 0,
        totalCostPhp:
          fItem.quantity * (match.sellingPricePhp || fItem.sellingPricePhp) +
          (match.laborCostPhp || 0) -
          (match.discountPhp || 0),
      };
    }
    return fItem;
  });

  return {
    ...quote,
    items: mergedItems,
  };
}

/**
 * Increments quotation revision number (e.g. Rev. 00 -> Rev. 01)
 */
export function incrementQuotationRevision(quote: SolarQuotationConfig): SolarQuotationConfig {
  const match = quote.revision.match(/Rev\.?\s*(\d+)/i);
  let nextNum = 1;
  if (match && match[1]) {
    nextNum = parseInt(match[1], 10) + 1;
  }
  const nextRev = `Rev. ${String(nextNum).padStart(2, "0")}`;
  const today = new Date().toISOString().split("T")[0];

  const currentSummary = calculateQuotationTotals(quote, {
    totalDcCapacityW: 1000,
  } as any);

  const updatedHistory = [
    ...(quote.history || []),
    {
      revision: nextRev,
      date: today,
      totalAmountPhp: currentSummary.grandTotalContractPricePhp,
      savedBy: quote.preparedBy || "Engineer",
      notes: `Updated to ${nextRev}`,
    },
  ];

  return {
    ...quote,
    revision: nextRev,
    quotationDate: today,
    history: updatedHistory,
  };
}
