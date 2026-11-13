// SiaoBrand: the top of the left column — traffic lights, the sidebar button, SiaoDesk, search.
// The sidebar button sits right after the traffic lights, and when the sidebar is folded away the tab
// strip draws the same button in the same spot (SiaoTabs), so folding and unfolding is one click on one place.
// Folding turns the column into a narrow rail (rail.js): ☰ on top, folders and agents as icon + name.
import { View, div, image, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { Hints, Badge as KeyBadge } from "./hints.js";
import { FoldSidebar, Narrow } from "./rail.js";
import { theme, run, window, shared } from "herdr";

export default class SiaoBrand extends View {
  init() { this.H = new Hints("SiaoBrand"); }

  render() {
    const T = theme(), W = window();
    // On the rail this card only holds the traffic lights; the ☰ that unfolds is at the top of the folders.
    if (Narrow()) return div().size_full();
    const Search = () => run("mod.open", { name: "picker" });
    this.H.begin();
    const FoldKey = this.H.add("fold", "", FoldSidebar), SearchKey = this.H.add("search", "", Search);
    this.H.end();
    const Button = (Id, Icon, Tip, Action, Key) => h_flex().id(Id).h(26).px(5).gap(4).flex_none().items_center().justify_center().rounded(6)
      .text_color(T.muted).tooltip(Tip).hover((S) => S.bg(T.hover).text_color(T.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(Action)
      .when(Boolean(Key), (El) => El.child(KeyBadge(T, Key)))
      .child(svg(Icon).size(15));
    const Lights = W?.platform === "macos" && !W?.fullscreen ? 82 : 6;
    return h_flex().size_full().pl(Lights).pr(8).gap(6).items_center().text_size(13.5)
      .child(Button("fold", "mods/workspace-chrome/sidebar.svg", "收起側欄", FoldSidebar, FoldKey))
      .child(h_flex().flex_1().min_w(0).gap(8).items_center()
        .child(image("frame/welcome/herdr.png").size(20).rounded(5))
        .child(div().font_semibold().text_color(T.foreground).truncate().child("SiaoDesk")))
      .child(Button("search", "mods/workspace-chrome/search.svg", "搜尋", Search, SearchKey));
  }
}
