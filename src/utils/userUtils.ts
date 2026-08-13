/**
 * Utility functions for user operations
 */

/**
 * Removes password from user object safely
 * @param user - User object (can be any type)
 * @returns User object without password
 */
export function removePasswordFromUser<T extends { password?: any }>(user: T | null | undefined): Omit<T, 'password'> | null {
  if (!user) return null;
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword as Omit<T, 'password'>;
}

/**
 * Extracts user's display name from user object
 * Priority: firstName > phoneNumber > email prefix
 * @param user - User object with firstName, phoneNumber, and email
 * @returns Display name string
 */
export function getUserDisplayName(user: {
  firstName?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
}): string {
  if (user.firstName) return user.firstName;
  if (user.phoneNumber) return user.phoneNumber;
  if (user.email) return user.email.split('@')[0];
  return 'User';
}

