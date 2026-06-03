/**
 * Choices (P3.2) — the reusable "show options / on pick" surface for the VN
 * layer. Generalises the choice rendering that was inlined in main.js
 * (askQuestion's buttons + openNicknameDialog's text input) into one owner of
 * the #choices element: button lists with an optional ignore-timeout, and a
 * single-field text input. Styling reuses the existing .choices/.choice-btn/
 * .choice-input rules in style.css.
 */

export interface ChoiceItem {
  /** Button label. */
  label: string;
  /** Any extra payload the caller wants back in onPick. */
  [k: string]: any;
}

export interface ChoicesOpts {
  /** Auto-dismiss after this many ms with no pick, then call onTimeout. */
  timeoutMs?: number;
  onTimeout?: () => void;
}

export interface InputOpts {
  placeholder?: string;
  maxLength?: number;
  submitLabel?: string;
}

export class Choices {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly root: HTMLElement) {}

  /** Show a button list; the picked item (and its index) come back via onPick.
   *  The pick hides the list and clears any ignore-timeout. */
  show(
    items: ChoiceItem[],
    onPick: (item: ChoiceItem, index: number) => void,
    opts: ChoicesOpts = {}
  ): void {
    this.clear();
    items.forEach((item, i) => {
      const b = document.createElement("button");
      b.className = "choice-btn";
      b.textContent = item.label;
      b.addEventListener(
        "click",
        () => {
          this.hide();
          onPick(item, i);
        },
        { once: true }
      );
      this.root.appendChild(b);
    });
    this.reveal();
    if (opts.timeoutMs) {
      this.timer = setTimeout(() => {
        if (!this.isOpen()) return;
        this.hide();
        opts.onTimeout?.();
      }, opts.timeoutMs);
    }
  }

  /** Show a single text field + submit button; the entered text comes back via
   *  onSubmit (Enter submits too). Hides on submit. */
  showInput(opts: InputOpts, onSubmit: (text: string) => void): void {
    this.clear();
    const input = document.createElement("input");
    input.type = "text";
    if (opts.maxLength) input.maxLength = opts.maxLength;
    input.placeholder = opts.placeholder ?? "";
    input.className = "choice-input";

    const submit = document.createElement("button");
    submit.className = "choice-btn";
    submit.textContent = opts.submitLabel ?? "确定";

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      const value = input.value || "";
      this.hide();
      onSubmit(value);
    };
    submit.addEventListener("click", finish);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish();
    });

    this.root.appendChild(input);
    this.root.appendChild(submit);
    this.reveal();
    input.focus();
  }

  hide(): void {
    this.clearTimer();
    this.root.classList.add("hidden");
    this.root.innerHTML = "";
  }

  isOpen(): boolean {
    return !this.root.classList.contains("hidden");
  }

  // ---- internals ----

  private clear(): void {
    this.clearTimer();
    this.root.innerHTML = "";
  }

  private reveal(): void {
    this.root.classList.remove("hidden");
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
