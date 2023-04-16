import { SETTINGS_TEMPLATE } from "./settings_template.js";
import { YAML } from "./deps.js";
export function safeRun(fn) {
  fn().catch((e) => {
    console.error(e);
  });
}
export function isMacLike() {
  return /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);
}
const yamlSettingsRegex = /```yaml([^`]+)```/;
export function parseYamlSettings(settingsMarkdown) {
  const match = yamlSettingsRegex.exec(settingsMarkdown);
  if (!match) {
    return {};
  }
  const yaml = match[1];
  try {
    return YAML.parse(yaml);
  } catch (e) {
    console.error("Error parsing SETTINGS as YAML", e.message);
    return {};
  }
}
export async function ensureAndLoadSettings(space, dontCreate) {
  if (dontCreate) {
    return {
      indexPage: "index",
    };
  }
  try {
    await space.getPageMeta("SETTINGS");
  } catch {
    await space.writePage("SETTINGS", SETTINGS_TEMPLATE, true);
  }
  const { text: settingsText } = await space.readPage("SETTINGS");
  const settings = parseYamlSettings(settingsText);
  if (!settings.indexPage) {
    settings.indexPage = "index";
  }
  try {
    await space.getPageMeta(settings.indexPage);
  } catch {
    await space.writePage(
      settings.indexPage,
      `Hello! And welcome to your brand new SilverBullet space!

<!-- #use [[\u{1F4AD} silverbullet.md/Getting Started]] -->
Loading some onboarding content for you (but doing so does require a working internet connection)...
<!-- /use -->`
    );
  }
  return settings;
}
