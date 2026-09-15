// Auth Context — provides currentUser, userRole, and loading state app-wide
import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import {
  doc, getDoc, setDoc, serverTimestamp, updateDoc, arrayUnion, onSnapshot
} from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import { auth, db, getMessagingInstance } from '../firebase';

export type UserRole = 'STUDENT' | 'STAFF_AUDITOR' | 'COUNSELOR' | 'ADMIN_GOVERNANCE';

export const PRE_APPROVED_COUNSELORS = [
  { name: "Peter", email: "peter.basechaninternational@gmail.com" },
  { name: "Feridu", email: "feridu.basechaninternational@gmail.com" },
  { name: "Effiong", email: "effiong.basechaninternational@gmail.com" },
  { name: "Cletus", email: "cletus.basechaninternational@gmail.com" },
  { name: "Izunyon", email: "izunyon.basechaninternational@gmail.com" },
  { name: "Jumai", email: "jumaibasechaninternational@gmail.com" },
  { name: "Nwaiwu Blessing OGE", email: "nwaiwu.basechaninternational@gmail.com" },
  { name: "Jegbase", email: "jegbase@gmail.com" },
];

export interface AppUser {
// ... existing interface ...
  uid: string;
  email: string;
  username?: string;
  displayName: string;
  photoURL: string;
  role: UserRole;
  isApproved: boolean;
  onboardingComplete?: boolean;
  mandateStatus?: 'NOT_STARTED' | 'DRAFT_GENERATED' | 'MANDATE_SUBMITTED_AWAITING_APPROVAL' | 'MANDATE_APPROVED' | 'MANDATE_REJECTED';
  hasCustomRequirements?: boolean;
  customDocumentRequirements?: any[];
  createdAt?: unknown;
}

interface AuthContextValue {
  currentUser: User | null;
  appUser: AppUser | null;
  loading: boolean;
  role: UserRole | null;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  currentUser: null,
  appUser: null,
  loading: true,
  role: null,
  refreshProfile: async () => {},
});

