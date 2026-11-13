// SiaoNotes: the living document for the project you are in — ClaudeDocs/ as kept by the notes skill.
// "The project you are in" = the focused terminal's live folder (or the space's first pane), walking up
// to the nearest folder that has a ClaudeDocs/. A space made in ~/a and cd'd to ~/b shows ~/b's notes.
// Files: HANDOFF / OVERVIEW as tabs, the rest grouped (日誌 NOTES_*, 規格 SPEC_*, 決策, 其他) behind menus.
// Default file is HANDOFF.md (the only document that is rewritten whole, so it is always current).
// Header pills switch to OVERVIEW.md, DECISIONS.md or any NOTES_*.md. Re-renders on every change.
// "Needs a human" bullets that carry an id like `[Q3]` become cards. Bullet shape (SiaoDispatcher writes it):
//   - [Q3] plan|accept|input|choice: <question> → ClaudeDocs/REPORT_T1.md. Assumed: <interim>
// plan → 核准 / 退回…, accept → 通過 / 退回…, choice → its 選項：A｜B｜C buttons (else 是 / 否);
// every card also has its own text box with 送出 (Enter works) for a custom answer or a reason.
// A referenced ClaudeDocs/*.md opens inline under the card. Answers go to the space's dispatcher via
// `hc send` as `SIAO ANSWER Q3 yes` / `SIAO ANSWER Q3 no: <reason>` / `SIAO ANSWER Q3 <free text>`.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextView } from "gpui-base";
import { Hints, Badge as KeyBadge } from "./hints.js";
import { spaces, focused, agents, terminals, panes, readTextFile, watchFolder, exec, hc, theme, settings, notify, openOverlay, shared, setShared, home, nextCommand } from "herdr";

const Preferred = ["HANDOFF.md", "OVERVIEW.md", "DECISIONS.md"];
const Tabs = ["HANDOFF.md", "OVERVIEW.md"];
const Groups = [
  ["notes", "日誌", (N) => /^NOTES_/.test(N), (N) => N.replace(/^NOTES_/, "")],
  ["spec", "規格", (N) => /^SPEC_/.test(N), (N) => N.replace(/^SPEC_/, "")],
  ["decision", "決策", (N) => /^DECISIONS?/.test(N), (N) => N],
  ["other", "其他", () => true, (N) => N],
];
function GroupOf(Name) { return Tabs.includes(Name) ? null : Groups.find((G) => G[2](Name)); }
function Pretty(Name, Strip) { return Strip(Name.replace(/\.md$/, "")).replaceAll("_", " "); }

