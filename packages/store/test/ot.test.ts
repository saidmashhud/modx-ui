import { describe, expect, it } from 'vitest';
import {
  apply, baseLength, clampIndex, compose, fromDiff, invert, isInsert, normalize, OtClient, sameOps, targetLength, transform,
  transformIndex, type Ops,
} from '../src/ot.js';

/* ───────── seeded randomness ───────── */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABET = ['a', 'b', 'c', ' ', '\n', 'ж', 'я', '😀', '🏗️', '👍🏽', 'é', '#', '<@usr_1>'];

function randStr(r: () => number, max = 6): string {
  let s = '';
  const n = Math.floor(r() * max) + 1;
  for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(r() * ALPHABET.length)];
  return s;
}

/** Random op over `text` (UTF-16 units; may split surrogate pairs — the algebra must not care). */
function randOp(r: () => number, text: string): Ops {
  const ops: Ops = [];
  let left = text.length;
  while (left > 0) {
    const n = Math.min(left, Math.floor(r() * 5) + 1);
    const k = r();
    if (k < 0.45) ops.push(n);
    else if (k < 0.7) ops.push({ d: n });
    else { ops.push(randStr(r)); continue; }
    left -= n;
  }
  if (r() < 0.4) ops.push(randStr(r));
  return normalize(ops);
}

/** A textarea-like edit: one span replaced, small. Keeps simulated documents from growing without bound. */
function editOp(r: () => number, text: string): Ops {
  const at = Math.floor(r() * (text.length + 1));
  const del = Math.min(text.length - at, Math.floor(r() * 4));
  return normalize([at, r() < 0.7 ? randStr(r, 3) : '', { d: del }, text.length - at - del]);
}

const wellFormed = (s: string) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

/* ───────── basics ───────── */

describe('ot basics', () => {
  it('applies retain / insert / delete over UTF-16 code units', () => {
    expect(apply('hello world', [6, { d: 5 }, 'there'])).toBe('hello there');
    expect(apply('', ['abc'])).toBe('abc');
    expect(apply('a😀b', [1, { d: 2 }, 1])).toBe('ab'); // the emoji is two code units
    expect(() => apply('abc', [2])).toThrow();
    expect(() => apply('abc', [4])).toThrow();
  });

  it('normalises: merges, drops empties, puts inserts before deletes', () => {
    expect(normalize([1, 2, '', 'a', 'b', { d: 0 }, { d: 1 }, { d: 2 }, 0])).toEqual([3, 'ab', { d: 3 }]);
    expect(normalize([{ d: 2 }, 'x'])).toEqual(['x', { d: 2 }]);
    expect(normalize(['a', { d: 1 }, 'b', { d: 1 }])).toEqual(['ab', { d: 2 }]);
    expect(() => normalize([-1])).toThrow();
    expect(() => normalize([{ x: 1 }])).toThrow();
    expect(baseLength([2, 'abc', { d: 3 }])).toBe(5);
    expect(targetLength([2, 'abc', { d: 3 }])).toBe(5);
  });

  it('transforms concurrent inserts at the same offset with the first op winning', () => {
    const [a1, b1] = transform([1, 'A', 1], [1, 'B', 1]);
    expect(apply(apply('xy', [1, 'A', 1]), b1)).toBe('xABy');
    expect(apply(apply('xy', [1, 'B', 1]), a1)).toBe('xABy');
  });

  it('transforms overlapping deletes so the span is removed once', () => {
    const s = 'abcdefgh';
    const a: Ops = [1, { d: 4 }, 3]; // bcde
    const b: Ops = [3, { d: 4 }, 1]; // defg
    const [a1, b1] = transform(a, b);
    expect(apply(apply(s, a), b1)).toBe('ah');
    expect(apply(apply(s, b), a1)).toBe('ah');
  });

  it('transformIndex moves carets past inserts before them and pulls them into deletions', () => {
    const op: Ops = [2, 'XX', 3, { d: 2 }, 1]; // over "abcdefgh"
    expect(transformIndex(op, 0)).toBe(0);
    expect(transformIndex(op, 2)).toBe(2); // insert exactly at someone else's caret: stays before
    expect(transformIndex(op, 2, true)).toBe(4); // own insert: caret after the text
    expect(transformIndex(op, 4)).toBe(6);
    expect(transformIndex(op, 6)).toBe(7); // inside the deleted span → its start
    expect(transformIndex(op, 8)).toBe(8);
    expect(transformIndex([{ d: 3 }, 2], 5)).toBe(2);
  });

  it('fromDiff produces a single span and never splits a surrogate pair', () => {
    expect(fromDiff('hello', 'hello')).toEqual([5]);
    expect(fromDiff('hello', 'help')).toEqual([3, 'p', { d: 2 }]);
    expect(fromDiff('', 'x')).toEqual(['x']);
    expect(fromDiff('abc', '')).toEqual([{ d: 3 }]);
    // 😀 = D83D DE00, 😃 = D83D DE03: sharing the high surrogate must not leave half an emoji in the op.
    const op = fromDiff('a😀b', 'a😃b');
    expect(op).toEqual([1, '😃', { d: 2 }, 1]);
    // A repeated char: the prefix wins, the suffix doesn't double count.
    expect(apply('aaa', fromDiff('aaa', 'aaaa'))).toBe('aaaa');
    expect(clampIndex('a😀', 2)).toBe(1);
    expect(clampIndex('a😀', 3)).toBe(3);
  });

  it('round-trips fromDiff and keeps inserted text well-formed (property, 500 cases)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const a = randStr(r, 20);
      // Edit by whole graphemes from the alphabet, like a textarea would.
      const cut = Math.floor(r() * (a.length + 1));
      const safeCut = clampIndex(a, cut);
      const b = r() < 0.5 ? a.slice(0, safeCut) + randStr(r, 3) + a.slice(safeCut) : a.slice(0, safeCut) + a.slice(clampIndex(a, safeCut + Math.floor(r() * 4)));
      const op = fromDiff(a, b);
      expect(apply(a, op)).toBe(b);
      for (const c of op) if (isInsert(c)) expect(wellFormed(c)).toBe(true);
    }
  });
});

