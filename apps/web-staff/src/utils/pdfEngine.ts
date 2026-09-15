import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { ref, uploadBytes, getDownloadURL, getBytes } from 'firebase/storage';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, storage } from '../firebase';

export interface CompilationPayload {
  userId: string;
  studentData: Record<string, any>;
  supportingDocs: {
    id: string;
    file?: File | Blob;
    url?: string;
    fileType: string;
  }[];
}

export interface MandateData {
    userId?: string;
    accountName: string;
    accountNumber?: string;
    mandateAuthorisation: string;
    bvn: string;
    surname: string;
    firstName: string;
    otherName?: string;
    identificationType: string;
    identificationNo: string;
    telephoneNo: string;
    date: string;
    passportPhotoBase64?: string;
}

/**
 * Common Mandate Stamping Logic
 */
export const stampMandateTemplate = async (templateUrl: string, data: MandateData): Promise<Uint8Array> => {
    const response = await fetch(templateUrl);
    const templateBuffer = await response.arrayBuffer();

    const pdfDoc = await PDFDocument.load(templateBuffer);
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const page = pdfDoc.getPages()[0];

    const drawText = (text: string, x: number, y: number, size = 10) => {
      if (text) {
        page.drawText(text.toUpperCase(), { x, y, size, font, color: rgb(0, 0, 0) });
      }
    };

    // --- SECTION 1: ACCOUNT DETAILS ---
    drawText(data.accountName, 130, 735, 10);
    drawText(data.accountNumber || 'N/A', 130, 715, 10);

    // --- MANDATE CHECKBOX ---
    let checkboxX = 104;
    if (data.mandateAuthorisation === 'EITHER_TO_SIGN') checkboxX = 218;
    if (data.mandateAuthorisation === 'BOTH_TO_SIGN') checkboxX = 345;
    page.drawText('X', { x: checkboxX, y: 692, size: 12, font });

    // --- SECTION 2: PERSONAL DETAILS ---
    drawText(data.bvn, 150, 668, 10);
    drawText(data.surname, 120, 630, 10);
    drawText(data.firstName, 120, 615, 10);
    drawText(data.otherName || '', 120, 600, 10);

    // ID Details & Phone
    drawText(data.identificationType.replace(/_/g, ' '), 120, 575, 10);
    drawText(data.identificationNo, 120, 560, 10);
    drawText(data.telephoneNo, 120, 545, 10);

    // Date
    drawText(data.date, 440, 480, 10);

    // --- PASSPORT PHOTOGRAPH ---
    if (data.passportPhotoBase64) {
      try {
        const base64Data = data.passportPhotoBase64.includes('base64,')
          ? data.passportPhotoBase64.split('base64,')[1]
          : data.passportPhotoBase64;

        const photoBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        const image = await pdfDoc.embedJpg(photoBytes).catch(() => pdfDoc.embedPng(photoBytes));

        page.drawImage(image, {
          x: 435,
          y: 50,
          width: 110,
          height: 130
        });
      } catch (e) {
        console.warn('Passport embedding failed:', e);
      }
    }

    return await pdfDoc.save();
};

/**
 * Generate Draft Overlay (Client-Side)
 */
export const generateMandateOverlayClientSide = async (data: MandateData): Promise<string> => {
    if (!data.userId) throw new Error('User ID required');

    const templateUrl = '/templates/Upgrade_Form.pdf';
    const pdfBytes = await stampMandateTemplate(templateUrl, data);

    const storageRef = ref(storage, `student_documents/${data.userId}/drafts/Upgrade_Form_Overlay.pdf`);
    await uploadBytes(storageRef, pdfBytes, { contentType: 'application/pdf' });
    return await getDownloadURL(storageRef);
};

/**
 * Client-Side PDF Compilation Pipeline
 * Replaces PdfCompilerService from NestJS
 */
export const generateAndUploadMandatePackage = async (payload: CompilationPayload): Promise<string> => {
  const { userId, studentData, supportingDocs } = payload;
  console.log(`[PdfEngine] Initiating client-side compilation for user ${userId}`);

  const masterPdf = await PDFDocument.create();

  /**
   * Required Sequence: [signed_form, passport, id_page, utility_bill, nin, bvn]
   */
  const sequence = [
    'signed_upgrade_form',
    'passport_photo',
    'id_data_page',
    'utility_bill',
    'nin_doc',
    'bvn_doc'
  ];

  for (const docId of sequence) {
    const docData = supportingDocs.find(d => d.id === docId);
    if (!docData) continue;

    try {
      let arrayBuffer: ArrayBuffer;
      if (docData.file) {
        arrayBuffer = await (docData.file as any).arrayBuffer();
      } else if (docData.url) {
        // If it's a base64 data URL
        if (docData.url.startsWith('data:')) {
            const base64Data = docData.url.split(',')[1];
            arrayBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)).buffer;
        } else {
            const response = await fetch(docData.url);
            arrayBuffer = await response.arrayBuffer();
        }
      } else {
        continue;
      }

      if (docData.fileType === 'application/pdf' || (docData as any).fileName?.endsWith('.pdf')) {
        const externalPdf = await PDFDocument.load(arrayBuffer);
        const copiedPages = await masterPdf.copyPages(externalPdf, externalPdf.getPageIndices());
        copiedPages.forEach((p) => masterPdf.addPage(p));
      } else {
        const image = docData.fileType.includes('png')
          ? await masterPdf.embedPng(arrayBuffer)
          : await masterPdf.embedJpg(arrayBuffer);

        const imgPage = masterPdf.addPage([595.28, 841.89]);
        const { width, height } = imgPage.getSize();

        const dims = image.scaleToFit(width - 80, height - 80);
        masterPdf.getPages()[masterPdf.getPageCount() - 1].drawImage(image, {
          x: (width - dims.width) / 2,
          y: (height - dims.height) / 2,
          width: dims.width,
          height: dims.height,
        });
      }
    } catch (e: any) {
      console.warn(`[PdfEngine] Failed to append doc ${docId}:`, e.message);
    }
  }

  const finalPdfBytes = await masterPdf.save();
  const fileName = `Final_Mandate_Package_${userId}.pdf`;
  const destination = `student_packages/${userId}/${fileName}`;

  const storageRef = ref(storage, destination);
  await uploadBytes(storageRef, finalPdfBytes, { contentType: 'application/pdf' });

  const downloadUrl = await getDownloadURL(storageRef);

  // 4. Update Student Status in Firestore
  await updateDoc(doc(db, 'users', userId), {
    mandateStatus: 'MANDATE_SUBMITTED_AWAITING_APPROVAL',
    compiledPackageUrl: destination,
    compiledPackageDownloadUrl: downloadUrl,
    updatedAt: serverTimestamp(),
  });

  return downloadUrl;
};
