// SiaoSpaces: the folder picker above the agent list.
// First row is "All": every agent on every machine shows below. Any other row is one space
// (grouped by machine when there is more than one): click it and the agent list shows only
// that space. A folder is just a folder: no agent status here, the tab strip carries that.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { Hints, Badge as KeyBadge } from "./hints.js";
import { Narrow, RailItem, RailMenu, UnfoldSidebar } from "./rail.js";
import { spaces, machines, run, theme, shared, setShared, openOverlay, layout, hc, notify } from "herdr";

function Find(Node, Id) {
  if (Node?.id === Id) return Node;
  for (const C of Node?.children ?? []) { const F = Find(C, Id); if (F) return F; }
  return null;
}
// The sidebar folded to its icon rail (SiaoDesk's ◫ button narrows it, like Herdr's own rail).
const Colors = ["#8ab4f8", "#f28b82", "#fdd663", "#81c995", "#ff8bcb", "#c58af9", "#78d9ec", "#fcad70"];
function ColorOf(Id) { let H = 0; for (const Ch of Id) H = (H * 31 + Ch.charCodeAt(0)) >>> 0; return Colors[H % Colors.length]; }

export default class SiaoSpaces extends View {
  init() { this.H = new Hints("SiaoSpaces"); }

  Scope() { return shared("siao.scope") === "all" ? "all" : "space"; }

  // Right-click: a folder gets Herdr's own space menu (rename, worktrees, close); "All" and the
  // empty area get the global one (new space, keybinds, themes).
  Menu(SpaceId) {
    // Same rows as SiaoMenu's built-in space / global menus: rename (+ 2 worktree rows in a git folder), close; or 3 global rows.
    const Git = Boolean(spaces().find((S) => S.id === SpaceId)?.branch);
    const Rows = SpaceId ? (Git ? 4 : 2) : 3;
    openOverlay({ mod: "SiaoMenu", kind: "popup", width: 220, height: Rows * 31 + 9 + 12, props: SpaceId ? { tab: "space", target: { id: SpaceId } } : { tab: "global" } });
  }

