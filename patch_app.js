const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const target1 = `        const grandTotalCost = bomItems.reduce((sum: number, item: any) => sum + (item.quantity * item.unitCost), 0);
        const totalRow = [
          "GRAND TOTAL", "", "", "", "", "", "", "", grandTotalCost, ""
        ];

        const bomWsData = [
          ["BILL OF MATERIALS (BOM) TAKEOFF REPORT"],
          [\`Project Designation: \${panel.designation || "Project"}\`, "", "", "", "", "", "", "", "", \`Generated on: \${new Date().toLocaleDateString()}\`],
          [""],
          bomHeaders,
          ...bomRows,
          [""], // Spacer
          totalRow
        ];`;

const replacement1 = `        const grandTotalCost = bomItems.reduce((sum: number, item: any) => sum + (item.quantity * item.unitCost), 0);
        const totalRow = [
          "MATERIALS TOTAL", "", "", "", "", "", "", "", grandTotalCost, ""
        ];

        // Cost calculations
        const laborRatePercent = bomSettings?.laborRatePercent ?? 35;
        const taxRatePercent = bomSettings?.taxRatePercent ?? 12;
        const profitMarginPercent = bomSettings?.profitMarginPercent ?? 15;
        const contingencyPercent = bomSettings?.contingencyPercent ?? 5;

        let materialsSum = 0;
        let laborSum = 0;
        bomItems.forEach((item: any) => {
          materialsSum += item.quantity * item.unitCost;
          laborSum += item.quantity * (item.laborCostPerUnit || (item.unitCost * (laborRatePercent / 100)));
        });

        const subtotal = materialsSum + laborSum;
        const contingencyAmount = subtotal * (contingencyPercent / 100);
        const profitAmount = subtotal * (profitMarginPercent / 100);
        const taxableSubtotal = subtotal + contingencyAmount + profitAmount;
        const taxAmount = taxableSubtotal * (taxRatePercent / 100);
        const grandTotal = taxableSubtotal + taxAmount;

        const bomWsData = [
          ["BILL OF MATERIALS (BOM) TAKEOFF REPORT"],
          [\`Project Designation: \${panel.designation || "Project"}\`, "", "", "", "", "", "", "", "", \`Generated on: \${new Date().toLocaleDateString()}\`],
          [""],
          bomHeaders,
          ...bomRows,
          [""], // Spacer
          totalRow,
          [""], // Spacer
          ["COST ESTIMATES & ANALYTICS", "", "", "", "", "", "", "", "", ""],
          ["", "", "", "", "", "", "", "Total Materials", materialsSum, ""],
          ["", "", "", "", "", "", "", "Labor Estimation", laborSum, ""],
          ["", "", "", "", "", "", "", "Subtotal", subtotal, ""],
          ["", "", "", "", "", "", "", "Contingency", contingencyAmount, ""],
          ["", "", "", "", "", "", "", "Profit Margin", profitAmount, ""],
          ["", "", "", "", "", "", "", "Taxable Subtotal", taxableSubtotal, ""],
          ["", "", "", "", "", "", "", "Taxes / VAT", taxAmount, ""],
          ["", "", "", "", "", "", "", "GRAND PROFESSIONAL TOTAL", grandTotal, ""]
        ];`;

code = code.replace(target1, replacement1);

const target2 = `        const grandTotalValueStyle = {
          font: { name: "Segoe UI", sz: 12, bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "1E293B" } },
          alignment: { horizontal: "right", vertical: "center" },
          numFmt: "₱#,##0.00",
          border: {
            top: { style: "medium", color: { rgb: "000000" } },
            bottom: { style: "medium", color: { rgb: "000000" } }
          }
        };

        // Apply styles to cells
        const rangeBom = XLSX.utils.decode_range(wsBom["!ref"] || "A1:A1");
        for (let R = rangeBom.s.r; R <= rangeBom.e.r; ++R) {
          for (let C = rangeBom.s.c; C <= rangeBom.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            if (!wsBom[cellAddress]) continue;

            if (R === 0) {
              wsBom[cellAddress].s = titleStyle;
            } else if (R === 1) {
              wsBom[cellAddress].s = subtitleStyle;
            } else if (R === 3) {
              wsBom[cellAddress].s = headerStyle;
            } else if (R === rangeBom.e.r) {
              // Grand Total row
              if (C === 8) {
                wsBom[cellAddress].s = grandTotalValueStyle;
              } else {
                wsBom[cellAddress].s = grandTotalLabelStyle;
              }
            } else if (R === rangeBom.e.r - 1) {
              // Spacer row
            } else if (R > 3) {
              if (C === 7 || C === 8) {
                wsBom[cellAddress].s = costStyle;
              } else if (C === 5) {
                wsBom[cellAddress].s = qtyStyle;
              } else {
                wsBom[cellAddress].s = cellStyle;
              }
            }
          }
        }

        // Merge cells for title and grand total
        if (!wsBom["!merges"]) wsBom["!merges"] = [];
        wsBom["!merges"].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } });
        wsBom["!merges"].push({ s: { r: rangeBom.e.r, c: 0 }, e: { r: rangeBom.e.r, c: 7 } }); // Merge Grand Total label`;

