"use strict";

// Work around Nuxt/Nuxi polyfill of process.getBuiltinModule returning a path string.
// We provide a correct implementation early so nuxi won't override it.
if (!process.getBuiltinModule) {
  process.getBuiltinModule = (name) => {
    try {
      // Support both "module" and "node:module" style built-ins.
      return require(name);
    } catch {
      return undefined;
    }
  };
}