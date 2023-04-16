import { parse } from "./parse_tree.js";
import buildMarkdown from "./parser.js";
import {
  collectNodesOfType,
  findNodeOfType,
  renderToText,
} from "../../plug-api/lib/tree.js";
import { assertEquals, assertNotEquals } from "../../test_deps.js";
const sample1 = `---
type: page
tags:
- hello
- world
---
# This is a doc

Here is a [[wiki link]] and a [[wiki link|alias]].

Supper`;
const sampleInvalid1 = `---
name: Zef
# This is a doc

Supper`;
Deno.test("Test parser", () => {
  const lang = buildMarkdown([]);
  let tree = parse(lang, sample1);
  assertEquals(renderToText(tree), sample1);
  const links = collectNodesOfType(tree, "WikiLink");
  assertEquals(links.length, 2);
  const nameNode = findNodeOfType(links[0], "WikiLinkPage");
  assertEquals(nameNode?.children[0].text, "wiki link");
  const aliasNode = findNodeOfType(links[1], "WikiLinkAlias");
  assertEquals(aliasNode?.children[0].text, "alias");
  let node = findNodeOfType(tree, "FrontMatter");
  assertNotEquals(node, void 0);
  tree = parse(lang, sampleInvalid1);
  node = findNodeOfType(tree, "FrontMatter");
  assertEquals(node, void 0);
});
const directiveSample = `
Before
<!-- #query page -->
Body line 1

Body line 2
<!-- /query -->
End
`;
const nestedDirectiveExample = `
Before
<!-- #query page -->
1
<!-- #eval 10 * 10 -->
100
<!-- /eval -->
3
<!-- /query -->
End
`;
Deno.test("Test directive parser", () => {
  const lang = buildMarkdown([]);
  let tree = parse(lang, directiveSample);
  assertEquals(renderToText(tree), directiveSample);
  tree = parse(lang, nestedDirectiveExample);
  assertEquals(renderToText(tree), nestedDirectiveExample);
  const orderByExample = `<!-- #query page order by lastModified -->
  
  <!-- /query -->`;
  tree = parse(lang, orderByExample);
  console.log("Tree", JSON.stringify(tree, null, 2));
});
