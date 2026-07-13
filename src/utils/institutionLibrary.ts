export const INSTITUTION_LIBRARY: Record<string, string[]> = {
  Residential: [
    "Single Detached House",
    "Duplex",
    "Townhouse",
    "Apartment",
    "Condominium",
    "Residential Building",
    "Dormitory",
    "Mixed Residential",
    "Custom..."
  ],
  Commercial: [
    "Office Building",
    "Shopping Mall",
    "Retail Store",
    "Supermarket",
    "Hotel",
    "Restaurant",
    "Warehouse",
    "Bank",
    "Gas Station",
    "Commercial Building",
    "Mixed Commercial",
    "Custom..."
  ],
  Industrial: [
    "Manufacturing Plant",
    "Processing Plant",
    "Factory",
    "Warehouse Facility",
    "Power Plant",
    "Water Treatment Plant",
    "Wastewater Treatment Plant",
    "Mining Facility",
    "Industrial Complex",
    "Processing Facility",
    "Custom..."
  ]
};

export const getInstitutionsForType = (projectType?: string): string[] => {
  if (!projectType) return [];
  return INSTITUTION_LIBRARY[projectType] || [];
};
