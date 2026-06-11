/**
 * Diacritic-insensitive fold for search: lowercases, strips combining marks, and
 * maps Turkish dotless-i so "ugurcan cakir" matches "Uğurcan Çakır".
 */
export function fold(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ç/g, "c");
}

export const matches = (haystack: string, needle: string) =>
  fold(haystack).includes(fold(needle));
