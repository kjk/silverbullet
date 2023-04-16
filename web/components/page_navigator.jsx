import { FilterList } from "./filter.jsx";
export function PageNavigator({
  allPages,
  onNavigate,
  completer,
  vimMode,
  darkMode,
  currentPage
}) {
  const options = [];
  for (const pageMeta of allPages) {
    let orderId = -pageMeta.lastModified;
    if (pageMeta.lastOpened) {
      orderId = -pageMeta.lastOpened;
    }
    if (currentPage && currentPage === pageMeta.name) {
      orderId = Infinity;
    }
    options.push({
      ...pageMeta,
      orderId
    });
  }
  let completePrefix = void 0;
  if (currentPage && currentPage.includes("/")) {
    const pieces = currentPage.split("/");
    completePrefix = pieces.slice(0, pieces.length - 1).join("/") + "/";
  } else if (currentPage && currentPage.includes(" ")) {
    completePrefix = currentPage.split(" ")[0] + " ";
  }
  return /* @__PURE__ */ React.createElement(
    FilterList,
    {
      placeholder: "Page",
      label: "Open",
      options,
      vimMode,
      darkMode,
      completer,
      allowNew: true,
      helpText: "Start typing the page name to filter results, press <code>Return</code> to open.",
      newHint: "Create page",
      completePrefix,
      onSelect: (opt) => {
        onNavigate(opt?.name);
      }
    }
  );
}
