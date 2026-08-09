// Documento da pasta pronto para o Assinador ONR (https://assinador.onr.org.br).
//
// Duas regras:
//
// 1) PDF existente é baixado INTOCADO. Certidões nato-digitais costumam já vir
//    assinadas (e muitas já em PDF/A) — reescrever os bytes destruiria a
//    assinatura. O invólucro nunca vale mais que o conteúdo.
// 2) Imagem (foto de guia, carnê, certidão) vira PDF de página A4 e recebe a
//    marcação PDF/A-1B: metadados XMP com `pdfaid` e OutputIntent GTS_PDFA1
//    com perfil ICC sRGB embutido — os dois requisitos estruturais que um
//    validador confere primeiro num PDF só de imagem.

import { imageFileToPdfBlob, isImageFile, pdfNameFor } from "@/lib/to-pdf";

// Perfil sRGB IEC61966-2.1 (Little CMS, 588 bytes, sem copyright).
const SRGB_ICC_B64 =
  "AAACTGxjbXMEQAAAbW50clJHQiBYWVogB+oACAAJABQAOQABYWNzcEFQUEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1sY21zAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALZGVzYwAAAQgAAAA2Y3BydAAAAUAAAABMd3RwdAAAAYwAAAAUY2hhZAAAAaAAAAAsclhZWgAAAcwAAAAUYlhZWgAAAeAAAAAUZ1hZWgAAAfQAAAAUclRSQwAAAggAAAAgZ1RSQwAAAggAAAAgYlRSQwAAAggAAAAgY2hybQAAAigAAAAkbWx1YwAAAAAAAAABAAAADGVuVVMAAAAaAAAAHABzAFIARwBCACAAYgB1AGkAbAB0AC0AaQBuAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAADAAAAAcAE4AbwAgAGMAbwBwAHkAcgBpAGcAaAB0ACwAIAB1AHMAZQAgAGYAcgBlAGUAbAB5WFlaIAAAAAAAAPbWAAEAAAAA0y1zZjMyAAAAAAABDEIAAAXe///zJQAAB5MAAP2Q///7of///aIAAAPcAADAblhZWiAAAAAAAABvoAAAOPUAAAOQWFlaIAAAAAAAACSfAAAPhAAAtsNYWVogAAAAAAAAYpcAALeHAAAY2XBhcmEAAAAAAAMAAAACZmYAAPKnAAANWQAAE9AAAApbY2hybQAAAAAAAwAAAACj1wAAVHsAAEzNAACZmgAAJmYAAA9c";

function iccBytes(): Uint8Array {
  const bin = atob(SRGB_ICC_B64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function xmpPdfA(titulo: string): string {
  const data = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>1</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(titulo)}</rdf:li></rdf:Alt></dc:title>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
   <xmp:CreateDate>${data}</xmp:CreateDate>
   <xmp:ModifyDate>${data}</xmp:ModifyDate>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

async function marcarPdfA(pdf: Blob, titulo: string): Promise<Blob> {
  const { PDFDocument, PDFHexString, PDFName, PDFString } = await import(
    "pdf-lib"
  );
  const doc = await PDFDocument.load(await pdf.arrayBuffer());

  // Identificador do arquivo no trailer (ISO 19005-1, 6.1.3)
  const id = crypto.getRandomValues(new Uint8Array(16));
  const hex = [...id].map((b) => b.toString(16).padStart(2, "0")).join("");
  doc.context.trailerInfo.ID = doc.context.obj([
    PDFHexString.of(hex),
    PDFHexString.of(hex),
  ]);

  // Metadados XMP (fluxo sem compressão, como o PDF/A exige)
  const meta = doc.context.stream(xmpPdfA(titulo), {
    Type: "Metadata",
    Subtype: "XML",
  });
  doc.catalog.set(PDFName.of("Metadata"), doc.context.register(meta));

  // OutputIntent GTS_PDFA1 com o perfil sRGB
  const icc = doc.context.stream(iccBytes(), { N: 3 });
  const intent = doc.context.obj({
    Type: "OutputIntent",
    S: "GTS_PDFA1",
    OutputConditionIdentifier: PDFString.of("sRGB IEC61966-2.1"),
    Info: PDFString.of("sRGB IEC61966-2.1"),
    DestOutputProfile: doc.context.register(icc),
  });
  doc.catalog.set(
    PDFName.of("OutputIntents"),
    doc.context.obj([doc.context.register(intent)])
  );

  doc.setTitle(titulo);
  doc.setProducer("Renomeador Inteligente de Documentos");

  // PDF/A-1 proíbe object streams e xref stream — gravação clássica.
  const bytes = await doc.save({ useObjectStreams: false });
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

export interface DocumentoAssinatura {
  blob: Blob;
  nome: string;
  convertido: boolean; // true = imagem convertida; false = PDF original intocado
}

export async function documentoParaAssinatura(
  file: File
): Promise<DocumentoAssinatura> {
  if (file.name.toLowerCase().endsWith(".pdf")) {
    return { blob: file, nome: file.name, convertido: false };
  }
  if (!isImageFile(file.name)) {
    throw new Error(
      "Formato sem conversão para PDF — envie o documento em PDF ou imagem."
    );
  }
  const nome = pdfNameFor(file.name);
  const titulo = nome.replace(/\.pdf$/i, "");
  const blob = await marcarPdfA(await imageFileToPdfBlob(file), titulo);
  return { blob, nome, convertido: true };
}
