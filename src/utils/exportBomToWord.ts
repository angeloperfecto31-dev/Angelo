import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  HeadingLevel, 
  Table, 
  TableRow, 
  TableCell, 
  AlignmentType, 
  WidthType, 
  BorderStyle, 
  VerticalAlign,
  Header,
  Footer,
  PageNumber,
  PageOrientation
} from "docx";
import { PanelConfig } from "../types";
import { BomItem } from "../components/BomModule";

export const exportBomToWord = async (panel: PanelConfig, bomItems: BomItem[], costCalculations: any) => {
  const docChildren: any[] = [];
  
  // Title
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300, before: 300 },
      children: [
        new TextRun({
          text: "BILL OF MATERIALS (BOM) TAKEOFF REPORT",
          bold: true,
          size: 32,
          font: "Segoe UI",
          color: "1E293B" // Slate 800
        })
      ]
    })
  );
  
  // Subtitle
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: `Project Designation: ${panel.designation || "Project"}`,
          size: 24,
          font: "Segoe UI",
          color: "475569" // Slate 600
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: `Generated on: ${new Date().toLocaleDateString()}`,
          size: 20,
          font: "Segoe UI",
          color: "64748B" // Slate 500
        })
      ]
    })
  );

  const grandTotalCost = bomItems.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);

  // BOM Table
  const tableRows: TableRow[] = [];

  const headers = ["Category", "Material Name", "Description", "Brand", "Specification", "Quantity", "Unit", "Unit Cost (PHP)", "Total Cost (PHP)", "Source"];
  
  tableRows.push(
    new TableRow({
      children: headers.map(header => 
        new TableCell({
          shading: { fill: "312E81" },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 100, bottom: 100, left: 100, right: 100 },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: header, bold: true, color: "FFFFFF", font: "Segoe UI", size: 18 })
              ]
            })
          ]
        })
      ),
      tableHeader: true
    })
  );

  bomItems.forEach((item, idx) => {
    const isEven = idx % 2 === 1;
    const fill = isEven ? "F8FAFC" : "FFFFFF";
    
    const rowData = [
      item.category,
      item.name,
      item.description,
      item.brand,
      item.specification,
      item.quantity.toString(),
      item.unit,
      item.unitCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      (item.quantity * item.unitCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      item.source
    ];

    tableRows.push(
      new TableRow({
        children: rowData.map((text, i) => 
          new TableCell({
            shading: { fill },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
            children: [
              new Paragraph({
                alignment: (i === 5 || i === 7 || i === 8) ? AlignmentType.RIGHT : AlignmentType.LEFT,
                children: [
                  new TextRun({ text: String(text), font: "Segoe UI", size: 18, color: "334155" })
                ]
              })
            ]
          })
        )
      })
    );
  });

  // Materials Total Row
  tableRows.push(
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 8,
          shading: { fill: "1E293B" },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 120, bottom: 120, left: 100, right: 100 },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: "MATERIALS TOTAL", bold: true, color: "FFFFFF", font: "Segoe UI", size: 20 })
              ]
            })
          ]
        }),
        new TableCell({
          shading: { fill: "1E293B" },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 120, bottom: 120, left: 100, right: 100 },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: `PHP ${costCalculations.materialsSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, bold: true, color: "FFFFFF", font: "Segoe UI", size: 20 })
              ]
            })
          ]
        }),
        new TableCell({
          shading: { fill: "1E293B" },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 120, bottom: 120, left: 100, right: 100 },
          children: [
            new Paragraph({
              children: []
            })
          ]
        })
      ]
    })
  );

  const table = new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
      bottom: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
      left: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
      right: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
      insideHorizontal: { color: "E2E8F0", space: 1, style: BorderStyle.SINGLE, size: 2 },
      insideVertical: { color: "E2E8F0", space: 1, style: BorderStyle.SINGLE, size: 2 }
    }
  });

  docChildren.push(table);

  // COST ESTIMATES & ANALYTICS
  docChildren.push(
    new Paragraph({
      spacing: { before: 800, after: 400 },
      children: [
        new TextRun({
          text: "Cost Estimates & Analytics",
          bold: true,
          size: 28,
          font: "Segoe UI",
          color: "1E293B" // Slate 800
        })
      ]
    })
  );

  const analyticsRows: TableRow[] = [];

  const analyticsData = [
    { label: "Total Materials", value: costCalculations.materialsSum, isTotal: false },
    { label: "Labor Estimation", value: costCalculations.laborSum, isTotal: false },
    { label: "Subtotal", value: costCalculations.subtotal, isTotal: true },
    { label: "Contingency", value: costCalculations.contingencyAmount, isTotal: false },
    { label: "Profit Margin", value: costCalculations.profitAmount, isTotal: false },
    { label: "Taxable Subtotal", value: costCalculations.subtotal + costCalculations.contingencyAmount + costCalculations.profitAmount, isTotal: true },
    { label: "Taxes / VAT", value: costCalculations.taxAmount, isTotal: false },
    { label: "GRAND PROFESSIONAL TOTAL", value: costCalculations.grandTotal, isTotal: true, highlight: true }
  ];

  analyticsData.forEach((row, idx) => {
    const isEven = idx % 2 === 1;
    const fill = row.highlight ? "312E81" : (row.isTotal ? "F1F5F9" : (isEven ? "F8FAFC" : "FFFFFF"));
    const textColor = row.highlight ? "FFFFFF" : (row.isTotal ? "1E293B" : "334155");
    const isBold = row.isTotal || row.highlight;

    analyticsRows.push(
      new TableRow({
        children: [
          new TableCell({
            shading: { fill },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 120, bottom: 120, left: 150, right: 100 },
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [
                  new TextRun({ text: row.label, bold: isBold, font: "Segoe UI", size: isBold ? 20 : 18, color: textColor })
                ]
              })
            ]
          }),
          new TableCell({
            shading: { fill },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 120, bottom: 120, left: 100, right: 150 },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: `PHP ${row.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, bold: isBold, font: "Segoe UI", size: isBold ? 20 : 18, color: textColor })
                ]
              })
            ]
          })
        ]
      })
    );
  });

  const analyticsTable = new Table({
    rows: analyticsRows,
    width: { size: 60, type: WidthType.PERCENTAGE },
    borders: {
      top: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
      bottom: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
      left: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
      right: { color: "CBD5E1", space: 1, style: BorderStyle.SINGLE, size: 4 },
      insideHorizontal: { color: "E2E8F0", space: 1, style: BorderStyle.SINGLE, size: 2 },
      insideVertical: { color: "E2E8F0", space: 1, style: BorderStyle.SINGLE, size: 2 }
    },
    alignment: AlignmentType.RIGHT // Right-align the analytics table
  });

  docChildren.push(analyticsTable);

  const footerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { color: "64748B", space: 1, style: BorderStyle.SINGLE, size: 4 }, 
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE }
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }
            },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "ELECTRICAL BOM TAKEOFF | PEC COMPLIANCE",
                    font: "Segoe UI",
                    size: 16,
                    color: "64748B",
                    bold: true
                  })
                ],
                alignment: AlignmentType.LEFT,
                spacing: { before: 100 }
              })
            ]
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }
            },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Page ",
                    font: "Segoe UI",
                    size: 16,
                    color: "64748B"
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: "Segoe UI",
                    size: 16,
                    color: "64748B"
                  }),
                  new TextRun({
                    text: " of ",
                    font: "Segoe UI",
                    size: 16,
                    color: "64748B"
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    font: "Segoe UI",
                    size: 16,
                    color: "64748B"
                  })
                ],
                alignment: AlignmentType.RIGHT,
                spacing: { before: 100 }
              })
            ]
          })
        ]
      })
    ]
  });

  const doc = new Document({
    creator: "AI Studio Integrated Sizer",
    title: `BOM Takeoff - ${panel.designation || 'Project'}`,
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 720,
              bottom: 1440,
              left: 720,
            },
            size: {
              orientation: PageOrientation.LANDSCAPE
            }
          },
        },
        footers: {
          default: new Footer({
            children: [footerTable]
          })
        },
        children: docChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `BOM_Takeoff_Report_${(panel.designation || 'Export').replace(/\s+/g, '_')}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
