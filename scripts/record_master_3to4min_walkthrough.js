/**
 * Master Walkthrough Recording Script (3.5 Minutes: 215 - 230 Seconds)
 * Records a single continuous master video of the real LanternED platform.
 *
 * Covers all 15 key workflow acts with realistic, deliberate pacing:
 * - Act 1: Public gateway & institutional application (Register choices & College registration)
 * - Act 2: Teacher sign-in & Dashboard overview (Live metrics, quick action modals)
 * - Act 3: Course authoring & Syllabus management (Units, modules, syllabus import)
 * - Act 4: Live class scheduling & session management
 * - Act 5: Coursework assignment creation & rubric criteria breakdown
 * - Act 6: AI lecture summaries (Overview, Key Concepts, Flashcards) & downloadable materials
 * - Act 7: Continuous Internal Assessment (CIA) Gradebook & cumulative student scores
 * - Act 8: College Admin portal (Branches, 12 Sections, Roster, rotating code EV-WXUW-EHHA)
 * - Act 9: Responsive bandwidth controller (smooth drawer scroll, 3G & offline simulation)
 * - Act 10: Native desktop & mobile app downloads modal (SHA-256, QR code, 3-step setup)
 * - Act 11: Student sign-in & Student portal (Enrolled courses, notifications)
 * - Act 12: Student offline draft editor & assignment submission with real typed analysis
 * - Act 13: Student downloads, offline storage meter & recorded lessons
 * - Act 14: Platform Super-Admin console, global colleges directory & system telemetry
 * - Act 15: Multilingual Telugu toggle & clean sign-out
 *
 * Fast transitions: Uses instant state injection so there are no "Verifying connection" stalls.
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { chromium } = require(path.resolve(__dirname, '../frontend/node_modules/@playwright/test'));

const BASE_URL = 'http://localhost:5173';

const TEACHER_USER = {
  id: "df19fe32-06cb-4a38-9219-4aed63397a80",
  email: "afzal97016458@gmail.com",
  full_name: "Afzal Thondaladinne siddappa gari",
  role: "teacher",
  college_id: "bd74bf29-fa79-4cb1-9ba7-16ea15f0035b",
  status: "active"
};

const STUDENT_USER = {
  id: "37c5aab5-8501-420c-9a0a-ddcddc03c6dd",
  email: "afzalsiddappagari@gmail.com",
  full_name: "Afzal",
  role: "student",
  college_id: "bd74bf29-fa79-4cb1-9ba7-16ea15f0035b",
  status: "active"
};

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

async function smoothScrollElement(page, selector, distance, durationMs = 1200) {
  await page.evaluate(async ({ selector, distance, durationMs }) => {
    const el = document.querySelector(selector);
    if (!el) return;
    const start = el.scrollTop;
    const startTime = performance.now();
    return new Promise(resolve => {
      function step(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        const ease = 0.5 - Math.cos(progress * Math.PI) / 2;
        el.scrollTop = start + distance * ease;
        if (progress < 1) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
  }, { selector, distance, durationMs });
  await sleep(400);
}

async function typeRealistic(page, selector, text, delayMs = 35) {
  await page.focus(selector);
  await page.fill(selector, '');
  for (const char of text) {
    await page.keyboard.type(char);
    await sleep(delayMs);
  }
  await sleep(250);
}

function getFreshUserToken(email) {
  const token = execSync(`backend\\venv\\Scripts\\python scripts/get_fresh_user_token.py "${email}"`, { encoding: 'utf-8' }).trim();
  return token;
}

function getFreshAdminToken() {
  const token = execSync('backend\\venv\\Scripts\\python scripts/get_fresh_admin_token.py', { encoding: 'utf-8' }).trim();
  return token;
}

async function injectAuth(page, context, userObj, token) {
  await context.addCookies([
    {
      name: 'eduvillage_session',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    }
  ]);
  await page.evaluate((u) => {
    localStorage.setItem('lanterned_user', JSON.stringify(u));
  }, userObj);
}

async function clearAuth(page, context) {
  await context.clearCookies();
  await page.evaluate(() => {
    localStorage.removeItem('lanterned_user');
    sessionStorage.removeItem('lanterned_user');
  });
}

async function runMasterWalkthrough() {
  const outputDir = path.resolve(__dirname, '../videos');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('>>> [Pre-flight] Pre-authorizing sessions for Teacher and Student...');
  const teacherToken = getFreshUserToken('afzal97016458@gmail.com');
  const studentToken = getFreshUserToken('afzalsiddappagari@gmail.com');
  const adminToken = getFreshAdminToken();
  console.log('✓ Teacher, Student, and Admin session tokens acquired.');

  console.log('>>> Launching Chromium (1440x900) for video recording...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: outputDir,
      size: { width: 1440, height: 900 }
    }
  });

  const page = await context.newPage();
  const startTime = Date.now();

  try {
    // =========================================================================
    // ACT 1: Public Gateway & Institutional Application (0:00 - 0:18)
    // =========================================================================
    console.log('>>> [Act 1] Public Gateway & Institutional Application...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    await smoothScroll(page, 300, 1000);
    await sleep(1500);
    await smoothScroll(page, -300, 1000);
    await sleep(1000);

    // Navigate to Register Choice
    console.log('  Navigating to /register...');
    await page.goto(`${BASE_URL}/register`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);

    // Navigate to College Register
    console.log('  Navigating to Institutional Onboarding (/register/college)...');
    await page.goto(`${BASE_URL}/register/college`, { waitUntil: 'domcontentloaded' });
    await sleep(2200);
    await smoothScroll(page, 400, 1200);
    await sleep(2000);
    await smoothScroll(page, -400, 1000);
    await sleep(1200);

    // =========================================================================
    // ACT 2: Teacher Sign-in & Teacher Dashboard Overview (0:18 - 0:38)
    // =========================================================================
    console.log('>>> [Act 2] Teacher Sign-In & Dashboard Overview...');
    await page.goto(`${BASE_URL}/login/teacher`, { waitUntil: 'domcontentloaded' });
    await sleep(1800);

    // Type credentials realistically
    await typeRealistic(page, '#email, input[type="email"]', 'afzal97016458@gmail.com', 30);
    await sleep(500);
    await typeRealistic(page, '#password, input[type="password"]', 'Password@123', 30);
    await sleep(800);

    // Inject session and navigate cleanly into Teacher Dashboard
    await injectAuth(page, context, TEACHER_USER, teacherToken);
    await page.goto(`${BASE_URL}/teacher/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 10000 });
    await sleep(3000);

    // Scroll dashboard content smoothly (main area scrolls while sidebar stays fixed!)
    await smoothScrollElement(page, 'main', 400, 1200);
    await sleep(2200);

    // Click "New Course" modal preview, then close
    const newCourseBtn = await page.$('button:has-text("New Course"), a:has-text("New Course")');
    if (newCourseBtn) {
      console.log('  Previewing New Course action...');
      await newCourseBtn.click();
      await sleep(2500);
      const closeBtn = await page.$('button:has-text("Cancel"), button[aria-label="Close"], a:has-text("Dashboard")');
      if (closeBtn) await closeBtn.click();
      await sleep(1200);
    }

    await page.goto(`${BASE_URL}/teacher/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 10000 });
    await sleep(1800);

    // =========================================================================
    // ACT 3: Course Authoring & Syllabus Management (0:38 - 0:56)
    // =========================================================================
    console.log('>>> [Act 3] Course Authoring & Syllabus Management...');
    await page.goto(`${BASE_URL}/teacher/courses`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 10000 });
    await sleep(2500);

    await smoothScrollElement(page, 'main', 350, 1000);
    await sleep(1800);

    // Click into course management for first course (Operating Systems CS502)
    const manageLink = await page.$('a[href*="/manage"]');
    if (manageLink) {
      console.log('  Opening Course Management details for Operating Systems...');
      await manageLink.click();
      await page.waitForSelector('h1', { timeout: 10000 });
      await sleep(3000);

      // Scroll through units and lessons
      await smoothScrollElement(page, 'main', 450, 1200);
      await sleep(2200);
      await smoothScrollElement(page, 'main', -450, 1000);
      await sleep(1500);
    }

    // =========================================================================
    // ACT 4: Live Class Scheduling & Session Management (0:56 - 1:14)
    // =========================================================================
    console.log('>>> [Act 4] Live Class Scheduling & Sessions...');
    await page.goto(`${BASE_URL}/teacher/classes`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 10000 });
    await sleep(2800);

    await smoothScrollElement(page, 'main', 350, 1000);
    await sleep(2000);

    // Click Schedule Class button
    const scheduleBtn = await page.$('button:has-text("Schedule Class"), a:has-text("Schedule Class")');
    if (scheduleBtn) {
      await scheduleBtn.click();
      await sleep(3000);
      const closeBtn = await page.$('button:has-text("Cancel"), button[aria-label="Close"], a:has-text("Classes")');
      if (closeBtn) await closeBtn.click();
      await sleep(1500);
    }

    // =========================================================================
    // ACT 5: Coursework Assignment Creation & Rubric Criteria (1:14 - 1:32)
    // =========================================================================
    console.log('>>> [Act 5] Coursework Assignment & Rubric Criteria...');
    await page.goto(`${BASE_URL}/teacher/assignments`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 10000 });
    await sleep(2800);

    await smoothScrollElement(page, 'main', 400, 1200);
    await sleep(2200);

    // Click New Assignment button to showcase rubric builder
    const newAssignBtn = await page.$('button:has-text("New Assignment"), button:has-text("Create Assignment")');
    if (newAssignBtn) {
      await newAssignBtn.click();
      await sleep(3000);
      await smoothScroll(page, 250, 800);
      await sleep(2000);
      const cancelBtn = await page.$('button:has-text("Cancel"), button[aria-label="Close"]');
      if (cancelBtn) await cancelBtn.click();
      await sleep(1500);
    }

    // =========================================================================
    // ACT 6: AI Lecture Summaries & Teaching Materials (1:32 - 1:52)
    // =========================================================================
    console.log('>>> [Act 6] AI Lecture Summaries & Teaching Resources...');
    await page.goto(`${BASE_URL}/teacher/summaries`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 10000 });
    await sleep(3000);

    // Open first summary if review button exists
    const reviewBtn = await page.$('button:has-text("Review Summary"), button:has-text("View")');
    if (reviewBtn) {
      await reviewBtn.click();
      await sleep(2500);

      // Switch tabs inside summary review: Key Points
      const keyPointsTab = await page.$('button:has-text("Key Points"), button:has-text("Key Concepts")');
      if (keyPointsTab) {
        await keyPointsTab.click();
        await sleep(2000);
      }

      // Switch tabs: Flashcards
      const flashcardsTab = await page.$('button:has-text("Flashcards"), button:has-text("Cards")');
      if (flashcardsTab) {
        await flashcardsTab.click();
        await sleep(2000);
      }

      const closeSummaryBtn = await page.$('button[aria-label="Close"], button:has-text("Close")');
      if (closeSummaryBtn) await closeSummaryBtn.click();
      await sleep(1500);
    }

    // Teaching Resources
    await page.goto(`${BASE_URL}/teacher/materials`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 10000 });
    await sleep(2500);
    await smoothScrollElement(page, 'main', 300, 1000);
    await sleep(2000);

    // =========================================================================
    // ACT 7: CIA Gradebook & Cumulative Student Scores (1:52 - 2:10)
    // =========================================================================
    console.log('>>> [Act 7] Continuous Internal Assessment (CIA) Gradebook...');
    const osCourseManageUrl = `${BASE_URL}/teacher/courses`;
    await page.goto(osCourseManageUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 10000 });
    await sleep(1800);

    const firstManage = await page.$('a[href*="/manage"]');
    if (firstManage) {
      await firstManage.click();
      await page.waitForSelector('h1', { timeout: 10000 });
      await sleep(2500);

      // Switch to Gradebook or CIA tab
      const gradebookTab = await page.$('button:has-text("Gradebook"), button:has-text("CIA"), button:has-text("Grades")');
      if (gradebookTab) {
        await gradebookTab.click();
        await sleep(3000);
        await smoothScrollElement(page, 'main', 350, 1000);
        await sleep(2500);
      }
    }

    // =========================================================================
    // ACT 8: College Admin Console (2:10 - 2:30)
    // =========================================================================
    console.log('>>> [Act 8] College Admin Console & Institutional Management...');
    await page.goto(`${BASE_URL}/institution/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1, h2', { timeout: 10000 });
    await sleep(3000);

    // Showcase Overview and rotating code EV-WXUW-EHHA
    await smoothScrollElement(page, 'main', 300, 900);
    await sleep(2000);

    // Switch to Branches tab
    console.log('  Inspecting Branches tab...');
    await page.goto(`${BASE_URL}/institution/branches`, { waitUntil: 'domcontentloaded' });
    await sleep(2800);
    await smoothScrollElement(page, 'main', 400, 1200);
    await sleep(2500);

    // Switch to Faculty tab
    console.log('  Inspecting Faculty tab...');
    await page.goto(`${BASE_URL}/institution/teachers`, { waitUntil: 'domcontentloaded' });
    await sleep(2800);
    await smoothScrollElement(page, 'main', 300, 900);
    await sleep(2000);

    // =========================================================================
    // ACT 9: Responsive Bandwidth Controller (2:30 - 2:50)
    // =========================================================================
    console.log('>>> [Act 9] Bandwidth Controller Simulation & Vertical Scrolling...');
    const bwTrigger = await page.$('button[title*="Network Quality Simulator"], button:has-text("Auto:"), button:has-text("3G"), button:has-text("Offline")');
    if (bwTrigger) {
      await bwTrigger.click();
      await sleep(2500);

      console.log('  Scrolling through Bandwidth Controller presets...');
      await smoothScrollElement(page, '[role="dialog"], .fixed', 250, 1000);
      await sleep(1500);

      // Click "Slow 3G" preset
      const slow3gBtn = await page.$('button:has-text("Slow 3G"), button:has-text("3G (150k)")');
      if (slow3gBtn) {
        await slow3gBtn.click();
        await sleep(2000);
      }

      // Click "Offline" preset
      const offlineBtn = await page.$('button:has-text("Offline (0 kbps)"), button:has-text("Offline")');
      if (offlineBtn) {
        await offlineBtn.click();
        await sleep(2000);
      }

      // Restore to "Auto / High Speed"
      const autoBtn = await page.$('button:has-text("Auto"), button:has-text("Real Network")');
      if (autoBtn) {
        await autoBtn.click();
        await sleep(2000);
      }

      // Close drawer
      const closeBw = await page.$('button[aria-label="Close"], button:has-text("Done")');
      if (closeBw) await closeBw.click();
      else await bwTrigger.click();
      await sleep(1500);
    }

    // =========================================================================
    // ACT 10: Native Applications Modal (2:50 - 3:10)
    // =========================================================================
    console.log('>>> [Act 10] Native Desktop & Mobile App Downloads Modal...');
    await page.goto(`${BASE_URL}/teacher/dashboard`, { waitUntil: 'domcontentloaded' });
    await sleep(1800);

    const appModalBtn = await page.$('button:has-text("Desktop & Mobile App")');
    if (appModalBtn) {
      await appModalBtn.click();
      await sleep(3000);

      // Switch to macOS tab
      const macTab = await page.$('button:has-text("macOS")');
      if (macTab) {
        await macTab.click();
        await sleep(2000);
      }

      // Switch to Android tab
      const androidTab = await page.$('button:has-text("Android")');
      if (androidTab) {
        await androidTab.click();
        await sleep(2200);
        await smoothScrollElement(page, '[role="dialog"]', 300, 1000);
        await sleep(2000);
      }

      // Switch to iOS tab
      const iosTab = await page.$('button:has-text("iOS")');
      if (iosTab) {
        await iosTab.click();
        await sleep(2000);
      }

      // Close modal
      const closeAppModal = await page.$('[role="dialog"] button[aria-label="Close"], [role="dialog"] button:has-text("Close")');
      if (closeAppModal) await closeAppModal.click();
      await sleep(1500);
    }

    // =========================================================================
    // ACT 11: Student Sign-in & Student Dashboard (3:10 - 3:28)
    // =========================================================================
    console.log('>>> [Act 11] Student Sign-In & Dashboard Portal...');
    await clearAuth(page, context);

    // Show student login form
    await page.goto(`${BASE_URL}/login/student`, { waitUntil: 'domcontentloaded' });
    await sleep(1800);
    await typeRealistic(page, '#email, input[type="email"]', 'afzalsiddappagari@gmail.com', 30);
    await sleep(500);
    await typeRealistic(page, '#password, input[type="password"]', 'Password@123', 30);
    await sleep(800);

    // Inject verified student session
    await injectAuth(page, context, STUDENT_USER, studentToken);
    await page.goto(`${BASE_URL}/student/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 10000 });
    await sleep(3000);

    // Smooth scroll in student dashboard (sidebar stays fixed, right part scrolls!)
    await smoothScrollElement(page, 'main', 400, 1200);
    await sleep(2200);
    await smoothScrollElement(page, 'main', -400, 1000);
    await sleep(1500);

    // =========================================================================
    // ACT 12: Student Offline Draft Editor & Submission (3:28 - 3:45)
    // =========================================================================
    console.log('>>> [Act 12] Student Offline Draft Editor & Assignment Submission...');
    await page.goto(`${BASE_URL}/student/assignments`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 10000 });
    await sleep(2500);

    const firstAssignmentLink = await page.$('a[href*="/student/assignments/"]');
    if (firstAssignmentLink) {
      await firstAssignmentLink.click();
      await page.waitForSelector('h1, textarea', { timeout: 10000 });
      await sleep(2500);

      const answerInput = await page.$('textarea');
      if (answerInput) {
        console.log('  Typing assignment answer in markdown editor...');
        await typeRealistic(page, 'textarea', '\n## Performance Optimization Analysis\nUsing the Second-Chance Clock page replacement algorithm with dirty-bit tracking reduces page faults by 34.2% under high memory pressure.', 25);
        await sleep(2000);

        const saveBtn = await page.$('button:has-text("Save Draft"), button:has-text("Submit")');
        if (saveBtn) {
          await saveBtn.click();
          await sleep(2200);
        }
      }
    }

    // =========================================================================
    // ACT 13: Student Downloads & Recorded Lessons (3:45 - 4:02)
    // =========================================================================
    console.log('>>> [Act 13] Student Downloads & Offline Storage Meter...');
    await page.goto(`${BASE_URL}/student/downloads`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 10000 });
    await sleep(2800);

    await smoothScrollElement(page, 'main', 350, 1000);
    await sleep(2000);

    console.log('  Navigating to Recorded Lessons...');
    await page.goto(`${BASE_URL}/student/recorded-lessons`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 10000 });
    await sleep(2500);
    await smoothScrollElement(page, 'main', 300, 900);
    await sleep(2000);

    // =========================================================================
    // ACT 14: Platform Super-Admin Console (4:02 - 4:20)
    // =========================================================================
    console.log('>>> [Act 14] Platform Super-Admin Console & System Telemetry...');
    await page.goto(`${BASE_URL}/super-admin`, { waitUntil: 'domcontentloaded' });
    await sleep(1200);

    // Wait for either the login form or dashboard to appear
    await page.waitForSelector('#admin-username, h1', { timeout: 15000 });
    const adminUserField = await page.$('#admin-username');
    if (adminUserField) {
      console.log('  Signing in to Super-Admin console...');
      await typeRealistic(page, '#admin-username', 'lanterned2026@', 30);
      await sleep(400);
      await typeRealistic(page, 'input[type="password"]', 'Village@2026', 30);
      await sleep(600);
      const submitAdmin = await page.$('button[type="submit"]');
      if (submitAdmin) await submitAdmin.click();
      await sleep(3500);
    }

    await sleep(3000);
    await smoothScroll(page, 400, 1200);
    await sleep(2500);
    await smoothScroll(page, -400, 1000);
    await sleep(2000);

    // =========================================================================
    // ACT 15: Multilingual Telugu Toggle & Completion (4:20 - 4:32)
    // =========================================================================
    console.log('>>> [Act 15] Multilingual Telugu Toggle & Sign-Out...');
    await injectAuth(page, context, TEACHER_USER, teacherToken);
    await page.goto(`${BASE_URL}/teacher/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 10000 });
    await sleep(2500);

    const langBtn = await page.$('button:has-text("TE"), button:has-text("తెలుగు"), button:has-text("EN")');
    if (langBtn) {
      console.log('  Toggling UI language to Telugu...');
      await langBtn.click();
      await sleep(2500);
      console.log('  Toggling back to English...');
      const langBtnBack = await page.$('button:has-text("TE"), button:has-text("తెలుగు"), button:has-text("EN")');
      if (langBtnBack) await langBtnBack.click();
      await sleep(2000);
    }

    const logoutBtn = await page.$('button[aria-label="Logout"], button[title="Sign out"], button:has-text("Logout"), button:has-text("Sign Out")');
    if (logoutBtn) {
      console.log('  Performing clean sign out...');
      await logoutBtn.click();
      await sleep(1500);
      const confirmLogout = await page.$('button:has-text("Sign Out"), button:has-text("Yes, Sign Out")');
      if (confirmLogout) await confirmLogout.click();
      await sleep(3000);
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`>>> Video Recording completed successfully! Total elapsed: ${elapsed} seconds (${Math.floor(elapsed/60)}m ${elapsed%60}s).`);

    const rawVideoPath = await page.video().path();
    await page.close();
    await context.close();
    await browser.close();

    // Finalize master video naming
    const finalMasterWebm = path.resolve(outputDir, 'LanternED_Complete_Single_Walkthrough.webm');
    if (fs.existsSync(finalMasterWebm)) fs.unlinkSync(finalMasterWebm);
    fs.renameSync(rawVideoPath, finalMasterWebm);
    console.log('Master Walkthrough video saved as:', finalMasterWebm);

    // Copy to artifact directory
    const artifactDir = 'C:\\Users\\Nandhi vardhan reddy\\.gemini\\antigravity\\brain\\b6de3cd7-4f0d-4f07-8d09-9738d0ec2ca0';
    if (fs.existsSync(artifactDir)) {
      const artifactDest = path.join(artifactDir, 'LanternED_Complete_Single_Walkthrough.webm');
      fs.copyFileSync(finalMasterWebm, artifactDest);
      console.log('Copied master video to artifact dir:', artifactDest);
    }
    return;

  } catch (err) {
    console.error('Recording encountered an error:', err);
  } finally {
    try {
      if (page && !page.isClosed()) await page.close();
      if (context) await context.close();
      if (browser) await browser.close();
    } catch {}
  }
}

runMasterWalkthrough().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
