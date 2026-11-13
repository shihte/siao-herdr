// SiaoMenu: the right-click menu every Siao mod opens (styled like the shipped `menu`), and the
// one-line prompt those menus need (rename a session, edit a task id).
//
// Menu:   openOverlay({ mod: "SiaoMenu", kind: "popup", width, height, props: { items } })
//         An item is { label, command, args?, icon?, danger?, hint? }; `null` draws a separator.
// Prompt: an item with command "prompt" and args { title, value?, hint?, hc: [...] | run: { command, args } }
//         opens a dialog showing the current value; Enter runs `hc` (or the Herdr command), "{text}" = what was typed.
// Special commands: "copy" ({ text }) → clipboard; "shared" ({ key, value }) → setShared, which is how a
// menu answers the mod that opened it; "hc" ({ args }) → runs hc; "restart" ({ terminal }) → bin/SiaoRestart
// (exit Claude Code and resume the same session). Anything else goes to run().
// ↑/↓ move, Enter runs, Esc closes.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { run, hc, exec, appHome, props, closeOverlay, openOverlay, theme, setShared, notify, spaces, terminals, panes } from "herdr";

// Chinese versions of Herdr's own context menus, so every right-click in the Siao layout speaks one
// language: props { tab: "space" | "tab" | "global" | "pane", target } like the shipped `menu` mod.
// The layout's root `terminal_menu` points here, so a terminal's right-click lands in "pane".
// Callers size the popup with MenuHeight(items) = rows * 31 + separators * 9 + 12.
function BuiltIn(P) {
  const Tg = P?.target ?? {};
  switch (P?.tab) {
    case "space": {
      const S = spaces().find((X) => X.id === Tg.id);
      return [
        { label: "重新命名", command: "prompt", args: { title: "重新命名資料夾", value: S?.name ?? "", allowEmpty: true, hint: "留空：改回資料夾名稱", run: { command: "space.rename", args: { id: Tg.id, name: "{text}" } } }, icon: "square-pen", hint: "⇧F2" },
        ...(S?.branch ? [
          { label: "新增 worktree", command: "worktree", args: { space: Tg.id, action: "new" }, icon: "git-branch" },
          { label: "開啟 worktree", command: "worktree", args: { space: Tg.id, action: "open" }, icon: "git-branch" },
        ] : []),
        null,
        { label: "關閉資料夾", command: "space.close", args: { id: Tg.id }, icon: "x", danger: true },
      ];
    }
    case "tab":
      return [
        { label: "重新命名", command: "prompt", args: { title: "重新命名分頁", value: Tg.label ?? "", allowEmpty: true, hint: "留空：改回自動顯示對話名稱", run: { command: "tab.rename", args: { id: Tg.id, name: "{text}" } } }, icon: "square-pen", hint: "F2" },
        { label: "新分頁", command: "tab.new", args: { space: Tg.space }, icon: "plus", hint: "⌘T" },
        null,
        { label: "關閉分頁", command: "tab.close", args: { id: Tg.id }, icon: "x", danger: true, hint: "⌘W" },
      ];
    case "pane": {
      const All = terminals();
      const Term = All.find((X) => X.address === Tg.terminal);
      const Parent = Term?.parent && All.find((X) => X.address === Term.parent);
      const ToProgram = Term?.labels?.["herdr.right-click"] === "program";
      const InTab = panes().some((X) => X.pane === Tg.pane);
      return [
        ...(InTab ? [
          { label: "向右分割", command: "pane.split", args: { direction: "right", pane: Tg.pane }, icon: "panel-right", hint: "⌘D" },
          { label: "向下分割", command: "pane.split", args: { direction: "down", pane: Tg.pane }, icon: "panel-right", hint: "⇧⌘D" },
          { label: "放大／還原", command: "pane.zoom", args: { pane: Tg.pane }, icon: "square", hint: "⇧⌘↩" },
        ] : []),
        ...(Term ? [ToProgram
          ? { label: "右鍵改回顯示這個選單", command: "terminal.right_click", args: { terminal: Term.address, to: "menu" }, icon: "terminal" }
          : { label: "右鍵交給程式", command: "terminal.right_click", args: { terminal: Term.address, to: "program" }, icon: "terminal" }] : []),
        ...(Parent ? [{ label: `送回 ${Parent.name || Parent.address}`, command: "terminal.park", args: { terminal: Term.address }, icon: "chevron-left" }] : []),
        ...(InTab ? [null, { label: "關閉窗格", command: "pane.close", args: { pane: Tg.pane }, icon: "x", danger: true, hint: "⇧⌘W" }] : []),
      ];
    }
    case "global":
      return [
        { label: "新增資料夾", command: "space.new", args: {}, icon: "folder-plus", hint: "⌘N" },
        { label: "快捷鍵說明", command: "app.help", args: {}, icon: "terminal", hint: "⌘/" },
        null,
        { label: "設定", command: "app.settings", args: {}, icon: "settings", hint: "⌘," },
      ];
    default:
      return null;
  }
}

async function Hc(Args, Title) {
  const R = await hc(Args);
  if (R.code !== 0) notify({ title: Title, body: (R.stderr || R.stdout || `exit ${R.code}`).trim(), level: "error", timeout: 6000 });
  return R.code === 0;
}

