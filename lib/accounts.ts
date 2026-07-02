/**
 * Back-compat shim. ContentOS now has a single account per platform, stored in
 * encrypted cookies by `lib/connections.ts`. The "Google account" backs Drive,
 * YouTube and Gmail. These aliases keep existing route imports working.
 */
import { getGoogleAccount } from './connections'

export { getGoogleAccount }

export const getActiveAccount = getGoogleAccount
export const getPersonalAccount = getGoogleAccount
