import { Plugin } from "@opencode/plugin";
import { createOpenCodeSetup } from "../packages/core/dist/adapters/opencode.js";
import plugin from "opencode-git-autocommit";

// Compile against the actual host SDK rather than an invented local plugin type.
Plugin.define({ id: "git-autocommit", setup: createOpenCodeSetup() });
Plugin.define(plugin);
