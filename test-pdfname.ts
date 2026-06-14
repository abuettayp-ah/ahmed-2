import { PDFName } from 'pdf-lib';
console.log(PDFName.of('Link').encodedName);
console.log(PDFName.of('Link') === PDFName.of('Link'));
