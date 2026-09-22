import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, type Extension, Prec } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as placeholderText,
} from "@codemirror/view";
import { type ReactNode, type Ref, useEffect, useImperativeHandle, useRef } from "react";
import type { CodeLanguage } from "@/features/editor/code-languages";
import { codeTheme } from "@/features/editor/code-theme";

export interface CursorPosition {
  line: number;
  column: number;
  /** Characters selected, 0 for a plain cursor. */
  selected: number;
}

export interface CodeEditorHandle {
  focus(): void;
}

export interface CodeEditorProps {
  /** Identity of the open document. Each keeps its own undo history and cursor. */
  docKey: string;
  value: string;
  language: CodeLanguage;
  wrap: boolean;
  placeholder?: string;
  ariaLabel: string;
  onChange(value: string): void;
  onSave(): void;
  onCursor?(position: CursorPosition): void;
  ref?: Ref<CodeEditorHandle>;
}

interface Callbacks {
  onChange(value: string): void;
  onSave(): void;
  onCursor?(position: CursorPosition): void;
}

function cursorOf(state: EditorState): CursorPosition {
  const range = state.selection.main;
  const line = state.doc.lineAt(range.head);
  return { line: line.number, column: range.head - line.from + 1, selected: range.to - range.from };
}

/**
 * CodeMirror 6 in a React component. The text is controlled by `value`, but the editor is only
 * told about it when it differs from what it already shows, so typing never fights React.
 */
export function CodeEditor({
  docKey,
  value,
  language,
  wrap,
  placeholder,
  ariaLabel,
  onChange,
  onSave,
  onCursor,
  ref,
}: CodeEditorProps): ReactNode {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const statesRef = useRef(new Map<string, EditorState>());
  const keyRef = useRef(docKey);
  const callbacks = useRef<Callbacks>({ onChange, onSave, onCursor });
  const compartments = useRef({
    language: new Compartment(),
    wrap: new Compartment(),
    label: new Compartment(),
  });
  const settings = useRef({ language, wrap, placeholder, ariaLabel });

  useEffect(() => {
    callbacks.current = { onChange, onSave, onCursor };
    settings.current = { language, wrap, placeholder, ariaLabel };
  });

  useImperativeHandle(ref, () => ({ focus: () => viewRef.current?.focus() }), []);

  function labelExtensions(): Extension {
    const { ariaLabel: label, placeholder: hint } = settings.current;
    return [
      EditorView.contentAttributes.of({ "aria-label": label, spellcheck: "true" }),
      hint ? placeholderText(hint) : [],
    ];
  }

  function createState(doc: string): EditorState {
    const { language: lang, wrap: wrapLines } = settings.current;
    const parts = compartments.current;
    return EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true }),
        Prec.highest(
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                callbacks.current.onSave();
                return true;
              },
            },
          ]),
        ),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        parts.language.of(lang.extension()),
        parts.wrap.of(wrapLines ? EditorView.lineWrapping : []),
        parts.label.of(labelExtensions()),
        codeTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
          if (update.docChanged || update.selectionSet) {
            callbacks.current.onCursor?.(cursorOf(update.state));
          }
        }),
      ],
    });
  }

  // One view for the component's lifetime; documents are swapped in as states.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new EditorView({ parent: host, state: createState(value) });
    viewRef.current = view;
    callbacks.current.onCursor?.(cursorOf(view.state));
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Created once; later props arrive through the effects below.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Another document: park the current one with its history, bring the next one back.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || keyRef.current === docKey) return;
    statesRef.current.set(keyRef.current, view.state);
    keyRef.current = docKey;
    const parked = statesRef.current.get(docKey);
    const next = parked && parked.doc.toString() === value ? parked : createState(value);
    view.setState(next);
    // A parked state carries the settings it was created with.
    view.dispatch({
      effects: [
        compartments.current.language.reconfigure(language.extension()),
        compartments.current.wrap.reconfigure(wrap ? EditorView.lineWrapping : []),
        compartments.current.label.reconfigure(labelExtensions()),
      ],
    });
    callbacks.current.onCursor?.(cursorOf(view.state));
    // `value`, `language` and `wrap` are applied by their own effects too.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  // Text replaced from outside (reload from disk, an earlier version): one undoable change.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || keyRef.current !== docKey) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    const head = Math.min(view.state.selection.main.head, value.length);
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: { anchor: head },
    });
  }, [value, docKey]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: compartments.current.language.reconfigure(language.extension()),
    });
  }, [language]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: compartments.current.wrap.reconfigure(wrap ? EditorView.lineWrapping : []),
    });
  }, [wrap]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: compartments.current.label.reconfigure(labelExtensions()),
    });
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [ariaLabel, placeholder]);

  return <div ref={hostRef} data-selectable className="h-full min-h-0 overflow-hidden" />;
}
