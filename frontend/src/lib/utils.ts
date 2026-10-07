import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// The canonical patient identifier is Patient.id (a UUID) — there is no
// separate human-facing patient number field in the schema. This shows a
// consistent, truncated prefix of that real id (never a hash, random value,
// or a different record's id), so the same patient always displays the same
// value everywhere.
export function getPatientDisplayId(id: string): string {
  return `ID ${id.slice(0, 8).toUpperCase()}`
}
