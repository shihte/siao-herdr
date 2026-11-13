// SiaoTabs: Chrome-style tab strip. With the folder picker on "All" it shows every tab of every
// space, grouped by space (a small label opens each group, like a Chrome tab group); with one folder
// picked it shows that space's tabs only. Clicking a tab in another space switches space first.
// Right side: + (new menu), panel buttons (筆記 / 預覽 / 檔案 / 變更), window buttons. Agents live in the left sidebar.
// Based on the shipped tabs mod; drag-to-reorder works inside the shown space only.
import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { Hints, Badge as KeyBadge } from "./hints.js";
import { UnfoldSidebar } from "./rail.js";
import { spaces, panes, agents, terminals, notify, run, exec, appHome, nextCommand, closeOverlay, openOverlay, theme, window, shared, setShared, layout, settings, focused } from "herdr";

// Chrome-like group colors, picked per space from its id so a space keeps its color.
const GroupColors = ["#8ab4f8", "#f28b82", "#fdd663", "#81c995", "#ff8bcb", "#c58af9", "#78d9ec", "#fcad70"];
function ColorOf(Id) { let H = 0; for (const Ch of Id) H = (H * 31 + Ch.charCodeAt(0)) >>> 0; return GroupColors[H % GroupColors.length]; }

function Find(Node, Id) {
  if (Node?.id === Id) return Node;
  for (const C of Node?.children ?? []) { const F = Find(C, Id); if (F) return F; }
  return null;
}

// What can sit under the terminals.
const Bottoms = [
  ["quota", "狀態欄", "clock"],
  ["none", "不顯示", "x"],
];
const BottomOf = () => { const V = shared("siao.bottom"); return Bottoms.some(([K]) => K === V) ? V : "quota"; };
function ApplyBottom(V, Was) {
  if (V === "quota") run("layout.show", { id: "quota" }); else run("layout.hide", { id: "quota" });
}

const Panels = [
  ["notes", "筆記", "mods/workspace-chrome/file-text.svg"],
  ["files", "檔案", "mods/files/file.svg"],
  ["changes", "變更", "mods/changes/changes.svg"],
];

export default class SiaoTabs extends View {
  init(_p, cx) {
    this.pressed = null;
    this.H = new Hints("SiaoTabs");
    // Left + right ⌘ together (keys.json "cmd-f20" → SiaoTabs.hints; SiaoDesk sends that key) turns the
    // quick guide on, and off again. The tab strip is always on screen, so it owns the switch: pressing
    // them again ends it whoever has the keyboard, and it ends by itself.
    cx.spawn(async (cx) => {
      for (;;) {
        const C = await nextCommand();
        if (C === "newtab" || C?.name === "newtab") { this.NewTabHere(); continue; }   // SiaoTabs.newtab: the ＋
        if (C?.name !== "hints" && C !== "hints") continue;
        if (shared("siao.hints")) this.HintsOff();
        else {
          const Started = Date.now();
          setShared("siao.hints", Started);
          this.hintOverlay = openOverlay({ mod: "SiaoHints", kind: "popup", at: "bottom", width: 1, height: 1, frame: "none" });
          cx.timer.after(15000, () => { if (shared("siao.hints") === Started) this.HintsOff(); });
        }
        cx.notify();
      }
    });
    // The bottom usage strip folded away: keep its two numbers as a chip here (read every minute).
    this.usage = null;
    cx.spawn(async (cx) => {
      for (;;) {
        if (Find(layout(), "quota")?.hidden) {
          const R = await exec(`${appHome()}/bin/SiaoQuota`, []).catch(() => null);
          try { this.usage = JSON.parse(R?.stdout ?? ""); cx.notify(); } catch {}
        }
        await new Promise((Res) => cx.timer.after(this.usage ? 60000 : 3000, Res));
      }
    });
  }

