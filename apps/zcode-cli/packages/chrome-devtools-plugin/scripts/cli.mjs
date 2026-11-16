process.env.CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS = "1";
process.env.CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS = "1";
await import("../dist/vendor/out/Default/gen/src/bin/chrome-devtools.js");
