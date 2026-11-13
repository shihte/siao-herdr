// SiaoQuota: Claude usage from ~/.config/herdr-app/bin/SiaoQuota (official rate_limits; ccusage fallback).
// 5h window ≥ 70% or today ≥ 10% of the weekly quota: red + one notification (the dispatcher gates on the same script).
//
// props.bar = true: the bottom strip, three equal cards —
//   會話  [model] 16% ▓▓░  161k / 1M         the focused agent's Claude Code session (restart: ↻ on its agent row)
//   5 小時  30% ▓▓▓░  2h06m 後重置
//   本週    21% ▓▓░  今日 +0% · 4d6h 後重置
// The session follows the focused terminal (~/.cache/ClaudeStatus/<terminal>.json, written by
// bin/SiaoStatusSave from the statusline); a mod pane keeps the last terminal. Mod command
// `SiaoQuota.restart` (ctrl-shift-r) restarts the focused agent's session the same way ↻ does.
// Without props.bar: the old two thin bars, for a sidebar.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { Hints, Badge as KeyBadge } from "./hints.js";
import { exec, appHome, theme, notify, props, shared, setShared, openOverlay, focused, terminals, nextCommand, run } from "herdr";

// Thresholds from 設定 → SiaoDesk (shared "siao.settings"), read every time.
const Limits = () => ({ five: shared("siao.settings")?.quota5h ?? 70, today: shared("siao.settings")?.quotaToday ?? 10 });

function Clamp(Pct) { return Math.max(0, Math.min(100, Number(Pct) || 0)); }

function Tokens(N) { return N >= 1e6 ? `${+(N / 1e6).toFixed(1)}M` : N >= 1e3 ? `${Math.round(N / 1e3)}k` : `${N ?? 0}`; }

export default class Quota extends View {
  init(Props, cx) {
    this.H = new Hints("SiaoQuota");
    this.bar = Boolean(props()?.bar ?? Props?.bar);
    this.usage = null;
    this.error = null;
    this.warned = false;
    this.width = 240;
    this.barWidth = {};
    this.term = null;
    this.restarting = false;
    // Every 設定 → SiaoDesk 用量更新頻率 seconds (15 unless changed).
    cx.spawn(async (cx) => {
      for (;;) {
        await new Promise((R) => cx.timer.after(1000 * (Number(shared("siao.settings")?.quotaRefresh) || 15), R));
        this.Refresh(cx);
      }
    });
    this.Refresh(cx);
    cx.spawn(async (cx) => {
      for (;;) {
        const C = await nextCommand();
        if (C === "restart") this.Restart(cx);
        if (C === "refresh") this.Refresh(cx);
      }
    });
  }

  // The focused terminal if it is one, else the last one we showed.
  Terminal() {
    const T = focused()?.terminal;
    if (T && terminals().some((X) => X.address === T)) this.term = T;
    return this.term;
  }

  Refresh(cx) {
    const Term = this.Terminal();
    cx.spawn(async (cx) => {
      try {
        const R = await exec(`${appHome()}/bin/SiaoQuota`, Term ? [Term] : [], { timeout: 20000 });
        if (R.code !== 0) throw new Error(R.stderr || `exit ${R.code}`);
        this.usage = JSON.parse(R.stdout);
        this.error = null;
        const Over = (this.usage.fiveHourPct ?? 0) >= Limits().five || (this.usage.weekTodayPct ?? 0) >= Limits().today;
        if (Over && !this.warned) {
          this.warned = true;
          notify({ title: "用量", body: "已達門檻，調度員暫停開新的代理。", level: "warning", timeout: 8000 });
        }
        if (!Over) this.warned = false;
      } catch (E) {
        // A failed read keeps the last numbers on screen; the reason only goes to the log.
        console.error("SiaoQuota:", String(E?.message ?? E));
      }
      this.tried = true;
      cx.notify();
    });
  }

