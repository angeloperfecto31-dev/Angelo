import { Document, Packer, Paragraph, TextRun, ImageRun } from 'docx';

(async () => {
  try {
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({
            children: [
              new TextRun("Hello World"),
              new ImageRun({
                data: Buffer.from("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64"),
                transformation: {
                  width: 100,
                  height: 100
                },
                type: "png"
              } as any)
            ]
          })
        ]
      }]
    });
    const blob = await Packer.toBuffer(doc);
    console.log("Success, size:", blob.length);
  } catch (e) {
    console.error(e);
  }
})();