export default class SiaoMenu extends View {
  init(_props, cx) {
    this.at = 0;
    this.handle = cx.focus_handle();
    const P = props()?.prompt;
    if (P) {
      this.text = P.value ?? "";
      this.input = InputState.new({ value: this.text });
      if (this.text) this.input.set_selected_range({ start: 0, end: this.text.length });
      this.input.on("change", (_e, cx) => { this.text = this.input.value(); cx.notify(); });
      this.input.on("submit", (_e, cx) => this.Submit(cx));
      this.input.focus();
      cx.timer.after(300, () => this.input.focus());
    } else this.handle.focus();
  }

  Items() { return (props()?.items ?? BuiltIn(props()) ?? []).filter((It, I, All) => It || (I > 0 && All[I - 1])); }
  Real() { return this.Items().filter(Boolean); }

  Choose(It, cx) {
    if (!It) return;
    closeOverlay(props()?.overlay);
    const A = It.args ?? {};
    if (It.command === "copy") {
      cx.write_to_clipboard(String(A.text ?? ""));
      notify({ title: "已複製", body: String(A.text ?? ""), timeout: 2500 });
    } else if (It.command === "shared") setShared(A.key, A.value);
    else if (It.command === "hc") cx.spawn(async () => { if (await Hc(A.args, It.label) && A.done) notify({ title: A.done, timeout: 2500 }); });
    else if (It.command === "worktree") openOverlay({ mod: "worktree", kind: "dialog", ...(A.action === "open" ? { width: 560, height: 480 } : { width: 440, height: 260 }), props: A });
    else if (It.command === "prompt") openOverlay({ mod: "SiaoMenu", kind: "dialog", width: 420, height: A.hint ? 176 : 150, props: { prompt: A } });
    else if (It.command === "restart") cx.spawn(async () => {
      notify({ title: "重新整理中…", body: A.terminal, timeout: 2000 });
      const R = await exec(`${appHome()}/bin/SiaoRestart`, [A.terminal], { timeout: 30000 }).catch((E) => ({ code: 1, stderr: String(E) }));
      notify(R.code === 0 ? { title: "已重新整理", body: R.stdout.trim(), timeout: 3000 } : { title: "重新整理失敗", body: (R.stderr || R.stdout || "").trim(), level: "error", timeout: 6000 });
    });
    else run(It.command, A);
  }

  Submit(cx) {
    const P = props().prompt, Text = this.text.trim();
    closeOverlay(props().overlay);
    if (!Text && !P.allowEmpty) return;
    // run: a Herdr command whose string args get "{text}"; hc: an hc command line.
    if (P.run) {
      const Fill = (V) => typeof V === "string" ? V.replaceAll("{text}", Text) : V;
      run(P.run.command, Object.fromEntries(Object.entries(P.run.args ?? {}).map(([K, V]) => [K, Fill(V)])));
      return;
    }
    const Args = P.hc.map((X) => X.replaceAll("{text}", Text));
    cx.spawn(async () => { if (await Hc(Args, P.title) && P.done) notify({ title: P.done, body: Text, timeout: 2500 }); });
  }

  RenderPrompt(T, P) {
    const Button = (Id, Label, Primary, Action) => div().id(Id).h(30).px(14).flex().items_center().rounded(7).cursor_pointer()
      .text_size(12.5).bg(Primary ? T.accent : T.raised).text_color(Primary ? T.background : T.foreground)
      .hover((S) => S.opacity(0.88)).on_click(Action).child(Label);
    return v_flex().id("siao-prompt").size_full().p(16).gap(10).bg(T.popover).text_color(T.foreground)
      .on_key_down((E, cx) => { if (E.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); } })
      .child(div().text_size(15).font_semibold().child(P.title ?? ""))
      .when(Boolean(P.hint), (El) => El.child(div().text_size(11.5).text_color(T.dim).child(P.hint)))
      .child(div().h(34).px(10).flex().items_center().rounded(7).border(1).border_color(T.accent).bg(T.background)
        .child(Input.new(this.input).h_full().text_size(13).text_color(T.foreground)))
      .child(h_flex().justify_end().gap(8)
        .child(Button("sp-cancel", "取消", false, () => closeOverlay(props().overlay)))
        .child(Button("sp-ok", "確定", true, (_e, cx) => this.Submit(cx))));
  }

  render(cx) {
    const T = theme();
    const P = props()?.prompt;
    if (P) return this.RenderPrompt(T, P);
    const Real = this.Real();
    let N = -1;
    return v_flex().id("siao-menu").track_focus(this.handle).w_full().min_h(0).p(5).bg(T.popover).text_size(12.8)
      .on_key_down((E, cx) => {
        if (!Real.length) return;
        if (E.key === "down") this.at = (this.at + 1) % Real.length;
        else if (E.key === "up") this.at = (this.at + Real.length - 1) % Real.length;
        else if (E.key === "enter") this.Choose(Real[this.at], cx);
        else if (E.key === "escape") closeOverlay(props().overlay);
        else return;
        cx.notify();
      })
      .children(this.Items().map((It, I) => {
        if (!It) return div().mx(7).my(4).h(1).bg(T.border);
        const K = ++N;
        return h_flex().id(`smi-${I}`).h(31).px(8).gap(9).rounded(7).items_center()
          .text_color(It.danger ? T.blocked : T.foreground)
          .when(K === this.at, (El) => El.bg(T.selected))
          .hover((S) => S.bg(T.hover))
          .on_click((_e, cx) => this.Choose(It, cx))
          .child(svg(`mods/workspace-chrome/${It.icon ?? "terminal"}.svg`).size(14).flex_none().text_color(It.danger ? T.blocked : T.muted))
          .child(div().flex_1().truncate().child(It.label))
          .when(Boolean(It.hint), (El) => El.child(div().text_size(11).text_color(T.dim).child(It.hint)));
      }));
  }
}
