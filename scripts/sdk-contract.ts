import { Plugin } from "@opencode/plugin";
import { createOpenCodeSetup } from "../dist/adapters/opencode.js";
import plugin from "../dist/index.js";
import subpathPlugin from "../dist/adapters/opencode-plugin.js";

// Compile against the actual host SDK rather than an invented local plugin type.
Plugin.define({ id: "git-autocommit", setup: createOpenCodeSetup() });
Plugin.define(plugin);
Plugin.define(subpathPlugin);
