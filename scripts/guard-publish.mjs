#!/usr/bin/env node
// prepublishOnly of the source manifests: the publishable package is the built one (scripts/build-packages.mjs).
console.error('Publish the built package instead: npm run build && npm publish packages/<name>/dist');
process.exit(1);
