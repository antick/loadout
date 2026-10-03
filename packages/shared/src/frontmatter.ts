/**
 * A document's leading YAML block, as Agent Skills and agents' rule files write it. The groups:
 * 1 the opening `---` line with its line break, 2 that line break alone, 3 the YAML, 4 the closing
 * `---` line. A byte-order mark and blank lines before it are allowed.
 */
export const FRONTMATTER_BLOCK =
  /^(\uFEFF?\s*---[ \t]*(\r?\n))([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/;
