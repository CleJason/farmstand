/**
 * A phone number reduced to digits for matching: "(555) 123-4567",
 * "555.123.4567" and "+1 555 123 4567" all become "5551234567".
 * Returns "" for anything too short to be a phone number.
 */
export function phoneKey(input: string | null | undefined): string {
  let digits = String(input ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length >= 7 ? digits : "";
}
