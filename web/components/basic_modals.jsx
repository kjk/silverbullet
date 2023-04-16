import { useRef, useState } from "../deps.js";
import { MiniEditor } from "./mini_editor.jsx";
export function Prompt({
  message,
  defaultValue,
  vimMode,
  darkMode,
  completer,
  callback
}) {
  const [text, setText] = useState(defaultValue || "");
  const returnEl = /* @__PURE__ */ React.createElement("div", { className: "sb-modal-wrapper" }, /* @__PURE__ */ React.createElement("div", { className: "sb-modal-box" }, /* @__PURE__ */ React.createElement("div", { className: "sb-prompt" }, /* @__PURE__ */ React.createElement("label", null, message), /* @__PURE__ */ React.createElement(
    MiniEditor,
    {
      text: defaultValue || "",
      vimMode,
      vimStartInInsertMode: true,
      focus: true,
      darkMode,
      completer,
      onEnter: (text2) => {
        callback(text2);
        return true;
      },
      onEscape: () => {
        callback();
      },
      onChange: (text2) => {
        setText(text2);
      }
    }
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        callback(text);
      }
    },
    "Ok"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        callback();
      }
    },
    "Cancel"
  ))));
  return returnEl;
}
export function Confirm({
  message,
  callback
}) {
  const okButtonRef = useRef(null);
  setTimeout(() => {
    okButtonRef.current?.focus();
  });
  const returnEl = /* @__PURE__ */ React.createElement("div", { className: "sb-modal-wrapper" }, /* @__PURE__ */ React.createElement("div", { className: "sb-modal-box" }, /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "sb-prompt",
      onKeyDown: (e) => {
        e.stopPropagation();
        e.preventDefault();
        switch (e.key) {
          case "Enter":
            callback(true);
            break;
          case "Escape":
            callback(false);
            break;
        }
      }
    },
    /* @__PURE__ */ React.createElement("label", null, message),
    /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
      "button",
      {
        ref: okButtonRef,
        onClick: (e) => {
          e.stopPropagation();
          e.preventDefault();
          callback(true);
        }
      },
      "Ok"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: (e) => {
          e.stopPropagation();
          e.preventDefault();
          callback(false);
        }
      },
      "Cancel"
    ))
  )));
  return returnEl;
}
