/**
 * Operational transformation on plain text (v11 collaborative documents) — the ot.js model.
 *
 * An operation is a list of components that walks the whole base document:
 *   `number` = retain n chars · `string` = insert · `{ d: n }` = delete n chars.
 * Lengths are **UTF-16 code units** (what JavaScript strings index), exactly as the server counts them.
 *
 * Canonical form (what `normalize` produces): no empty components, adjacent components of the same kind merged,
 * and an insert placed before an adjacent delete (insert+delete and delete+insert mean the same thing).
 *
 * Pure: no DOM, no I/O.
 */

export type OtComponent = number | string | { d: number };
export type Ops = OtComponent[];

export const isRetain = (c: OtComponent): c is number => typeof c === 'number';
export const isInsert = (c: OtComponent): c is string => typeof c === 'string';
export const isDelete = (c: OtComponent): c is { d: number } => typeof c === 'object' && c !== null && typeof (c as { d: unknown }).d === 'number';

/** Incremental builder that keeps the canonical form. */
class Builder {
  readonly ops: Ops = [];
  retain(n: number): this {
    if (n <= 0) return this;
    const last = this.ops[this.ops.length - 1];
    if (last !== undefined && isRetain(last)) this.ops[this.ops.length - 1] = last + n;
    else this.ops.push(n);
    return this;
  }
  insert(s: string): this {
    if (!s) return this;
    const ops = this.ops;
    const last = ops[ops.length - 1];
    if (last !== undefined && isInsert(last)) { ops[ops.length - 1] = last + s; return this; }
    if (last !== undefined && isDelete(last)) {
      // Keep inserts before deletes: …, ins, del  (merge with an insert that precedes the delete).
      const prev = ops[ops.length - 2];
      if (prev !== undefined && isInsert(prev)) ops[ops.length - 2] = prev + s;
      else ops.splice(ops.length - 1, 0, s);
      return this;
    }
    ops.push(s);
    return this;
  }
  delete(n: number): this {
    if (n <= 0) return this;
    const last = this.ops[this.ops.length - 1];
    if (last !== undefined && isDelete(last)) this.ops[this.ops.length - 1] = { d: last.d + n };
    else this.ops.push({ d: n });
    return this;
  }
  push(c: OtComponent): this {
    if (isRetain(c)) return this.retain(c);
    if (isInsert(c)) return this.insert(c);
    return this.delete(c.d);
  }
}

function assertComponent(c: unknown): asserts c is OtComponent {
  if (typeof c === 'number') { if (!Number.isInteger(c) || c < 0) throw new Error(`Bad retain: ${c}`); return; }
  if (typeof c === 'string') return;
  if (isDelete(c as OtComponent) && Number.isInteger((c as { d: number }).d) && (c as { d: number }).d >= 0) return;
  throw new Error(`Bad op component: ${JSON.stringify(c)}`);
}

/** Merge adjacent same-kind components, drop empty ones, put inserts before adjacent deletes. Throws on garbage. */
export function normalize(ops: readonly unknown[]): Ops {
  const b = new Builder();
  for (const c of ops) { assertComponent(c); b.push(c); }
  return b.ops;
}

/** Length of the document the op applies to. */
export function baseLength(ops: readonly OtComponent[]): number {
  let n = 0;
  for (const c of ops) n += isRetain(c) ? c : isDelete(c) ? c.d : 0;
  return n;
}

/** Length of the document the op produces. */
export function targetLength(ops: readonly OtComponent[]): number {
  let n = 0;
  for (const c of ops) n += isRetain(c) ? c : isInsert(c) ? c.length : 0;
  return n;
}

/** Does nothing (only retains)? */
export function isNoop(ops: readonly OtComponent[]): boolean {
  return ops.every(isRetain);
}

/** Identity op for a document of `length`. */
export const identity = (length: number): Ops => (length > 0 ? [length] : []);

export function apply(text: string, ops: readonly OtComponent[]): string {
  if (baseLength(ops) !== text.length) throw new Error(`Op spans ${baseLength(ops)} chars, document has ${text.length}`);
  let out = '';
  let pos = 0;
  for (const c of ops) {
    if (isRetain(c)) { out += text.slice(pos, pos + c); pos += c; }
    else if (isInsert(c)) out += c;
    else pos += c.d;
  }
  return out;
}

/** The op that undoes `ops` (needs the text it was applied to, to restore deleted characters). */
export function invert(ops: readonly OtComponent[], text: string): Ops {
  const b = new Builder();
  let pos = 0;
  for (const c of ops) {
    if (isRetain(c)) { b.retain(c); pos += c; }
    else if (isInsert(c)) b.delete(c.length);
    else { b.insert(text.slice(pos, pos + c.d)); pos += c.d; }
  }
  return b.ops;
}

