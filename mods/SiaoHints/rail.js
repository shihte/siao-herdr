// The left column folded into a narrow rail (like Google Maps' side rail): a ☰ on top, then one icon
// per folder and agent, one column, no text (names are tooltips). Shared by
// SiaoBrand / SiaoSpaces / SiaoBoard / SiaoTabs (Install.sh copies this file into each).
import { div, svg } from "gpui-kit";
import { run, layout, shared, setShared } from "herdr";

export const RailWidth = 84;

function Find(Node, Id) {
  if (Node?.id === Id) return Node;
  for (const C of Node?.children ?? []) { const F = Find(C, Id); if (F) return F; }
  return null;
}

export const Narrow = () => (Find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

export function FoldSidebar() {
  const W = Find(layout(), "sidebar")?.size?.px;
  if (W && W >= 160) setShared("sidebar.width", W);
  setShared("sidebar.collapsed", true);
  run("layout.show", { id: "sidebar" });
  run("layout.resize", { id: "sidebar", px: RailWidth });
  run("layout.hide", { id: "sidebar-footer" });
}

export function UnfoldSidebar() {
  setShared("sidebar.collapsed", false);
  run("layout.show", { id: "sidebar" });
  run("layout.resize", { id: "sidebar", px: shared("sidebar.width") ?? 300 });
  run("layout.show", { id: "sidebar-footer" });
}

/// One rail entry: a single icon, nothing beside it and no text (the name is the tooltip). The current
/// one sits on a filled tile; a status dot and a quick-guide key sit on the tile's corners.
export function RailItem(T, Id, Icon, Label, On, Action, Badge, OnRight, Dot) {
  return div().id(Id).w_full().h(52).flex().items_center().justify_center().cursor_pointer()
    .tooltip(Label)
    .on_click(Action)
    .when(Boolean(OnRight), (El) => El.on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); OnRight(); }))
    .child(div().relative().size(46).flex().items_center().justify_center().rounded(12)
      .when(On, (El) => El.bg(T.selected)).hover((S) => S.bg(On ? T.selected : T.hover))
      .child(Icon)
      .when(Boolean(Dot), (El) => El.child(div().absolute().right(2).bottom(2).size(9).rounded_full().border(2).border_color(T.background).bg(Dot)))
      .when(Boolean(Badge), (El) => El.child(div().absolute().left(-6).top(-4).child(Badge))));
}

/// The ☰ at the top of the rail: back to the full column.
export function RailMenu(T, Badge) {
  return div().id("rail-menu").w_full().h(50).flex().items_center().justify_center().cursor_pointer()
    .tooltip("展開側欄").on_click(() => UnfoldSidebar())
    .child(div().relative().size(46).flex().items_center().justify_center().rounded(12)
      .text_color(T.muted).hover((S) => S.bg(T.hover).text_color(T.foreground))
      .child(svg("mods/SiaoSpaces/menu.svg").size(22))
      .when(Boolean(Badge), (El) => El.child(div().absolute().left(-6).top(-4).child(Badge))));
}

export const RailDivider = (T) => div().mx(16).my(4).h(1).bg(T.border);
