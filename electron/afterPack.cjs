const fs = require('node:fs');
const path = require('node:path');

module.exports = async ({ appOutDir }) => {
  fs.chmodSync(path.join(appOutDir, 'chrome-sandbox'), 0o4755);
};
