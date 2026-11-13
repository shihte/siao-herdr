// SiaoBoard: dispatcher → sub-agent tree for the Siao dispatch workflow.
// Scope follows the SiaoSpaces picker above: a folder, or "All". The mod command
// `SiaoBoard.toggle` flips between the two.
// Status glyphs are the same as the shipped agents mod (spinner / "Needs you" / ring / dot).
// Left click: focus that terminal (peek when it has no pane). Right click: SiaoMenu with focus, reply,
// rename, pin, copy id / task, send back to parent, stop, close tab. ↻ at the row's end restarts the
// Claude Code session (exit + resume); ctrl-shift-r (`SiaoBoard.restart`) does it for the focused agent.
// Data comes from herdr-core labels: siao.role / siao.task.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { Hints, Badge as KeyBadge } from "./hints.js";
import { Narrow, RailItem } from "./rail.js";
import { agents, terminals, panes, spaces, focused, run, hc, exec, appHome, theme, settings, shared, setShared, setAgentOrder, notify, nextCommand, openOverlay, layout, readTextFile, watchFolder, home } from "herdr";

function FindNode(Node, Id) {
  if (Node?.id === Id) return Node;
  for (const C of Node?.children ?? []) { const F = FindNode(C, Id); if (F) return F; }
  return null;
}
// The sidebar folded to its icon rail: rows become status + program icon, the name in a tooltip.
// Claude Code puts a spinner / status glyph in front of its title.
const Clean = (T) => String(T ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

const Rank = { blocked: 0, error: 0, done: 1, working: 2, idle: 3, unknown: 4 };
// Status filter chips in the header: All (default) or one bucket.
// Every status lands in one bucket, so the chips always add up to All.
const Buckets = { blocked: ["blocked", "error"], working: ["working"], done: ["done"], idle: ["idle", "unknown"] };

function StatusOf(Term, AgentMap) {
  return AgentMap.get(Term.address)?.status ?? Term.status ?? "unknown";
}

// Same drawing as mods/agents/main.js status(): keep the look people already know.
// An agent's mark: its working state as the main picture, the program's (AI vendor's) icon small on
// the bottom-right corner.
function AgentMark(T, Status, Program, Size) {
  const S = Size;
  const Main = Status === "working" ? svg("mods/workspace-chrome/spinner.svg").size(Math.round(S * 0.78)).text_color(T.working).spin(900)
    : Status === "blocked" || Status === "error" ? div().size(Math.round(S * 0.8)).rounded(Math.round(S * 0.22)).bg(T.blocked + "2e")
      .text_size(Math.round(S * 0.5)).font_bold().text_color(T.blocked).flex().items_center().justify_center().child("!")
    : Status === "done" ? div().size(Math.round(S * 0.5)).rounded_full().bg(T.done)
    : div().size(Math.round(S * 0.46)).rounded_full().border(2).border_color(T.idle ?? T.dim);
  const Small = Math.round(S * 0.5);
  const Vendor = ProgramIcon(Program, Small - 2, T.muted);
  return div().relative().size(S).flex_none().flex().items_center().justify_center().child(Main)
    .when(Boolean(Vendor), (El) => El.child(div().absolute().right(-3).bottom(-3).size(Small).rounded_full().bg(T.background)
      .flex().items_center().justify_center().child(Vendor)));
}

function ProgramIcon(P, Size, Color) {
  if (!P?.icon) return null;
  return P.tint ? svg(P.icon).size(Size).flex_none().text_color(Color) : image(P.icon).w(Size).h(Size).flex_none();
}

export default class SiaoBoard extends View {
  init(_props, cx) {
    this.subs = new Map();
    cx.timer.every(3000, (cx) => this.LoadSubs(cx));
    cx.spawn(async (cx) => {
      try { for (;;) { await watchFolder(`${home()}/.cache/siao-subagents`); await this.LoadSubs(cx); } } catch {}
    });
    this.selected = null;
    this.filter = "all";
    this.restarting = new Set();
    this.lastRestart = shared("siao.restart") ?? null;
    this.H = new Hints("SiaoBoard");
    this.text = "";
    this.input = InputState.new({ value: "" });
    this.input.on("change", (_e, cx) => { this.text = this.input.value(); cx.notify(); });
    this.typing = false;
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify?.(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify?.(); });
    this.input.on("submit", (_e, cx) => this.Send(cx));
    cx.spawn(async (cx) => {
      for (;;) {
        const C = await nextCommand();
        if (C === "toggle") this.Toggle();
        if (C === "all") setShared("siao.scope", "all");
        if (C === "space") setShared("siao.scope", "space");
        if (C === "restart") { const T = focused()?.terminal; if (T) this.Restart(T, cx); }
        cx.notify();
      }
    });
  }

  Scope() { return shared("siao.scope") === "all" ? "all" : "space"; }
  Toggle() { setShared("siao.scope", this.Scope() === "all" ? "space" : "all"); }

  Send(cx) {
    const Target = this.selected, Text = this.text.trim();
    if (!Target || !Text) return;
    cx.spawn(async (cx) => {
      const R = await hc(["send", Target, Text]);
      if (R.code !== 0) notify({ title: "代理", body: `傳送失敗：${R.stderr || R.stdout}`, level: "error" });
      this.input.set_value(""); this.text = "";
      cx.notify();
    });
  }

  // ↻ on a row / ctrl-shift-r: end claude, reopen `claude … --resume <session>` in a new tab at the same
// place, close the old tab (bin/SiaoRestart).
  Restart(Address, cx) {
    if (this.restarting.has(Address)) return;
    this.restarting.add(Address);
    cx.notify();
    cx.spawn(async (cx) => {
      // The new tab goes back to the old one's place and keeps its name if someone named it.
      const A = agents().find((X) => X.address === Address);
      const Tab = A && spaces().flatMap((S) => S.tabs).find((C) => C.id === A.tab);
      const Args = [Address, A?.tab_index ? String(A.tab_index) : "", Tab?.named ? Tab.name : ""];
      const R = await exec(`${appHome()}/bin/SiaoRestart`, Args, { timeout: 45000 }).catch((E) => ({ code: 1, stderr: String(E) }));
      this.restarting.delete(Address);
      if (R.code === 0) notify({ title: "已重新整理", body: R.stdout.trim(), timeout: 3000 });
      else notify({ title: "重新整理失敗", body: (R.stderr || R.stdout || "").trim(), level: "error", timeout: 6000 });
      cx.notify();
    });
  }

  IsClaude(Term, Agent) {
    return /claude/i.test(`${Agent?.app ?? ""} ${Agent?.program?.name ?? ""} ${Term.argv?.join(" ") ?? ""}`);
  }

  Urgency(Term, Kids, AgentMap) {
    let Best = Rank[StatusOf(Term, AgentMap)] ?? 4;
    for (const K of Kids.get(Term.address) ?? []) Best = Math.min(Best, this.Urgency(K, Kids, AgentMap));
    return Best;
  }

  Open(Term, AgentMap) {
    if (AgentMap.get(Term.address)?.pane) run("pane.focus", { terminal: Term.address });
    else run("terminal.peek", { terminal: Term.address });
  }

  // Right-click menu for one agent row. Items that cannot apply (no tab, no parent, not Claude) are left out.
  Menu(Term, AgentMap) {
    const Agent = AgentMap.get(Term.address);
    const Pane = panes().find((P) => P.terminal === Term.address);
    const Task = Term.labels?.["siao.task"] ?? "";
    const Parent = Term.parent && terminals().find((X) => X.address === Term.parent);
    const Claude = this.IsClaude(Term, Agent) || Boolean(Agent);
    const Name = Term.name || Agent?.title || "";
    // The conversation in use (focused) is highlighted the way the open folder is.
    const F = focused();
    const Picked = F?.terminal === Term.address || F?.agent === Term.address || (!F?.terminal && this.selected === Term.address);
    const Items = [
      { label: Pane ? "切換到這個代理" : "預覽（不切換分頁）", command: Pane ? "pane.focus" : "terminal.peek", args: { terminal: Term.address }, icon: "square" },
      ...(Claude ? [{ label: "重新整理會話（退出重進）", command: "shared", args: { key: "siao.restart", value: `${Term.address}|${Date.now()}` }, icon: "check", hint: Term.address === focused()?.terminal ? "⌃⇧R" : "" }] : []),
      null,
      ...(Claude ? [{ label: "修改對話名稱", command: "prompt", icon: "square-pen",
        args: { title: "修改對話名稱", value: Clean(Agent?.title ?? Name), hint: "送出 Claude Code 的 /rename", hc: ["send", Term.address, "/rename {text}"], done: "已送出 /rename" } }] : []),
      { label: Task ? `修改任務 ID（${Task}）` : "設定任務 ID", command: "prompt", icon: "square-pen",
        args: { title: "任務 ID", value: Task, hint: "Herdr 標籤 siao.task，例如 T3", hc: ["label", Term.address, "siao.task={text}"], done: "任務 ID 已更新" } },
      ...(Pane ? [{ label: "重新命名分頁", command: "prompt", icon: "square-pen", hint: "F2", args: { title: "重新命名分頁", allowEmpty: true, hint: "留空：改回自動顯示對話名稱",
        value: spaces().flatMap((Sp) => Sp.tabs).find((Tb) => Tb.id === Pane.tab && Tb.named)?.name ?? Clean(Agent?.title ?? Name), run: { command: "tab.rename", args: { id: Pane.tab, name: "{text}" } } } }] : []),
      Agent ? { label: Agent.pinned ? "取消釘選" : "釘選到最上面", command: "terminal.pin", args: { terminal: Term.address, pinned: !Agent.pinned }, icon: Agent.pinned ? "pin-off" : "pin" } : null,
      null,
      { label: `複製終端機 ID  ${Term.address}`, command: "copy", args: { text: Term.address }, icon: "files" },
      ...(Task ? [{ label: `複製任務 ID  ${Task}`, command: "copy", args: { text: Task }, icon: "files" }] : []),
      null,
      ...(Parent ? [{ label: `送回 ${Parent.name || Parent.address}`, command: "terminal.park", args: { terminal: Term.address }, icon: "chevron-left" }] : []),
      ...(Pane ? [{ label: "關閉分頁", command: "tab.close", args: { id: Pane.tab }, icon: "x", danger: true }] : []),
      { label: "停止代理", command: "terminal.kill", args: { terminal: Term.address }, icon: "x", danger: true },
    ].filter((X, I, All) => X !== null || (I > 0 && All[I - 1] !== null));
    const Real = Items.filter(Boolean).length, Seps = Items.filter((X) => X === null).length;
    openOverlay({ mod: "SiaoMenu", kind: "popup", width: 270, height: Real * 31 + Seps * 9 + 12, props: { items: Items } });
  }

  Row(Term, Depth, Kids, AgentMap, T, Mono) {
    const Status = StatusOf(Term, AgentMap);
    const Labels = Term.labels ?? {};
    const Task = Labels["siao.task"] ?? "";
    const Agent = AgentMap.get(Term.address);
    const Name = Term.name || Agent?.title || Term.argv?.[0] || Term.address;
    // The conversation in use (focused) is highlighted the way the open folder is.
    const F = focused();
    const Picked = F?.terminal === Term.address || F?.agent === Term.address || (!F?.terminal && this.selected === Term.address);
    const Pinned = Boolean(Agent?.pinned);
    const Key = this.H.add(`agent-${Term.address}`, this.keyN < 10 ? "asdfghjkl;"[this.keyN] : "", () => this.Open(Term, AgentMap));
    this.keyN++;
    const Badge = Key ? KeyBadge(T, Key) : null;
    if (Narrow()) {
      // Rail: just the program icon; its status is the dot on the corner, the name the tooltip.
      const Glyph = AgentMark(T, Status, Agent?.program, 26);
      const Dot = null;
      const Icon = RailItem(T, `sb-${Term.address}`, Glyph, Task ? `${Task} ${Clean(Name)}` : Clean(Name), focused()?.terminal === Term.address,
        () => this.Open(Term, AgentMap), Badge, () => this.Menu(Term, AgentMap), Dot);
      const Under = (Kids.get(Term.address) ?? []).filter((K) => !this.visible || this.visible.has(K.address))
        .map((K) => this.Row(K, Depth + 1, Kids, AgentMap, T, Mono));
      return v_flex().child(Icon).children(Under);
    }
    const Row = h_flex().id(`sb-${Term.address}`).h(32).pl(8 + Depth * 14).pr(8).gap(6).items_center().rounded(6)
      .cursor_pointer()
      .when(Pinned && !Picked, (El) => El.bg(T.accent + "1f").border_l(3).border_color(T.accent))
      .when(Picked, (El) => El.bg(T.selected))
      .hover((S) => S.bg(Picked ? T.selected : Pinned ? T.accent + "33" : T.hover))
      .on_click(() => this.Open(Term, AgentMap))
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.Menu(Term, AgentMap); })
      .when(Boolean(Badge), (El) => El.child(Badge))
      // Full column: status and the program's icon side by side, both full size (the small corner icon is the rail's).
      .child(AgentMark(T, Status, null, 20))
      .child(ProgramIcon(Agent?.program, 18, T.muted) ?? div().w(18).flex_none())
      .when(Depth > 0, (El) => El.border_l(1).border_color(T.border))
      .when(Boolean(Task), (El) => El.child(div().text_size(11).font_family(Mono).text_color(T.accent).child(Task)))
      .child(div().flex_1().min_w(0).truncate().text_size(13.5).when(Pinned, (El) => El.font_semibold())
        .text_color(Pinned ? T.foreground : Status === "idle" ? T.muted : T.foreground).child(Name))
      .when(Pinned, (El) => El.child(svg("mods/workspace-chrome/pin.svg").size(12).flex_none().text_color(T.accent)))
      .when((Boolean(Agent) || this.IsClaude(Term, Agent)) && shared("siao.settings")?.agentRestart !== false, (El) => {
        const Busy = this.restarting.has(Term.address);
        return El.child(div().id(`sb-re-${Term.address}`).flex_none().size(20).rounded(5).flex().items_center().justify_center()
          .text_size(13).text_color(Busy ? T.accent : T.dim).cursor_pointer()
          .hover((S) => S.bg(T.raised).text_color(T.foreground))
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click((_e, cx) => { cx.stop_propagation(); this.Restart(Term.address, cx); })
          .child(Busy ? svg("mods/workspace-chrome/spinner.svg").size(12).text_color(T.accent).spin(900) : "↻"));
      });
    const Children = (Kids.get(Term.address) ?? [])
      .filter((K) => !this.visible || this.visible.has(K.address))
      .sort((A, B) => this.Urgency(A, Kids, AgentMap) - this.Urgency(B, Kids, AgentMap))
      .map((K) => this.Row(K, Depth + 1, Kids, AgentMap, T, Mono));
    return v_flex().child(Row).children(this.SubRows(Term, Depth, T, Mono, AgentMap)).children(Children);
  }

  // Claude Code's own subagents (Agent / Task tool) running inside this terminal, from the hook
  // bin/SiaoSubagents (~/.cache/siao-subagents/<terminal>.json). Drawn like an agent row, one step in
  // under whoever started it (a subagent's own subagents one step further), with what it is doing now
  // (its latest tool call) under its name.
  SubRows(Term, Depth, T, Mono, AgentMap) {
    if (shared("siao.settings")?.subagents === false) return [];   // 設定 → SiaoDesk → 顯示子代理
    const List = this.subs.get(Term.address) ?? [];
    const Ids = new Set(List.map((A) => A.id));
    const Ago = (S) => { const M = Math.floor((Date.now() / 1000 - S) / 60); return M < 1 ? "剛開始" : M < 60 ? `${M} 分` : `${Math.floor(M / 60)} 時 ${M % 60} 分`; };
    const Program = AgentMap.get(Term.address)?.program;
    const Rows = (Parent, D) => List.filter((A) => (A.parent && Ids.has(A.parent) ? A.parent : null) === Parent).flatMap((A) => [
      h_flex().id(`sb-sub-${Term.address}-${A.id}`).h(40).pl(8 + D * 14).pr(8).gap(6).items_center().rounded(6)
        .border_l(1).border_color(T.border)
        .cursor_pointer().hover((S) => S.bg(T.hover)).on_click(() => shared("siao.settings")?.subOpen === false ? this.Open(Term, AgentMap) : this.OpenSub(Term, A, AgentMap))
        .tooltip("打開這個子代理（跟在 Claude Code 裡選它一樣）")
        .child(AgentMark(T, "working", null, 20))
        .child(ProgramIcon(Program, 18, T.muted) ?? div().w(18).flex_none())
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(h_flex().gap(6).items_center().min_w(0)
            .child(div().flex_1().min_w(0).truncate().text_size(13.5).text_color(T.foreground).child(A.desc || A.type || "子代理"))
            .child(div().flex_none().text_size(10.5).text_color(T.dim).child(Ago(A.started))))
          .child(h_flex().gap(6).items_center().min_w(0)
            .child(div().flex_none().text_size(10.5).font_family(Mono).text_color(T.accent).child(A.type || "agent"))
            .when(shared("siao.settings")?.subDoing !== false, (El) => El.child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(T.muted).child(A.doing || "準備中…"))))),
      ...Rows(A.id, D + 1),
    ]);
    return Rows(null, Depth + 1);
  }

  // A subagent opens the way Claude Code itself opens one: its agent's terminal comes forward, then the
  // keys Claude Code uses — ↓ from the prompt enters the agents list at "main", ↓ again per row down to
  // this subagent (rows follow start order, main first), Enter to view it. Esc in there returns to the list.
  OpenSub(Term, A, AgentMap) {
    this.Open(Term, AgentMap);
    const Row = (this.subs.get(Term.address) ?? []).findIndex((X) => X.id === A.id);
    if (Row < 0) return;
    hc(["keys", Term.address, "down", ...Array(Row + 1).fill("down"), "enter"])
      .then((R) => { if (R?.code) console.error("SiaoBoard: hc keys:", R.stderr); })
      .catch((E) => console.error("SiaoBoard: hc keys:", E?.message ?? E));
  }

  async LoadSubs(cx) {
    const Dir = `${home()}/.cache/siao-subagents`;
    const Next = new Map();
    for (const X of terminals().filter((X) => X.state === "live")) {
      const Text = await readTextFile(`${Dir}/${X.address}.json`).catch(() => null);
      if (!Text) continue;
      try {
        const List = Object.entries(JSON.parse(Text).agents ?? {}).map(([Id, A]) => ({ ...A, id: Id })).sort((A, B) => A.started - B.started);
        if (List.length) Next.set(X.address, List);
      } catch {}
    }
    const Sig = JSON.stringify([...Next]);
    // Re-render when the list changed, and once a minute while any run (the "N 分" counter).
    if (Sig !== this.subSig || (Next.size && Date.now() - (this.subDrawn ?? 0) > 60000)) {
      this.subSig = Sig; this.subs = Next; this.subDrawn = Date.now(); cx.notify();
    }
  }

  render(cx) {
    this.selected = null;   // the reply box is gone (not needed): nothing is "picked" any more
    this.H.begin(); this.keyN = 0;
    // A menu asked to restart an agent ("<address>|<time>", so the same agent twice still counts).
    const Ask = shared("siao.restart");
    if (Ask && Ask !== this.lastRestart) { this.lastRestart = Ask; this.Restart(Ask.split("|")[0], cx); }
    const T = theme();
    const Mono = settings().font_family ?? "JetBrains Mono";
    const Scope = this.Scope();
    const Space = focused()?.space ?? null;
    const AgentMap = new Map(agents().map((A) => [A.address, A]));
    const Live = terminals().filter((X) => X.state === "live" && (AgentMap.has(X.address) || X.labels?.["siao.role"]));
    const Addresses = new Set(Live.map((X) => X.address));
    const Kids = new Map();
    for (const X of Live) {
      if (X.parent && Addresses.has(X.parent)) {
        if (!Kids.has(X.parent)) Kids.set(X.parent, []);
        Kids.get(X.parent).push(X);
      }
    }
    // Roots: no live parent. In "space" scope keep only roots that live in the selected space;
    // children follow their root, so sub-terminals without an agent entry still show.
    const Roots = Live.filter((X) => !(X.parent && Addresses.has(X.parent)))
      .filter((X) => Scope === "all" || !Space || (AgentMap.get(X.address)?.space ?? Space) === Space)
      .sort((A, B) => (AgentMap.get(B.address)?.pinned ? 1 : 0) - (AgentMap.get(A.address)?.pinned ? 1 : 0)
        || this.Urgency(A, Kids, AgentMap) - this.Urgency(B, Kids, AgentMap));

    const Flat = [];
    const Walk = (X) => { Flat.push(X.address); for (const K of Kids.get(X.address) ?? []) Walk(K); };
    Roots.forEach(Walk);
    setAgentOrder(Flat);

    const Shown = new Set(Flat);
    const Count = (S) => Live.filter((X) => Shown.has(X.address) && StatusOf(X, AgentMap) === S).length;
    const NeedYou = Count("blocked") + Count("error");

    // Filter: keep an agent when it, or something under it, is in the chosen bucket (parents stay for context).
    this.visible = null;
    if (this.filter !== "all") {
      const Want = Buckets[this.filter];
      const Keep = (X) => {
        let Hit = Want.includes(StatusOf(X, AgentMap));
        for (const K of Kids.get(X.address) ?? []) Hit = Keep(K) || Hit;
        if (Hit) this.visible.add(X.address);
        return Hit;
      };
      this.visible = new Set();
      Roots.forEach(Keep);
    }
    const ShownRoots = this.visible ? Roots.filter((X) => this.visible.has(X.address)) : Roots;

    const Chip = (Id, Label, N, Color) => {
      const On = this.filter === Id;
      const Key = this.H.add(`filter-${Id}`, "", () => { this.filter = On && Id !== "all" ? "all" : Id; });
      return h_flex().id(`sb-filter-${Id}`).h(22).px(7).gap(5).items_center().rounded(6).cursor_pointer()
        .bg(On ? T.selected : T.surface + "00").border(1).border_color(On ? T.border : T.surface + "00")
        .hover((S) => S.bg(On ? T.selected : T.hover))
        .on_click((_e, cx) => { this.filter = On && Id !== "all" ? "all" : Id; cx.notify(); })
        .when(Boolean(Key), (El) => El.child(KeyBadge(T, Key)))
        .when(Color != null, (El) => El.child(div().w(6).h(6).rounded_full().bg(N ? Color : T.dim + "55")))
        .child(div().text_size(11).text_color(On ? T.foreground : N || Color == null ? T.muted : T.dim)
          .child(N == null ? Label : `${Label} ${N}`));
    };

    const SelectedTerm = Live.find((X) => X.address === this.selected);
    const SelectedName = SelectedTerm ? (SelectedTerm.labels?.["siao.task"] || SelectedTerm.name || SelectedTerm.address) : null;

    const RowEls = ShownRoots.map((X) => this.Row(X, 0, Kids, AgentMap, T, Mono));
    const Chips = Narrow() ? [] : [Chip("all", "全部", Shown.size, null), Chip("blocked", "需要你", NeedYou, T.blocked),
      Chip("working", "進行中", Count("working"), T.working), Chip("done", "完成", Count("done"), T.done),
      Chip("idle", "閒置", Count("idle") + Count("unknown"), T.dim)];
    this.H.end(cx);
    if (Narrow()) return v_flex().id("root").size_full().pt(4).text_color(T.foreground)
      .child(v_flex().id("sb-list").flex_1().min_h(0).gap(0).overflow_y_scrollbar()
        .children(RowEls));
    return v_flex().id("root").size_full().text_color(T.foreground)
      .child(h_flex().h(34).px(12).items_center()
        .child(div().text_size(12).font_semibold().text_color(T.muted).child(Scope === "all" ? "代理 · 全部資料夾" : "代理")))
      .child(h_flex().px(8).pb(6).gap(2).items_center()
        .children(Chips))
      .child(v_flex().id("sb-list").flex_1().min_h(0).px(6).gap(2).overflow_y_scrollbar()
        .when(ShownRoots.length === 0, (El) => El.child(div().p(12).text_size(12).text_color(T.dim)
          .child(this.filter !== "all" ? "這個分類目前沒有代理。" : Scope === "space" ? "這個資料夾還沒有代理。按 + → Siao 調度員，或選上方的「全部」。" : "還沒有代理。按 + → Siao 調度員。")))
        .children(RowEls));
  }
}
