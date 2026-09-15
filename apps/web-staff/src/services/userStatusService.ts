export type ComplianceStatus =
  | 'CLEARED'
  | 'NEEDS_TOPUP'
  | 'NEAR_MATURITY'
  | 'AT_RISK'
  | 'PENDING'
  | 'NEW'
  | 'WAITING_APPROVAL'
  | 'UNAUTHENTICATED'
  | 'AT_RISK_CAPITAL_BREACH'
  | 'ARCHIVED'
  | 'PENDING_ONBOARDING'
  | 'AWAITING_VERIFICATION'
  | 'TOPUP_PENDING';

export interface UserStatusData {
  isApproved: boolean;
  onboardingComplete: boolean;
  onboardingProfile?: any;
  status?: string;
  anomalyRatio?: number;
  consecutiveDays?: number;
  balanceGbp?: number;
  targetGbp?: number;
  verificationFailed?: boolean;
}

/**
 * High-Integrity User Status Resolver
 * Determines the precise lifecycle state of a student.
 */
export function resolveUserStatus(data: UserStatusData): ComplianceStatus {
  // Top-Up Pending takes priority so students needing top-up review appear immediately
  if (data.status === 'TOPUP_PENDING') {
    return 'TOPUP_PENDING';
  }

  // 1. Initial State: Newly signed up, no profile details yet
  if (!data.onboardingComplete) {
    // If already approved, move them to PENDING (Awaiting setup but authorized)
    return data.isApproved ? 'PENDING' : 'PENDING_ONBOARDING';
  }

  // 2. Setup Wizard Submitted, awaiting initial data match
  if (data.onboardingComplete && !data.isApproved && !data.verificationFailed) {
    return 'AWAITING_VERIFICATION';
  }

  // 3. Match Failed / Fraud Flag (Assigned after cross-reference engine check)
  if (data.verificationFailed) {
    return 'UNAUTHENTICATED';
  }

  // 4. Manual / Admin Blocked (Legacy fallback)
  if (!data.isApproved) {
    return 'WAITING_APPROVAL';
  }

  // 5. Mature / Validated States
  // A student is only CLEARED if they are approved AND meet the financial target/days OR are explicitly cleared by admin
  const isExplicitlyCleared = data.status === 'VALIDATED' || data.status === 'CLEARED';
  const meetsCompliance = (data.targetGbp || 0) > 0 && (data.consecutiveDays || 0) >= 28;

  if (isExplicitlyCleared) {
    // Even if status is CLEARED, we check if it's a false positive (e.g. no target set)
    // A student MUST have a target amount AND meet the 28-day maturity to be considered cleared,
    // unless they were manually cleared by an admin (which should also set consecutiveDays to 28).
    const hasMaturity = (data.consecutiveDays || 0) >= 28;

    if (data.isApproved && (data.targetGbp || 0) > 0 && hasMaturity) {
      return 'CLEARED';
    }
    // If they were cleared but don't meet requirements, they are still waiting for full compliance
    return 'WAITING_APPROVAL';
  }

  // 6. Dynamic Risk States
  if (data.anomalyRatio && data.anomalyRatio > 2.5) {
    return 'AT_RISK';
  }

  if (data.consecutiveDays && data.consecutiveDays >= 22 && data.consecutiveDays < 28) {
    return 'NEAR_MATURITY';
  }

  if (data.status === 'NEEDS_TOPUP') {
    return 'NEEDS_TOPUP';
  }

  return (data.status as ComplianceStatus) || 'PENDING';
}
