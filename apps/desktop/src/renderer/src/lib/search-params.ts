/** Reading a route's search parameters, which arrive as whatever the address held. */

/** The text a parameter holds; "" when it is missing or not text. */
export function searchText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** The text a parameter holds; undefined when it is missing, empty or not text. */
export function optionalSearchText(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
