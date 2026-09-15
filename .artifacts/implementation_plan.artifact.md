# Implementation Plan — Decommission `apps/server` & Move Logic to BaaS

This plan details the steps to migrate all backend logic from the NestJS server to the browser and Firebase (BaaS), allowing the `apps/server` module to be decommissioned.

## Proposed Changes

### 1. Browser-Side PDF Stamping & Compilation
Refactor the PDF generation logic from the server to the client using `pdf-lib`.

#### [NEW] [pdfEngine.ts](file:///C:/Users/HP/Documents/CODING/E6-ELIXIR/apps/web-staff/src/utils/pdfEngine.ts)
- Implement `generateAndUploadMandatePackage` using `pdf-lib`.
- Handle cover page generation with student data.
- Merge uploaded images (converted to PDF pages) and PDF documents.
- Upload the final package directly to Firebase Storage.

---

### 2. Document-Based Role System
Migrate Role-Based Access Control (RBAC) from Firebase Custom Claims to Firestore document-based roles.

#### [MODIFY] [AuthContext.tsx](file:///C:/Users/HP/Documents/CODING/E6-ELIXIR/apps/web-staff/src/context/AuthContext.tsx)
- Update `UserRole` type and `deriveRole` logic to align with the new standard (e.g., using `ADMIN` instead of `ADMIN_GOVERNANCE` if requested, or ensuring consistent mapping).
- Ensure the role is persisted in the `/users/{uid}` document upon login/initialization.

#### [MODIFY] [firestore.rules](file:///C:/Users/HP/Documents/CODING/E6-ELIXIR/firestore.rules)
- Implement `getUserData()` and `isAdmin()` helper functions.
- Restrict write access to sensitive collections (like `topup_requests` and `system_config`) based on the Firestore `role` field.

---

### 3. Client-Side Governance Controls
Move administrative actions (like user purging) to the client using Firebase SDK.

#### [NEW] [governanceService.ts](file:///C:/Users/HP/Documents/CODING/E6-ELIXIR/apps/web-staff/src/utils/governanceService.ts)
- Implement `purgeUserClientSide` using `writeBatch` for Firestore and `listAll`/`deleteObject` for Storage.
- Ensure all associated data (financial accounts, notifications, etc.) is included in the cascade.

---

### 4. Server Decommissioning & Cleanup
Remove all dependencies on the NestJS server.

#### [MODIFY] [.env](file:///C:/Users/HP/Documents/CODING/E6-ELIXIR/.env)
- Remove `VITE_API_BASE_URL` or any server-pointing environment variables.

#### [MODIFY] [web-staff components](file:///C:/Users/HP/Documents/CODING/E6-ELIXIR/apps/web-staff/src/components)
- Scan for and replace all `fetch` or `axios` calls pointing to `/api/v1/...` with direct calls to the new utility services or Firebase SDK.
- Components to update include `Dashboard.tsx`, `StudentActionModal.tsx`, etc.

## Verification Plan

### Automated Tests
- None planned for browser-side utilities at this stage.

### Manual Verification
1. **PDF Generation**: Trigger a mandate submission in the student portal. Verify the PDF is generated correctly in the browser and appears in Firebase Storage.
2. **Role Enforcement**: Sign in as a regular student and attempt to access admin-only Firestore paths. Verify "Permission Denied" in the console.
3. **User Purge**: Use the Admin dashboard to "Hard Purge" a test user. Verify all Firestore documents and Storage files for that UID are removed.
4. **Server Offline**: Shut down the NestJS server (`Ctrl+C` in the server terminal) and verify the entire web application remains functional.
