const fs = require("fs/promises");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..", "..");

function shouldUseGithubStore() {
  return String(process.env.REMOTE_STORE_PROVIDER || "").trim().toLowerCase() === "github";
}

function getGithubStoreConfig() {
  const owner = String(process.env.GITHUB_RUNTIME_OWNER || process.env.GITHUB_REPO_OWNER || "douglascxbx").trim();
  const repo = String(process.env.GITHUB_RUNTIME_REPO || process.env.GITHUB_REPO_NAME || "securehabbo-monitor-zkevm").trim();
  const branch = String(process.env.GITHUB_RUNTIME_BRANCH || "runtime-state").trim();
  const token = String(process.env.GITHUB_TOKEN || "").trim();

  if (!owner || !repo || !branch || !token) {
    throw new Error("GitHub store is missing one or more required environment variables.");
  }

  return { owner, repo, branch, token };
}

function toRepoPath(filePath) {
  return path.relative(projectRoot, filePath).replace(/\\/g, "/");
}

async function githubRequest(url, options = {}) {
  const { token } = getGithubStoreConfig();
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });

  return response;
}

async function readGithubJson(filePath, fallbackValue) {
  const { owner, repo, branch } = getGithubStoreConfig();
  const repoPath = toRepoPath(filePath);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${repoPath}?ref=${encodeURIComponent(branch)}`;
  const response = await githubRequest(url);

  if (response.status === 404) {
    return fallbackValue;
  }

  if (!response.ok) {
    throw new Error(`GitHub store read failed with HTTP ${response.status} for ${repoPath}.`);
  }

  const payload = await response.json();
  const content = Buffer.from(String(payload.content || "").replace(/\n/g, ""), "base64").toString("utf8");
  return JSON.parse(content);
}

async function writeGithubJson(filePath, value) {
  const { owner, repo, branch } = getGithubStoreConfig();
  const repoPath = toRepoPath(filePath);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${repoPath}`;
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  let sha = null;

  const currentResponse = await githubRequest(`${url}?ref=${encodeURIComponent(branch)}`);
  if (currentResponse.ok) {
    const current = await currentResponse.json();
    sha = current.sha || null;
  } else if (currentResponse.status !== 404) {
    throw new Error(`GitHub store lookup failed with HTTP ${currentResponse.status} for ${repoPath}.`);
  }

  const updateResponse = await githubRequest(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: `chore(runtime): update ${repoPath}`,
      branch,
      content: Buffer.from(serialized, "utf8").toString("base64"),
      sha: sha || undefined,
    }),
  });

  if (!updateResponse.ok) {
    const body = await updateResponse.text();
    throw new Error(`GitHub store write failed with HTTP ${updateResponse.status} for ${repoPath}: ${body}`);
  }
}

async function ensureLocalJsonFile(filePath, fallbackValue) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(fallbackValue, null, 2)}\n`, "utf8");
  }
}

async function readLocalJson(filePath, fallbackValue) {
  await ensureLocalJsonFile(filePath, fallbackValue);
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeLocalJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(filePath, fallbackValue) {
  if (shouldUseGithubStore()) {
    return readGithubJson(filePath, fallbackValue);
  }

  return readLocalJson(filePath, fallbackValue);
}

async function writeJson(filePath, value) {
  if (shouldUseGithubStore()) {
    await writeGithubJson(filePath, value);
    return;
  }

  await writeLocalJson(filePath, value);
}

module.exports = {
  readJson,
  writeJson,
  shouldUseGithubStore,
};
