// SiaoHints: quick-guide keys. Left + right ⌘ together turns hints on: every Siao mod draws a key
// beside what can be clicked. The next key press clicks that thing and ends the guide; both ⌘ again,
// Esc, or a key without a target just ends it. No box, no prompt.
//
// This overlay only holds the keyboard while hints show (so keys don't go to a terminal) and tells
// the mods: shared "siao.hints" = start time while on, "siao.hints.key" = "<key>|<time>|<start>".
// Which key goes where is hints.js (copied into every Siao mod): wished-for keys stay put — tabs 1–0,
// folders q w e…, agents a s d…, n new tab, z 筆記 · x 預覽 · c 檔案 · v 變更, b usage — and the rest
// take free lowercase letters, then symbols, then digits (letters ignore case: Z or z, Caps Lock or not).
import { View, div } from "gpui-kit";
import { props, closeOverlay, setShared, shared } from "herdr";
import { KeyOf } from "./hints.js";

export default class SiaoHints extends View {
  init(_p, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(50, () => this.handle.focus());
    // SiaoTabs switched the guide on (shared "siao.hints") and switches it off on a second ⌘; or after 15 s.
  }

  End(Key) {
    if (this.done) return;
    this.done = true;
    if (Key) setShared("siao.hints.key", `${Key}|${Date.now()}|${shared("siao.hints")}`);
    setShared("siao.hints", null);
    closeOverlay(props()?.overlay);
  }

  render() {
    // Nothing to see: the letters on screen are the whole guide. This only holds the keyboard.
    return div().id("siao-hints").track_focus(this.handle).size_full()
      .on_key_down((E, cx) => {
        cx.stop_propagation();
        const M = E.modifiers ?? {};
        // Both ⌘ again, Esc, or any shortcut: just end. A key: click its target and end.
        if (E.key === "escape" || M.platform || M.control || M.alt) return this.End();
        if (E.key === "shift") return;   // ⇧ on its own: wait for the key that goes with it
        this.End(KeyOf(E));
      });
  }
}
