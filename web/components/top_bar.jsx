import {
  useEffect,
  useRef
} from "../deps.js";
import { MiniEditor } from "./mini_editor.jsx";
export function TopBar({
  pageName,
  unsavedChanges,
  isLoading,
  notifications,
  onRename,
  actionButtons,
  darkMode,
  vimMode,
  completer,
  lhs,
  rhs
}) {
  const inputRef = useRef(null);
  useEffect(() => {
    function resizeHandler() {
      const editorWidth = parseInt(
        getComputedStyle(document.getElementById("sb-root")).getPropertyValue(
          "--editor-width"
        )
      );
      const currentPageElement = document.getElementById("sb-current-page");
      if (currentPageElement) {
        currentPageElement.style.width = "10px";
        const innerDiv = currentPageElement.parentElement.parentElement;
        currentPageElement.style.width = `${Math.min(editorWidth - 150, innerDiv.clientWidth - 150)}px`;
      }
    }
    globalThis.addEventListener("resize", resizeHandler);
    return () => {
      globalThis.removeEventListener("resize", resizeHandler);
    };
  }, []);
  return /* @__PURE__ */ React.createElement("div", { id: "sb-top" }, lhs, /* @__PURE__ */ React.createElement("div", { className: "main" }, /* @__PURE__ */ React.createElement("div", { className: "inner" }, /* @__PURE__ */ React.createElement("div", { className: "wrapper" }, /* @__PURE__ */ React.createElement(
    "span",
    {
      id: "sb-current-page",
      className: isLoading ? "sb-loading" : unsavedChanges ? "sb-unsaved" : "sb-saved"
    },
    /* @__PURE__ */ React.createElement(
      MiniEditor,
      {
        text: pageName ?? "",
        vimMode,
        darkMode,
        onBlur: (newName) => {
          if (newName !== pageName) {
            return onRename(newName);
          } else {
            return onRename();
          }
        },
        completer,
        onEnter: (newName) => {
          onRename(newName);
        }
      }
    )
  ), notifications.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "sb-notifications" }, notifications.map((notification) => /* @__PURE__ */ React.createElement(
    "div",
    {
      key: notification.id,
      className: `sb-notification-${notification.type}`
    },
    notification.message
  ))), /* @__PURE__ */ React.createElement("div", { className: "sb-actions" }, actionButtons.map((actionButton) => /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: (e) => {
        actionButton.callback();
        e.stopPropagation();
      },
      title: actionButton.description
    },
    /* @__PURE__ */ React.createElement(actionButton.icon, { size: 18 })
  )))))), rhs);
}
