/**
 * Admin accounts are fixed by the server owner in the container settings, so
 * nobody else can claim admin. ADMIN_EMAIL is the owner (comma-separated for
 * several); ADMIN_EMAIL_2 is an optional extra admin such as an assistant.
 */
export function getAdminEmails(): string[] {
  return [process.env.ADMIN_EMAIL, process.env.ADMIN_EMAIL_2]
    .join(",")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && getAdminEmails().includes(email.trim().toLowerCase());
}
