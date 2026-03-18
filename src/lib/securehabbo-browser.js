async function fetchJsonThroughBrowser(url) {
  let playwright;

  try {
    playwright = require("playwright");
  } catch (error) {
    throw new Error("Playwright is not installed for browser fallback.");
  }

  const browser = await playwright.chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();
    await page.goto("https://securehabbo.com/", {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    await page.waitForTimeout(4000);

    const result = await page.evaluate(async (targetUrl) => {
      const response = await fetch(targetUrl, {
        headers: {
          Accept: "application/json, text/plain, */*",
        },
        credentials: "include",
      });

      return {
        status: response.status,
        body: await response.text(),
      };
    }, url);

    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Browser fetch failed with status ${result.status}`);
    }

    return JSON.parse(result.body);
  } finally {
    await browser.close();
  }
}

module.exports = {
  fetchJsonThroughBrowser,
};