/* ───────── algebra properties ───────── */

describe('ot properties (seeded, 500 cases each)', () => {
  it('TP1: apply(apply(s, a), b′) == apply(apply(s, b), a′)', () => {
    const r = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const s = randStr(r, 30);
      const a = randOp(r, s);
      const b = randOp(r, s);
      const [a1, b1] = transform(a, b);
      expect(apply(apply(s, a), b1)).toBe(apply(apply(s, b), a1));
    }
  });

  it('compose: apply(s, compose(a, b)) == apply(apply(s, a), b)', () => {
    const r = mulberry32(1234);
    for (let i = 0; i < 500; i++) {
      const s = randStr(r, 30);
      const a = randOp(r, s);
      const mid = apply(s, a);
      const b = randOp(r, mid);
      const ab = compose(a, b);
      expect(apply(s, ab)).toBe(apply(mid, b));
      expect(ab).toEqual(normalize(ab)); // canonical output
    }
  });

  it('compose is associative and transform keeps lengths consistent', () => {
    const r = mulberry32(99);
    for (let i = 0; i < 500; i++) {
      const s = randStr(r, 20);
      const a = randOp(r, s);
      const b = randOp(r, apply(s, a));
      const c = randOp(r, apply(apply(s, a), b));
      expect(apply(s, compose(compose(a, b), c))).toBe(apply(s, compose(a, compose(b, c))));
      const x = randOp(r, s);
      const [a1, x1] = transform(a, x);
      expect(baseLength(a1)).toBe(targetLength(x));
      expect(baseLength(x1)).toBe(targetLength(a));
    }
  });

  it('invert undoes an op', () => {
    const r = mulberry32(5);
    for (let i = 0; i < 500; i++) {
      const s = randStr(r, 30);
      const a = randOp(r, s);
      expect(apply(apply(s, a), invert(a, s))).toBe(s);
    }
  });

  it('carets follow the text they sit in', () => {
    const r = mulberry32(77);
    for (let i = 0; i < 500; i++) {
      const s = randStr(r, 20) + '|' + randStr(r, 20);
      const at = s.indexOf('|');
      // An op that never deletes the marker.
      const op = normalize([...randOp(r, s.slice(0, at)), 1, ...randOp(r, s.slice(at + 1))]);
      const out = apply(s, op);
      const own = transformIndex(op, at, true);
      const other = transformIndex(op, at);
      expect(out[own]).toBe('|'); // own insert at the caret: caret after it, still before the marker
      expect(other).toBeLessThanOrEqual(own); // someone else's insert at the caret: caret before their text
      expect(out.slice(other, own).includes('|')).toBe(false);
    }
  });

  it('sameOps compares after normalisation', () => {
    expect(sameOps([1, 1, 'a', ''], [2, 'a'])).toBe(true);
    expect(sameOps([1, 'a'], ['a', 1])).toBe(false);
  });
});

/* ───────── client state machine against a simulated server ───────── */

interface Msg { kind: 'op'; ops: Ops; from: string }

