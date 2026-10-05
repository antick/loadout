import { CLI_BINARY_NAME } from "@loadout/shared";
import { type CompletionSpec, valueKinds } from "./spec";

/**
 * Bash and Zsh completion scripts. The tables are written out from the command definitions, so
 * a script always matches the CLI that printed it; names of skills, agents, presets and tags are
 * asked of the library while completing (`completion words <kind>`).
 *
 * Library words are untrusted text: they are compared and quoted, never evaluated (no
 * `compgen -W`, which expands `$(…)` inside the word list).
 */

const SHELLS = ["bash", "zsh"] as const;
export type Shell = (typeof SHELLS)[number];

/** Prefix of every shell function the scripts define, so they never clash with others. */
const FN = `_${CLI_BINARY_NAME}`;

/** One `case` branch per key, each printing its words on one line. */
function caseTable(name: string, rows: readonly (readonly [string, string])[]): string {
  const branches = rows.map(([key, words]) => `    '${key}') echo '${words}' ;;`);
  return [`${FN}_${name}() {`, '  case "$1" in', ...branches, "  esac", "}"].join("\n");
}

/** Spellings of the flags that take a value, space separated. */
const valued = (flags: CompletionSpec["globals"]): string =>
  flags
    .filter((flag) => flag.takesValue)
    .flatMap((flag) => flag.spellings)
    .join(" ");

/** Long spellings only: `-h` next to `--help` doubles the list for nothing. */
const offered = (flags: CompletionSpec["globals"]): string =>
  flags.flatMap((flag) => flag.spellings.filter((s) => s.startsWith("--"))).join(" ");

/** `flags`, `valued` and `positionals` tables, keyed by `group command` (empty key: globals). */
function tables(spec: CompletionSpec): string {
  const commands = [...spec.byPath.values()];
  const kinds = [...valueKinds(spec)].map(([spelling, flag]) => {
    const kind: string = flag.choices ? `choice:${flag.choices.join(",")}` : flag.kind;
    return [spelling, kind] as const;
  });
  const positionals = commands.map((command) => {
    const list = command.positionals.join(" ");
    return [command.path, command.repeats ? `${list} +` : list] as const;
  });
  return [
    `${FN}_groups() { echo '${spec.groups.join(" ")}'; }`,
    caseTable(
      "commands",
      [...spec.commands].map(([group, names]) => [group, names.join(" ")] as const),
    ),
    caseTable("flags", [
      ["", offered(spec.globals)],
      ...commands.map((command) => [command.path, offered(command.flags)] as const),
    ]),
    caseTable("valued", [
      ["", valued(spec.globals)],
      ...commands.map((command) => [command.path, valued(command.flags)] as const),
    ]),
    caseTable("kind", kinds),
    caseTable("positionals", positionals),
  ].join("\n\n");
}

/**
 * The part both shells share: walk the words typed so far and decide what the current one is.
 * Sets `lib` (a `--library` given) and either `kind` (what to complete) or `offer` (fixed words).
 * Written for Bash 3.2 (macOS) and for Zsh with KSH_ARRAYS, so arrays count from 0 in both.
 */
function scanner(first: string, current: string, word: (index: string) => string): string {
  return `  local group="" command="" lib="" kind="" offer="" npos=0 skip="" i w
  for ((i = ${first}; i < ${current}; i++)); do
    w=${word("i")}
    if [[ -n $skip ]]; then
      [[ $skip == --library ]] && lib=$w
      skip=""
      continue
    fi
    if [[ $w == -* ]]; then
      # Options of the command so far, and the global ones, which may come anywhere.
      [[ " $(${FN}_valued "$group\${command:+ $command}") $(${FN}_valued "") " == *" $w "* ]] && skip=$w
      continue
    fi
    if [[ -z $group ]]; then
      group=$w
    elif [[ -z $command && -n $(${FN}_commands "$group") ]]; then
      command=$w
    else
      npos=$((npos + 1))
    fi
  done
  local at="$group\${command:+ $command}"
  if [[ -n $skip ]]; then
    kind=$(${FN}_kind "$at $skip")
    [[ -z $kind ]] && kind=$(${FN}_kind " $skip")
  elif [[ $cur == -* ]]; then
    offer=$(${FN}_flags "$at")
  elif [[ -z $group ]]; then
    offer=$(${FN}_groups)
  elif [[ -z $command && -n $(${FN}_commands "$group") ]]; then
    offer=$(${FN}_commands "$group")
  else
    local list n
    list=($(${FN}_positionals "$at"))
    n=\${#list[@]}
    if ((n > 0)) && [[ \${list[n - 1]} == + ]]; then
      n=$((n - 1))
      if ((npos < n)); then kind=\${list[npos]}; else kind=\${list[n - 1]}; fi
    elif ((npos < n)); then
      kind=\${list[npos]}
    fi
  fi`;
}

