import puppeteer from "puppeteer";
import path from "path";
import fs from "fs";

export interface BrowserObservation {
  screenshotPath: string | null;
  screenshotSize: number | null;
  url: string;
  status: number | null;
  pageTitle: string;
  consoleErrors: string[];
  consoleWarnings: string[];
  failedRequests: string[];
  domSummary: string;
  loadError: string | null;
}

export async function observeBrowser(
  url: string,
  waitMs: number = 3000,
  screenshotName: string = "screenshot"
): Promise<BrowserObservation> {
  // 1. Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (e) {
    throw new Error(`Invalid URL: ${url}`);
  }

  const hostname = parsedUrl.hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error(`External URLs are not allowed. Only localhost is supported.`);
  }

  // 2. Setup storage
  const screenshotsDir = path.resolve(process.cwd(), ".sandboxes", "screenshots");
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const macChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const executablePath = fs.existsSync(macChromePath) ? macChromePath : undefined;

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const observation: BrowserObservation = {
    screenshotPath: null,
    screenshotSize: null,
    url: url,
    status: null,
    pageTitle: "",
    consoleErrors: [],
    consoleWarnings: [],
    failedRequests: [],
    domSummary: "",
    loadError: null,
  };

  try {
    const page = await browser.newPage();
    
    // Intercept console
    page.on("console", (msg) => {
      if (msg.type() === "error") observation.consoleErrors.push(msg.text());
      if (msg.type() === "warn") observation.consoleWarnings.push(msg.text());
    });

    // Intercept uncaught exceptions
    page.on("pageerror", (err: any) => {
      observation.consoleErrors.push(`Uncaught Error: ${err.message}`);
    });

    // Intercept failed requests
    page.on("requestfailed", (request) => {
      observation.failedRequests.push(`${request.url()} - ${request.failure()?.errorText || 'Unknown error'}`);
    });

    // Navigate
    const response = await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    observation.status = response?.status() || null;

    // Optional wait
    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, waitMs));
    }

    observation.pageTitle = await page.title();
    
    observation.domSummary = await page.evaluate(() => {
      return document.body ? document.body.innerText.substring(0, 1000) : "No body found";
    });

    const timestamp = Date.now();
    const safeName = screenshotName.replace(/[^a-zA-Z0-9-]/g, "");
    const screenshotPath = path.join(screenshotsDir, `${safeName}-${timestamp}.png`);
    
    const buffer = await page.screenshot({ path: screenshotPath, fullPage: false });
    observation.screenshotPath = screenshotPath;
    observation.screenshotSize = buffer.length;

  } catch (err: any) {
    observation.loadError = err.message;
  } finally {
    await browser.close();
  }

  return observation;
}
