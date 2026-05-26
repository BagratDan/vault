/**
 * Lossy preview redactor (spec §9.2 step 4). Keeps the first word; in the
 * remainder, replaces every alphanumeric char with U+2022 BULLET. Trims to
 * ~80 chars (breaking on the last whitespace inside the budget). Whitespace
 * and most punctuation pass through unchanged.
 */
const MAX_LEN = 80;

export function blurPreview(input: string): string {
  if (!input) return "";
  const truncated = trimToBudget(input, MAX_LEN);
  const firstSpace = truncated.search(/\s/);
  if (firstSpace === -1) {
    return truncated;
  }
  const head = truncated.slice(0, firstSpace);
  const tail = truncated.slice(firstSpace);
  return head + tail.replace(/[A-Za-z0-9]/g, "•");
}

function trimToBudget(s: string, budget: number): string {
  if (s.length <= budget) return s;
  const slice = s.slice(0, budget);
  const lastSpace = slice.lastIndexOf(" ");
  return lastSpace > budget / 2 ? slice.slice(0, lastSpace) : slice;
}
