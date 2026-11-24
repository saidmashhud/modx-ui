/**
 * Form participation for mx-* controls (form-associated custom elements). A control with `static formAssociated =
 * true` keeps a `FormControl`, which owns its ElementInternals: the value a <form> submits (`setFormValue`), the
 * `required` validity, and the form the element belongs to. Where ElementInternals is missing (old browsers, DOM
 * shims) every call is a no-op and the control works as before, outside form submission.
 */

export type FormValue = string | File | FormData | null;

/** The part of ElementInternals the kit uses (so tests can pass a stand-in). */
export interface FormInternals {
  readonly form: HTMLFormElement | null;
  setFormValue(value: FormValue, state?: FormValue): void;
  setValidity(flags?: ValidityStateFlags, message?: string, anchor?: HTMLElement): void;
  readonly validity?: ValidityState;
  readonly validationMessage?: string;
  checkValidity?(): boolean;
  reportValidity?(): boolean;
}

/** ElementInternals for `el`, or null where the platform has none (or it was already attached). */
export function attachFormInternals(el: HTMLElement): FormInternals | null {
  const attach = (el as { attachInternals?: () => ElementInternals }).attachInternals;
  if (typeof attach !== 'function') return null;
  try {
    return attach.call(el) as FormInternals;
  } catch {
    return null;
  }
}

/** Several values under one name (a multiple select, a date range) — what `setFormValue` takes for them. */
export function formDataOf(name: string, values: readonly string[]): FormData | null {
  if (typeof FormData === 'undefined') return null;
  const fd = new FormData();
  if (name) for (const v of values) fd.append(name, v);
  return fd;
}

export interface FormState {
  /** What the form submits for this control (null: nothing, like an unchecked checkbox). */
  value: FormValue;
  /** Restored by the browser on back/forward navigation and autofill (default: `value`). */
  state?: FormValue;
  /** The control is required and has no value. */
  missing: boolean;
  /** Shown by the browser for a missing value. */
  message: string;
  /** Where the browser anchors its validation bubble (an element inside the shadow root). */
  anchor?: HTMLElement | null;
}

/** Push value + validity into ElementInternals. */
export function applyFormState(i: FormInternals | null, s: FormState): void {
  if (!i) return;
  try {
    i.setFormValue(s.value, s.state === undefined ? s.value : s.state);
    if (s.missing) i.setValidity({ valueMissing: true }, s.message, s.anchor ?? undefined);
    else i.setValidity({});
  } catch { /* a stand-in without validity support */ }
}

/** One control's link to its form. */
export class FormControl {
  readonly internals: FormInternals | null;
  constructor(host: HTMLElement) {
    this.internals = attachFormInternals(host);
  }
  /** The form the control belongs to (its `form` attribute or nearest <form>), when the platform knows it. */
  get form(): HTMLFormElement | null { return this.internals?.form ?? null; }
  sync(s: FormState): void { applyFormState(this.internals, s); }
  checkValidity(): boolean { return this.internals?.checkValidity?.() ?? true; }
  reportValidity(): boolean { return this.internals?.reportValidity?.() ?? true; }
  get validity(): ValidityState | undefined { return this.internals?.validity; }
  get validationMessage(): string { return this.internals?.validationMessage ?? ''; }
}
