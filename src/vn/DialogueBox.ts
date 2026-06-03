import "./vn-styles.css";

/**
 * DialogueBox (P3.1) — the galgame VN dialogue surface: a bottom text band with
 * a name tab + typewriter body. It's the primary thing the cat "says" on screen
 * (scripted lines, chat replies, story beats), replacing the floating speech
 * bubble. It owns ONLY its DOM + timers; callers keep doing audio (speak/duck).
 *
 * Two modes:
 *   say(text)        — a complete line, typed out char-by-char, auto-hiding after
 *                      a read dwell. Tap to skip the typewriter, tap again to close.
 *   beginStream()    — the network paces the text (LLM stream); push accumulated
 *                      text via the handle's setText(), then end(dwell).
 */

export interface DialogueBoxOpts {
  /** Name shown in the tab, read fresh each open (so renames apply). */
  getName?: () => string;
  /** Where to mount. Defaults to document.body. */
  parent?: HTMLElement;
  /** Typewriter speed for say() in ms/char. Default 24. */
  charMs?: number;
}

export interface StreamHandle {
  /** Set the full accumulated text so far (call on each stream delta). */
  setText(full: string): void;
  /** Mark the stream complete; keep the box up for `dwellMs` then auto-hide. */
  end(dwellMs?: number): void;
}

const DWELL_MAX = 7000;
const DWELL_BASE = 2200;
const DWELL_PER_CHAR = 180;

export class DialogueBox {
  private readonly root: HTMLElement;
  private readonly nameEl: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly getName: () => string;
  private readonly charMs: number;

  private typeTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private full = ""; // text being typed (say mode)
  private typing = false;
  private streaming = false;

  constructor(opts: DialogueBoxOpts = {}) {
    this.getName = opts.getName ?? (() => "喵喵");
    this.charMs = opts.charMs ?? 24;

    const root = document.createElement("div");
    root.className = "vn-box";
    root.setAttribute("aria-live", "polite");
    root.innerHTML =
      '<div class="vn-name"></div>' +
      '<div class="vn-body"><span class="vn-text"></span><span class="vn-caret">▍</span></div>' +
      '<div class="vn-advance">▼</div>';
    (opts.parent ?? document.body).appendChild(root);

    this.root = root;
    this.nameEl = root.querySelector(".vn-name") as HTMLElement;
    this.textEl = root.querySelector(".vn-text") as HTMLElement;
    root.addEventListener("click", () => this.onTap());
  }

  /** Show a complete line, typed out, auto-hiding after a read dwell. */
  say(text: string, dwellMs?: number): void {
    if (!text) return;
    this.cancelTimers();
    this.streaming = false;
    this.full = text;
    this.open();
    this.typeOut(text, () => {
      this.hideTimer = setTimeout(() => this.hide(), dwellMs ?? dwellFor(text));
    });
  }

  /** Begin a streamed line — the caller pushes accumulated text as it arrives. */
  beginStream(): StreamHandle {
    this.cancelTimers();
    this.streaming = true;
    this.typing = false;
    this.full = "";
    this.open();
    this.setText("");
    return {
      setText: (full: string) => {
        if (!this.streaming) return;
        this.full = full;
        this.setText(full);
      },
      end: (dwellMs?: number) => {
        if (!this.streaming) return;
        this.streaming = false;
        this.root.classList.add("done");
        const text = this.textEl.textContent || "";
        this.hideTimer = setTimeout(() => this.hide(), dwellMs ?? dwellFor(text));
      },
    };
  }

  hide(): void {
    this.cancelTimers();
    this.typing = false;
    this.streaming = false;
    this.root.classList.remove("show");
  }

  isOpen(): boolean {
    return this.root.classList.contains("show");
  }

  // ---- internals ----

  private open(): void {
    this.nameEl.textContent = this.getName();
    this.root.classList.add("show");
    this.root.classList.remove("done");
  }

  private setText(s: string): void {
    this.textEl.textContent = s;
  }

  private typeOut(text: string, done: () => void): void {
    this.setText("");
    if (!text.length) {
      this.root.classList.add("done");
      done();
      return;
    }
    this.typing = true;
    this.root.classList.remove("done");
    let i = 0;
    const step = () => {
      if (!this.typing) return;
      i++;
      this.setText(text.slice(0, i));
      if (i >= text.length) {
        this.typing = false;
        this.root.classList.add("done");
        done();
        return;
      }
      this.typeTimer = setTimeout(step, this.charMs);
    };
    this.typeTimer = setTimeout(step, this.charMs);
  }

  /** Tap: skip the typewriter while typing; once done, tap again to dismiss. */
  private onTap(): void {
    if (this.typing) {
      this.typing = false;
      if (this.typeTimer) clearTimeout(this.typeTimer);
      this.setText(this.full);
      this.root.classList.add("done");
      if (this.hideTimer) clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => this.hide(), dwellFor(this.full));
    } else if (!this.streaming && this.root.classList.contains("done")) {
      this.hide();
    }
  }

  private cancelTimers(): void {
    if (this.typeTimer) clearTimeout(this.typeTimer);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.typeTimer = null;
    this.hideTimer = null;
  }
}

/** Read-dwell for a line — matches main.js's bubbleDwellMs heuristic. */
function dwellFor(s: string): number {
  return Math.min(DWELL_MAX, DWELL_BASE + (s ? s.length : 0) * DWELL_PER_CHAR);
}
