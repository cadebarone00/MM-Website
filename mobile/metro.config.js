// Lets the app use the website's shared logic in ../lib (docs/architecture/app-first.md: same brain, same results).
// Only ../lib is watched (not the whole repo) so the app's bundler stays fast.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "../lib")];
module.exports = config;