function ParseNeedsHuman(Text) {
  const Lines = Text.split("\n");
  const Start = Lines.findIndex((L) => /^##\s+Needs a human/i.test(L));
  if (Start < 0) return [];
  const Items = [];
  for (let I = Start + 1; I < Lines.length; I++) {
    const L = Lines[I];
    if (/^##\s/.test(L)) break;
    const M = L.match(/^\s*[-*]\s+(?:\[(Q\d+)\]\s*)?(.*)$/);
    if (M) {
      let Text = M[2], Kind = "choice", File = null, Assumed = null;
      const K = Text.match(/^(plan|accept|input|choice)\s*[:：]\s*/i);
      if (K) { Kind = K[1].toLowerCase(); Text = Text.slice(K[0].length); }
      const F = Text.match(/(?:→|->)\s*(ClaudeDocs\/[\w./-]+\.md)\.?/);
      if (F) { File = F[1]; Text = Text.replace(F[0], "").trim(); }
      const A = Text.match(/\bAssumed\s*[:：]\s*(.*)$/i);
      if (A) { Assumed = A[1].trim(); Text = Text.slice(0, A.index).trim(); }
      // "選項：A｜B｜C" (or Options: A | B | C, / also splits) → one button per option.
      let Options = [];
      const O = Text.match(/(?:選項|Options?)\s*[:：]\s*([^。]*?)\s*(?:[。.]\s*|$)/i);
      if (O) { Options = O[1].split(/\s*[|｜/／]\s*/).map((X) => X.trim()).filter(Boolean); Text = (Text.slice(0, O.index) + Text.slice(O.index + O[0].length)).trim(); }
      Items.push({ id: M[1] ?? null, kind: Kind, text: Text, file: File, assumed: Assumed, options: Options });
    }
    else if (Items.length && /^\s{2,}\S/.test(L)) Items[Items.length - 1].text += " " + L.trim();
  }
  return Items.filter((X) => X.id);
}

// "## State" table → one pipeline row per task: written → committed → pushed → deployed.
const Stages = ["written", "committed", "pushed", "deployed"];
const StageLabel = { written: "寫入", committed: "提交", pushed: "推送", deployed: "部署" };
function ParseState(Text) {
  const Lines = Text.split("\n");
  const Start = Lines.findIndex((L) => /^##\s+State/i.test(L));
  if (Start < 0) return { rows: [], rest: Text };
  const Rows = [], Drop = new Set();
  for (let I = Start + 1; I < Lines.length; I++) {
    const L = Lines[I];
    if (/^##\s/.test(L)) break;
    if (!/^\s*\|/.test(L)) continue;
    Drop.add(I);
    const Cells = L.split("|").slice(1, -1).map((C) => C.trim());
    if (Cells.length < 5 || /^-+$/.test(Cells[0]) || /^(task|component)$/i.test(Cells[0])) continue;
    const Level = (C) => /partial|half/i.test(C) ? 0.5 : (C === "" || /^(—|-|–|no|✗|x)$/i.test(C)) ? 0 : 1;
    Rows.push({ name: Cells[0], levels: Cells.slice(1, 5).map(Level), how: Cells[5] ?? "" });
  }
  return { rows: Rows, rest: Lines.filter((_, I) => !Drop.has(I)).filter((L) => !/^Rewritten:/i.test(L)).join("\n") };
}

export default class SiaoNotes extends View {
  init(_props, cx) {
    this.H = new Hints("SiaoNotes");
    this.files = [];
    this.file = "HANDOFF.md";
    this.text = null;
    this.error = null;
    this.context = null;
    this.answering = null;
    this.pool = Array.from({ length: 12 }, (_, I) => {
      const St = InputState.new({ value: "", placeholder: "輸入回答或補充說明，Enter 送出…" });
      St.on("submit", (_e, cx) => { const It = this.slotItem[I]; if (It) this.Reply(cx, It, null); });
      St.on("focus", (_e, cx) => { this.typing = true; cx.notify?.(); });
      St.on("blur", (_e, cx) => { this.typing = false; cx.notify?.(); });
      return St;
    });
    this.slots = Array(12).fill(null);
    this.slotItem = Array(12).fill(null);
    // Answered questions disappear at once and stay gone (id → the question text it answered; the
    // same id asked again with other words shows again). Kept across restarts in localStorage.
    try { this.answered = new Map(Object.entries(JSON.parse(localStorage.getItem("answered") ?? "{}"))); } catch { this.answered = new Map(); }
    this.reason = "";
    this.opened = new Set();
    this.attached = new Map();
    cx.timer.every(5000, (cx) => this.Refresh(cx));
    // Mod commands: SiaoNotes.handoff jumps back to HANDOFF.md (its question cards), SiaoNotes.refresh reloads.
    cx.spawn(async (cx) => {
      for (;;) {
        const C = await nextCommand();
        if (C === "handoff") { this.file = "HANDOFF.md"; setShared("siao.notes.file", "HANDOFF.md"); this.lastWant = "HANDOFF.md"; }
        this.Refresh(cx);
      }
    });
    this.Refresh(cx);
  }

  Space() {
    const F = focused();
    return spaces().find((S) => S.id === F?.space) ?? spaces().find((S) => S.active) ?? spaces()[0] ?? null;
  }

  // Where the user is: the focused terminal's folder when it is in this space, else the space's first pane.
  Folder(S) {
    const F = focused();
    if (F?.space === S.id && F.cwd) return F.cwd;
    const Tabs = new Set((S.tabs ?? []).map((C) => C.id));
    return panes().find((P) => Tabs.has(P.tab) && P.cwd)?.cwd || S.folder;
  }

  // ClaudeDocs/ of the nearest folder (this one or a parent, not above home) that has one.
  async Resolve(S, Folder) {
    const R = await exec("sh", ["-c", 'd="$1"; while [ -n "$d" ] && [ "$d" != "/" ]; do [ -d "$d/ClaudeDocs" ] && { echo "$d"; exit; }; [ "$d" = "$HOME" ] && break; d=$(dirname "$d"); done; echo "$1"', "find", Folder], { on: S.machine ?? null }).catch(() => null);
    return (R?.stdout ?? "").trim() || Folder;
  }

  Dir() { return `${this.root}/ClaudeDocs`; }

  Refresh(cx) {
    const S = this.Space();
    if (!S?.folder) { this.text = null; this.files = []; return; }
    const Folder = this.Folder(S);
    this.lastFolder = Folder;
    cx.spawn(async (cx) => {
      const Root = await this.Resolve(S, Folder);
      const Context = `${S.machine ?? ""}:${Root}`;
      const Dir = `${Root}/ClaudeDocs`;
      const Changed = this.context !== Context;
      this.root = Root;
      const Ls = await exec("sh", ["-c", 'ls -1 "$1" 2>/dev/null | grep -E "\\.md$"', "ls", Dir], { on: S.machine ?? null }).catch(() => null);
      const Names = (Ls?.stdout ?? "").split("\n").map((X) => X.trim()).filter(Boolean);
      this.files = [...Preferred.filter((P) => Names.includes(P)), ...Names.filter((N) => !Preferred.includes(N) && !/^REPORT_/.test(N)).sort()];
      if (Changed || (this.files.length && !this.files.includes(this.file))) { this.file = this.files.includes("HANDOFF.md") ? "HANDOFF.md" : (this.files[0] ?? "HANDOFF.md"); }
      const Text = await readTextFile(`${Dir}/${this.file}`, { on: S.machine ?? null }).catch(() => null);
      this.text = Text; this.error = null;
      if (Changed) {
        this.context = Context;
        if (!S.machine) cx.spawn(async (cx) => {
          try { while (this.context === Context) { await watchFolder(Dir); if (this.context === Context) this.Refresh(cx); } } catch {}
        });
      }
      cx.notify();
    });
  }

  // The dispatcher of this space: a live terminal labelled siao.role=Dispatcher whose agent entry is in the space.
  Dispatcher(S) {
    const InSpace = new Set(agents().filter((A) => A.space === S.id).map((A) => A.address));
    // Only this space's: a dispatcher elsewhere is someone else's conversation.
    const D = terminals().find((X) => X.state === "live" && X.labels?.["siao.role"] === "Dispatcher" && InSpace.has(X.address));
    return D?.address ?? null;
  }

  // Who gets the answer: this space's dispatcher, else an agent working in this project's folder (the one
  // that wrote the handoff), else the focused agent.
  Target(S) {
    const D = S ? this.Dispatcher(S) : null;
    if (D) return D;
    const Root = this.root;
    const Pane = Root && panes().find((P) => P.terminal && P.cwd && (P.cwd === Root || P.cwd.startsWith(Root + "/")) && agents().some((A) => A.address === P.terminal));
    return Pane?.terminal ?? focused()?.terminal ?? null;
  }

  Send(cx, Text) {
    const To = this.Target(this.Space());
    if (!To) { notify({ title: "筆記", body: "找不到可以接收回答的代理。", level: "error" }); return; }
    cx.spawn(async (cx) => {
      const R = await hc(["send", To, Text]);
      if (R.code !== 0) notify({ title: "筆記", body: `傳送失敗：${R.stderr || R.stdout}`, level: "error" });
      else notify({ title: "已送出回答", body: Text, timeout: 2500 });
      cx.notify();
    });
  }

  // One text box per card, so typing in one never shows up in another. Herdr only lets a mod create
  // InputState in init or an event handler, so a pool is made up front and handed out by card order.
  Box(Item) {
    let I = this.slots.indexOf(Item.id);
    if (I < 0) { I = this.slots.findIndex((X) => !X); if (I < 0) I = this.slots.length - 1; this.slots[I] = Item.id; }
    this.slotItem[I] = Item;
    return this.pool[I];
  }

  // Choice: an option / yes; no: "no: <reason>"; null: whatever is typed (with the choice in front if any).
  Reply(cx, Item, Choice) {
    const Box = this.Box(Item);
    const Note = Box.value().trim();
    let Text;
    if (Choice === "yes") Text = `SIAO ANSWER ${Item.id} yes${Note ? `: ${Note}` : ""}`;
    else if (Choice === "no") Text = `SIAO ANSWER ${Item.id} no: ${Note || "（沒有說明）"}`;
    else if (Choice) Text = `SIAO ANSWER ${Item.id} ${Choice}${Note ? `：${Note}` : ""}`;
    else if (Note) Text = `SIAO ANSWER ${Item.id} ${Note}`;
    else { notify({ title: "筆記", body: "先輸入回答，或點一個選項。", timeout: 2500 }); return; }
    this.Send(cx, Text);
    Box.set_value("");
    this.answered.set(Item.id, Item.text);
    try { localStorage.setItem("answered", JSON.stringify(Object.fromEntries(this.answered))); } catch {}
    cx.notify();
  }

  ToggleFile(cx, Item) {
    const S = this.Space();
    if (!S || !Item.file) return;
    if (this.opened.has(Item.id)) { this.opened.delete(Item.id); cx.notify(); return; }
    this.opened.add(Item.id);
    cx.spawn(async (cx) => {
      const Text = await readTextFile(`${this.root ?? S.folder}/${Item.file}`, { on: S.machine ?? null }).catch(() => null);
      this.attached.set(Item.id, Text ?? `（找不到 ${Item.file}）`);
      cx.notify();
    });
  }

  Button(Id, Text, Primary, T, Action) {
    const Key = this.H.add(Id, "", (Cx) => Action(null, Cx));
    return h_flex().id(Id).h(26).px(10).items_center().rounded(6).cursor_pointer()
      .border_1().border_color(Primary ? T.solid : T.input).bg(Primary ? T.solid : T.raised)
      .text_color(Primary ? T.solid_foreground : T.foreground).text_size(11.5)
      .hover((S) => S.opacity(0.88)).on_click(Action)
      .when(Boolean(Key), (El) => El.gap(5).child(KeyBadge(T, Key))).child(Text);
  }

  Card(Item, Index, T, Mono) {
    const Expanded = this.opened.has(Item.id);
    const Done = false;
    const KindLabel = { plan: "計畫", accept: "驗收", input: "輸入", choice: "決定" }[Item.kind] ?? "決定";
    const Choices = Item.options?.length ? Item.options.map((O) => [O, O, false])
      : Item.kind === "plan" ? [["核准", "yes", true], ["退回", "no", false]]
      : Item.kind === "accept" ? [["通過", "yes", true], ["退回", "no", false]]
      : Item.kind === "input" ? []
      : [["是", "yes", true], ["否", "no", false]];
    const Box = this.Box(Item);
    return v_flex().p(10).gap(8).rounded(8).bg(T.surface).border_1().border_color(Done ? T.border : T.blocked)
      .child(h_flex().gap(6).items_center()
        .child(div().text_size(11).font_semibold().text_color(Done ? T.dim : T.blocked).child(Done ? `${KindLabel} · 已回答` : KindLabel))
        .child(div().text_size(11.5).font_family(Mono).text_color(T.accent).child(Item.id))
        .child(div().flex_1())
        .when(Boolean(Item.file), (El) => El.child(div().id(`sn-open-${Index}`).text_size(11).text_color(T.muted).cursor_pointer()
          .hover((S) => S.text_color(T.foreground)).on_click((_e, cx) => this.ToggleFile(cx, Item))
          .child(Expanded ? "收起" : "展開"))))
      .child(TextView.markdown(`sn-q-${Index}`, Item.text).selectable(true))
      .when(Expanded, (El) => El.child(div().p(8).rounded(6).bg(T.background).border_1().border_color(T.border)
        .child(TextView.markdown(`sn-file-${Index}`, this.attached.get(Item.id) ?? "…").selectable(true))))
      .when(Choices.length > 0, (El) => El.child(h_flex().gap(6).flex_wrap()
        .children(Choices.map(([Label, Value, Primary], K) => this.Button(`sn-c-${Index}-${K}`, Label, Primary, T, (_e, cx) => this.Reply(cx, Item, Value))))))
      .child(h_flex().gap(6).items_center()
        .child(div().id(`sn-box-${Index}`).flex_1().min_w(0).h(30).px(8).flex().items_center().rounded(6)
          .border_1().border_color(T.input).bg(T.background).cursor_text()
          .on_mouse_down("left", () => Box.focus())
          .child(Input.new(Box).h_full().text_size(12).text_color(T.foreground)))
        .child(this.Button(`sn-send-${Index}`, "送出", true, T, (_e, cx) => this.Reply(cx, Item, null))))
      .when(Boolean(Item.assumed), (El) => El.child(div().text_size(10.5).text_color(T.dim).child(`在那之前：${Item.assumed}`)));
  }

  Menu(Name) {
    const S = this.Space();
    const Path = this.root ? `${this.Dir()}/${Name ?? this.file}` : "";
    const Items = [
      ...(Name ? [{ label: `打開 ${Name}`, command: "shared", args: { key: "siao.notes.file", value: Name }, icon: "file-text" }] : []),
      { label: "重新整理", command: "shared", args: { key: "siao.notes.refresh", value: Date.now() }, icon: "check" },
      null,
      ...(Path ? [{ label: "複製路徑", command: "copy", args: { text: Path }, icon: "files" }] : []),
      { label: "到 Files 面板", command: "layout.select", args: { stack: "panel-body", child: "files" }, icon: "files" },
    ];
    openOverlay({ mod: "SiaoMenu", kind: "popup", width: 230, height: Items.filter(Boolean).length * 31 + 21, props: { items: Items } });
  }

  // One State-table row: name, then a dot per stage (written / committed / pushed / deployed) under the
  // header letters; full = done, dim = partial, ring = not yet. "checked how" goes on a second line.
  Pipeline(Row, Index, T) {
    const Dot = (Level) => div().size(8).rounded_full().border(1.5)
      .border_color(Level >= 1 ? T.done : Level > 0 ? T.working : T.dim + "88")
      .bg(Level >= 1 ? T.done : Level > 0 ? T.working + "55" : T.surface + "00");
    return v_flex().id(`sn-row-${Index}`).px(6).py(3).gap(1).rounded(5).hover((S) => S.bg(T.hover))
      .child(h_flex().items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(T.foreground).child(Row.name))
        .child(h_flex().gap(0).flex_none().children(Row.levels.map((L, I) => h_flex().w(30).justify_end().child(Dot(L))))))
      .when(Boolean(Row.how), (El) => El.child(div().text_size(10.5).text_color(T.dim).truncate().child(Row.how)));
  }

  Pill(Name, Label, T) {
    const On = this.file === Name;
    const Key = this.H.add(`file-${Name}`, "", () => { this.file = Name; this.Refresh(this.cx); });
    return div().id(`sn-f-${Name}`).h(24).px(9).rounded(6).flex().items_center().cursor_pointer().text_size(11.5)
      .when(On, (El) => El.bg(T.selected)).text_color(On ? T.foreground : T.muted)
      .hover((S) => S.bg(On ? T.selected : T.hover))
      .on_click((_e, cx) => { this.file = Name; this.Refresh(cx); })
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.Menu(Name); })
      .when(Boolean(Key), (El) => El.gap(5).child(KeyBadge(T, Key)))
      .child(Label);
  }

  // A group chip ("規格 18 ▾", or "規格 · ANSWERHUB MCP ▾" while one of them is open) → list of its files.
  GroupChip(G, Names, T) {
    const [Id, Label, , Strip] = G;
    const Current = Names.includes(this.file) ? this.file : null;
    const Items = Names.map((N) => ({ label: Pretty(N, Strip), command: "shared", args: { key: "siao.notes.file", value: N }, icon: N === this.file ? "check" : "file-text" }));
    const Open = () => openOverlay({ mod: "SiaoMenu", kind: "popup", width: 280, height: Math.min(480, Items.length * 31 + 12), props: { items: Items } });
    const Key = this.H.add(`group-${Id}`, "", Open);
    return h_flex().id(`sn-g-${Id}`).h(24).px(9).gap(5).rounded(6).items_center().cursor_pointer().text_size(11.5)
      .when(Boolean(Current), (El) => El.bg(T.selected)).text_color(Current ? T.foreground : T.muted)
      .hover((S) => S.bg(Current ? T.selected : T.hover))
      .on_click(Open)
      .when(Boolean(Key), (El) => El.child(KeyBadge(T, Key)))
      .child(div().max_w(200).truncate().child(Current ? `${Label} · ${Pretty(Current, Strip)}` : Label))
      .when(!Current, (El) => El.child(div().text_size(10.5).text_color(T.dim).child(`${Names.length}`)))
      .child(svg("mods/workspace-chrome/chevron-down.svg").size(11).text_color(T.dim));
  }

  FileBar(T) {
    const Rest = new Map();
    for (const N of this.files) { const G = GroupOf(N); if (G) { if (!Rest.has(G[0])) Rest.set(G[0], []); Rest.get(G[0]).push(N); } }
    return h_flex().px(8).pb(6).gap(2).flex_wrap().items_center()
      .children(Tabs.filter((N) => this.files.includes(N)).map((N) => this.Pill(N, N.replace(/\.md$/, ""), T)))
      .children(Groups.filter((G) => Rest.has(G[0])).map((G) => this.GroupChip(G, Rest.get(G[0]), T)));
  }

  render(cx) {
    // Menu answers arrive through shared keys (SiaoMenu can't call into this copy directly).
    const Want = shared("siao.notes.file"), Tick = shared("siao.notes.refresh");
    if (Want && Want !== this.lastWant) { this.lastWant = Want; this.file = Want; this.Refresh(cx); }
    if (Tick && Tick !== this.lastTick) { this.lastTick = Tick; this.Refresh(cx); }
    // Moved to another project (focus, cd, space switch): follow it now, not on the next 5 s tick.
    const Here = this.Space();
    if (Here && this.Folder(Here) !== this.lastFolder) this.Refresh(cx);
    const T = theme();
    const Mono = settings().font_family ?? "JetBrains Mono";
    // Quick guide: card buttons, the file pills and the group chips get free keys (hints.js).
    this.cx = cx; this.H.begin();
    const S = this.Space();
    const Body = v_flex().id("sn-body").flex_1().min_h(0).px(10).pb(10).overflow_y_scrollbar();

    if (!S) Body.child(div().p(12).text_size(12).text_color(T.dim).child("沒有選取資料夾。"));
    else if (this.text == null) Body.child(div().p(12).text_size(12).text_color(T.dim)
      .child(this.files.length ? `找不到 ${this.file}。` : "這個專案還沒有 ClaudeDocs/。調度員接第一個任務時會建立（notes skill）。"));
    else {
      const Handoff = this.file === "HANDOFF.md";
      const Items = Handoff ? ParseNeedsHuman(this.text).filter((Q) => this.answered.get(Q.id) !== Q.text) : [];
      const State = Handoff ? ParseState(this.text) : { rows: [], rest: this.text };
      if (Items.length) Body.child(v_flex().gap(6).pt(8).pb(4).children(Items.map((Q, I) => this.Card(Q, I, T, Mono))));
      if (State.rows.length) {
        Body.child(h_flex().pt(10).pb(2).px(6).justify_between()
          .child(div().text_size(11).font_semibold().text_color(T.dim).child("狀態"))
          .child(h_flex().gap(0).children(Stages.map((S, I) => div().w(30).text_size(9.5).text_color(T.dim).text_right().child(StageLabel[S])))));
        Body.children(State.rows.map((R, I) => this.Pipeline(R, I, T)));
      }
      Body.child(div().pt(6).child(TextView.markdown(`sn-doc-${this.file}`, State.rest).selectable(true)));
    }

    const Bar = this.files.length > 0 ? this.FileBar(T) : null;
    this.H.end(cx);
    return v_flex().id("root").size_full().text_color(T.foreground).rounded(10).when(Boolean(this.typing), (El) => El.border(1).border_color(T.accent))
      .on_mouse_down("right", () => this.Menu(null))
      .child(h_flex().h(34).px(10).items_center().justify_between().gap(8)
        .child(h_flex().gap(6).items_center()
          .child(svg("mods/workspace-chrome/file-text.svg").size(13).flex_none().text_color(T.muted))
          .child(div().text_size(12).font_semibold().text_color(T.muted).child("筆記")))
        .child(div().text_size(10.5).font_family(Mono).text_color(T.dim).truncate().child(this.root ? `${this.root.replace(home(), "~")}/ClaudeDocs` : "")))
      .when(Boolean(Bar), (El) => El.child(Bar))
      .child(Body);
  }
}
