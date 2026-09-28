/**
 * A search field with text in it takes Escape for itself (it clears the text), so the dialog or
 * sheet around it must stay open. Radix hears the key first, on the document, hence this check.
 */
export function searchOwnsEscape(event: KeyboardEvent): boolean {
  const target = event.target;
  return target instanceof HTMLInputElement && target.type === "search" && target.value !== "";
}