class SimServer {
  text: string;
  history: Ops[] = [];
  constructor(text: string) { this.text = text; }
  get revision() { return this.history.length; }
  receive(from: string, base: number, ops: Ops, clients: SimClient[]) {
    let op = ops;
    for (const h of this.history.slice(base)) op = transform(op, h)[0];
    this.text = apply(this.text, op);
    this.history.push(op);
    for (const c of clients) c.inbox.push({ kind: 'op', ops: op, from });
  }
}

class SimClient {
  inbox: Msg[] = [];
  outbox: { base: number; ops: Ops }[] = [];
  client: OtClient;
  /** A caret that must keep pointing at the same character through everyone's edits. */
  caret = 0;
  constructor(readonly id: string, rev: number, text: string) {
    this.client = new OtClient(rev, text, (base, ops) => this.outbox.push({ base, ops }));
  }
  deliver() {
    const m = this.inbox.shift();
    if (!m) return;
    if (m.from === this.id) this.client.serverAck();
    else {
      const local = this.client.applyServer(m.ops);
      this.caret = transformIndex(local, this.caret);
    }
  }
}

describe('OtClient', () => {
  it('walks synchronized → awaiting → buffering → awaiting → synchronized', () => {
    const sent: [number, Ops][] = [];
    const c = new OtClient(3, 'abc', (rev, ops) => sent.push([rev, ops]));
    c.applyLocal([3, 'd']);
    expect(c.state.kind).toBe('awaiting');
    expect(sent).toEqual([[3, [3, 'd']]]);
    c.applyLocal([4, 'e']);
    c.applyLocal([5, 'f']);
    expect(c.state).toEqual({ kind: 'buffering', inflight: [3, 'd'], buffer: [4, 'ef'] });
    // Someone inserts at the start before our op lands.
    const local = c.applyServer(['X', 3]);
    expect(local).toEqual(['X', 6]);
    expect(c.text).toBe('Xabcdef');
    expect(c.revision).toBe(4);
    c.serverAck();
    expect(c.revision).toBe(5);
    expect(sent[1]).toEqual([5, [5, 'ef']]);
    c.serverAck();
    expect(c.state.kind).toBe('synchronized');
    expect(c.revision).toBe(6);
    c.resync(10, 'zzz');
    expect([c.revision, c.text, c.state.kind]).toEqual([10, 'zzz', 'synchronized']);
    expect(() => c.serverAck()).toThrow();
  });

  it('converges with 3 clients and random interleaving (seeded, 60 runs)', () => {
    for (let run = 0; run < 60; run++) {
      const r = mulberry32(1000 + run);
      const start = randStr(r, 12);
      const server = new SimServer(start);
      const clients = ['a', 'b', 'c'].map((id) => new SimClient(id, 0, start));
      const step = () => {
        const c = clients[Math.floor(r() * clients.length)]!;
        const k = r();
        if (k < 0.35) {
          const op = r() < 0.2 ? randOp(r, c.client.text) : editOp(r, c.client.text);
          c.client.applyLocal(op);
          c.caret = transformIndex(op, c.caret, true);
        } else if (k < 0.7) c.deliver();
        else {
          const out = c.outbox.shift();
          if (out) server.receive(c.id, out.base, out.ops, clients);
        }
      };
      for (let i = 0; i < 120; i++) step();
      // Drain the network.
      for (let guard = 0; guard < 10_000; guard++) {
        const busy = clients.some((c) => c.inbox.length || c.outbox.length);
        if (!busy) break;
        for (const c of clients) {
          const out = c.outbox.shift();
          if (out) server.receive(c.id, out.base, out.ops, clients);
          c.deliver();
        }
      }
      for (const c of clients) {
        expect(c.client.text).toBe(server.text);
        expect(c.client.revision).toBe(server.revision);
        expect(c.client.state.kind).toBe('synchronized');
        expect(c.caret).toBeLessThanOrEqual(c.client.text.length);
      }
    }
  });

  it('keeps a remote caret on the same character while edits interleave', () => {
    const server = new SimServer('hello world');
    const a = new SimClient('a', 0, 'hello world');
    const b = new SimClient('b', 0, 'hello world');
    a.caret = 6; // before "world"
    a.client.applyLocal([6, 'big ', 5]);
    a.caret = transformIndex([6, 'big ', 5], a.caret, true);
    b.client.applyLocal(['Oh, ', 11]);
    server.receive('b', b.outbox[0]!.base, b.outbox.shift()!.ops, [a, b]);
    server.receive('a', a.outbox[0]!.base, a.outbox.shift()!.ops, [a, b]);
    a.deliver(); a.deliver(); b.deliver(); b.deliver();
    expect(a.client.text).toBe('Oh, hello big world');
    expect(b.client.text).toBe(a.client.text);
    expect(a.client.text.slice(a.caret)).toBe('world');
  });
});
