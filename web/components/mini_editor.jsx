import {
  autocompletion,
  closeBracketsKeymap,
  completionKeymap,
  EditorState,
  EditorView,
  highlightSpecialChars,
  history,
  historyKeymap,
  keymap,
  placeholder,
  standardKeymap,
  useEffect,
  useRef,
  ViewPlugin,
  Vim,
  vim,
  vimGetCm
} from "../deps.js";
export function MiniEditor({
  text,
  placeholderText,
  vimMode,
  darkMode,
  vimStartInInsertMode,
  onBlur,
  onEscape,
  onKeyUp,
  onKeyDown,
  onEnter,
  onChange,
  focus,
  completer
}) {
  const editorDiv = useRef(null);
  const editorViewRef = useRef();
  const vimModeRef = useRef("normal");
  const callbacksRef = useRef();
  useEffect(() => {
    if (editorDiv.current) {
      console.log("Creating editor view");
      const editorView = new EditorView({
        state: buildEditorState(),
        parent: editorDiv.current
      });
      editorViewRef.current = editorView;
      if (focus) {
        editorView.focus();
      }
      return () => {
        if (editorViewRef.current) {
          editorViewRef.current.destroy();
        }
      };
    }
  }, [editorDiv]);
  useEffect(() => {
    callbacksRef.current = {
      onBlur,
      onEnter,
      onEscape,
      onKeyUp,
      onKeyDown,
      onChange
    };
  });
  useEffect(() => {
    if (editorViewRef.current) {
      editorViewRef.current.setState(buildEditorState());
      editorViewRef.current.dispatch({
        selection: { anchor: text.length }
      });
    }
  }, [text, vimMode]);
  useEffect(() => {
    function onKeyDown2(e) {
      const parent = e.target.parentElement.parentElement;
      if (parent !== editorViewRef.current?.dom) {
        return;
      }
      let stopPropagation = false;
      if (callbacksRef.current.onKeyDown) {
        stopPropagation = callbacksRef.current.onKeyDown(
          editorViewRef.current,
          e
        );
      }
      if (stopPropagation) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    document.addEventListener("keydown", onKeyDown2);
    return () => {
      document.removeEventListener("keydown", onKeyDown2);
    };
  }, []);
  let onBlurred = false, onEntered = false;
  return /* @__PURE__ */ React.createElement("div", { class: "sb-mini-editor", ref: editorDiv });
  function buildEditorState() {
    if (vimMode) {
      setTimeout(() => {
        const cm = vimGetCm(editorViewRef.current);
        cm.on("vim-mode-change", ({ mode }) => {
          vimModeRef.current = mode;
        });
        if (vimStartInInsertMode) {
          Vim.handleKey(cm, "i");
        }
      });
    }
    return EditorState.create({
      doc: text,
      extensions: [
        EditorView.theme({}, { dark: darkMode }),
        [...vimMode ? [vim()] : []],
        autocompletion({
          override: completer ? [completer] : []
        }),
        highlightSpecialChars(),
        history(),
        [...placeholderText ? [placeholder(placeholderText)] : []],
        keymap.of([
          {
            key: "Enter",
            run: (view) => {
              onEnter2(view);
              return true;
            }
          },
          {
            key: "Escape",
            run: (view) => {
              callbacksRef.current.onEscape && callbacksRef.current.onEscape(view.state.sliceDoc());
              return true;
            }
          },
          ...closeBracketsKeymap,
          ...standardKeymap,
          ...historyKeymap,
          ...completionKeymap
        ]),
        EditorView.domEventHandlers({
          click: (e) => {
            e.stopPropagation();
          },
          keyup: (event, view) => {
            if (event.key === "Escape") {
              return false;
            }
            if (event.key === "Enter") {
              if (vimMode && vimModeRef.current === "normal") {
                onEnter2(view);
                return true;
              }
              return false;
            }
            if (callbacksRef.current.onKeyUp) {
              return callbacksRef.current.onKeyUp(view, event);
            }
            return false;
          },
          blur: (_e, view) => {
            onBlur2(view);
          }
        }),
        ViewPlugin.fromClass(
          class {
            update(update) {
              if (update.docChanged) {
                callbacksRef.current.onChange && callbacksRef.current.onChange(update.state.sliceDoc());
              }
            }
          }
        )
      ]
    });
    function onEnter2(view) {
      if (onEntered) {
        return;
      }
      onEntered = true;
      callbacksRef.current.onEnter(view.state.sliceDoc());
      setTimeout(() => {
        onEntered = false;
      }, 500);
    }
    function onBlur2(view) {
      if (onBlurred || onEntered) {
        return;
      }
      onBlurred = true;
      if (callbacksRef.current.onBlur) {
        Promise.resolve(callbacksRef.current.onBlur(view.state.sliceDoc())).catch((e) => {
          view.setState(buildEditorState());
        });
      }
      setTimeout(() => {
        onBlurred = false;
      }, 500);
    }
  }
}
