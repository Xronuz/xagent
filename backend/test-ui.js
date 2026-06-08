const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173');
  
  console.log("Navigated to Home");
  
  // Wait for the UI to load and start a session
  await new Promise(r => setTimeout(r, 2000));
  
  // Since we don't know the exact DOM elements without viewing them, let's take a screenshot
  await page.screenshot({ path: 'home.png' });
  console.log("Screenshot taken at home.png");
  
  await browser.close();
})();
