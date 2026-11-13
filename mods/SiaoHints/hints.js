// Quick-guide keys, shared by every Siao mod (Install.sh copies this file into each one).
//
// While the guide is on (shared "siao.hints" = its start time) each mod lists what it can click, in
// order, with the key it would like (tabs 1–0, folders q w e…, agents a s d…, panels z x c v). The
// lists meet in shared state ("siao.hints.want.<mod>") and every mod runs the same allocation over all
// of them, so a key is never given twice: wished-for keys first, then everything else takes the next
// free key — lowercase letters, then symbols, then digits, then ⇧ + symbol. Letters ignore case.
// SiaoHints catches the key pressed ("siao.hints.key" = "<key>|<time>|<guide start>") and the mod
// that owns it runs the action.
import { div } from "gpui-kit";
import { shared, setShared } from "herdr";

// Earlier mods get their wished-for keys first when two want the same one.
const Mods = ["SiaoTabs", "SiaoQuota", "SiaoBrand", "SiaoSpaces", "SiaoBoard", "SiaoNotes", "SiaoChanges"];
// Letters are case-blind (the badge shows a capital, Caps Lock may be on), so there is no ⇧ + letter.
const Free = [..."asdfghjklqwertyuiopzxcvbnm", ..."/;,.'[]-=`\\", ..."1234567890", ..."?:<>\"{}_+~|!@#$%^&*()"];
const Shifted = { "`": "~", 1: "!", 2: "@", 3: "#", 4: "$", 5: "%", 6: "^", 7: "&", 8: "*", 9: "(", 0: ")",
  "-": "_", "=": "+", "[": "{", "]": "}", "\\": "|", ";": ":", "'": "\"", ",": "<", ".": ">", "/": "?" };

/// The key a key-down event stands for: "a" for a / A / ⇧a / Caps Lock a, "/", "?" (⇧/). Layout-independent.
export function KeyOf(E) {
  const K = (E.key ?? "").toLowerCase(), Shift = Boolean(E.modifiers?.shift);
  if (K.length !== 1) return K === "space" ? " " : K;
  if (!Shift || (K >= "a" && K <= "z")) return K;
  return Shifted[K] ?? K;
}

/// What a badge shows for a key: letters in capitals (either case works).
export function KeyLabel(Key) {
  return Key.toUpperCase();
}

export function Badge(T, Key) {
  return div().flex_none().h(16).min_w(16).px(3).rounded(4).bg(T.accent).text_color("#1b1b1f")
    .text_size(10.5).font_semibold().flex().items_center().justify_center().child(KeyLabel(Key));
}

// Key → [mod, id] for one guide (its start time), from every mod's published list.
let Memo = { sig: null, map: null };
function Allocate(At) {
  const Lists = Mods.map((M) => { const W = shared(`siao.hints.want.${M}`); return W?.at === At ? [M, W.items] : [M, []]; });
  const Sig = JSON.stringify([At, Lists]);
  if (Memo.sig === Sig) return Memo.map;
  const ByKey = new Map(), ById = new Map();
  for (const [M, Items] of Lists) for (const [Id, Want] of Items) {
    if (Want && !ByKey.has(Want)) { ByKey.set(Want, [M, Id]); ById.set(`${M}\n${Id}`, Want); }
  }
  let Next = 0;
  for (const [M, Items] of Lists) for (const [Id] of Items) {
    if (ById.has(`${M}\n${Id}`)) continue;
    while (Next < Free.length && ByKey.has(Free[Next])) Next++;
    if (Next >= Free.length) break;
    ByKey.set(Free[Next], [M, Id]); ById.set(`${M}\n${Id}`, Free[Next]);
  }
  Memo = { sig: Sig, map: { ByKey, ById } };
  return Memo.map;
}

/// One per mod instance. In render: `H.begin()`, then `H.add(id, wantedKey, action)` for each thing
/// that can be clicked (returns the key to draw, or null), then `H.end(cx)` after the last add.
export class Hints {
  constructor(Mod) { this.mod = Mod; this.seen = shared("siao.hints.key"); this.items = []; this.acts = new Map(); }

  get on() { return Boolean(shared("siao.hints")); }

  begin() { this.items = []; this.acts = new Map(); this.at = shared("siao.hints"); }

  add(Id, Want, Act) {
    Id = String(Id);
    this.items.push([Id, Want || ""]);
    this.acts.set(Id, Act);
    if (!this.at) return null;
    return Allocate(this.at).ById.get(`${this.mod}\n${Id}`) ?? null;
  }

  end(cx) {
    if (this.at) {
      const Mine = shared(`siao.hints.want.${this.mod}`);
      if (Mine?.at !== this.at || JSON.stringify(Mine.items) !== JSON.stringify(this.items))
        setShared(`siao.hints.want.${this.mod}`, { at: this.at, items: this.items });
    }
    const Pressed = shared("siao.hints.key");
    if (!Pressed || Pressed === this.seen) return;
    this.seen = Pressed;
    const [Key, , At] = Pressed.split("|");
    const Owner = Allocate(Number(At)).ByKey.get(Key);
    if (Owner?.[0] !== this.mod) return;
    // Actions get a click-handler-like cx (notify, spawn), so a button's on_click can be reused as is.
    // This runs inside render, where cx.notify() isn't allowed: ask for the redraw from a task instead.
    const Cx = { notify: () => cx?.spawn?.(async (c) => c.notify()), spawn: (F) => cx?.spawn?.(F), stop_propagation() {} };
    this.acts.get(Owner[1])?.(Cx);
    Cx.notify();
  }
}
