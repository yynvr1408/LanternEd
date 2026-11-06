/**
 * Playwright script to record the REAL LanternED website and workflows end-to-end.
 * Navigates through real frontend pages on http://localhost:5173 connected to backend http://localhost:8000.
 * Records all 4 consoles: Teacher, Student, Institution Admin, and Super-Admin Console.
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { chromium } = require(path.resolve(__dirname, '../frontend/node_modules/@playwright/test'));

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function smoothScroll(page, distance, durationMs = 1200) {
  await page.evaluate(async ({ distance, durationMs }) => {
    const start = window.scrollY;
    const startTime = performance.now();
    return new Promise(resolve => {
      function step(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        const ease = 0.5 - Math.cos(progress * Math.PI) / 2;
        window.scrollTo(0, start + distance * ease);
        if (progress < 1) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
  }, { distance, durationMs });
  await sleep(400);
}

async function fetchSessionCookie(email, password) {
  const resp = await fetch('http://127.0.0.1:8000/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' },
    body: JSON.stringify({ email, password })
  });
  const setCookie = resp.headers.get('set-cookie');
  if (!setCookie) throw new Error(`Login failed for ${email}: ${await resp.text()}`);
  return setCookie.split(';')[0].split('=')[1];
}

function getFreshAdminToken() {
  const token = execSync('backend\\venv\\Scripts\\python scripts/get_fresh_admin_token.py', { encoding: 'utf-8' }).trim();
  return token;
}

async function recordRealWebsite() {
  const outputDir = path.resolve(__dirname, '../videos');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('>>> [Pre-flight] Fetching authenticated session tokens...');
  const teacherToken = await fetchSessionCookie('afzal97016458@gmail.com', 'Password@123');
  console.log('Teacher token acquired successfully.');
  const studentToken = await fetchSessionCookie('afzalsiddappagari@gmail.com', 'Password@123');
  console.log('Student token acquired successfully.');

  console.log('>>> Launching Chromium to record REAL LanternED website (1440x900)...');
  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: outputDir,
      size: { width: 1440, height: 900 }
    }
  });

  const page = await context.newPage();

  // =========================================================================
  // SCENE 1: Public Authentication & Portal Selection
  // =========================================================================
  console.log('>>> [Scene 1] Navigating to Public Portal Selection (/login)...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await smoothScroll(page, 200, 800);
  await sleep(600);
  await smoothScroll(page, -200, 600);

  console.log('Navigating to Register Choice (/register)...');
  await page.goto('http://localhost:5173/register', { waitUntil: 'domcontentloaded' });
  await sleep(1200);

  console.log('Navigating to Institutional College Onboarding (/register/college)...');
  await page.goto('http://localhost:5173/register/college', { waitUntil: 'domcontentloaded' });
  await sleep(1200);
  await smoothScroll(page, 350, 900);
  await sleep(800);
  await smoothScroll(page, -350, 700);
  await sleep(600);

  console.log('Navigating to Forgot Password (/forgot-password)...');
  await page.goto('http://localhost:5173/forgot-password', { waitUntil: 'domcontentloaded' });
  await sleep(1000);

  // =========================================================================
  // SCENE 2: Real Teacher Login & Teacher Dashboard
  // =========================================================================
  console.log('>>> [Scene 2] Teacher Authentication (/login/teacher)...');
  await page.goto('http://localhost:5173/login/teacher', { waitUntil: 'domcontentloaded' });
  await sleep(800);

  console.log('Filling teacher credentials...');
  await page.fill('input[type="email"]', 'afzal97016458@gmail.com');
  await sleep(350);
  await page.fill('input[type="password"]', 'Password@123');
  await sleep(500);

  // Inject session cookie into browser context for seamless persistent auth
  await context.addCookies([
    { name: 'eduvillage_session', value: teacherToken, url: 'http://localhost:8000' },
    { name: 'eduvillage_session', value: teacherToken, url: 'http://localhost:5173' }
  ]);

  console.log('Entering Teacher Dashboard (/teacher/dashboard)...');
  await page.goto('http://localhost:5173/teacher/dashboard', { waitUntil: 'domcontentloaded' });
  await sleep(1800);

  console.log('Viewing Teacher Dashboard...');
  await smoothScroll(page, 350, 1000);
  await sleep(900);
  await smoothScroll(page, -350, 800);
  await sleep(900);

  // =========================================================================
  // SCENE 3: Real Teacher Courses & Course Authoring
  // =========================================================================
  console.log('>>> [Scene 3] Navigating to Teacher Courses (/teacher/courses)...');
  await page.goto('http://localhost:5173/teacher/courses', { waitUntil: 'domcontentloaded' });
  await sleep(1600);

  console.log('Navigating to New Course Creation (/teacher/courses/new)...');
  await page.goto('http://localhost:5173/teacher/courses/new', { waitUntil: 'domcontentloaded' });
  await sleep(1000);

  try {
    const titleInput = await page.$('input[name="title"], input[placeholder*="Course Title"], input[placeholder*="title" i]');
    if (titleInput) {
      await titleInput.fill('CS402: Quantum Algorithms & Distributed Consensus');
      await sleep(400);
    }
  } catch (e) {}
  await smoothScroll(page, 250, 800);
  await sleep(1000);
  await smoothScroll(page, -250, 600);

  // =========================================================================
  // SCENE 4: Real Institution Admin Console
  // =========================================================================
  console.log('>>> [Scene 4] Navigating to Institution Admin (/institution/dashboard)...');
  await page.goto('http://localhost:5173/institution/dashboard', { waitUntil: 'domcontentloaded' });
  await sleep(1800);

  // Click through institution tabs if available
  try {
    const tabs = await page.$$('button[role="tab"], .tab-btn, button:has-text("Branches"), button:has-text("Sections"), button:has-text("Courses"), button:has-text("Members")');
    for (const tab of tabs.slice(0, 4)) {
      await tab.click();
      await sleep(800);
    }
  } catch (e) {}

  await smoothScroll(page, 300, 900);
  await sleep(1000);
  await smoothScroll(page, -300, 700);
  await sleep(800);

  // =========================================================================
  // SCENE 5: Real Classes, Assignments, Summaries & Materials
  // =========================================================================
  console.log('>>> [Scene 5] Navigating to Classes (/teacher/classes)...');
  await page.goto('http://localhost:5173/teacher/classes', { waitUntil: 'domcontentloaded' });
  await sleep(1400);

  console.log('Navigating to Class Scheduler (/teacher/classes/new)...');
  await page.goto('http://localhost:5173/teacher/classes/new', { waitUntil: 'domcontentloaded' });
  await sleep(1200);

  console.log('Navigating to Assignments (/teacher/assignments)...');
  await page.goto('http://localhost:5173/teacher/assignments', { waitUntil: 'domcontentloaded' });
  await sleep(1500);

  console.log('Navigating to AI Summaries (/teacher/summaries)...');
  await page.goto('http://localhost:5173/teacher/summaries', { waitUntil: 'domcontentloaded' });
  await sleep(1400);

  console.log('Navigating to Teaching Materials (/teacher/materials)...');
  await page.goto('http://localhost:5173/teacher/materials', { waitUntil: 'domcontentloaded' });
  await sleep(1300);

  console.log('Navigating to Teacher Profile (/teacher/profile)...');
  await page.goto('http://localhost:5173/teacher/profile', { waitUntil: 'domcontentloaded' });
  await sleep(1300);

  // =========================================================================
  // SCENE 6: Real Native App Modal & Bandwidth Controller
  // =========================================================================
  console.log('>>> [Scene 6] Testing Native App Modal & Bandwidth Controller...');
  await page.goto('http://localhost:5173/teacher/dashboard', { waitUntil: 'domcontentloaded' });
  await sleep(1200);

  // Open Native App Download Modal
  try {
    const appBtn = await page.$('button:has-text("Desktop & Mobile App"), button:has-text("Download App")');
    if (appBtn) {
      console.log('Opening Native Apps Modal...');
      await appBtn.click();
      await sleep(1400);

      const modalTabs = ['Windows Desktop', 'macOS Desktop', 'Android Mobile', 'iOS Mobile'];
      for (const tabName of modalTabs) {
        const tabEl = await page.$(`button:has-text("${tabName}")`);
        if (tabEl) {
          await tabEl.click();
          await sleep(700);
        }
      }
      // Close modal
      const closeBtn = await page.$('button[aria-label="Close download modal"], button:has-text("Close")');
      if (closeBtn) {
        await closeBtn.click();
        await sleep(700);
      }
    }
  } catch (e) {
    console.log('App modal test note:', e.message);
  }

  // Open Network Bandwidth Controller pill
  try {
    const bwPill = await page.$('[aria-label*="bandwidth" i], button:has-text("Auto"), button:has-text("3G"), button:has-text("4G")');
    if (bwPill) {
      console.log('Opening Bandwidth Simulator...');
      await bwPill.click();
      await sleep(1200);
      // Select low-bandwidth 3G or 2G simulation
      const lowBwBtn = await page.$('button:has-text("3G"), button:has-text("150k"), button:has-text("Low Bandwidth")');
      if (lowBwBtn) {
        await lowBwBtn.click();
        await sleep(800);
      }
      await page.keyboard.press('Escape');
      await sleep(600);
    }
  } catch (e) {}

  // =========================================================================
  // SCENE 7: Real Student Login & Student Dashboard
  // =========================================================================
  console.log('>>> [Scene 7] Student Authentication (/login/student)...');
  await context.clearCookies();
  await page.goto('http://localhost:5173/login/student', { waitUntil: 'domcontentloaded' });
  await sleep(900);

  console.log('Filling student credentials...');
  await page.fill('input[type="email"]', 'afzalsiddappagari@gmail.com');
  await sleep(350);
  await page.fill('input[type="password"]', 'Password@123');
  await sleep(500);

  // Set student session cookie
  await context.addCookies([
    { name: 'eduvillage_session', value: studentToken, url: 'http://localhost:8000' },
    { name: 'eduvillage_session', value: studentToken, url: 'http://localhost:5173' }
  ]);

  console.log('Navigating to Student Dashboard (/student/dashboard)...');
  await page.goto('http://localhost:5173/student/dashboard', { waitUntil: 'domcontentloaded' });
  await sleep(1800);

  console.log('Viewing Student Dashboard...');
  await smoothScroll(page, 300, 1000);
  await sleep(900);
  await smoothScroll(page, -300, 800);
  await sleep(800);

  // =========================================================================
  // SCENE 8: Real Student Courses, Assignments, Lessons & Downloads
  // =========================================================================
  console.log('>>> [Scene 8] Student Courses (/student/courses)...');
  await page.goto('http://localhost:5173/student/courses', { waitUntil: 'domcontentloaded' });
  await sleep(1500);

  console.log('Student Assignments (/student/assignments)...');
  await page.goto('http://localhost:5173/student/assignments', { waitUntil: 'domcontentloaded' });
  await sleep(1500);

  console.log('Student Recorded Lessons (/student/recorded-lessons)...');
  await page.goto('http://localhost:5173/student/recorded-lessons', { waitUntil: 'domcontentloaded' });
  await sleep(1300);

  console.log('Student Offline Downloads & Storage Meter (/student/downloads)...');
  await page.goto('http://localhost:5173/student/downloads', { waitUntil: 'domcontentloaded' });
  await sleep(1600);
  await smoothScroll(page, 250, 800);
  await sleep(800);
  await smoothScroll(page, -250, 600);

  console.log('Student Profile (/student/profile)...');
  await page.goto('http://localhost:5173/student/profile', { waitUntil: 'domcontentloaded' });
  await sleep(1200);

  // =========================================================================
  // SCENE 9: Platform Super-Administrator Console (/super-admin)
  // =========================================================================
  console.log('>>> [Scene 9] Platform Super-Administrator Console (/super-admin)...');
  await context.clearCookies();

  const freshAdminToken = getFreshAdminToken();
  console.log('Injected fresh Super-Admin session token.');
  await context.addCookies([
    { name: 'lanterned_admin_session', value: freshAdminToken, url: 'http://localhost:8000' },
    { name: 'lanterned_admin_session', value: freshAdminToken, url: 'http://localhost:5173' }
  ]);

  await page.goto('http://localhost:5173/super-admin', { waitUntil: 'domcontentloaded' });
  await sleep(2000);

  console.log('Viewing Super-Admin Global Management Console...');
  await smoothScroll(page, 350, 1000);
  await sleep(1000);
  await smoothScroll(page, -350, 800);
  await sleep(1200);

  console.log('Finalizing real website recording session...');
  await sleep(1500);

  // Close context to flush video to disk
  await context.close();
  await browser.close();

  const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.webm'));
  if (files.length > 0) {
    files.sort((a, b) => fs.statSync(path.join(outputDir, b)).mtime - fs.statSync(path.join(outputDir, a)).mtime);
    const latestVideo = path.join(outputDir, files[0]);
    const finalName = path.join(outputDir, 'LanternED_Real_Website_Walkthrough.webm');
    if (fs.existsSync(finalName)) {
      try { fs.unlinkSync(finalName); } catch (e) {}
    }
    fs.renameSync(latestVideo, finalName);
    const sizeMb = (fs.statSync(finalName).size / (1024 * 1024)).toFixed(2);
    console.log(`SUCCESS: Real website video recorded to ${finalName} (${sizeMb} MB)`);

    // Universal MP4 Conversion via FFmpeg
    const ffmpegPath = path.resolve(__dirname, '../backend/venv/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v9.0.2.exe');
    const mp4Name = path.join(outputDir, 'LanternED_Real_Website_Walkthrough.mp4');
    const artifactDir = 'C:\\Users\\Nandhi vardhan reddy\\.gemini\\antigravity\\brain\\b6de3cd7-4f0d-4f07-8d09-9738d0ec2ca0';

    if (fs.existsSync(ffmpegPath)) {
      console.log('>>> Converting WebM to high-definition universal MP4...');
      if (fs.existsSync(mp4Name)) {
        try { fs.unlinkSync(mp4Name); } catch (e) {}
      }
      try {
        execSync(`"${ffmpegPath}" -y -i "${finalName}" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 22 -c:a aac -b:a 192k "${mp4Name}"`, { stdio: 'inherit' });
        const mp4SizeMb = (fs.statSync(mp4Name).size / (1024 * 1024)).toFixed(2);
        console.log(`SUCCESS: Universal MP4 video created at ${mp4Name} (${mp4SizeMb} MB)`);
      } catch (convErr) {
        console.log('FFmpeg conversion note:', convErr.message);
      }
    }

    // Copy to artifact directory
    if (fs.existsSync(artifactDir)) {
      try {
        fs.copyFileSync(finalName, path.join(artifactDir, 'LanternED_Real_Website_Walkthrough.webm'));
        if (fs.existsSync(mp4Name)) {
          fs.copyFileSync(mp4Name, path.join(artifactDir, 'LanternED_Real_Website_Walkthrough.mp4'));
        }
        console.log(`SUCCESS: Copied video deliverables to artifact directory ${artifactDir}`);
      } catch (copyErr) {
        console.log('Artifact copy note:', copyErr.message);
      }
    }

    return finalName;
  }
}

recordRealWebsite().catch(err => {
  console.error('Real website recording error:', err);
  process.exit(1);
});
