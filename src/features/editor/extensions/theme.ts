import { EditorView } from "@codemirror/view";

export const customTheme = EditorView.theme({
  "&": {
    outline: "none !important",
    height: "100%",
    backgroundColor: "var(--background) !important",
  },
  ".cm-gutters": {
    backgroundColor: "var(--background) !important",
    borderRight: "none",
  },
  ".cm-content": {
    fontFamily: "var(--font-plex-mono), monospace",
    fontSize: "14px",
  },
  ".cm-scroller": {
    scrollbarWidth: "thin",
    scrollbarColor: "#3f3f46 transparent",
  },
});
