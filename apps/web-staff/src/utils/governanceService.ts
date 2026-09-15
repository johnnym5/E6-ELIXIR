import { writeBatch, doc, getDocs, collection, query, where, getDoc } from 'firebase/firestore';
import { ref, listAll, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase';

/**
 * Client-Side Governance Service
 * Handles administrative actions that were previously managed by NestJS.
 */

export const purgeUserClientSide = async (targetUid: string): Promise<{ success: boolean; message: string }> => {
  console.log(`[Governance] Initiating complete purge for user: ${targetUid}`);

  try {
    // 1. Storage Wipe (Cascading deletion of all user-owned files)
    const storagePrefixes = [
      `student_documents/${targetUid}`,
      `mandate_packages/${targetUid}`,
      `student_packages/${targetUid}`
    ];

    for (const prefix of storagePrefixes) {
      const folderRef = ref(storage, prefix);
      try {
        const result = await listAll(folderRef);
        // Delete all files in the folder
        await Promise.all(result.items.map(item => deleteObject(item)));

        // Handle nested folders (recursive)
        for (const folder of result.prefixes) {
            const nestedFiles = await listAll(folder);
            await Promise.all(nestedFiles.items.map(item => deleteObject(item)));
        }
        console.log(`[Governance] Storage cleared for: ${prefix}`);
      } catch (e: any) {
        console.warn(`[Governance] Storage prefix ${prefix} skip/error: ${e.message}`);
      }
    }

    // 2. Firestore Cascading Deletion
    const batch = writeBatch(db);

    // Global Collections to scan for userId/studentId
    const globalCollections = [
      { name: 'financial_accounts', field: 'userId' },
      { name: 'pof_evaluations', field: 'userId' },
      { name: 'liquidity_requests', field: 'userId' },
      { name: 'notifications', field: 'userId' },
      { name: 'audit_logs', field: 'studentId' },
      { name: 'topup_requests', field: 'userId' },
      { name: 'manual_adjustments', field: 'userId' }
    ];

    for (const col of globalCollections) {
      const q = query(collection(db, col.name), where(col.field, '==', targetUid));
      const snap = await getDocs(q);
      snap.forEach((d) => batch.delete(d.ref));
    }

    // Root User & Subcollections
    const userRef = doc(db, 'users', targetUid);

    // Deleting common subcollections (Firestore Web SDK cannot list subcollections,
    // so we hardcode the ones used in the app)
    const subCollections = ['submitted_documents', 'financial_accounts', 'notifications', 'pushTokens'];
    for (const subName of subCollections) {
        const subSnap = await getDocs(collection(db, 'users', targetUid, subName));
        subSnap.forEach(d => batch.delete(d.ref));
    }

    // Delete Root Doc
    batch.delete(userRef);

    await batch.commit();
    console.log(`[Governance] Firestore records purged for ${targetUid}`);

    return {
      success: true,
      message: "Cascading hard purge completed successfully via Client SDK."
    };

  } catch (error: any) {
    console.error('[Governance] Purge Failed:', error);
    return {
      success: false,
      message: `Critical Purge Failure: ${error.message}`
    };
  }
};

/**
 * Seed Global Document Requirements (Client-Side)
 */
export const seedRequirementsClientSide = async (): Promise<void> => {
    const batch = writeBatch(db);
    const requirements = [
        { id: 'passport_photo', name: 'Passport Photograph', description: 'Recent color photo with white background', required: true, order: 1 },
        { id: 'id_data_page', name: 'Identity Data Page', description: 'International Passport or Government ID', required: true, order: 2 },
        { id: 'utility_bill', name: 'Utility Bill', description: 'Proof of address (last 3 months)', required: true, order: 3 },
        { id: 'nin_doc', name: 'NIN Slip', description: 'National Identification Number digital slip', required: true, order: 4 },
        { id: 'bvn_doc', name: 'BVN Confirmation', description: 'Bank Verification Number printout', required: true, order: 5 },
        { id: 'signed_upgrade_form', name: 'Signed Mandate Form', description: 'Official Parallex bank upgrade mandate', required: true, order: 0 }
      ];

      const configRef = doc(db, 'system_config', 'document_requirements');
      batch.set(configRef, {
        requirements,
        updatedAt: new Date().toISOString(),
        lastSeededBy: 'CLIENT_ADMIN'
      });

      await batch.commit();
      console.log('[Governance] Global requirements seeded.');
};