  // ↻ / ctrl-shift-r: /exit, then `claude … --resume <session>` in the same terminal (bin/SiaoRestart).
  Restart(cx) {
    const Term = this.Terminal();
    if (!Term || this.restarting) return;
    this.restarting = true;
    cx.notify();
    cx.spawn(async (cx) => {
      const R = await exec(`${appHome()}/bin/SiaoRestart`, [Term], { timeout: 30000 }).catch((E) => ({ code: 1, stderr: String(E) }));
      this.restarting = false;
      if (R.code === 0) notify({ title: "已重新整理", body: R.stdout.trim(), timeout: 3000 });
      else notify({ title: "重新整理失敗", body: (R.stderr || R.stdout || "").trim(), level: "error", timeout: 6000 });
      cx.timer.after(4000, (cx) => this.Refresh(cx));
      cx.notify();
    });
  }

  // A bar that fills its own measured width.
  Meter(Id, Pct, Color, T) {
    const W = this.barWidth[Id] ?? 0;
    return div().id(`${Id}-track`).flex_1().min_w(24).h(8).rounded_full().bg(T.raised).overflow_hidden()
      .on_size_change((Size, cx) => { if (Size.width !== this.barWidth[Id]) { this.barWidth[Id] = Size.width; cx.notify(); } })
      .child(div().h_full().rounded_full().bg(Color).w(W * Clamp(Pct) / 100));
  }

  // One card: label · (extra) · big % · bar · detail · (trailing).
  Card(Id, Label, Pct, Limit, Detail, T, Extra, Trailing) {
    const P = Clamp(Pct);
    const Hot = P >= Limit;
    const Color = Hot ? T.blocked : P >= Limit * 0.75 ? T.working : T.accent;
    return h_flex().id(Id).flex_1().min_w(0).h_full().pl(14).pr(Trailing ? 6 : 14).gap(10).items_center().rounded(10)
      .bg(T.background).border(1).border_color(Hot ? T.blocked : T.accent + "80")
      .when(Label === "5 小時" || Label === "本週", (El) => El.child(svg(Label === "本週" ? "mods/SiaoQuota/calendar.svg" : "mods/workspace-chrome/clock.svg").size(13).flex_none().text_color(T.muted)))
      .child(div().flex_none().text_size(12).text_color(T.muted).child(Label))
      .when(Boolean(Extra), (El) => El.child(Extra))
      .child(div().flex_none().text_size(18).font_bold().text_color(Hot ? T.blocked : T.foreground).child(`${P.toFixed(0)}%`))
      .child(this.Meter(Id, P, Color, T))
      .when(Boolean(Detail), (El) => El.child(div().flex_none().text_size(11).text_color(T.dim).child(Detail)))
      .when(Boolean(Trailing), (El) => El.child(Trailing));
  }

  Menu() {
    const U = this.usage ?? {};
    const Items = [
      ...(U.terminal ? [{ label: "重新整理會話（退出重進）", command: "shared", args: { key: "siao.restart", value: `${U.terminal}|${Date.now()}` }, icon: "check" }] : []),
      { label: "重新讀取用量", command: "SiaoQuota.refresh", icon: "check" },
      ...(U.sessionName || U.sessionId ? [null] : []),
      ...(U.sessionName ? [{ label: `複製會話名稱  ${U.sessionName}`, command: "copy", args: { text: U.sessionName }, icon: "files" }] : []),
      ...(U.sessionId ? [{ label: "複製會話 ID", command: "copy", args: { text: U.sessionId }, icon: "files" }] : []),
      ...(U.sessionCwd ? [{ label: "複製會話資料夾", command: "copy", args: { text: U.sessionCwd }, icon: "files" }] : []),
    ];
    const Seps = Items.filter((X) => X === null).length;
    openOverlay({ mod: "SiaoMenu", kind: "popup", width: 280, height: (Items.length - Seps) * 31 + Seps * 9 + 12, props: { items: Items } });
  }

  // The strip.
  RenderBar(T) {
    return div().id("quota-bar").relative().size_full()
      .on_size_change((S, cx) => { const W = Number(S?.width) || 0; if (W !== this.edgeWidth) { this.edgeWidth = W; cx.notify(); } })
      .child(this.RenderCards(T))
;
  }