// Determine role from email domain
export function deriveRole(email: string): { role: UserRole; name?: string } {
  const lower = email.toLowerCase().trim();

  // 1. Check Counselor Whitelist
  const preApproved = PRE_APPROVED_COUNSELORS.find(c => c.email.toLowerCase() === lower);
  if (preApproved) return { role: 'COUNSELOR', name: preApproved.name };

  // 2. Check Admin Domain
  if (lower.endsWith('@basechaninternational.com')) return { role: 'ADMIN_GOVERNANCE' };

  // 3. Fallbacks
  if (lower.includes('auditor')) return { role: 'STAFF_AUDITOR' };
  if (lower.endsWith('.basechaninternational@gmail.com') || lower.includes('counselor')) return { role: 'COUNSELOR' };

  return { role: 'STUDENT' };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [fcmToken, setFcmToken] = useState<string | null>(null);

  useEffect(() => {
    let profileUnsub: (() => void) | null = null;

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        // 0. Cleanup previous profile listener if exists
        if (profileUnsub) {
          profileUnsub();
          profileUnsub = null;
        }

        if (firebaseUser) {
          setCurrentUser(firebaseUser);
          
          const { role, name: whitelistedName } = deriveRole(firebaseUser.email ?? '');
          const isApproved = role !== 'STUDENT';
          const derivedUsername = (firebaseUser.email?.split('@')[0] || firebaseUser.uid)
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '');

          const resolvedAppUser: AppUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email ?? '',
            username: derivedUsername,
            displayName: whitelistedName || firebaseUser.displayName || derivedUsername || 'User',
            photoURL: firebaseUser.photoURL ?? '',
            role,
            isApproved,
            onboardingComplete: false, // Default for new sign-ins
          };

          // 1. Set initial local state immediately to avoid flicker/blank screens
          console.log(`[AuthContext] User detected: ${firebaseUser.email} (${firebaseUser.uid})`);
          setAppUser(resolvedAppUser);

          // 2. Setup real-time listener for user profile
          const userRef = doc(db, 'users', firebaseUser.uid);

          // 2b. Role Hardening: Ensure role is stored in Firestore (Replacing Custom Claims)
          try {
            const profileSnap = await getDoc(userRef);
            if (!profileSnap.exists() || profileSnap.data()?.role !== role) {
              console.log(`[AuthContext] Persisting/Updating role "${role}" in Firestore for ${firebaseUser.email}`);
              await setDoc(userRef, {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                role,
                username: derivedUsername,
                displayName: whitelistedName || firebaseUser.displayName || derivedUsername,
                isApproved,
                updatedAt: serverTimestamp(),
                lastLoginAt: serverTimestamp()
              }, { merge: true });
            }
          } catch (roleErr: any) {
            console.warn('[AuthContext] Role persistence check failed:', roleErr.message);
          }

          profileUnsub = onSnapshot(userRef, async (snap) => {
            if (snap.exists()) {
              const data = snap.data() as any;
              console.log("[AuthContext] Firestore Profile loaded. OnboardingComplete:", data.onboardingComplete);

              // KILL-SWITCH: If user is marked for hard delete, force logout immediately
              if (data.hardDeleted === true) {
                console.warn("[AuthContext] Account deleted by admin. Logging out...");
                await signOut(auth);
                return;
              }

              // Merge Firestore data into local appUser
              setAppUser(prev => {
                const next = { ...resolvedAppUser, ...prev, ...data };
                return next;
              });
            } else {
              console.log("[AuthContext] Soft-reset detected or missing profile. Auto-Reinitializing...");

              // Only auto-initialize if it's a STUDENT role (Admins/Staff usually have stable profiles)
              // This is Task 2: Auto-Reinitialization
              if (resolvedAppUser.role === 'STUDENT') {
                const freshProfile = {
                  ...resolvedAppUser,
                  status: 'UNAUTHENTICATED',
                  mandateStatus: 'NOT_STARTED',
                  topUpStatus: 'NONE',
                  hasPendingTopUp: false,
                  accountBalanceNgn: 0,
                  resetCount: (resolvedAppUser as any).resetCount ? (resolvedAppUser as any).resetCount + 1 : 1,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                };

                await setDoc(userRef, freshProfile);
                setAppUser(freshProfile as any);
              } else {
                // For non-students, just set the basic info
                setAppUser(resolvedAppUser);
              }
            }
          }, (err) => {
            console.error("[AuthContext] Firestore Listener Error:", err);
            // If we hit a permission error (e.g. newly signed in user, rules not ready)
            // we keep the basic resolvedAppUser so they don't get stuck on a spinner.
            setAppUser(resolvedAppUser);
          });


          // 3. Handle FCM (Async, non-blocking)
          try {
            const messaging = await getMessagingInstance();
            const vapidKey = ((import.meta as any).env?.VITE_FIREBASE_VAPID_KEY as string) ||
                             (typeof process !== 'undefined' ? (process.env as any).NEXT_PUBLIC_FIREBASE_VAPID_KEY : undefined);

            if (messaging && vapidKey && typeof Notification !== 'undefined') {
              if (Notification.permission === 'granted') {
                const token = await getToken(messaging, { vapidKey });
                if (token && token !== fcmToken) {
                  await updateDoc(userRef, {
                    pushTokens: arrayUnion({ token, platform: 'WEB', updatedAt: new Date().toISOString() })
                  }).catch(() => {});
                  setFcmToken(token);
                }
              }
            }
          } catch (fcmErr) {
            console.warn("FCM setup background error:", fcmErr);
          }

        } else {
          setCurrentUser(null);
          setAppUser(null);
        }
      } catch (err) {
        console.error('Auth state change error:', err);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      unsub();
      if (profileUnsub) profileUnsub();
    };
  }, []);

  const refreshProfile = async () => {
    if (!currentUser) return;
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data() as AppUser;
        setAppUser(prev => ({ ...prev, ...data } as AppUser));
      }
    } catch (err) {
      console.error("Manual Profile Refresh Error:", err);
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, appUser, loading, role: appUser?.role ?? null, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