const LIBRARY_KINDS = "skills|agents|presets|tags";

function bashScript(spec: CompletionSpec): string {
  return `# ${CLI_BINARY_NAME} completion for Bash. Printed by \`${CLI_BINARY_NAME} completion bash\`.
# Load it from ~/.bashrc:  eval "$(${CLI_BINARY_NAME} completion bash)"

${tables(spec)}

${FN}_library_words() {
  local kind=$1 lib=$2 cur=$3 name
  while IFS= read -r name; do
    [[ -n $name && $name == "$cur"* ]] && COMPREPLY+=("$(printf '%q' "$name")")
  done < <(command ${CLI_BINARY_NAME} completion words "$kind" \${lib:+--library "$lib"} 2>/dev/null)
}

${FN}() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  COMPREPLY=()
${scanner("1", "COMP_CWORD", (i) => `"\${COMP_WORDS[${i}]}"`)}
  local choice
  case $kind in
    ${LIBRARY_KINDS}) ${FN}_library_words "$kind" "$lib" "$cur" ;;
    files) compopt -o filenames 2>/dev/null; COMPREPLY=($(compgen -f -- "$cur")) ;;
    choice:*) choice=\${kind#choice:}
      for choice in \${choice//,/ }; do
        [[ $choice == "$cur"* ]] && COMPREPLY+=("$choice")
      done ;;
    *) for choice in $offer; do
        [[ $choice == "$cur"* ]] && COMPREPLY+=("$choice")
      done ;;
  esac
}

complete -F ${FN} ${CLI_BINARY_NAME}
`;
}

function zshScript(spec: CompletionSpec): string {
  return `#compdef ${CLI_BINARY_NAME}
# ${CLI_BINARY_NAME} completion for Zsh. Printed by \`${CLI_BINARY_NAME} completion zsh\`.
# Load it from ~/.zshrc, after compinit:  eval "$(${CLI_BINARY_NAME} completion zsh)"

${tables(spec)}

${FN}() {
  emulate -L zsh
  setopt ksh_arrays
  local cur="\${words[CURRENT - 1]}"
${scanner("1", "CURRENT - 1", (i) => `"\${words[${i}]}"`)}
  # Arrays count from 1 again for the rest.
  unsetopt ksh_arrays
  case $kind in
    ${LIBRARY_KINDS})
      local -a names
      names=("\${(@f)$(command ${CLI_BINARY_NAME} completion words "$kind" \${lib:+--library "$lib"} 2>/dev/null)}")
      names=("\${(@)names:#}")
      compadd -a names ;;
    files) _files ;;
    choice:*)
      local -a choices
      choices=("\${(@s:,:)\${kind#choice:}}")
      compadd -a choices ;;
    *)
      local -a fixed
      fixed=(\${=offer})
      compadd -a fixed ;;
  esac
}

if [[ \${zsh_eval_context[-1]} == loadautofunc ]]; then
  ${FN} "$@"
else
  compdef ${FN} ${CLI_BINARY_NAME}
fi
`;
}

/** The completion script for `shell`. */
export function completionScript(shell: Shell, spec: CompletionSpec): string {
  return shell === "bash" ? bashScript(spec) : zshScript(spec);
}
