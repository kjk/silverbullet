import { isMacLike } from "../../common/util.js";
import { FilterList } from "./filter.jsx";
import { TerminalIcon } from "../deps.js";
export function CommandPalette({
  commands,
  recentCommands,
  onTrigger,
  vimMode,
  darkMode,
  completer
}) {
  const options = [];
  const isMac = isMacLike();
  for (const [name, def] of commands.entries()) {
    options.push({
      name,
      hint: isMac && def.command.mac ? def.command.mac : def.command.key,
      orderId: recentCommands.has(name) ? -recentCommands.get(name).getTime() : 0
    });
  }
  return /* @__PURE__ */ React.createElement(
    FilterList,
    {
      label: "Run",
      placeholder: "Command",
      options,
      allowNew: false,
      icon: TerminalIcon,
      completer,
      vimMode,
      darkMode,
      helpText: "Start typing the command name to filter results, press <code>Return</code> to run.",
      onSelect: (opt) => {
        if (opt) {
          onTrigger(commands.get(opt.name));
        } else {
          onTrigger(void 0);
        }
      }
    }
  );
}
