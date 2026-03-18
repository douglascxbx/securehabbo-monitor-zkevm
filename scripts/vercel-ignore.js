const { execSync } = require("child_process");

const runtimeOnlyPatterns = [/^data\//, /^public\/dashboard-data\.json$/];

function shouldIgnore(changedFiles) {
  if (!changedFiles.length) {
    return false;
  }

  return changedFiles.every((filePath) => runtimeOnlyPatterns.some((pattern) => pattern.test(filePath)));
}

function getChangedFiles() {
  try {
    const output = execSync("git diff --name-only HEAD^ HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    return output
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

const changedFiles = getChangedFiles();

if (shouldIgnore(changedFiles)) {
  process.exit(0);
}

process.exit(1);
