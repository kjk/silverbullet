import {
  useEffect,
  useRef,
  useState
} from "../deps.js";
import fuzzysort from "https://esm.sh/fuzzysort@2.0.1";
import { MiniEditor } from "./mini_editor.jsx";
function magicSorter(a, b) {
  if (a.orderId && b.orderId) {
    return a.orderId < b.orderId ? -1 : 1;
  }
  if (a.orderId) {
    return -1;
  }
  if (b.orderId) {
    return 1;
  }
  return 0;
}
function simpleFilter(pattern, options) {
  const lowerPattern = pattern.toLowerCase();
  return options.filter((option) => {
    return option.name.toLowerCase().includes(lowerPattern);
  });
}
function escapeHtml(unsafe) {
  return unsafe.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function fuzzySorter(pattern, options) {
  return fuzzysort.go(pattern, options, {
    all: true,
    key: "name"
  }).map((result) => ({ ...result.obj, result })).sort(magicSorter);
}
export function FilterList({
  placeholder,
  options,
  label,
  onSelect,
  onKeyPress,
  completer,
  vimMode,
  darkMode,
  allowNew = false,
  helpText = "",
  completePrefix,
  icon: Icon,
  newHint
}) {
  const [text, setText] = useState("");
  const [matchingOptions, setMatchingOptions] = useState(
    fuzzySorter("", options)
  );
  const [selectedOption, setSelectionOption] = useState(0);
  const selectedElementRef = useRef(null);
  function updateFilter(originalPhrase) {
    const foundExactMatch = false;
    const results = fuzzySorter(originalPhrase, options);
    if (allowNew && !foundExactMatch && originalPhrase) {
      results.splice(1, 0, {
        name: originalPhrase,
        hint: newHint
      });
    }
    setMatchingOptions(results);
    setSelectionOption(0);
  }
  useEffect(() => {
    updateFilter(text);
  }, [options]);
  useEffect(() => {
    function closer() {
      console.log("Invoking closer");
      onSelect(void 0);
    }
    document.addEventListener("click", closer);
    return () => {
      document.removeEventListener("click", closer);
    };
  }, []);
  const returnEl = /* @__PURE__ */ React.createElement("div", { className: "sb-modal-wrapper" }, /* @__PURE__ */ React.createElement("div", { className: "sb-modal-box" }, /* @__PURE__ */ React.createElement("div", { className: "sb-header" }, /* @__PURE__ */ React.createElement("label", null, label), /* @__PURE__ */ React.createElement(
    MiniEditor,
    {
      text,
      vimMode,
      vimStartInInsertMode: true,
      focus: true,
      darkMode,
      completer,
      placeholderText: placeholder,
      onEnter: () => {
        onSelect(matchingOptions[selectedOption]);
        return true;
      },
      onEscape: () => {
        onSelect(void 0);
      },
      onChange: (text2) => {
        updateFilter(text2);
      },
      onKeyUp: (view, e) => {
        if (onKeyPress) {
          onKeyPress(e.key, view.state.sliceDoc());
        }
        return false;
      },
      onKeyDown: (view, e) => {
        switch (e.key) {
          case "ArrowUp":
            setSelectionOption(Math.max(0, selectedOption - 1));
            return true;
          case "ArrowDown":
            setSelectionOption(
              Math.min(matchingOptions.length - 1, selectedOption + 1)
            );
            return true;
          case "PageUp":
            setSelectionOption(Math.max(0, selectedOption - 5));
            return true;
          case "PageDown":
            setSelectionOption(Math.max(0, selectedOption + 5));
            return true;
          case "Home":
            setSelectionOption(0);
            return true;
          case "End":
            setSelectionOption(matchingOptions.length - 1);
            return true;
          case " ": {
            const text2 = view.state.sliceDoc();
            if (completePrefix && text2 === "") {
              setText(completePrefix);
              updateFilter(completePrefix);
              return true;
            }
            break;
          }
        }
        return false;
      }
    }
  )), /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "sb-help-text",
      dangerouslySetInnerHTML: { __html: helpText }
    }
  ), /* @__PURE__ */ React.createElement("div", { className: "sb-result-list" }, matchingOptions && matchingOptions.length > 0 ? matchingOptions.map((option, idx) => /* @__PURE__ */ React.createElement(
    "div",
    {
      key: "" + idx,
      ref: selectedOption === idx ? selectedElementRef : void 0,
      className: selectedOption === idx ? "sb-selected-option" : "sb-option",
      onMouseOver: (e) => {
        setSelectionOption(idx);
      },
      onClick: (e) => {
        console.log("Selecting", option);
        e.stopPropagation();
        onSelect(option);
      }
    },
    Icon && /* @__PURE__ */ React.createElement("span", { className: "sb-icon" }, /* @__PURE__ */ React.createElement(Icon, { width: 16, height: 16 })),
    /* @__PURE__ */ React.createElement(
      "span",
      {
        className: "sb-name",
        dangerouslySetInnerHTML: {
          __html: option?.result?.indexes ? fuzzysort.highlight(option.result, "<b>", "</b>") : escapeHtml(option.name)
        }
      }
    ),
    option.hint && /* @__PURE__ */ React.createElement("span", { className: "sb-hint" }, option.hint)
  )) : null)));
  useEffect(() => {
    selectedElementRef.current?.scrollIntoView({
      block: "nearest"
    });
  });
  return returnEl;
}