  Status(T, S) {
    if (S === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(T.working).spin(900);
    if (S === "blocked") return div().size(14).flex_none().rounded(4).bg(T.blocked + "26").text_size(10.5).font_bold().text_color(T.blocked).flex().items_center().justify_center().child("!");
    if (S === "done") return div().size(6).flex_none().rounded(3).bg(T.done);
    return null;
  }

  // A tab nobody named shows what is in it, not its position: the agent's conversation name (its terminal
  // title, minus the spinner/status glyph Claude Code puts in front), else the folder it is in, else the program.
  Label(C, Program) {
    if (C.named && !/^tb\d+$/.test(C.name)) return C.name;
    const Agent = agents().find((A) => A.tab === C.id);
    const Pane = panes().find((P) => P.tab === C.id && P.terminal);
    const Title = (Agent?.title ?? Pane?.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
    if (Title && !/^(claude|claude code|zsh|bash|fish|-?zsh)$/i.test(Title)) return Title;
    const Folder = Pane?.cwd?.split("/").filter(Boolean).pop();
    return Folder ? `${Program?.name ?? "Terminal"} · ${Folder}` : Program?.name ?? "Terminal";
  }

  Tab(C, Space, Current, T, Stop, Color) {
    const Program = panes().find((P) => P.tab === C.id && P.program?.agent)?.program ?? panes().find((P) => P.tab === C.id)?.program;
    const Name = this.Label(C, Program);
    const On = C.active && Space.active;
    const Key = this.H.add(`tab-${C.id}`, this.tabN < 10 ? "1234567890"[this.tabN] : "", () => { if (!Space.active) run("space.select", { id: Space.id }); run("tab.select", { id: C.id }); });
    this.tabN++;
    // In a group the tab sits on the group's colored underline (Chrome tab groups).
    return h_flex().id(`tab-${C.id}`).h(29).px(10).gap(7).rounded(7).items_center().flex_none().text_size(12.8)
      .text_color(On ? T.foreground : T.muted).when(On, (El) => El.bg(T.raised))
      .when(!Color, (El) => El.border(1).border_color(On ? T.border : T.background + "00"))
      .when(Boolean(Color), (El) => El.rounded_b(0))
      .hover((S) => S.bg(T.hover))
      .on_mouse_down("left", (E, cx) => { cx.stop_propagation(); this.pressed = Current ? C.id : null; if (E.click_count === 2) this.Rename(C, Name); })
      .on_mouse_up("left", () => {
        const From = this.pressed; this.pressed = null;
        if (Current && From && From !== C.id) run("tab.move", { id: From, index: Space.tabs.findIndex((X) => X.id === C.id) + 1 });
        else { if (!Space.active) run("space.select", { id: Space.id }); run("tab.select", { id: C.id }); }
      })
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "SiaoMenu", kind: "popup", width: 200, height: 3 * 31 + 9 + 12, props: { tab: "tab", target: { id: C.id, space: Space.id, label: Name } } }); })
      .when(Boolean(Key), (El) => El.child(KeyBadge(T, Key)))
      .when(Boolean(Program?.icon), (El) => El.child(Program.tint ? svg(Program.icon).size(14).text_color(T.muted) : image(Program.icon).size(14)))
      .child(div().max_w(170).truncate().child(C.zoomed ? `${Name} Z` : Name))
      .when(Boolean(this.Status(T, C.status)), (El) => El.child(this.Status(T, C.status)))
      .when(On, (El) => El.child(div().id(`close-${C.id}`).text_color(T.dim).on_mouse_down("left", Stop)
        .on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: C.id }); }).child(svg("mods/pane/close.svg").size(12))));
  }

  HintsOff() {
    setShared("siao.hints", null);
    if (this.hintOverlay) { closeOverlay(this.hintOverlay); this.hintOverlay = null; }
  }

  // Rename showing what the tab shows now (its conversation name when nobody named it).
  Rename(C, Name) {
    openOverlay({ mod: "SiaoMenu", kind: "dialog", width: 420, height: 176, props: { prompt: {
      title: "重新命名分頁", value: Name, allowEmpty: true, hint: "留空：改回自動顯示對話名稱",
      run: { command: "tab.rename", args: { id: C.id, name: "{text}" } } } } });
  }

  Collapsed() { return shared("siao.tabs.collapsed") ?? {}; }

  // ＋: a terminal tab in the shown folder, in its own folder (not wherever the focused terminal has
  // wandered to), and that folder's group unfolded so the new tab shows up here at the top.
  NewTabHere() {
    const S = spaces().find((X) => X.active);
    if (S && this.Collapsed()[S.id]) setShared("siao.tabs.collapsed", { ...this.Collapsed(), [S.id]: false });
    run("tab.new", S ? { space: S.id, ...(S.folder ? { folder: S.folder } : {}) } : {});
  }

  // Chrome-style group label in the group's color. Click: collapse / expand its tabs (the label keeps its
  // width, so nothing jumps). Right click: the space menu.
  // About how wide a group's tabs are (for the fold animation only): padding, icon, name, close.
  GroupWidth(Shown) {
    const Text = (S) => [...S].reduce((W, Ch) => W + (Ch.charCodeAt(0) > 0x2e80 ? 12.8 : 7.7), 0);
    return Shown.reduce((W, C) => W + 20 + 14 + 7 + Math.min(170, Text(this.Label(C, panes().find((P) => P.tab === C.id)?.program))) + (C.active ? 19 : 0) + 3, 0);
  }

  Group(Space, Count, Color, T) {
    const Folded = Boolean(this.Collapsed()[Space.id]);
    return h_flex().id(`grp-${Space.id}`).h(22).px(8).gap(5).ml(4).rounded(6).items_center().flex_none().text_size(11.5).font_semibold()
      .bg(Folded ? Color + "33" : Color).text_color(Folded ? Color : "#1b1b1f").cursor_pointer()
      .border(1).border_color(Color)
      .hover((S) => S.opacity(0.85))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "SiaoMenu", kind: "popup", width: 220, height: (Space.branch ? 4 : 2) * 31 + 9 + 12, props: { tab: "space", target: { id: Space.id } } }); })
      .on_click((_e, cx) => {
        this.fold = { ...(this.fold ?? {}), [Space.id]: { at: Date.now(), shut: !Folded } };
        setShared("siao.tabs.collapsed", { ...this.Collapsed(), [Space.id]: !Folded });
        // render keeps redrawing while the slide runs (a click handler's timers aren't reliable here).
      })
      .child(div().max_w(140).truncate().child(Space.name));
  }

  render(cx) {
    const T = theme();
    this.H.begin(); this.tabN = 0;
    let Sliding = false;
    const Hint = (Id, Want, Action) => { const K = this.H.add(Id, Want, Action); return K ? KeyBadge(T, K) : null; };
    const All = shared("siao.scope") === "all";
    const List = spaces();
    const Active = List.find((S) => S.active);
    const Stop = (_e, cx) => cx.stop_propagation();
    const Button = (Id, Label, Action) => div().id(Id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(T.dim)
      .hover((S) => S.bg(T.hover).text_color(T.foreground)).on_mouse_down("left", Stop).on_click(Action).child(Label);

    const Strip = h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(3).overflow_x_scrollbar();
    // Groups (a colored label, then its tabs) only when tabs of two or more folders are shown together;
    // with one folder open the label would say nothing.
    const Folded = this.Collapsed();
    const Open = (S) => S.tabs.filter((C) => !C.settled);
    const Draw = (S, Grouped) => {
      const Shown = Open(S);
      if (!Shown.length) return;
      if (!Grouped) return Strip.children(Shown.map((C) => this.Tab(C, S, S.active, T, Stop, null)));
      const Color = ColorOf(S.id);
      // The label and the tabs share one box carrying the group's line, so it runs unbroken under the
      // label too. Folding slides the tabs' box shut: it is drawn one frame at the width it has, then
      // given the width it goes to, so the width transition has two numbers to move between.
      // The phase goes by frames drawn, not by time since the click: a first frame that came late
      // used to skip the "from" width, and then there was nothing to slide between.
      const Shut = Boolean(Folded[S.id]), F = this.fold?.[S.id];
      // (only once the shared fold state says what the click asked for)
      const Anim = Boolean(F) && F.shut === Shut && shared("siao.settings")?.tabAnim !== false;
      const First = Anim && !F.first;
      if (First) F.first = Date.now();
      const Since = Anim ? Date.now() - F.first : 1e9;
      const Dur = Number(shared("siao.settings")?.tabAnimMs) || 220;
      const Moving = Anim && Since < Dur + 80;
      if (F && F.first && !Moving) delete this.fold[S.id];
      if (F && !F.first && Date.now() - F.at > 1000) delete this.fold[S.id];
      if (F && !F.first) Sliding = true;
      if (Moving) Sliding = true;
      const Tabs = h_flex().id(`grp-tabs-${S.id}`).h_full().gap(3).items_center().flex_none().overflow_hidden()
        .children(Shut && !Moving ? [] : Shown.map((C) => this.Tab(C, S, S.active, T, Stop, Color)));
      // The width it slides to/from is the one measured while it stood open (an estimate only if never).
      this.groupW = this.groupW ?? {};
      if (!Moving && !Shut) Tabs.on_size_change((Sz, cx) => { const W = Number(Sz?.width) || 0; if (W && Math.abs(W - (this.groupW[S.id] ?? 0)) > 0.5) this.groupW[S.id] = W; });
      if (Moving) {
        const Full = this.groupW[S.id] ?? this.GroupWidth(Shown), From = Shut ? Full : 0, To = Shut ? 0 : Full;
        Tabs.w(First ? From : To).opacity(First ? (Shut ? 1 : 0) : (Shut ? 0 : 1))
          .transition("width", { duration: Dur, easing: "ease-out" }).transition("opacity", { duration: Dur, easing: "ease-out" });
      }
      Strip.child(h_flex().id(`grp-${S.id}-box`).h_full().gap(3).items_center().flex_none().border_b(2).border_color(Color)
        .child(this.Group(S, Shown.length, Color, T))
        .when(!Shut || Moving, (El) => El.child(Tabs)));
    };
    const WithTabs = List.filter((S) => Open(S).length);
    const Groups = WithTabs.length >= 2 && shared("siao.settings")?.groups !== false;
    if (All) WithTabs.forEach((S) => Draw(S, Groups));
    else if (Active) Draw(Active, false);

    // A group is sliding: draw again shortly — the first frame at the old width, then the new one, then
    // once more after the slide so a folded group's tabs leave.
    if (Sliding) cx?.spawn?.(async (c) => { await new Promise((R) => c.timer.after(20, R)); c.notify(); });
    const Root = layout(), Sidebar = Find(Root, "sidebar"), W = window();
    // What sits under the terminals (shared "siao.bottom": 狀態欄 quota / 終端機 terminal / 不顯示 none,
    // chosen in 設定 → SiaoDesk): applied at start and when it changes.
    const Bottom = BottomOf();
    // At start too: a choice kept from last time (shared.json) takes effect in the restored layout.
    if (this.bottomSeen === undefined) { this.bottomSeen = Bottom; ApplyBottom(Bottom, null); }
    if (Bottom !== this.bottomSeen) { const Was = this.bottomSeen; this.bottomSeen = Bottom; ApplyBottom(Bottom, Was); }
    // Sidebar folded away: the traffic lights move into this strip, and the sidebar button follows them to
    // exactly where SiaoBrand draws it (82 px into the card), so unfold is the same click on the same spot.
    const SideFolded = Boolean(Sidebar?.hidden);
    const LightsPadding = SideFolded ? (W?.platform === "macos" && !W.fullscreen ? 82 : 6) : 10;
    const Unfold = UnfoldSidebar;
    const Panel = Find(Root, "panel"), Body = Find(Root, "panel-body");
    // The right column shows one thing at a time: 筆記 / 檔案 / 變更 (the panel stack); clicking the
    // open one hides it.
    const PanelOn = Panel && !Panel.hidden;
    const PanelKeys = { notes: "z", files: "x", changes: "c" };
    const Choice = (Id, Label, Icon, On, Action) => {
      const Badge = Hint(`panel-${Id}`, PanelKeys[Id], Action);
      return h_flex().id(`panel-${Id}`).h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).text_color(On ? T.foreground : T.muted).when(On, (El) => El.bg(T.selected))
        .hover((S) => S.bg(T.hover)).on_mouse_down("left", Stop).on_click(Action)
        .when(Boolean(Badge), (El) => El.child(Badge))
        .child(svg(Icon).size(14)).child(Label);
    };
    const PanelButton = (Id, Label, Icon) => {
      const On = PanelOn && Body?.active === Id;
      return Choice(Id, Label, Icon, On, () => {
        if (On) return run("layout.hide", { id: "panel" });
        run("layout.select", { stack: "panel-body", child: Id });
        run("layout.show", { id: "panel" });
      });
    };

    const NewTab = () => openOverlay({ mod: "SiaoNewMenu", kind: "popup", width: 250, height: 543 });
    const UnfoldBadge = SideFolded ? Hint("unfold", "", Unfold) : null;
    const CloseTab = () => { const Cur = Active?.tabs.find((C) => C.active); if (Cur) run("tab.close", { id: Cur.id }); };
    const CloseBadge = Hint("close-tab", "", CloseTab);
    const NewBadge = Hint("new-tab", "n", NewTab);
    const Out = h_flex().size_full().min_w(0).px(10).pl(LightsPadding).gap(3).items_center()
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_mouse_down("right", () => openOverlay({ mod: "SiaoMenu", kind: "popup", width: 220, height: 3 * 31 + 9 + 12, props: { tab: "global" } }))
      .on_scroll_wheel((E) => { if (Math.abs(E.delta.y) >= 1) run(E.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .when(SideFolded, (El) => El.child(h_flex().id("unfold").h(26).px(5).gap(4).mr(4).flex_none().items_center().rounded(6)
        .text_color(T.muted).tooltip("展開側欄").hover((S) => S.bg(T.hover).text_color(T.foreground))
        .on_mouse_down("left", Stop).on_click(Unfold)
        .when(Boolean(UnfoldBadge), (E2) => E2.child(UnfoldBadge))
        .child(svg("mods/workspace-chrome/sidebar.svg").size(15)))
        .child(image("frame/welcome/herdr.png").size(18).rounded(5).flex_none().mr(6)))
      .when(Boolean(CloseBadge), (El) => El.child(CloseBadge))
      .child(Strip)
      .when(Boolean(NewBadge), (El) => El.child(NewBadge))
      // ＋: the menu of what to start (SiaoNewMenu puts the tab in the shown folder, its group unfolded).
      .child(Button("tab-new", "+", NewTab))
      .when(Boolean(Find(Root, "quota")?.hidden), (El) => {
        const U = this.usage, Pct = (V) => `${Math.round(Number(V) || 0)}%`;
        // What sits at the bottom is chosen in 設定 → SiaoDesk only; this just keeps the numbers in view.
        return El.child(h_flex().id("usage-chip").h(26).px(8).gap(6).flex_none().items_center().rounded(6)
          .text_size(11.5).text_color(T.muted).tooltip("用量（底部放什麼在 設定 → SiaoDesk 改）")
          .child(svg("mods/workspace-chrome/clock.svg").size(13))
          .child(U ? Pct(U.fiveHourPct) : "用量")
          .when(Boolean(U), (El) => El.child(svg("mods/SiaoTabs/calendar.svg").size(13).ml(4)).child(Pct(U.weekPct))));
      })
      .children(Panels.map(([Id, Label, Icon]) => PanelButton(Id, Label, Icon)))
      .when(W?.buttons, (El) => El.child(Button("minimize", W.platform === "windows" ? svg("mods/tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(Button("maximize", W.platform === "windows" ? svg(`mods/tabs/${W.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(Button("close-window", W.platform === "windows" ? svg("mods/tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
    this.H.end();
    return Out;
  }
}
