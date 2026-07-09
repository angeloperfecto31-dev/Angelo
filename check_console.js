import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log(`[Browser Console ${msg.type()}] ${msg.text()}`);
  });
  
  page.on('pageerror', err => {
    console.log(`[Browser PageError] ${err.message}`);
  });
  
  page.on('requestfailed', request => {
    console.log(`[Browser RequestFailed] ${request.url()} ${request.failure().errorText}`);
  });

  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 15000 });
  } catch (err) {
    console.log(`[Navigation Error] ${err.message}`);
  }
  
  console.log('--- HTML content ---');
  console.log(await page.content());
  
  await browser.close();
})();
