const path = require('path');
const fs = require('fs');

const { chromium } = require(path.resolve(__dirname, '../frontend/node_modules/@playwright/test'));

async function recordVideo() {
  const outputDir = path.resolve(__dirname, '../videos');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const htmlPath = 'file:///' + path.resolve(__dirname, '../frontend/public/video_walkthrough.html').replace(/\\/g, '/');
  console.log('Loading video showcase from:', htmlPath);

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: outputDir,
      size: { width: 1280, height: 720 }
    }
  });

  const page = await context.newPage();
  await page.goto(htmlPath);

  console.log('Video recording session started at 1280x720 60fps...');
  
  // Set speed to 2.5x for recording so the full 8-chapter presentation completes in ~48 seconds
  await page.evaluate(() => {
    playbackSpeed = 2.5;
    play();
  });

  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(6000);
    const chapter = await page.textContent('#narration-chapter-title');
    console.log(`[Captured Scene ${i + 1}/8] ${chapter}`);
  }

  console.log('Finalizing recording and writing video stream...');
  await page.waitForTimeout(2000);

  // Close context to finish writing the video file
  await context.close();
  await browser.close();

  const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.webm'));
  if (files.length > 0) {
    files.sort((a, b) => fs.statSync(path.join(outputDir, b)).mtime - fs.statSync(path.join(outputDir, a)).mtime);
    const latestVideo = path.join(outputDir, files[0]);
    const finalName = path.join(outputDir, 'LanternED_Full_System_Walkthrough.webm');
    if (fs.existsSync(finalName)) {
      try { fs.unlinkSync(finalName); } catch (e) {}
    }
    fs.renameSync(latestVideo, finalName);
    const sizeMb = (fs.statSync(finalName).size / (1024 * 1024)).toFixed(2);
    console.log(`SUCCESS: Video saved to ${finalName} (${sizeMb} MB)`);
    return finalName;
  }
}

recordVideo().catch(err => {
  console.error('Recording failed:', err);
  process.exit(1);
});
