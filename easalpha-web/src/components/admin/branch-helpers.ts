/**
 * What the branch code box keeps of what is typed: A-Z and 0-9, upper-cased, at most 8. The code is printed in every
 * receipt number and its Code 128 barcode, and the API holds new and changed codes to the same rule (review of 6 Nov
 * 2026, R15); an older code is shown as it is until someone edits it.
 */
export const branchCode = (typed: string): string => typed.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
