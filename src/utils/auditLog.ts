import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

export type AuditAction =
  | 'APPROVE_DRIVER'
  | 'REJECT_DRIVER'
  | 'SUSPEND_DRIVER'
  | 'ACTIVATE_DRIVER'
  | 'GIVE_CREDITS'
  | 'APPROVE_TOPUP'
  | 'REJECT_TOPUP'
  | 'CREATE_STAFF'
  | 'SUSPEND_STAFF'
  | 'ACTIVATE_STAFF'
  | 'UPDATE_SETTINGS'
  | 'UPDATE_PACKAGES';

/**
 * Write a record to the `adminActions` Firestore collection.
 * Non-fatal — log failures are swallowed so admin workflows are never blocked.
 */
export const logAdminAction = async (
  action: AuditAction,
  details: Record<string, unknown>
): Promise<void> => {
  try {
    const admin = auth.currentUser;
    if (!admin) return;
    await addDoc(collection(db, 'adminActions'), {
      action,
      adminId: admin.uid,
      adminEmail: admin.email ?? 'unknown',
      details,
      timestamp: serverTimestamp(),
    });
  } catch {
    // Non-fatal — never block an admin workflow due to a logging failure
  }
};