  RenderCards(T) {
    const U = this.usage;
    const Root = h_flex().id("root").size_full().gap(8).text_color(T.foreground)
      .on_mouse_down("right", () => this.Menu());
    // Never read yet: plainly that. A failed read later keeps the last numbers (Refresh).
    if (!U) return Root.child(div().px(14).text_size(12).text_color(T.dim).child(this.tried ? "讀不到用量" : "用量載入中…"));


    // Which cards show: 設定 → SiaoDesk → 狀態欄.
    const On = (K) => shared("siao.settings")?.[K] !== false;
    if (U.model && On("barSession")) {
      const Model = div().flex_none().px(7).h(20).flex().items_center().rounded(5).bg(T.raised)
        .text_size(11.5).font_semibold().text_color(T.foreground).child(U.model);
      const Ctx = U.contextTokens != null && U.contextSize ? `${Tokens(U.contextTokens)} / ${Tokens(U.contextSize)}` : "";
      Root.child(this.Card("q-ctx", "會話", U.contextPct, 80, Ctx, T, Model, null));
    }

    const Reset = On("barReset");
    const Week = [U.weekTodayPct != null && On("barToday") ? `今日 +${Number(U.weekTodayPct).toFixed(0)}%` : "", U.weekResetIn && Reset ? `${U.weekResetIn} 後重置` : ""].filter(Boolean).join(" · ");
    if (On("bar5h")) Root.child(this.Card("q-5h", "5 小時", U.fiveHourPct, Limits().five, U.resetIn && Reset ? `${U.resetIn} 後重置` : "", T));
    if (On("barWeek")) Root.child(this.Card("q-week", "本週", U.weekPct, 100, Week, T));
    if (!On("barSession") && !On("bar5h") && !On("barWeek"))
      Root.child(div().px(14).text_size(12).text_color(T.dim).child("狀態欄沒有選任何項目（設定 → SiaoDesk → 狀態欄）"));
    if (U.ageSeconds > 1800)
      Root.child(div().flex_none().px(6).text_size(11).text_color(T.dim).child(`${Math.round(U.ageSeconds / 60)} 分鐘前`));
    return Root;
  }

  Bar(Label, Pct, Limit, Extra, T) {
    const P = Clamp(Pct);
    const Color = P >= Limit ? T.blocked : P >= Limit * 0.75 ? T.working : T.done;
    return v_flex().gap(2)
      .child(h_flex().justify_between().items_center()
        .child(div().text_size(10).text_color(T.dim).child(Label))
        .child(div().text_size(10).text_color(P >= Limit ? T.blocked : T.muted).child(`${P.toFixed(0)}%${Extra ? `  ${Extra}` : ""}`)))
      .child(div().h(4).w_full().rounded_full().bg(T.raised)
        .child(div().h_full().rounded_full().bg(Color).w(Math.max(0, (this.width - 24) * P / 100))));
  }

  render(cx) {
    // The focused terminal changed: show that agent's session now, not in 15 s.
    const Term = focused()?.terminal;
    if (Term && Term !== this.lastFocus) { this.lastFocus = Term; this.Refresh(cx); }
    const T = theme();
    if (this.bar || props()?.bar) return this.RenderBar(T);
    const U = this.usage;
    const Root = v_flex().id("root").size_full().px(12).py(6).gap(5).text_color(T.foreground)
      .on_size_change((Size, cx) => { if (Size.width !== this.width) { this.width = Size.width; cx.notify(); } });
    if (!U) return Root.child(div().text_size(10.5).text_color(T.dim).child("用量載入中…"));
    return Root
      .child(this.Bar("5 小時", U.fiveHourPct, Limits().five, U.resetIn ? `${U.resetIn} 後重置` : "", T))
      .child(this.Bar("今日占本週", U.weekTodayPct, Limits().today, U.weekPct != null ? `本週 ${Number(U.weekPct).toFixed(0)}%` : "", T));
  }
}
