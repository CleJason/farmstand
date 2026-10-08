/**
 * Admin accounts are fixed by the server owner in the container settings
 * (ADMIN_EMAIL, comma-separated for several), so nobody else can claim admin
 * through the setup wizard.
 */
export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && getAdminEmails().includes(email.trim().toLowerCase());
}
