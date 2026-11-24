const fs = require('node:fs');

// Both callers pass the application-owned leaf directory under an XDG root.
function ensurePrivateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (process.platform === 'win32') {
    // Windows inherits access control from the parent directory.
    if (!fs.lstatSync(directory).isDirectory()) throw new Error(`Invalid storage directory: ${directory}`);
    return;
  }
  const descriptor = fs.openSync(directory, fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  try {
    if (fs.fstatSync(descriptor).mode & 0o077) fs.fchmodSync(descriptor, 0o700);
  } finally {
    fs.closeSync(descriptor);
  }
}

module.exports = { ensurePrivateDirectory };
