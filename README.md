# 🛡️ E6 Elixir — Proof of Funds & Compliance Portal

<p align="center">
  <img src="apps/web-staff/public/logo_white.png" alt="E6 Elixir Logo" width="220" />
</p>

## 📖 Overview

**E6 Elixir** is a high-stakes financial technology ecosystem built to automate the **Proof of Funds (PoF)** process for international student visa applicants. It is specifically optimized for the **UKVI 28-Day Rule**, ensuring that bank balances are monitored, buffered against FX volatility, and mathematically validated for regulatory submission.

The platform provides a unified bridge between local Nigerian banking (via SMS/USSD/API) and international compliance standards.

---

## 🏗️ Project Architecture

The project is structured as a **TypeScript Monorepo** using NPM Workspaces:

```text
E6 Elixir/
├── apps/
│   ├── web-staff/          # Primary React Portal (Students, Counselors & Auditing)
│   ├── web-admin/          # Governance Dashboard (Global Settings, Counselor Roster)
│   ├── server/             # NestJS Backend (PDF Assembly, Purge Cron, Auth Sync)
│   ├── mobile-android/     # Kotlin Native Wrapper (SMS Parsing & WebKit Bridge)
│   ├── web/                # NextJS Landing Page & Public Site
│   └── mobile/             # Flutter Multi-Platform Client (Experimental)
├── .artifacts/             # Implementation Plans & Research Notes
└── package.json            # NPM Workspaces Configuration
```

---

## 🛠 Tech Stack

### Frontend & UI
*   **React (Vite)**: Modern, functional component architecture.
*   **Tailwind CSS**: Rapid UI development with custom Glassmorphism tokens.
*   **Framer Motion**: High-end animations and page transitions.
*   **Lucide React**: Premium icon set for consistent visual language.

### Backend & Logic
*   **NestJS (Node.js)**: Robust TypeScript API and service layer.
*   **PDF-Lib**: Server-side PDF stamping and multi-page assembly.
*   **Cron/Schedule**: Background jobs for automated data purging.

### Infrastructure & Data (Firebase)
*   **Firestore**: Real-time NoSQL database for ledgers and evaluations.
*   **Auth**: Role-based access control with Google OAuth2 support.
*   **Storage**: Secure repository for identity proofs and mandates.
*   **FCM**: Push notification delivery across web and native platforms.

---

## 🌟 Key Features

*   **Native SMS Sync**: Real-time extraction of bank balances from mobile alerts (UBA, GTB, Zenith, etc.) via a secure Android bridge.
*   **28-Day Maturity Tracker**: Visual progress indicators for statutory holding requirements.
*   **Branded PDF Reports**: Automated generation of official POF status reports and account mandates.
*   **Administrative Governance**: Full control over FX buffers, price caps, and student-specific requirements.
*   **Privacy-First Purge**: Automated deletion of support chat history (24h) and archived users (7d).

---

## 🚀 Getting Started

### Prerequisites
*   Node.js (v18+)
*   Firebase CLI
*   Android Studio (for mobile development)

### Local Development
1.  **Clone the repository**: `git clone https://github.com/basechanfunder/basechan-funder`
2.  **Install dependencies**: `npm install`
3.  **Start the Dashboard**: `npm run dev`
4.  **Access the Portal**: Open `https://localhost:3001` (Accept the HTTPS certificate).

### Android Testing
Download the latest development build directly to your emulator or physical device:
👉 **[📲 Download E6 Elixir APK](https://github.com/johnnym5/basechanfunder/raw/main/apps/mobile-android/app/build/outputs/apk/debug/app-debug.apk)**

---

© 2026 E6 Elixir. Engineered for High-Stakes Financial Compliance.