const replacement2 = `        const grandTotalValueStyle = {
          font: { name: "Segoe UI", sz: 12, bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "1E293B" } },
          alignment: { horizontal: "right", vertical: "center" },
          numFmt: "₱#,##0.00",
          border: {
            top: { style: "medium", color: { rgb: "000000" } },
            bottom: { style: "medium", color: { rgb: "000000" } }
          }
        };

        const analyticsSectionTitleStyle = {
          font: { name: "Segoe UI", sz: 14, bold: true, color: { rgb: "1E293B" } },
          alignment: { horizontal: "left", vertical: "center" }
        };

        const analyticsLabelStyle = {
          font: { name: "Segoe UI", sz: 10, bold: true, color: { rgb: "334155" } },
          alignment: { horizontal: "right", vertical: "center" }
        };
        
        const analyticsValueStyle = {
          font: { name: "Segoe UI", sz: 10, bold: true, color: { rgb: "334155" } },
          alignment: { horizontal: "right", vertical: "center" },
          numFmt: "₱#,##0.00",
        };
        
        const analyticsSubtotalLabelStyle = {
          font: { name: "Segoe UI", sz: 11, bold: true, color: { rgb: "0F172A" } },
          fill: { fgColor: { rgb: "F1F5F9" } },
          alignment: { horizontal: "right", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "E2E8F0" } },
            bottom: { style: "thin", color: { rgb: "E2E8F0" } }
          }
        };
        
        const analyticsSubtotalValueStyle = {
          font: { name: "Segoe UI", sz: 11, bold: true, color: { rgb: "0F172A" } },
          fill: { fgColor: { rgb: "F1F5F9" } },
          alignment: { horizontal: "right", vertical: "center" },
          numFmt: "₱#,##0.00",
          border: {
            top: { style: "thin", color: { rgb: "E2E8F0" } },
            bottom: { style: "thin", color: { rgb: "E2E8F0" } }
          }
        };

        // Apply styles to cells
        const rangeBom = XLSX.utils.decode_range(wsBom["!ref"] || "A1:A1");
        const materialsTotalRowIndex = bomRows.length + 5;
        const analyticsHeaderRowIndex = bomRows.length + 7;
        const subtotalRowIndex = analyticsHeaderRowIndex + 3;
        const taxableSubtotalRowIndex = analyticsHeaderRowIndex + 6;

        for (let R = rangeBom.s.r; R <= rangeBom.e.r; ++R) {
          for (let C = rangeBom.s.c; C <= rangeBom.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            if (!wsBom[cellAddress]) continue;

            if (R === 0) {
              wsBom[cellAddress].s = titleStyle;
            } else if (R === 1) {
              wsBom[cellAddress].s = subtitleStyle;
            } else if (R === 3) {
              wsBom[cellAddress].s = headerStyle;
            } else if (R === materialsTotalRowIndex) {
              // Materials Total row
              if (C === 8) {
                wsBom[cellAddress].s = grandTotalValueStyle;
              } else {
                wsBom[cellAddress].s = grandTotalLabelStyle;
              }
            } else if (R === analyticsHeaderRowIndex) {
              wsBom[cellAddress].s = analyticsSectionTitleStyle;
            } else if (R === rangeBom.e.r) {
              // Grand Professional Total row
              if (C === 8) {
                wsBom[cellAddress].s = grandTotalValueStyle;
              } else {
                if (C >= 7) wsBom[cellAddress].s = grandTotalLabelStyle;
              }
            } else if (R === subtotalRowIndex || R === taxableSubtotalRowIndex) {
               if (C === 8) {
                 wsBom[cellAddress].s = analyticsSubtotalValueStyle;
               } else if (C === 7) {
                 wsBom[cellAddress].s = analyticsSubtotalLabelStyle;
               }
            } else if (R > analyticsHeaderRowIndex && R < rangeBom.e.r) {
               if (C === 8) {
                 wsBom[cellAddress].s = analyticsValueStyle;
               } else if (C === 7) {
                 wsBom[cellAddress].s = analyticsLabelStyle;
               }
            } else if (R > 3 && R < materialsTotalRowIndex - 1) {
              if (C === 7 || C === 8) {
                wsBom[cellAddress].s = costStyle;
              } else if (C === 5) {
                wsBom[cellAddress].s = qtyStyle;
              } else {
                wsBom[cellAddress].s = cellStyle;
              }
            }
          }
        }

        // Merge cells for title and grand total
        if (!wsBom["!merges"]) wsBom["!merges"] = [];
        wsBom["!merges"].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } });
        wsBom["!merges"].push({ s: { r: materialsTotalRowIndex, c: 0 }, e: { r: materialsTotalRowIndex, c: 7 } }); // Merge Materials Total label
        wsBom["!merges"].push({ s: { r: analyticsHeaderRowIndex, c: 0 }, e: { r: analyticsHeaderRowIndex, c: 9 } }); // Merge Analytics Header
        wsBom["!merges"].push({ s: { r: rangeBom.e.r, c: 0 }, e: { r: rangeBom.e.r, c: 6 } }); // Merge Grand Professional Total start`;

code = code.replace(target2, replacement2);

fs.writeFileSync('src/App.tsx', code);
console.log('App.tsx patched successfully.');
