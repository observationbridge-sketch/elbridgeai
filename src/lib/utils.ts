import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Map internal grade band value to user-facing display label */
export function displayGradeBand(band: string): string {
  if (band === "K-2") return "1-2";
  return band;
}
