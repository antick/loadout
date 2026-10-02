/** The attribute that marks a field handling Escape itself (it cancels an edit or clears text). */
const OWNS_ESCAPE = "data-owns-escape";

/** Spread on such a field: `<Textarea {...ownsEscape} />`. */
export const ownsEscape = { [OWNS_ESCAPE]: "" } as const;

/**
 * A field that takes Escape for itself, so the dialog or sheet around it must stay open: a search
 * field with text in it (Escape clears it), or one marked with {@link ownsEscape} (Escape cancels
 * its edit). Radix hears the key first, on the document, so the field cannot stop it there.
 */
export function fieldOwnsEscape(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement && target.type === "search" && target.value !== "") {
    return true;
  }
  return target.closest(`[${OWNS_ESCAPE}]`) !== null;
}