/* Component cursor: hands out pieces of components, splitting them as needed. */
class Reader {
  private i = 0;
  private off = 0; // consumed part of the current component
  constructor(private readonly ops: readonly OtComponent[]) {}
  peek(): OtComponent | undefined {
    const c = this.ops[this.i];
    if (c === undefined) return undefined;
    if (this.off === 0) return c;
    if (isRetain(c)) return c - this.off;
    if (isInsert(c)) return c.slice(this.off);
    return { d: c.d - this.off };
  }
  /** Take at most `n` length units of the current component (whole insert when n is Infinity). */
  take(n: number): OtComponent {
    const c = this.peek()!;
    const len = isRetain(c) ? c : isInsert(c) ? c.length : c.d;
    if (n >= len) { this.i++; this.off = 0; return c; }
    this.off += n;
    if (isRetain(c)) return n;
    if (isInsert(c)) return c.slice(0, n);
    return { d: n };
  }
}

const compLen = (c: OtComponent) => (isRetain(c) ? c : isInsert(c) ? c.length : c.d);

/** a then b, as one op: apply(apply(s, a), b) == apply(s, compose(a, b)). */
export function compose(a: readonly OtComponent[], b: readonly OtComponent[]): Ops {
  if (targetLength(a) !== baseLength(b)) throw new Error(`compose: ${targetLength(a)} ≠ ${baseLength(b)}`);
  const out = new Builder();
  const ra = new Reader(a);
  const rb = new Reader(b);
  for (;;) {
    const ca = ra.peek();
    const cb = rb.peek();
    if (ca === undefined && cb === undefined) break;
    // Deletes in a and inserts in b don't interact with the other side.
    if (ca !== undefined && isDelete(ca)) { out.push(ra.take(Infinity)); continue; }
    if (cb !== undefined && isInsert(cb)) { out.push(rb.take(Infinity)); continue; }
    if (ca === undefined || cb === undefined) throw new Error('compose: length mismatch');
    const n = Math.min(compLen(ca), compLen(cb));
    const pa = ra.take(n);
    const pb = rb.take(n);
    if (isRetain(pa)) {
      out.push(pb); // retain→retain = retain; retain→delete = delete
    } else if (isInsert(pa)) {
      if (isRetain(pb)) out.insert(pa); // inserted then kept
      // inserted then deleted: nothing
    }
  }
  return out.ops;
}

/**
 * Concurrent ops a and b on the same document → [a', b'] such that
 * apply(apply(s, a), b') == apply(apply(s, b), a').
 * Tie-break (both insert at one offset): **a's insert goes first** — ot.js convention; callers pass the op that is
 * being rebased (the client's pending op, or the server's incoming op) as `a`.
 */
export function transform(a: readonly OtComponent[], b: readonly OtComponent[]): [Ops, Ops] {
  if (baseLength(a) !== baseLength(b)) throw new Error(`transform: ${baseLength(a)} ≠ ${baseLength(b)}`);
  const a1 = new Builder();
  const b1 = new Builder();
  const ra = new Reader(a);
  const rb = new Reader(b);
  for (;;) {
    const ca = ra.peek();
    const cb = rb.peek();
    if (ca === undefined && cb === undefined) break;
    if (ca !== undefined && isInsert(ca)) {
      const s = ra.take(Infinity) as string;
      a1.insert(s); b1.retain(s.length);
      continue;
    }
    if (cb !== undefined && isInsert(cb)) {
      const s = rb.take(Infinity) as string;
      a1.retain(s.length); b1.insert(s);
      continue;
    }
    if (ca === undefined || cb === undefined) throw new Error('transform: length mismatch');
    const n = Math.min(compLen(ca), compLen(cb));
    const pa = ra.take(n);
    const pb = rb.take(n);
    if (isRetain(pa) && isRetain(pb)) { a1.retain(n); b1.retain(n); }
    else if (isDelete(pa) && isRetain(pb)) a1.delete(n);
    else if (isRetain(pa) && isDelete(pb)) b1.delete(n);
    // both delete the same span: neither needs to
  }
  return [a1.ops, b1.ops];
}

/**
 * Where a position ends up after `ops`. An insert exactly at the position pushes it forward only when `isOwn`
 * (your own typing moves your caret; someone else typing at your caret leaves it before their text).
 */
export function transformIndex(ops: readonly OtComponent[], index: number, isOwn = false): number {
  let pos = 0; // position in the old document
  let out = index;
  for (const c of ops) {
    if (pos > index) break;
    if (isRetain(c)) { pos += c; continue; }
    if (isInsert(c)) {
      if (pos < index || (pos === index && isOwn)) out += c.length;
      continue;
    }
    // delete [pos, pos + d)
    const end = pos + c.d;
    if (end <= index) out -= c.d;
    else if (pos < index) out -= index - pos;
    pos = end;
  }
  return out;
}

const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/**
 * Single-span diff: common prefix and suffix kept, the middle replaced. Exactly what a textarea edit (typing,
 * paste, cut, IME, autocorrect) produces. Never splits a surrogate pair, so emoji stay whole.
 */
