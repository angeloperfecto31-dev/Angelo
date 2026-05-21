import { Document, Packer, Paragraph, Table, TableRow, TableCell } from 'docx';

(async () => {
  try {
    const doc = new Document({
      sections: [{
        children: [
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Header")] })
                ],
                tableHeader: true
              })
            ]
          })
        ]
      }]
    });
    const blob = await Packer.toBuffer(doc);
    console.log("Success");
  } catch(e) { console.error(e); }
})();
