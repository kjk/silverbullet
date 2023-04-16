import {
  autocompletion,
  cLanguage,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  cppLanguage,
  csharpLanguage,
  dartLanguage,
  drawSelection,
  dropCursor,
  EditorState,
  EditorView,
  highlightSpecialChars,
  history,
  historyKeymap,
  indentOnInput,
  indentWithTab,
  javaLanguage,
  javascriptLanguage,
  jsonLanguage,
  keymap,
  kotlinLanguage,
  LanguageDescription,
  LanguageSupport,
  markdown,
  objectiveCLanguage,
  objectiveCppLanguage,
  postgresqlLanguage,
  protobufLanguage,
  pythonLanguage,
  runScopeHandlers,
  rustLanguage,
  scalaLanguage,
  searchKeymap,
  shellLanguage,
  sqlLanguage,
  standardKeymap,
  StreamLanguage,
  syntaxHighlighting,
  syntaxTree,
  tomlLanguage,
  typescriptLanguage,
  ViewPlugin,
  xmlLanguage,
  yamlLanguage
} from "../common/deps.js";
import {
  loadMarkdownExtensions
} from "../common/markdown_parser/markdown_ext.js";
import buildMarkdown from "../common/markdown_parser/parser.js";
import { markdownSyscalls } from "../common/syscalls/markdown.js";
import { isMacLike, safeRun } from "../common/util.js";
import { createSandbox } from "../plugos/environments/webworker_sandbox.js";
import assetSyscalls from "../plugos/syscalls/asset.js";
import { eventSyscalls } from "../plugos/syscalls/event.js";
import sandboxSyscalls from "../plugos/syscalls/sandbox.js";
import { cleanModePlugins } from "./cm_plugins/clean.js";
import { CollabState } from "./cm_plugins/collab.js";
import {
  attachmentExtension,
  pasteLinkExtension
} from "./cm_plugins/editor_paste.js";
import { inlineImagesPlugin } from "./cm_plugins/inline_image.js";
import { lineWrapper } from "./cm_plugins/line_wrapper.js";
import { smartQuoteKeymap } from "./cm_plugins/smart_quotes.js";
import { Confirm, Prompt } from "./components/basic_modals.jsx";
import { CommandPalette } from "./components/command_palette.jsx";
import { FilterList } from "./components/filter.jsx";
import { PageNavigator } from "./components/page_navigator.jsx";
import { Panel } from "./components/panel.jsx";
import { TopBar } from "./components/top_bar.jsx";
import {
  BookIcon,
  HomeIcon,
  preactRender,
  TerminalIcon,
  useEffect,
  useReducer,
  vim,
  yUndoManagerKeymap
} from "./deps.js";
import { CommandHook } from "./hooks/command.js";
import { SlashCommandHook } from "./hooks/slash_command.js";
import { PathPageNavigator } from "./navigator.js";
import reducer from "./reducer.js";
import customMarkdownStyle from "./style.js";
import { collabSyscalls } from "./syscalls/collab.js";
import { editorSyscalls } from "./syscalls/editor.js";
import { spaceSyscalls } from "./syscalls/space.js";
import { systemSyscalls } from "./syscalls/system.js";
import { initialViewState } from "./types.js";
import { CodeWidgetHook } from "./hooks/code_widget.js";
import { throttle } from "../common/async_util.js";
import { readonlyMode } from "./cm_plugins/readonly.js";
const frontMatterRegex = /^---\n(.*?)---\n/ms;
class PageState {
  constructor(scrollTop, selection) {
    this.scrollTop = scrollTop;
    this.selection = selection;
  }
}
const saveInterval = 1e3;
export class Editor {
  constructor(space, system, eventHook, parent, urlPrefix, builtinSettings) {
    this.builtinSettings = builtinSettings;
    this.openPages = /* @__PURE__ */ new Map();
    this.debouncedUpdateEvent = throttle(() => {
      this.eventHook.dispatchEvent("editor:updated").catch((e) => console.error("Error dispatching editor:updated event", e));
    }, 1e3);
    this.mdExtensions = [];
    this.space = space;
    this.system = system;
    this.urlPrefix = urlPrefix;
    this.viewState = initialViewState;
    this.viewDispatch = () => {
    };
    this.indexPage = builtinSettings.indexPage;
    this.eventHook = eventHook;
    this.codeWidgetHook = new CodeWidgetHook();
    this.system.addHook(this.codeWidgetHook);
    this.commandHook = new CommandHook();
    this.commandHook.on({
      commandsUpdated: (commandMap) => {
        this.viewDispatch({
          type: "update-commands",
          commands: commandMap
        });
      }
    });
    this.system.addHook(this.commandHook);
    this.slashCommandHook = new SlashCommandHook(this);
    this.system.addHook(this.slashCommandHook);
    this.render(parent);
    this.editorView = new EditorView({
      state: this.createEditorState("", "", false),
      parent: document.getElementById("sb-editor")
    });
    this.pageNavigator = new PathPageNavigator(
      builtinSettings.indexPage,
      urlPrefix
    );
    this.system.registerSyscalls(
      [],
      eventSyscalls(this.eventHook),
      editorSyscalls(this),
      spaceSyscalls(this),
      systemSyscalls(this, this.system),
      markdownSyscalls(buildMarkdown(this.mdExtensions)),
      sandboxSyscalls(this.system),
      assetSyscalls(this.system),
      collabSyscalls(this)
    );
    globalThis.addEventListener("keydown", (ev) => {
      if (!this.editorView?.hasFocus) {
        if (ev.target.closest(".cm-editor")) {
          return;
        }
        if (runScopeHandlers(this.editorView, ev, "editor")) {
          ev.preventDefault();
        }
      }
    });
    globalThis.addEventListener("touchstart", (ev) => {
      if (ev.touches.length > 2) {
        ev.stopPropagation();
        ev.preventDefault();
        this.viewDispatch({ type: "show-palette", context: this.getContext() });
      }
    });
  }
  get currentPage() {
    return this.viewState.currentPage;
  }
  async init() {
    this.focus();
    const globalModules = await (await fetch(`${this.urlPrefix}/global.plug.json`)).json();
    this.system.on({
      sandboxInitialized: async (sandbox) => {
        for (const [modName, code] of Object.entries(
          globalModules.dependencies
        )) {
          await sandbox.loadDependency(modName, code);
        }
      }
    });
    this.space.on({
      pageChanged: (meta) => {
        if (this.currentPage === meta.name) {
          console.log("Page changed on disk, reloading");
          this.flashNotification("Page changed on disk, reloading");
          this.reloadPage();
        }
      },
      pageListUpdated: (pages) => {
        this.viewDispatch({
          type: "pages-listed",
          pages
        });
      }
    });
    await this.reloadPlugs();
    this.pageNavigator.subscribe(async (pageName, pos) => {
      console.log("Now navigating to", pageName);
      if (!this.editorView) {
        return;
      }
      const stateRestored = await this.loadPage(pageName);
      if (pos) {
        if (typeof pos === "string") {
          console.log("Navigating to anchor", pos);
          const posLookup = await this.system.localSyscall(
            "core",
            "index.get",
            [
              pageName,
              `a:${pageName}:${pos}`
            ]
          );
          if (!posLookup) {
            return this.flashNotification(
              `Could not find anchor @${pos}`,
              "error"
            );
          } else {
            pos = +posLookup;
          }
        }
        this.editorView.dispatch({
          selection: { anchor: pos },
          scrollIntoView: true
        });
      } else if (!stateRestored) {
        const pageText = this.editorView.state.sliceDoc();
        let initialCursorPos = 0;
        const match = frontMatterRegex.exec(pageText);
        if (match) {
          initialCursorPos = match[0].length;
        }
        this.editorView.scrollDOM.scrollTop = 0;
        this.editorView.dispatch({
          selection: { anchor: initialCursorPos },
          scrollIntoView: true
        });
      }
    });
    this.loadCustomStyles().catch(console.error);
    await this.dispatchAppEvent("editor:init");
  }
  save(immediate = false) {
    return new Promise((resolve, reject) => {
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
      }
      this.saveTimeout = setTimeout(
        () => {
          if (this.currentPage) {
            if (!this.viewState.unsavedChanges || this.viewState.uiOptions.forcedROMode) {
              return resolve();
            }
            console.log("Saving page", this.currentPage);
            this.space.writePage(
              this.currentPage,
              this.editorView.state.sliceDoc(0),
              true
            ).then(() => {
              this.viewDispatch({ type: "page-saved" });
              resolve();
            }).catch((e) => {
              this.flashNotification(
                "Could not save page, retrying again in 10 seconds",
                "error"
              );
              this.saveTimeout = setTimeout(this.save.bind(this), 1e4);
              reject(e);
            });
          } else {
            resolve();
          }
        },
        immediate ? 0 : saveInterval
      );
    });
  }
  flashNotification(message, type = "info") {
    const id = Math.floor(Math.random() * 1e6);
    this.viewDispatch({
      type: "show-notification",
      notification: {
        id,
        type,
        message,
        date: new Date()
      }
    });
    setTimeout(
      () => {
        this.viewDispatch({
          type: "dismiss-notification",
          id
        });
      },
      type === "info" ? 2e3 : 5e3
    );
  }
  filterBox(label, options, helpText = "", placeHolder = "") {
    return new Promise((resolve) => {
      this.viewDispatch({
        type: "show-filterbox",
        label,
        options,
        placeHolder,
        helpText,
        onSelect: (option) => {
          this.viewDispatch({ type: "hide-filterbox" });
          this.focus();
          resolve(option);
        }
      });
    });
  }
  prompt(message, defaultValue = "") {
    return new Promise((resolve) => {
      this.viewDispatch({
        type: "show-prompt",
        message,
        defaultValue,
        callback: (value) => {
          this.viewDispatch({ type: "hide-prompt" });
          this.focus();
          resolve(value);
        }
      });
    });
  }
  confirm(message) {
    return new Promise((resolve) => {
      this.viewDispatch({
        type: "show-confirm",
        message,
        callback: (value) => {
          this.viewDispatch({ type: "hide-confirm" });
          this.focus();
          resolve(value);
        }
      });
    });
  }
  dispatchAppEvent(name, data) {
    return this.eventHook.dispatchEvent(name, data);
  }
  createEditorState(pageName, text, readOnly) {
    const commandKeyBindings = [];
    for (const def of this.commandHook.editorCommands.values()) {
      if (def.command.key) {
        commandKeyBindings.push({
          key: def.command.key,
          mac: def.command.mac,
          run: () => {
            if (def.command.contexts) {
              const context = this.getContext();
              if (!context || !def.command.contexts.includes(context)) {
                return false;
              }
            }
            Promise.resolve().then(def.run).catch((e) => {
              console.error(e);
              this.flashNotification(
                `Error running command: ${e.message}`,
                "error"
              );
            }).then(() => {
              editor.focus();
            });
            return true;
          }
        });
      }
    }
    const editor = this;
    let touchCount = 0;
    return EditorState.create({
      doc: this.collabState ? this.collabState.ytext.toString() : text,
      extensions: [
        EditorView.theme({}, { dark: this.viewState.uiOptions.darkMode }),
        [...editor.viewState.uiOptions.vimMode ? [vim({ status: true })] : []],
        [
          ...readOnly || editor.viewState.uiOptions.forcedROMode ? [readonlyMode()] : []
        ],
        markdown({
          base: buildMarkdown(this.mdExtensions),
          codeLanguages: [
            LanguageDescription.of({
              name: "yaml",
              alias: ["meta", "data", "embed"],
              support: new LanguageSupport(StreamLanguage.define(yamlLanguage))
            }),
            LanguageDescription.of({
              name: "javascript",
              alias: ["js"],
              support: new LanguageSupport(javascriptLanguage)
            }),
            LanguageDescription.of({
              name: "typescript",
              alias: ["ts"],
              support: new LanguageSupport(typescriptLanguage)
            }),
            LanguageDescription.of({
              name: "sql",
              alias: ["sql"],
              support: new LanguageSupport(StreamLanguage.define(sqlLanguage))
            }),
            LanguageDescription.of({
              name: "postgresql",
              alias: ["pgsql", "postgres"],
              support: new LanguageSupport(
                StreamLanguage.define(postgresqlLanguage)
              )
            }),
            LanguageDescription.of({
              name: "rust",
              alias: ["rs"],
              support: new LanguageSupport(StreamLanguage.define(rustLanguage))
            }),
            LanguageDescription.of({
              name: "css",
              support: new LanguageSupport(StreamLanguage.define(sqlLanguage))
            }),
            LanguageDescription.of({
              name: "python",
              alias: ["py"],
              support: new LanguageSupport(
                StreamLanguage.define(pythonLanguage)
              )
            }),
            LanguageDescription.of({
              name: "protobuf",
              alias: ["proto"],
              support: new LanguageSupport(
                StreamLanguage.define(protobufLanguage)
              )
            }),
            LanguageDescription.of({
              name: "shell",
              alias: ["sh", "bash", "zsh", "fish"],
              support: new LanguageSupport(
                StreamLanguage.define(shellLanguage)
              )
            }),
            LanguageDescription.of({
              name: "swift",
              support: new LanguageSupport(StreamLanguage.define(rustLanguage))
            }),
            LanguageDescription.of({
              name: "toml",
              support: new LanguageSupport(StreamLanguage.define(tomlLanguage))
            }),
            LanguageDescription.of({
              name: "json",
              support: new LanguageSupport(StreamLanguage.define(jsonLanguage))
            }),
            LanguageDescription.of({
              name: "xml",
              support: new LanguageSupport(StreamLanguage.define(xmlLanguage))
            }),
            LanguageDescription.of({
              name: "c",
              support: new LanguageSupport(StreamLanguage.define(cLanguage))
            }),
            LanguageDescription.of({
              name: "cpp",
              alias: ["c++", "cxx"],
              support: new LanguageSupport(StreamLanguage.define(cppLanguage))
            }),
            LanguageDescription.of({
              name: "java",
              support: new LanguageSupport(StreamLanguage.define(javaLanguage))
            }),
            LanguageDescription.of({
              name: "csharp",
              alias: ["c#", "cs"],
              support: new LanguageSupport(
                StreamLanguage.define(csharpLanguage)
              )
            }),
            LanguageDescription.of({
              name: "scala",
              alias: ["sc"],
              support: new LanguageSupport(
                StreamLanguage.define(scalaLanguage)
              )
            }),
            LanguageDescription.of({
              name: "kotlin",
              alias: ["kt", "kts"],
              support: new LanguageSupport(
                StreamLanguage.define(kotlinLanguage)
              )
            }),
            LanguageDescription.of({
              name: "objc",
              alias: ["objective-c", "objectivec"],
              support: new LanguageSupport(
                StreamLanguage.define(objectiveCLanguage)
              )
            }),
            LanguageDescription.of({
              name: "objcpp",
              alias: [
                "objc++",
                "objective-cpp",
                "objectivecpp",
                "objective-c++",
                "objectivec++"
              ],
              support: new LanguageSupport(
                StreamLanguage.define(objectiveCppLanguage)
              )
            }),
            LanguageDescription.of({
              name: "dart",
              support: new LanguageSupport(StreamLanguage.define(dartLanguage))
            })
          ],
          addKeymap: true
        }),
        syntaxHighlighting(customMarkdownStyle(this.mdExtensions)),
        autocompletion({
          override: [
            this.editorComplete.bind(this),
            this.slashCommandHook.slashCommandCompleter.bind(
              this.slashCommandHook
            )
          ]
        }),
        inlineImagesPlugin(this.space),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        indentOnInput(),
        ...cleanModePlugins(this),
        EditorView.lineWrapping,
        lineWrapper([
          { selector: "ATXHeading1", class: "sb-line-h1" },
          { selector: "ATXHeading2", class: "sb-line-h2" },
          { selector: "ATXHeading3", class: "sb-line-h3" },
          { selector: "ATXHeading4", class: "sb-line-h4" },
          { selector: "ListItem", class: "sb-line-li", nesting: true },
          { selector: "Blockquote", class: "sb-line-blockquote" },
          { selector: "Task", class: "sb-line-task" },
          { selector: "CodeBlock", class: "sb-line-code" },
          { selector: "FencedCode", class: "sb-line-fenced-code" },
          { selector: "Comment", class: "sb-line-comment" },
          { selector: "BulletList", class: "sb-line-ul" },
          { selector: "OrderedList", class: "sb-line-ol" },
          { selector: "TableHeader", class: "sb-line-tbl-header" },
          { selector: "FrontMatter", class: "sb-frontmatter" }
        ]),
        keymap.of([
          ...smartQuoteKeymap,
          ...closeBracketsKeymap,
          ...standardKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...completionKeymap,
          ...this.collabState ? yUndoManagerKeymap : [],
          indentWithTab,
          ...commandKeyBindings,
          {
            key: "Ctrl-k",
            mac: "Cmd-k",
            run: () => {
              this.viewDispatch({ type: "start-navigate" });
              this.space.updatePageList();
              return true;
            }
          },
          {
            key: "Ctrl-/",
            mac: "Cmd-/",
            run: () => {
              this.viewDispatch({
                type: "show-palette",
                context: this.getContext()
              });
              return true;
            }
          }
        ]),
        EditorView.domEventHandlers({
          touchmove: (event, view) => {
            touchCount++;
          },
          touchend: (event, view) => {
            if (touchCount === 0) {
              safeRun(async () => {
                const touch = event.changedTouches.item(0);
                const clickEvent = {
                  page: pageName,
                  ctrlKey: event.ctrlKey,
                  metaKey: event.metaKey,
                  altKey: event.altKey,
                  pos: view.posAtCoords({
                    x: touch.clientX,
                    y: touch.clientY
                  })
                };
                await this.dispatchAppEvent("page:click", clickEvent);
              });
            }
            touchCount = 0;
          },
          mousedown: (event, view) => {
            if (!event.altKey && event.target instanceof Element) {
              const parentA = event.target.closest("a");
              if (parentA) {
                event.stopPropagation();
                event.preventDefault();
                const clickEvent = {
                  page: pageName,
                  ctrlKey: event.ctrlKey,
                  metaKey: event.metaKey,
                  altKey: event.altKey,
                  pos: view.posAtCoords({
                    x: event.x,
                    y: event.y
                  })
                };
                this.dispatchAppEvent("page:click", clickEvent).catch(
                  console.error
                );
              }
            }
          },
          click: (event, view) => {
            safeRun(async () => {
              const clickEvent = {
                page: pageName,
                ctrlKey: event.ctrlKey,
                metaKey: event.metaKey,
                altKey: event.altKey,
                pos: view.posAtCoords(event)
              };
              await this.dispatchAppEvent("page:click", clickEvent);
            });
          }
        }),
        ViewPlugin.fromClass(
          class {
            update(update) {
              if (update.docChanged) {
                editor.viewDispatch({ type: "page-changed" });
                editor.debouncedUpdateEvent();
                editor.save().catch((e) => console.error("Error saving", e));
              }
            }
          }
        ),
        pasteLinkExtension,
        attachmentExtension(this),
        closeBrackets(),
        ...[this.collabState ? this.collabState.collabExtension() : []]
      ]
    });
  }
  async reloadPlugs() {
    console.log("Loading plugs");
    await this.space.updatePageList();
    await this.system.unloadAll();
    console.log("(Re)loading plugs");
    await Promise.all((await this.space.listPlugs()).map(async (plugName) => {
      const { data } = await this.space.readAttachment(plugName, "utf8");
      await this.system.load(JSON.parse(data), createSandbox);
    }));
    this.rebuildEditorState();
    await this.dispatchAppEvent("plugs:loaded");
  }
  rebuildEditorState() {
    const editorView = this.editorView;
    console.log("Rebuilding editor state");
    this.mdExtensions = loadMarkdownExtensions(this.system);
    this.system.registerSyscalls(
      [],
      markdownSyscalls(buildMarkdown(this.mdExtensions))
    );
    if (editorView && this.currentPage) {
      this.saveState(this.currentPage);
      editorView.setState(
        this.createEditorState(
          this.currentPage,
          editorView.state.sliceDoc(),
          this.viewState.currentPageMeta?.perm === "ro"
        )
      );
      if (editorView.contentDOM) {
        this.tweakEditorDOM(
          editorView.contentDOM
        );
      }
      this.restoreState(this.currentPage);
    }
  }
  async completeWithEvent(context, eventName) {
    const editorState = context.state;
    const selection = editorState.selection.main;
    const line = editorState.doc.lineAt(selection.from);
    const linePrefix = line.text.slice(0, selection.from - line.from);
    const results = await this.dispatchAppEvent(eventName, {
      linePrefix,
      pos: selection.from
    });
    let actualResult = null;
    for (const result of results) {
      if (result) {
        if (actualResult) {
          console.error(
            "Got completion results from multiple sources, cannot deal with that"
          );
          return null;
        }
        actualResult = result;
      }
    }
    return actualResult;
  }
  editorComplete(context) {
    return this.completeWithEvent(context, "editor:complete");
  }
  miniEditorComplete(context) {
    return this.completeWithEvent(context, "minieditor:complete");
  }
  async reloadPage() {
    console.log("Reloading page");
    clearTimeout(this.saveTimeout);
    await this.loadPage(this.currentPage);
  }
  focus() {
    this.editorView.focus();
  }
  async navigate(name, pos, replaceState = false, newWindow = false) {
    if (!name) {
      name = this.indexPage;
    }
    if (newWindow) {
      const win = window.open(`${location.origin}/${name}`, "_blank");
      if (win) {
        win.focus();
      }
      return;
    }
    await this.pageNavigator.navigate(name, pos, replaceState);
  }
  async loadPage(pageName) {
    const loadingDifferentPage = pageName !== this.currentPage;
    const editorView = this.editorView;
    if (!editorView) {
      return false;
    }
    const previousPage = this.currentPage;
    if (previousPage) {
      this.saveState(previousPage);
      this.space.unwatchPage(previousPage);
      if (previousPage !== pageName) {
        await this.save(true);
        if (this.collabState) {
          this.collabState.stop();
          this.collabState = void 0;
        }
      }
    }
    this.viewDispatch({
      type: "page-loading",
      name: pageName
    });
    let doc;
    try {
      doc = await this.space.readPage(pageName);
    } catch (e) {
      console.log("Creating new page", pageName);
      doc = {
        text: "",
        meta: { name: pageName, lastModified: 0, perm: "rw" }
      };
    }
    const editorState = this.createEditorState(
      pageName,
      doc.text,
      doc.meta.perm === "ro"
    );
    editorView.setState(editorState);
    if (editorView.contentDOM) {
      this.tweakEditorDOM(editorView.contentDOM);
    }
    const stateRestored = this.restoreState(pageName);
    this.space.watchPage(pageName);
    this.viewDispatch({
      type: "page-loaded",
      meta: doc.meta
    });
    if (loadingDifferentPage) {
      this.eventHook.dispatchEvent("editor:pageLoaded", pageName).catch(
        console.error
      );
    } else {
      this.eventHook.dispatchEvent("editor:pageReloaded", pageName).catch(
        console.error
      );
    }
    return stateRestored;
  }
  tweakEditorDOM(contentDOM) {
    contentDOM.spellcheck = true;
    contentDOM.setAttribute("autocorrect", "on");
    contentDOM.setAttribute("autocapitalize", "on");
  }
  async loadCustomStyles() {
    try {
      const { text: stylesText } = await this.space.readPage("STYLES");
      const cssBlockRegex = /```css([^`]+)```/;
      const match = cssBlockRegex.exec(stylesText);
      if (!match) {
        return;
      }
      const css = match[1];
      document.getElementById("custom-styles").innerHTML = css;
    } catch {
    }
  }
  restoreState(pageName) {
    const pageState = this.openPages.get(pageName);
    const editorView = this.editorView;
    if (pageState) {
      editorView.scrollDOM.scrollTop = pageState.scrollTop;
      editorView.dispatch({
        selection: pageState.selection,
        scrollIntoView: true
      });
    } else {
      editorView.scrollDOM.scrollTop = 0;
      editorView.dispatch({
        selection: { anchor: 0 },
        scrollIntoView: true
      });
    }
    editorView.focus();
    return !!pageState;
  }
  saveState(currentPage) {
    this.openPages.set(
      currentPage,
      new PageState(
        this.editorView.scrollDOM.scrollTop,
        this.editorView.state.selection
      )
    );
  }
  ViewComponent() {
    const [viewState, dispatch] = useReducer(reducer, initialViewState);
    this.viewState = viewState;
    this.viewDispatch = dispatch;
    const editor = this;
    useEffect(() => {
      if (viewState.currentPage) {
        document.title = viewState.currentPage;
      }
    }, [viewState.currentPage]);
    useEffect(() => {
      if (editor.editorView) {
        editor.tweakEditorDOM(
          editor.editorView.contentDOM
        );
      }
    }, [viewState.uiOptions.forcedROMode]);
    useEffect(() => {
      this.rebuildEditorState();
      this.dispatchAppEvent("editor:modeswitch");
    }, [viewState.uiOptions.vimMode]);
    useEffect(() => {
      document.documentElement.dataset.theme = viewState.uiOptions.darkMode ? "dark" : "light";
    }, [viewState.uiOptions.darkMode]);
    useEffect(() => {
      globalThis.dispatchEvent(new Event("resize"));
    }, [viewState.panels]);
    return /* @__PURE__ */ React.createElement(React.Fragment, null, viewState.showPageNavigator && /* @__PURE__ */ React.createElement(
      PageNavigator,
      {
        allPages: viewState.allPages,
        currentPage: this.currentPage,
        completer: this.miniEditorComplete.bind(this),
        vimMode: viewState.uiOptions.vimMode,
        darkMode: viewState.uiOptions.darkMode,
        onNavigate: (page) => {
          dispatch({ type: "stop-navigate" });
          editor.focus();
          if (page) {
            safeRun(async () => {
              await editor.navigate(page);
            });
          }
        }
      }
    ), viewState.showCommandPalette && /* @__PURE__ */ React.createElement(
      CommandPalette,
      {
        onTrigger: (cmd) => {
          dispatch({ type: "hide-palette" });
          editor.focus();
          if (cmd) {
            dispatch({ type: "command-run", command: cmd.command.name });
            cmd.run().catch((e) => {
              console.error("Error running command", e.message);
            }).then(() => {
              editor.focus();
            });
          }
        },
        commands: this.getCommandsByContext(viewState),
        vimMode: viewState.uiOptions.vimMode,
        darkMode: viewState.uiOptions.darkMode,
        completer: this.miniEditorComplete.bind(this),
        recentCommands: viewState.recentCommands
      }
    ), viewState.showFilterBox && /* @__PURE__ */ React.createElement(
      FilterList,
      {
        label: viewState.filterBoxLabel,
        placeholder: viewState.filterBoxPlaceHolder,
        options: viewState.filterBoxOptions,
        vimMode: viewState.uiOptions.vimMode,
        darkMode: viewState.uiOptions.darkMode,
        allowNew: false,
        completer: this.miniEditorComplete.bind(this),
        helpText: viewState.filterBoxHelpText,
        onSelect: viewState.filterBoxOnSelect
      }
    ), viewState.showPrompt && /* @__PURE__ */ React.createElement(
      Prompt,
      {
        message: viewState.promptMessage,
        defaultValue: viewState.promptDefaultValue,
        vimMode: viewState.uiOptions.vimMode,
        darkMode: viewState.uiOptions.darkMode,
        completer: this.miniEditorComplete.bind(this),
        callback: (value) => {
          dispatch({ type: "hide-prompt" });
          viewState.promptCallback(value);
        }
      }
    ), viewState.showConfirm && /* @__PURE__ */ React.createElement(
      Confirm,
      {
        message: viewState.confirmMessage,
        callback: (value) => {
          dispatch({ type: "hide-confirm" });
          viewState.confirmCallback(value);
        }
      }
    ), /* @__PURE__ */ React.createElement(
      TopBar,
      {
        pageName: viewState.currentPage,
        notifications: viewState.notifications,
        unsavedChanges: viewState.unsavedChanges,
        isLoading: viewState.isLoading,
        vimMode: viewState.uiOptions.vimMode,
        darkMode: viewState.uiOptions.darkMode,
        completer: editor.miniEditorComplete.bind(editor),
        onRename: async (newName) => {
          if (!newName) {
            editor.editorView?.dispatch({
              selection: { anchor: 0 }
            });
            editor.focus();
            return;
          }
          console.log("Now renaming page to...", newName);
          await editor.system.loadedPlugs.get("core").invoke(
            "renamePage",
            [{ page: newName }]
          );
          editor.focus();
        },
        actionButtons: [
          {
            icon: HomeIcon,
            description: `Go home (Alt-h)`,
            callback: () => {
              editor.navigate("");
            }
          },
          {
            icon: BookIcon,
            description: `Open page (${isMacLike() ? "Cmd-k" : "Ctrl-k"})`,
            callback: () => {
              dispatch({ type: "start-navigate" });
              this.space.updatePageList();
            }
          },
          {
            icon: TerminalIcon,
            description: `Run command (${isMacLike() ? "Cmd-/" : "Ctrl-/"})`,
            callback: () => {
              dispatch({ type: "show-palette", context: this.getContext() });
            }
          }
        ],
        rhs: !!viewState.panels.rhs.mode && /* @__PURE__ */ React.createElement(
          "div",
          {
            className: "panel",
            style: { flex: viewState.panels.rhs.mode }
          }
        ),
        lhs: !!viewState.panels.lhs.mode && /* @__PURE__ */ React.createElement(
          "div",
          {
            className: "panel",
            style: { flex: viewState.panels.lhs.mode }
          }
        )
      }
    ), /* @__PURE__ */ React.createElement("div", { id: "sb-main" }, !!viewState.panels.lhs.mode && /* @__PURE__ */ React.createElement(Panel, { config: viewState.panels.lhs, editor }), /* @__PURE__ */ React.createElement("div", { id: "sb-editor" }), !!viewState.panels.rhs.mode && /* @__PURE__ */ React.createElement(Panel, { config: viewState.panels.rhs, editor })), !!viewState.panels.modal.mode && /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "sb-modal",
        style: { inset: `${viewState.panels.modal.mode}px` }
      },
      /* @__PURE__ */ React.createElement(Panel, { config: viewState.panels.modal, editor })
    ), !!viewState.panels.bhs.mode && /* @__PURE__ */ React.createElement("div", { className: "sb-bhs" }, /* @__PURE__ */ React.createElement(Panel, { config: viewState.panels.bhs, editor })));
  }
  async runCommandByName(name, ...args) {
    const cmd = this.viewState.commands.get(name);
    if (cmd) {
      await cmd.run();
    } else {
      throw new Error(`Command ${name} not found`);
    }
  }
  render(container) {
    const ViewComponent = this.ViewComponent.bind(this);
    preactRender(/* @__PURE__ */ React.createElement(ViewComponent, null), container);
  }
  getCommandsByContext(state) {
    const commands = new Map(state.commands);
    for (const [k, v] of state.commands.entries()) {
      if (v.command.contexts && (!state.showCommandPaletteContext || !v.command.contexts.includes(state.showCommandPaletteContext))) {
        commands.delete(k);
      }
    }
    return commands;
  }
  getContext() {
    const state = this.editorView.state;
    const selection = state.selection.main;
    if (selection.empty) {
      return syntaxTree(state).resolveInner(selection.from).type.name;
    }
    return;
  }
  startCollab(serverUrl, token, username) {
    if (this.collabState) {
      this.collabState.stop();
    }
    const initialText = this.editorView.state.sliceDoc();
    this.collabState = new CollabState(serverUrl, token, username);
    this.collabState.collabProvider.once("sync", (synced) => {
      if (this.collabState?.ytext.toString() === "") {
        console.log("Synced value is empty, putting back original text");
        this.collabState?.ytext.insert(0, initialText);
      }
    });
    this.rebuildEditorState();
  }
}