export function fromDiff(oldText: string, newText: string): Ops {
  if (oldText === newText) return identity(oldText.length);
  const max = Math.min(oldText.length, newText.length);
  let pre = 0;
  while (pre < max && oldText.charCodeAt(pre) === newText.charCodeAt(pre)) pre++;
  // Don't end the prefix between the halves of a surrogate pair.
  if (pre > 0 && isHigh(oldText.charCodeAt(pre - 1)) && (isLow(oldText.charCodeAt(pre)) || isLow(newText.charCodeAt(pre)))) pre--;
  let suf = 0;
  const maxSuf = max - pre;
  while (suf < maxSuf && oldText.charCodeAt(oldText.length - 1 - suf) === newText.charCodeAt(newText.length - 1 - suf)) suf++;
  // Don't start the suffix on a low surrogate.
  if (suf > 0 && isLow(oldText.charCodeAt(oldText.length - suf)) && (isHigh(oldText.charCodeAt(oldText.length - suf - 1)) || isHigh(newText.charCodeAt(newText.length - suf - 1)))) suf--;
  const b = new Builder();
  b.retain(pre);
  b.insert(newText.slice(pre, newText.length - suf));
  b.delete(oldText.length - suf - pre);
  b.retain(suf);
  return b.ops;
}

/** Move an offset off the middle of a surrogate pair (for carets computed from other people's offsets). */
export function clampIndex(text: string, index: number): number {
  const i = Math.max(0, Math.min(text.length, Math.round(index)));
  return i > 0 && i < text.length && isLow(text.charCodeAt(i)) && isHigh(text.charCodeAt(i - 1)) ? i - 1 : i;
}

/* ─────────────── client state machine ─────────────── */

export type OtClientState =
  | { kind: 'synchronized' }
  /** One op sent, waiting for the server to acknowledge it. */
  | { kind: 'awaiting'; inflight: Ops }
  /** One op in flight plus local edits made since, composed into `buffer` and sent after the ack. */
  | { kind: 'buffering'; inflight: Ops; buffer: Ops };

/**
 * Client half of server-authoritative OT (ot.js `Client`). Holds the local text, the last server revision it has
 * seen, and at most one op in flight. Feed it local edits and server events; it calls `send` when an op should go
 * out and returns the (transformed) op to apply locally for server ops.
 */
export class OtClient {
  revision: number;
  text: string;
  state: OtClientState = { kind: 'synchronized' };

  constructor(revision: number, text: string, private readonly send: (baseRevision: number, ops: Ops) => void) {
    this.revision = revision;
    this.text = text;
  }

  /** Local edit (already in the editor). */
  applyLocal(ops: Ops): void {
    const n = normalize(ops);
    if (isNoop(n)) return;
    this.text = apply(this.text, n);
    const s = this.state;
    if (s.kind === 'synchronized') {
      this.state = { kind: 'awaiting', inflight: n };
      this.send(this.revision, n);
    } else if (s.kind === 'awaiting') {
      this.state = { kind: 'buffering', inflight: s.inflight, buffer: n };
    } else {
      this.state = { kind: 'buffering', inflight: s.inflight, buffer: compose(s.buffer, n) };
    }
  }

  /** Someone else's committed op (the next revision). Returns the op as it applies to the local text. */
  applyServer(ops: Ops): Ops {
    const n = normalize(ops);
    this.revision++;
    const s = this.state;
    let local: Ops;
    if (s.kind === 'synchronized') {
      local = n;
    } else if (s.kind === 'awaiting') {
      const [inflight, o] = transform(s.inflight, n);
      this.state = { kind: 'awaiting', inflight };
      local = o;
    } else {
      const [inflight, o1] = transform(s.inflight, n);
      const [buffer, o2] = transform(s.buffer, o1);
      this.state = { kind: 'buffering', inflight, buffer };
      local = o2;
    }
    this.text = apply(this.text, local);
    return local;
  }

  /** The server committed our in-flight op (as the next revision). */
  serverAck(): void {
    const s = this.state;
    if (s.kind === 'synchronized') throw new Error('No operation is in flight');
    this.revision++;
    if (s.kind === 'awaiting') {
      this.state = { kind: 'synchronized' };
    } else {
      this.state = { kind: 'awaiting', inflight: s.buffer };
      this.send(this.revision, s.buffer);
    }
  }

  /** Send the in-flight op again (after a network failure / reconnect catch-up didn't find it committed). */
  resend(): void {
    const s = this.state;
    if (s.kind !== 'synchronized') this.send(this.revision, s.inflight);
  }

  /** Throw everything local away and continue from the server's text (stale base, rejected op). */
  resync(revision: number, text: string): void {
    this.revision = revision;
    this.text = text;
    this.state = { kind: 'synchronized' };
  }

  /** Every unacknowledged local change as one op (local text → … the server's text at `revision` is its base). */
  pending(): Ops | null {
    const s = this.state;
    if (s.kind === 'synchronized') return null;
    return s.kind === 'awaiting' ? s.inflight : compose(s.inflight, s.buffer);
  }

  get inflight(): Ops | null {
    return this.state.kind === 'synchronized' ? null : this.state.inflight;
  }
}

/** Ops equal after normalisation (to check that the server applied what we expected). */
export function sameOps(a: readonly unknown[], b: readonly unknown[]): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
