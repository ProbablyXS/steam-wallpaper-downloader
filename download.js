const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const https = require('https');

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
            fs.unlink(destination);
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

async function scrollToBottom(page) {
    let previousVideoCount = 0;
    let currentVideoCount = 0;

    while (true) {
        await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight);
        });

        await waitFor(2000); // Wait for new content to load

        currentVideoCount = (await fetchVideos(page)).length; // Get the current video count

        // Wait if 20 videos have been loaded
        if (currentVideoCount >= previousVideoCount + 20) {
            await waitFor(2000); // Wait for 2 seconds before next scroll
        }

        if (currentVideoCount === previousVideoCount) break; // Stop if no new videos are loaded
        previousVideoCount = currentVideoCount;

        console.log(`Loaded ${currentVideoCount} videos so far.`);
    }
}

async function fetchVideos(page) {
    return await page.$$('video[playsinline][loop][autoplay]');
}

async function isFileDownloaded(filePath) {
    return fs.existsSync(filePath);
}

(async () => {
    let browser;
    let downloadCount = 0;
    const overallStartTime = Date.now(); // Start overall stopwatch

    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--fast-start',
                '--disable-extensions',
                '--disable-gpu',
                '--disable-infobars',
                '--disable-dev-shm-usage',
                '--window-size=1,1',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--remote-debugging-port=9222',
                '--mute-audio',
                '--start-maximized'
            ],
            ignoreHTTPSErrors: true
        });
        const page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36');
        await page.goto('https://store.steampowered.com/points/shop/c/backgrounds/cluster/0', { waitUntil: 'networkidle2' });

        await waitFor(2000); // Wait for initial load
        await closeCookiePopup(page); // Close cookie consent popup
        await scrollToBottom(page); // Scroll down to load all videos

        let videoElements;

        while (true) {
            videoElements = await fetchVideos(page);
            console.log(`Found ${videoElements.length} videos available for download.`);

            if (videoElements.length === 0) break; // Break if no videos are found

            const downloadDir = path.join(__dirname, 'downloads');
            if (!fs.existsSync(downloadDir)) {
                fs.mkdirSync(downloadDir);
            }

            const downloadPromises = [];

            for (let i = 0; i < videoElements.length; i++) {
                const videoElement = videoElements[i];
                await videoElement.click();
                await page.waitForSelector('.FullModalOverlay', { visible: true });
                await waitFor(500);

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
                        await page.click('button._3Ju8vy_foEPg9ILmy2-htb._1hcJa9ylImmFKuHsfilos.Focusable');
                        continue;
                    }

                    downloadCount++;
                    downloadPromises.push(downloadFile(highestQualityUrl, videoPath, downloadCount));
                }

                const closeButtonSelector = 'button._3Ju8vy_foEPg9ILmy2-htb._1hcJa9ylImmFKuHsfilos.Focusable';
                await page.waitForSelector(closeButtonSelector);
                await page.click(closeButtonSelector);
                await waitFor(500);
                
                videoElements = await fetchVideos(page); // Refresh video elements
            }

            await Promise.all(downloadPromises);

            // Scroll to load more videos after processing the current batch
            await scrollToBottom(page);
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
