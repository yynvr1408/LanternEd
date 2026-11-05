# 📝 Evaluation, Proctored Examinations & Accreditation Standards

> **Technical specifications for LanternED's continuous assessment engine, anti-cheat examination telemetry, interactive rubric grading, and accreditation outcome attainment.**

---

## 1. Proctored Examination Engine & Anti-Cheat Telemetry

LanternED features an examination runner engineered for high-integrity institutional evaluations, supporting low-bandwidth connections without compromising academic honesty.

### 1.1. Anti-Cheat Telemetry Protocol
The examination runner (`StudentExamRunnerPage.tsx`) operates within an isolated browser context governed by three core defensive primitives:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   CLIENT-SIDE PROCTORING DEFENSE TIERS                 │
├──────────────────────┬─────────────────────────────────────────────────┤
│ API / Technique      │ Operational Enforcement                         │
├──────────────────────┼─────────────────────────────────────────────────┤
│ Fullscreen API       │ Forces complete window lockdown on initiation.  │
│                      │ Exiting fullscreen triggers immediate telemetry.│
├──────────────────────┼─────────────────────────────────────────────────┤
│ Page Visibility API  │ Detects tab-switching, window blurring, and OS  │
│                      │ multitasking events instantly.                  │
├──────────────────────┼─────────────────────────────────────────────────┤
│ Keyboard Guard       │ Blocks shortcuts for copy/paste (`Ctrl+C/V`),   │
│                      │ inspect element (`F12`), and print (`Ctrl+P`).  │
├──────────────────────┼─────────────────────────────────────────────────┤
│ Server Clock Sync    │ Countdown timer is driven by server timestamps; │
│                      │ local system clock adjustments have zero impact.│
└──────────────────────┴─────────────────────────────────────────────────┘
```

#### Telemetry Event Schema (`ExamAuditLog`)
Every security violation dispatches an encrypted audit event to the backend:

```json
{
  "attempt_id": "8f3e2b1a-9c4d-4e5f-b6a7-0123456789ab",
  "event_type": "TAB_BLUR",
  "payload": {
    "blur_duration_ms": 3420,
    "user_agent": "Mozilla/5.0 ...",
    "client_timestamp": "2026-11-06T10:30:15.200Z"
  }
}
```

When violations exceed the exam's `max_tab_switches` threshold, the server sets `is_flagged_for_review = True`, alerting faculty proctors upon submission.

### 1.2. Cryptographic Submission Proof (SHA-256 Receipts)
To resolve disputes over missing or incomplete submissions, LanternED produces a cryptographically verifiable SHA-256 receipt for every completed examination sitting:

$$\text{Digest} = \text{SHA256}(\text{attempt\_id} + \text{student\_id} + \text{canonical\_json}(\text{final\_answers}) + \text{submitted\_at})$$

Both the student and institution retain this 64-character hexadecimal digest, providing non-repudiable audit trails for accreditation boards.

---

## 2. Interactive Rubric Scoring & Faculty Evaluation Hub

Grading assignments and subjective exam questions occurs inside the **Faculty Split-Screen Evaluation Hub** (`SplitScreenEvaluatorModal.tsx`), designed to accelerate turnaround times while eliminating evaluation bias.

```
┌───────────────────────────────────────┬───────────────────────────────────────┐
│     STUDENT SUBMISSION ARTIFACT       │     INTERACTIVE RUBRIC SCORING        │
├───────────────────────────────────────┼───────────────────────────────────────┤
│ • Native PDF / Document Viewer        │ [ ] Blind Grading (Mask Student Name) │
│ • Text response formatting            │                                       │
│ • Submission timestamp & revisions    │ Criterion 1: Technical Depth  [ 4/5 ] │
│ • Embedded image / canvas previews    │ Criterion 2: Code Structure   [ 5/5 ] │
│                                       │ Criterion 3: Documentation    [ 3/5 ] │
│                                       ├───────────────────────────────────────┤
│                                       │ Private Staff Notes (Audit Log)       │
│                                       │ Feedback for Student                  │
│                                       │ [ Save Evaluation & Publish ]         │
└───────────────────────────────────────┴───────────────────────────────────────┘
```

### 2.1. Blind (Anonymous) Evaluation
By toggling **Blind Grading**, student identifiers (name, email, avatar, registration number) are replaced with an ephemeral submission hash. This eliminates unconscious bias regarding gender, ethnicity, or prior academic history during grading cycles.

### 2.2. Structured Rubric Model (`RubricCriterion`)
Each criterion comprises customizable performance levels:
- **Exemplary (100%):** Demonstrates mastery and complete conceptual accuracy.
- **Proficient (80%):** Minor syntactical or formatting oversights; core theory sound.
- **Developing (60%):** Fundamental gaps in technical reasoning or incomplete solution.
- **Unsatisfactory (0–40%):** Fails to address primary objective or missing work.

---

## 3. Continuous Internal Assessment (CIA) & Gradebook Engine

LanternED’s `GradebookService` automates university internal assessment calculations according to configurable syllabus weightings.

### 3.1. Calculation Formula & Dynamic Weights
The total cumulative grade is evaluated dynamically using syllabus component coefficients:

$$\text{Cumulative \%} = \sum_{c \in \text{Components}} \left( \frac{\text{StudentScore}_c}{\text{MaxScore}_c} \times \text{Weight}_c \right)$$

Where typical university configurations enforce:
$$\text{Assignments (20\%)} + \text{Quizzes (15\%)} + \text{Midterms (25\%)} + \text{Final Exam (30\%)} + \text{Attendance (10\%)} = 100\%$$

#### Drop-Lowest-Score Policy
To encourage exploratory learning, institutions can configure `drop_lowest_quizzes = N`. The engine ranks all quiz sittings per student and automatically excludes the lowest $N$ scores from the grade calculation.

### 3.2. Automated At-Risk Academic Sentinel
The gradebook engine continually flags at-risk students for early faculty intervention:
- **Attendance Risk:** $\text{attendance\_pct} < 75\%$
- **Performance Risk:** $\text{cumulative\_score} < \text{passing\_grade\_pct}$ (default: $40\%$)

At-risk students are visually tagged on both the **Teacher Course Roster** and the **Student Internal Grade Card**, displaying immediate mentoring alerts before formal exam cutoffs.

---

## 4. Outcome-Based Education (OBE): Bloom's Taxonomy & CO-PO Attainment

LanternED aligns course authoring directly with global engineering and higher education accreditation requirements (such as **ABET**, **NBA**, and **NAAC**).

### 4.1. Bloom's Taxonomy Integration
Every question item in a `QuestionBank` is categorized by cognitive domain level:
1. **L1: Remember** (Factual recall, definitions)
2. **L2: Understand** (Explanations, concept summaries)
3. **L3: Apply** (Algorithm execution, numerical problems)
4. **L4: Analyze** (System debugging, data interpretation)
5. **L5: Evaluate** (Design trade-offs, architecture reviews)
6. **L6: Create** (Synthesizing systems, developing software)

### 4.2. Course Outcomes (CO) & Program Outcomes (PO)
- Faculty tag questions and assignments with specific Course Outcomes (e.g., `CO1: Understand discrete mathematics`, `CO3: Design relational schemas`).
- When students complete exams and rubrics, attainment metrics update in real-time:
  $$\text{CO Attainment \%} = \frac{\sum \text{Marks Obtained on CO Questions}}{\sum \text{Total Marks Allocated to CO}}$$
- The gradebook generates one-click CSV/Excel export bundles containing structured CO-PO attainment matrices ready for direct submission to institutional accreditation review boards.
