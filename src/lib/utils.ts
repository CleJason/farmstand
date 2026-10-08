import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a Date to a readable string */
export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}

/** Format a Date to time string */
export function formatTime(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(date));
}

/** Format cents to display string */
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/** Generate a PayPal.me URL with pre-filled amount and note */
export function paypalMeUrl(username: string | undefined, amount: number): string {
  if (!username) return "#";
  const dollars = (amount / 100).toFixed(2);
  return `https://www.paypal.me/${username}/${dollars}?country.x=US&locale.x=en_US`;
}

/** Generate a Venmo deep link with pre-filled amount and note */
export function venmoUrl(username: string | undefined, amount: number, note: string): string {
  if (!username) return "#";
  const dollars = (amount / 100).toFixed(2);
  const encodedNote = encodeURIComponent(note);
  return `https://venmo.com/${username}?txn=pay&amount=${dollars}&note=${encodedNote}`;
}
