import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { load } from "js-yaml";

test("YAML examples contain one valid document", () => {
  const examplesDir = path.join(process.cwd(), "examples");
  const examples = fs.readdirSync(examplesDir).filter((file) => file.endsWith(".yml"));

  assert.ok(examples.length > 0);
  for (const example of examples) {
    assert.doesNotThrow(() => load(fs.readFileSync(path.join(examplesDir, example), "utf8")), example);
  }
});
