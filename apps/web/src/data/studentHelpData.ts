export interface HelpSection {
  id: string;
  category: string;
  title: string;
  description: string;
  tags: string[];
  steps?: { stepNumber: number; title: string; detail: string }[];
  bulletPoints?: string[];
  glossaryItems?: { buttonText: string; actionDescription: string; locationTip: string }[];
  callout?: { type: 'tip' | 'warning' | 'important'; text: string };
}

export const STUDENT_HELP_CATEGORIES = [
  'All Topics',
  'Proof of Funds (PoF)',
  '5-Stage Document Mandate',
  'Bank Sync & SMS Parser',
  'Top-Up Capital & Extensions',
  'Interactive Button Glossary'
];

export const STUDENT_HELP_DATA: HelpSection[] = [
  {
    id: 'pof-overview',
    category: 'Proof of Funds (PoF)',
    title: 'App Overview & Proof of Funds (PoF)',
    description:
      'Understand how Basechanfunder continuously tracks your bank balance maturity to meet strict international student visa requirements.',
    tags: ['proof of funds', 'pof', '28 days', 'visa', 'maturity', 'threshold', 'buffer', 'uk', 'canada', 'germany'],
    bulletPoints: [
      '28-Day Maturity Rule: Embassies and immigration authorities (e.g. UKVI, Canada IRCC) require your required tuition and living funds to remain in your account continuously for a minimum of 28 consecutive days.',
      'Threshold Integrity: At no point during the 28-day maturity window can your closing daily balance fall below the required target threshold.',
      'FX Buffer Protection: We maintain an automated 10-15% FX buffer against Central Bank of Nigeria (CBN) volatility to prevent exchange rate fluctuations from causing accidental non-compliance.',
      'Multi-Currency Valuation: Accounts automatically display real-time conversions into GBP, EUR, CAD, or USD alongside your local NGN bank balance.'
    ],
    callout: {
      type: 'important',
      text: 'Do not withdraw or transfer funds that drop your account below the target balance during active maturity, or the 28-day countdown will reset.'
    }
  },
  {
    id: 'document-mandate',
    category: '5-Stage Document Mandate',
    title: 'Step-by-Step 5-Stage Document Mandate',
    description:
      'Follow the standardized 5-stage onboarding protocol to generate your wet-signed compliance file for counselor and admin clearance.',
    tags: ['mandate', 'document', 'upgrade form', 'wet-sign', 'upload', 'pdf', 'passport', 'nin', 'bvn', 'utility bill'],
    steps: [
      {
        stepNumber: 1,
        title: 'Download Blank Form',
        detail: 'Download the official blank Upgrade_Form.pdf document directly from the compliance portal.'
      },
      {
        stepNumber: 2,
        title: 'Print, Wet-Sign & Scan',
        detail: 'Print the form, complete all required fields legibly with blue/black ink, append your wet physical signature, and scan in high resolution.'
      },
      {
        stepNumber: 3,
        title: 'Upload 5 Supporting Attachments',
        detail: 'Upload clear scans of your 5 identity verification files: (1) Passport Photograph, (2) International Passport Data Page, (3) Recent Utility Bill, (4) National Identification Number (NIN) Slip, and (5) Bank Verification Number (BVN) Document.'
      },
      {
        stepNumber: 4,
        title: 'Automated Multi-Page PDF Compilation',
        detail: 'The Basechanfunder engine compiles all 5 uploaded documents plus the signed Upgrade Form into 1 unified master PDF document.'
      },
      {
        stepNumber: 5,
        title: 'Admin Review & Clearance Queue',
        detail: 'Your consolidated file is forwarded to the Admin Governance Roster for signature verification, tamper-detection, and official clearance.'
      }
    ],
    callout: {
      type: 'tip',
      text: 'Ensure uploaded images are high-contrast and in PNG, JPG, or PDF format without reflections or obscured corners.'
    }
  },
  {
    id: 'bank-sync-sms',
    category: 'Bank Sync & SMS Parser',
    title: 'Bank Sync & SMS Parser Guide',
    description:
      'Learn how the mobile application safely reads bank credit and balance SMS notifications to verify account maturity in real time.',
    tags: ['bank sync', 'sms', 'read_sms', 'uba', 'zenith', 'gtbank', 'parser', 'tail', 'syncing loop', 'permissions'],
    bulletPoints: [
      'Granting READ_SMS Permissions: On the mobile Android app, allow SMS read access when prompted. This permission is read-only and restricted exclusively to official bank alphanumeric sender IDs (e.g. UBA, GTBank, FirstBank, Access).',
      'Intelligent SMS Parsing Engine: When your bank delivers an account balance or credit alert, the engine extracts the balance figure, currency, timestamp, and account tail number.',
      'Account Tail Matching: Verify that the last 3-4 digits of the account number configured in your dashboard match the account digits mentioned in your bank SMS.',
      'Resolving "Syncing..." Loops: If the sync status remains stuck on "Syncing...", ensure mobile data/Wi-Fi is active, open the Android permissions page to confirm SMS permission is set to "Allow", and trigger a manual balance refresh.'
    ],
    callout: {
      type: 'warning',
      text: 'SMS parsing does not transmit OTPs or sensitive personal messages. Only transaction notifications from licensed financial institutions are processed.'
    }
  },
  {
    id: 'top-up-capital',
    category: 'Top-Up Capital & Extensions',
    title: 'Top-Up Capital & Extension Rules',
    description:
      'Understand how supplementary capital funding works, how administrative fees are computed, and how maturity dates are adjusted.',
    tags: ['top-up', 'funding', 'capital', 'fee', '2.5%', 'service fee', 'extension', 'cycle', 'maturity'],
    bulletPoints: [
      'Top-Up Capital Allocation: If your bank balance is insufficient to satisfy the visa target amount, you can request an emergency top-up balance injection.',
      '2.5% Admin Service Fee: A nominal 2.5% administration fee is assessed on the gross requested top-up capital to cover legal compliance and liquidity underwriting.',
      'Payment Reference Submission: When submitting a top-up request, include your bank transaction reference code or receipt screenshot for instant counselor confirmation.',
      '28-Day Maturity Cycle Extensions: When a top-up balance is approved mid-cycle, the 28-day maturity window resets or extends to ensure the full combined balance matures for a complete 28 consecutive days.'
    ],
    callout: {
      type: 'important',
      text: 'Always coordinate top-up requests with your assigned counselor prior to submission to align with your embassy appointment date.'
    }
  },
  {
    id: 'button-glossary',
    category: 'Interactive Button Glossary',
    title: 'Interactive Button Glossary',
    description:
      'Quick reference for key actions and buttons found throughout the Student Dashboard.',
    tags: ['buttons', 'glossary', 'sync balance', 'manage submissions', 'request top up', 'statement'],
    glossaryItems: [
      {
        buttonText: '[ SYNC BALANCE ]',
        actionDescription: 'Triggers the mobile Android engine to scan your SMS inbox for the latest bank balance alert and synchronizes the ledger in real time.',
        locationTip: 'Found in the Proof of Funds maturity card and the Top-Up balance overview.'
      },
      {
        buttonText: '[ MANAGE SUBMISSIONS ]',
        actionDescription: 'Opens the compliance document upload drawer where you can view existing files, download the blank Upgrade Form, and submit updated identification.',
        locationTip: 'Located in the Document Mandate status card in your primary dashboard.'
      },
      {
        buttonText: '[ REQUEST TOP UP ]',
        actionDescription: 'Opens the capital funding adjustment modal to specify a requested top-up sum, view the 2.5% fee breakdown, and attach payment receipts.',
        locationTip: 'Accessible from the Top-Up Request widget and the approved top-up cards.'
      },
      {
        buttonText: '[ STATEMENT ]',
        actionDescription: 'Generates and downloads a cryptographically signed Electronic Ledger Statement PDF formatted specifically for visa submission.',
        locationTip: 'Found in the header actions and quick access ledger controls.'
      }
    ]
  }
];
