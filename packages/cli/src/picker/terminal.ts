import { emitKeypressEvents } from "node:readline";
import { COLOR_STYLES, PLAIN_STYLES, renderPicker } from "./render";
import { type PickRequest, type PickerKey, createPickerState, pickerStep } from "./state";

/** The streams of an interactive terminal: both ends must be one for the picker to run. */
export interface PickerTerminal {
  input: NodeJS.ReadStream;
  output: NodeJS.WriteStream;
  /** Colour unless `NO_COLOR` is set (no-color.org). */
  color: boolean;
}

const ESC = "\u001B[";
/** The alternate screen keeps the picker out of the scrollback; the cursor is hidden meanwhile. */
const ENTER_SCREEN = `${ESC}?1049h${ESC}?25l`;
const LEAVE_SCREEN = `${ESC}?25h${ESC}?1049l`;
const CLEAR = `${ESC}H${ESC}2J`;
const FALLBACK_COLUMNS = 80;
const FALLBACK_ROWS = 24;

/**
 * Let a person tick skills with the keyboard. Resolves with the chosen keys, or null when they
 * cancel. The terminal is always put back as it was, whatever happens.
 */
export function pickInTerminal(
  terminal: PickerTerminal,
  request: PickRequest,
): Promise<string[] | null> {
  const { input, output } = terminal;
  const styles = terminal.color ? COLOR_STYLES : PLAIN_STYLES;
  let state = createPickerState(request);

  const draw = (): void => {
    const lines = renderPicker(
      state,
      output.columns || FALLBACK_COLUMNS,
      output.rows || FALLBACK_ROWS,
      styles,
    );
    output.write(`${CLEAR}${lines.join("\r\n")}`);
  };

  return new Promise((resolve, reject) => {
    const wasRaw = input.isRaw;
    let restored = false;
    // Also on the way out of a process that exits meanwhile: never a raw terminal left behind.
    const restore = (): void => {
      if (restored) return;
      restored = true;
      input.off("keypress", onKey);
      output.off("resize", redraw);
      process.off("exit", restore);
      input.setRawMode(wasRaw);
      input.pause();
      output.write(LEAVE_SCREEN);
    };
    const fail = (error: unknown): void => {
      restore();
      reject(error);
    };
    const redraw = (): void => {
      try {
        draw();
      } catch (error) {
        fail(error);
      }
    };
    const onKey = (_text: string | undefined, key: PickerKey | undefined): void => {
      try {
        const step = pickerStep(state, key ?? {});
        if (step.type === "confirm" || step.type === "cancel") {
          restore();
          resolve(step.type === "confirm" ? step.keys : null);
          return;
        }
        state = step.state;
        draw();
      } catch (error) {
        fail(error);
      }
    };
    process.on("exit", restore);
    try {
      emitKeypressEvents(input);
      input.setRawMode(true);
      input.resume();
      input.on("keypress", onKey);
      output.on("resize", redraw);
      output.write(ENTER_SCREEN);
      draw();
    } catch (error) {
      fail(error);
    }
  });
}