  Row(Id, Glyph, Label, Sub, On, T, Action, SpaceId) {
    const Key = this.H.add(Id, SpaceId && this.keyN < 10 ? "qwertyuiop"[this.keyN] : "", (Cx) => Action(null, Cx));
    if (SpaceId) this.keyN++;
    if (Narrow()) return RailItem(T, Id, Glyph, Label, On, Action, Key ? KeyBadge(T, Key) : null, () => this.Menu(SpaceId));
    if (Key) Glyph = h_flex().gap(3).items_center().child(KeyBadge(T, Key)).child(Glyph);
    return h_flex().id(Id).h(32).px(8).gap(8).items_center().rounded(6).cursor_pointer()
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.Menu(SpaceId); })
      .when(On, (El) => El.bg(T.selected))
      .hover((S) => S.bg(On ? T.selected : T.hover))
      .on_click(Action)
      .child(h_flex().min_w(20).flex_none().items_center().justify_center().child(Glyph))
      .child(div().flex_1().min_w(0).truncate().text_size(13.5).text_color(On ? T.foreground : T.muted).child(Label))
      .when(Boolean(Sub), (El) => El.child(div().text_size(10.5).text_color(T.dim).child(Sub)));
  }

  // ＋: a folder on this Mac, or — once machines are added (設定 → 機器) — pick which machine first.
  // There it opens in that machine's home; its terminals and agents run there.
  NewFolder() {
    const Others = machines().filter((M) => M.name && M.layout !== "unavailable");
    if (!Others.length) return run("space.new", {});
    const Items = [
      { label: "這台 Mac", command: "space.new", args: { machine: "" }, icon: "folder" },
      ...Others.map((M) => ({ label: M.name, command: "space.new", args: { machine: M.name }, icon: "server" })),
    ];
    openOverlay({ mod: "SiaoMenu", kind: "popup", width: 220, height: Items.length * 31 + 12, props: { items: Items } });
  }

  // A machine's menu (right-click its heading). 斷開連線 forgets it here (`hc machine rm`): its folders
  // leave the list, but what runs there keeps running and comes back when it is added again.
  MachineMenu(Name) {
    const Ask = (Act) => ({ command: "shared", args: { key: "siao.machine.ask", value: `${Act}|${Name}|${Date.now()}` } });
    const Items = [
      { label: "重新登入", ...Ask("login"), icon: "check" },
      { label: "更新那台的 hc", ...Ask("update"), icon: "check" },
      null,
      { label: `斷開 ${Name}`, ...Ask("rm"), icon: "x", danger: true },
    ];
    openOverlay({ mod: "SiaoMenu", kind: "popup", width: 220, height: 3 * 31 + 9 + 12, props: { items: Items } });
  }

  Disconnect(Name) { this.MachineDo("rm", Name); }

  MachineDo(Act, Name) {
    const Words = { rm: ["斷開", "已斷開"], login: ["重新登入", "已重新登入"], update: ["更新 hc", "已更新 hc"] }[Act];
    if (!Words) return;
    hc(["machine", Act, Name]).then((R) => {
      if (R?.code) notify({ title: `${Words[0]} ${Name} 沒有成功`, body: (R.stderr || R.stdout || "").trim().slice(0, 300), level: "error", timeout: 6000 });
      else notify({ title: `${Words[1]} ${Name}`, body: Act === "rm" ? "那裡正在跑的東西會繼續跑，重新新增就回來。" : "", timeout: 4000 });
    }).catch((E) => notify({ title: `${Words[0]} ${Name} 沒有成功`, body: String(E?.message ?? E), level: "error", timeout: 6000 }));
  }

  render(cx) {
    // A choice from a machine's menu (SiaoMenu writes "act|name|time").
    const Ask = shared("siao.machine.ask");
    if (Ask && Ask !== this.askSeen) {
      const First = this.askSeen === undefined;
      this.askSeen = Ask;
      const [Act, Name, At] = String(Ask).split("|");
      if (!First || Date.now() - Number(At) < 5000) this.MachineDo(Act, Name);
    }
    const T = theme();
    this.H.begin(); this.keyN = 0;
    const NewKey = this.H.add("new-folder", "", () => this.NewFolder());
    const All = this.Scope() === "all";
    const List = spaces();
    const Known = machines().map((M) => M.name);
    const Groups = new Map();
    for (const S of List) {
      const K = S.machine ?? null;
      if (!Groups.has(K)) Groups.set(K, []);
      Groups.get(K).push(S);
    }
    const Multi = Groups.size > 1 || Known.length > 1;
    const AllGlyph = svg("mods/workspace-chrome/layers.svg").size(Narrow() ? 24 : 17).flex_none().text_color(All ? T.accent : T.dim);

    const UnfoldKey = Narrow() ? this.H.add("unfold", "", UnfoldSidebar) : null;
    const Body = v_flex().id("ss-list").flex_1().min_h(0).px(Narrow() ? 4 : 6).gap(2).overflow_y_scrollbar()
      .child(this.Row("ss-all", AllGlyph, "全部", `${List.length}`, All, T,
        (_e, cx) => { setShared("siao.scope", "all"); cx.notify(); }));
    for (const [Machine, Items] of Groups) {
      if (Multi && !Narrow()) Body.child(h_flex().id(`ss-m-${Machine ?? "here"}`).pt(8).pb(2).px(8).items_center().gap(6)
        .text_size(10.5).font_semibold().text_color(T.dim)
        .when(Boolean(Machine), (El) => El.cursor_pointer().tooltip("右鍵：斷開連線、重新登入、更新 hc")
          .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.MachineMenu(Machine); }))
        .child(div().flex_1().child(Machine ?? "這台 Mac"))
        .when(Boolean(Machine), (El) => El.child(div().id(`ss-m-x-${Machine}`).px(4).rounded(4).cursor_pointer()
          .text_color(T.dim).hover((S) => S.bg(T.hover).text_color(T.foreground)).tooltip(`斷開 ${Machine}`)
          .on_click((_e, cx) => { cx.stop_propagation(); this.Disconnect(Machine); }).child("⏏"))));
      for (const S of Items) {
        const On = !All && S.active;
        const Glyph = Narrow()
          ? div().size(30).rounded(8).flex().items_center().justify_center().text_size(15).font_semibold()
            .bg(ColorOf(S.id) + (On ? "" : "33")).text_color(On ? "#1b1b1f" : ColorOf(S.id)).child((S.name || "?").slice(0, 1).toUpperCase())
          : svg("mods/workspace-chrome/folder.svg").size(17).flex_none().text_color(On ? T.accent : T.dim);
        Body.child(this.Row(`ss-${S.id}`, Glyph, S.name, S.branch ?? "", On, T,
          (_e, cx) => { setShared("siao.scope", "space"); run("space.select", { id: S.id }); cx.notify(); }, S.id));
      }
    }

    this.H.end(cx);
    if (Narrow()) return v_flex().id("root").size_full().text_color(T.foreground)
      .on_mouse_down("right", () => this.Menu(null))
      .child(RailMenu(T, UnfoldKey ? KeyBadge(T, UnfoldKey) : null))
      .child(Body);
    return v_flex().id("root").size_full().text_color(T.foreground)
      .on_mouse_down("right", () => this.Menu(null))
      .child(h_flex().h(34).px(12).items_center().justify_between()
        .child(div().text_size(12).font_semibold().text_color(T.muted).child("資料夾"))
        .when(Boolean(NewKey), (El) => El.child(KeyBadge(T, NewKey)))
        .child(div().id("ss-new").size(20).rounded(5).flex().items_center().justify_center().cursor_pointer()
          .hover((S) => S.bg(T.hover)).on_click(() => this.NewFolder())
          .child(svg("mods/workspace-chrome/plus.svg").size(13).text_color(T.dim))))
      .child(Body);
  }
}
