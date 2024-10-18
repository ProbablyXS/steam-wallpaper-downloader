const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const https = require('https');

process.on('SIGINT', () => {
    console.log('Terminating Puppeteer process...');
    process.exit(0);
});

async function downloadFile(url, destination, count) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destination, { highWaterMark: 64 * 1024 });
        const startTime = Date.now();

        https.get(url, response => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                const endTime = Date.now();
                const duration = (endTime - startTime) / 1000;
                console.log(`Downloaded ${count}: ${path.basename(destination)} in ${duration.toFixed(2)} seconds`);
                resolve();
            });
        }).on('error', err => {
            fs.unlink(destination, () => { }); // Handle the callback for fs.unlink
            console.error('Error downloading file:', err.message);
            reject(err);
        });
    });
}

async function waitFor(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function closeCookiePopup(page) {
    await waitFor(2000);
    try {
        const cookieButtonSelector = '#acceptAllButton';
        await page.waitForSelector(cookieButtonSelector, { timeout: 5000 });
        await page.click(cookieButtonSelector);
        console.log("Closed cookie consent popup.");
    } catch (error) {
        console.log("No cookie consent popup found.");
    }
}

async function hideVideoElements(page) {
    await page.evaluate(() => {
        const videos = document.querySelectorAll('video[playsinline][loop][autoplay]');
        videos.forEach(video => {
            video.style.display = 'none'; // Hides the video
        });
        console.log(`Hid ${videos.length} video(s).`);
    });
}

async function scrollToBottomUsingTab(page) {
    await page.keyboard.press('Tab'); // Simulate pressing the Tab key
    await hideVideoElements(page);
    await waitFor(10); // Wait for new content to load
}

async function isFileDownloaded(filePath) {
    return fs.existsSync(filePath);
}

(async () => {
    let browser;
    let downloadCount = 0;
    let total = 0;
    let lastProcessedIndex = 0; // Track the last processed index
    const overallStartTime = Date.now(); // Start overall stopwatch

    try {
        // Launch Puppeteer
        browser = await puppeteer.launch({
            headless: 'none', // Use headless mode if desired
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--fast-start',
                '--disable-extensions',
                '--disable-gpu',
                '--disable-infobars',
                '--disable-dev-shm-usage',
                '--window-size=1024,720',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--remote-debugging-port=9222',
                '--mute-audio',
                '--start-maximized',
                '--user-data-dir=' + path.join(__dirname, 'puppeteer-cache')
            ],
            ignoreHTTPSErrors: true
        });

        const page = await browser.newPage();

        // Set the viewport size
        await page.setViewport({ width: 1280, height: 720 });

        // Set a user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36');
        await page.goto('https://store.steampowered.com/points/shop/c/backgrounds/cluster/0', { waitUntil: 'networkidle2' });

        await waitFor(2000); // Wait for initial load
        await closeCookiePopup(page); // Close cookie consent popup
        await hideVideoElements(page); // Hide videos
        await scrollToBottomUsingTab(page); // Scroll down to load all videos
        await waitFor(1000); // Wait for initial load

        while (true) {
            // Select all clickable elements
            const clickableElements = await page.$$('.padding-top-large._1hyVDUTu00_a_5XtwVOdU2.Panel.Focusable');
            console.log(`Found ${clickableElements.length - 1} clickable elements.`);

            if (clickableElements.length === 0) break; // Break if no elements are found

            const downloadDir = path.join(__dirname, 'downloads');
            if (!fs.existsSync(downloadDir)) {
                fs.mkdirSync(downloadDir);
            }

            const downloadPromises = [];

            // Start from the last processed index
            // for (let i = lastProcessedIndex; i < clickableElements.length - 1; i++) {
            const element = clickableElements[0];

            // Click on the div that opens the modal
            await element.click(); // Click on the specified div to open the modal

            await page.waitForSelector('.FullModalOverlay', { visible: true });
            await waitFor(100);

            const videoUrls = await page.evaluate(() => {
                const sources = [];
                const video = document.querySelector('.FullModalOverlay video[playsinline][loop][autoplay]');
                if (video) {
                    const sourceElements = Array.from(video.querySelectorAll('source'));
                    sourceElements.forEach(source => {
                        if (source.src) {
                            sources.push(source.src);
                        }
                    });
                }
                return sources;
            });

            if (videoUrls.length > 0) {
                const highestQualityUrl = videoUrls[0];
                const videoName = path.basename(highestQualityUrl);
                const videoPath = path.join(downloadDir, videoName);

                if (await isFileDownloaded(videoPath)) {
                    console.log(`Skipping ${videoName}, already downloaded.`);
                } else {
                    downloadCount++;
                    downloadPromises.push(downloadFile(highestQualityUrl, videoPath, downloadCount));
                }
            }

            const closeButtonSelector = 'button._3Ju8vy_foEPg9ILmy2-htb._1hcJa9ylImmFKuHsfilos.Focusable';
            await page.waitForSelector(closeButtonSelector);
            await page.click(closeButtonSelector);

            // Remove the element using page.evaluate
            await page.evaluate(element => {
                if (element) {
                    element.remove();
                }
            }, element);

            await waitFor(10);

            // Update lastProcessedIndex after processing each clickable element
            // lastProcessedIndex = i + 1; // Move to the next element

            await Promise.all(downloadPromises);

            // Scroll to load more videos after processing the current batch
            await scrollToBottomUsingTab(page);

            total++;
            console.log(`Total videos: ${total}`);
        }

        const overallEndTime = Date.now();
        const totalDuration = (overallEndTime - overallStartTime) / 1000;
        console.log(`Total downloads: ${downloadCount} in ${totalDuration.toFixed(2)} seconds`);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
})();
