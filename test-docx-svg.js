import { Document, Packer, Paragraph, ImageRun } from "docx";
import * as fs from "fs";

const svgData = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\"><circle cx=\"50\" cy=\"50\" r=\"40\" stroke=\"green\" stroke-width=\"4\" fill=\"yellow\" /></svg>";
const buffer = Buffer.from(svgData, "utf-8");

const doc = new Document({
    sections: [{
        children: [
            new Paragraph({
                children: [
                    new ImageRun({
                        data: buffer,
                        transformation: { width: 100, height: 100 }
                    })
                ]
            })
        ]
    }]
});

Packer.toBuffer(doc).then((buf) => {
    fs.writeFileSync("test-svg.docx", buf);
    console.log("Success");
}).catch((err) => {
    console.error("Error:", err);
});
