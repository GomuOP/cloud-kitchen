/** Same fail-closed-in-production pattern as the session secret — see session.ts. */
export function getAdminPasscode(): string {
  const value = process.env.ADMIN_PASSCODE;
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ADMIN_PASSCODE must be set in production");
    }
    return "admin123";
  }
  return value;
}
