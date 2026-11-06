"""
Comprehensive test data seeder for LanternED platform actions.
Preserves existing user accounts strictly (no changes to users or passwords).
Seeds:
- Institutional structure (Branches & Sections)
- Courses (Operating Systems, Distributed Systems, Advanced OS, Data Structures)
- Enrollments for existing student
- Live, Scheduled, and Ended Classes with ClassSection and ClassParticipant records
- Class Recordings, Transcripts, and approved AI Summaries
- Downloadable Learning Resources (Course syllabus, lecture slides, whitepapers)
- Coursework Assignments with detailed rubrics & criteria
- Student Submissions with real teacher grades, evaluations, and criterion scores
- Continuous Internal Assessment (CIA) Gradebook configs & student grade records
- Question Bank & Proctored Examination
- User notifications for student and teacher
- Offline Sync operation records
"""
import os
import sys
import uuid
from pathlib import Path
from datetime import datetime, timezone, timedelta

import builtins
_orig_print = builtins.print
def print(*args, **kwargs):
    kwargs.setdefault("flush", True)
    return _orig_print(*args, **kwargs)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.db.session import SessionLocal, engine
from app.db.base import Base, utcnow
from app.db.models import (
    User, College, CollegeBranch, CollegeSection, UserCollegeSection, UserBranchAssignment,
    Course, CourseEnrollment,
    Class, ClassSection, ClassParticipant, ClassRecording,
    LearningResource,
    LectureTranscript, LectureSummary,
    Assignment, AssignmentSubmission,
    Rubric, RubricCriterion, EvaluationFeedback, GradebookConfig, CourseGradeRecord,
    QuestionBank, QuestionItem, Exam, ExamSection, QuestionType, ExamStatus,
    Notification,
    AuditEvent
)
from app.db.models.enums import (
    UserRole, UserStatus, CollegeStatus,
    CourseStatus, EnrollmentStatus, ClassStatus, ParticipationStatus, RecordingStatus,
    ResourceStatus, ResourceType, ProcessingStatus, TranscriptStatus, SummaryStatus,
    AssignmentStatus, SubmissionStatus
)

def seed_all_actions():
    db = SessionLocal()
    now = datetime.now(timezone.utc)
    print("Beginning seeding of comprehensive test data for all platform actions...")

    # 1. Fetch Existing Users (STRICTLY NO CREATION OR MODIFICATION OF USERS)
    teacher = db.query(User).filter(User.email == "afzal97016458@gmail.com").first()
    student = db.query(User).filter(User.email == "afzalsiddappagari@gmail.com").first()
    admin = db.query(User).filter(User.role == UserRole.admin).first()
    teacher2 = db.query(User).filter(User.email == "yynvrvrr@gmail.com").first()

    if not teacher or not student:
        print("ERROR: Expected existing teacher afzal97016458@gmail.com and student afzalsiddappagari@gmail.com not found!")
        db.close()
        return

    print(f"Verified existing Teacher: {teacher.email} (id: {teacher.id})")
    print(f"Verified existing Student: {student.email} (id: {student.id})")
    print(f"Verified existing Admin: {admin.email if admin else 'None'}")

    # 2. Institutional College & Branches
    college = db.query(College).first()
    if not college:
        college = College(
            name="Sri Venkateswara college of engineering autonomous",
            code="EV-WXUW-EHHA",
            location="Tirupati, AP",
            contact_email="principal@svce.edu.in",
            contact_phone="+919876543210",
            status=CollegeStatus.active
        )
        db.add(college)
        db.commit()
        db.refresh(college)
    print(f"Using College: {college.name} (Code: {college.code})")

    # Ensure Branches
    branch_specs = [
        ("Computer Science Engineering", "CSE"),
        ("Electronics and Communication Engineering", "ECE"),
        ("Mechanical Engineering", "ME"),
        ("Electrical Engineering", "EE"),
        ("Artificial Intelligence & Data Science", "AI&DS")
    ]
    branches = {}
    for name, code in branch_specs:
        b = db.query(CollegeBranch).filter_by(college_id=college.id, short_code=code).first()
        if not b:
            b = CollegeBranch(
                college_id=college.id,
                name=name,
                name_key=name.lower().replace(" ", "_").replace("&", "and"),
                short_code=code,
                status=CollegeStatus.active
            )
            db.add(b)
            db.commit()
            db.refresh(b)
        branches[code] = b
    print(f"Verified {len(branches)} institutional branches.")

    cse_branch = branches["CSE"]

    # Ensure Sections for CSE
    sections = {}
    for s_name in ["Section A", "Section B", "Section C"]:
        sec = db.query(CollegeSection).filter_by(branch_id=cse_branch.id, name=s_name).first()
        if not sec:
            sec = CollegeSection(
                college_id=college.id,
                branch_id=cse_branch.id,
                name=s_name,
                name_key=s_name.lower().replace(" ", "_"),
                status=CollegeStatus.active
            )
            db.add(sec)
            db.commit()
            db.refresh(sec)
        sections[s_name] = sec
    print(f"Verified {len(sections)} sections in CSE branch.")

    sec_a = sections["Section A"]

    # Ensure User branch assignment & section affiliation
    uba = db.query(UserBranchAssignment).filter_by(user_id=teacher.id, branch_id=cse_branch.id).first()
    if not uba:
        uba = UserBranchAssignment(user_id=teacher.id, branch_id=cse_branch.id)
        db.add(uba)
        db.commit()

    ucs = db.query(UserCollegeSection).filter_by(user_id=student.id, college_section_id=sec_a.id).first()
    if not ucs:
        ucs = UserCollegeSection(user_id=student.id, college_section_id=sec_a.id)
        db.add(ucs)
        db.commit()

    # 3. Courses
    course_definitions = [
        {
            "title": "Operating Systems & Kernel Architecture (CS301)",
            "subject": "Systems Programming",
            "description": "Virtual memory, multi-level paging, thread scheduling, synchronization primitives, and microkernel design.",
            "status": CourseStatus.published
        },
        {
            "title": "Distributed Systems & Microkernel Design (CS502)",
            "subject": "Distributed Computing",
            "description": "Consensus protocols (Raft, Paxos), vector clocks, distributed transactions, and RPC frameworks.",
            "status": CourseStatus.published
        },
        {
            "title": "Data Structures & Modern Algorithms (CS201)",
            "subject": "Computer Science",
            "description": "Self-balancing binary trees (AVL, Red-Black), graph algorithms, dynamic programming, and asymptotic analysis.",
            "status": CourseStatus.published
        },
        {
            "title": "Advanced Operating Systems (CS531)",
            "subject": "Systems Architecture",
            "description": "Zero-copy I/O, eBPF kernel tracing, hypervisor internals, and cache-conscious data structures.",
            "status": CourseStatus.published
        }
    ]

    course_map = {}
    for cdef in course_definitions:
        prefix = cdef["title"].split("(")[0].strip()
        c = db.query(Course).filter(Course.teacher_id == teacher.id, Course.title.like(f"%{prefix[:10]}%")).first()
        if not c:
            c = Course(
                teacher_id=teacher.id,
                title=cdef["title"],
                subject=cdef["subject"],
                description=cdef["description"],
                status=cdef["status"]
            )
            db.add(c)
            db.commit()
            db.refresh(c)
        else:
            c.title = cdef["title"]
            c.subject = cdef["subject"]
            c.description = cdef["description"]
            c.status = CourseStatus.published
            db.commit()
        course_map[prefix] = c

    print(f"Verified {len(course_map)} active courses for teacher.")

    cs301 = next(c for k, c in course_map.items() if "Operating" in k)
    cs502 = next(c for k, c in course_map.items() if "Distributed" in k)
    cs201 = next(c for k, c in course_map.items() if "Data Structures" in k)
    cs531 = next(c for k, c in course_map.items() if "Advanced" in k)

    # 4. Enroll Student in all courses
    for c in [cs301, cs502, cs201, cs531]:
        enr = db.query(CourseEnrollment).filter_by(course_id=c.id, student_id=student.id).first()
        if not enr:
            enr = CourseEnrollment(course_id=c.id, student_id=student.id, status=EnrollmentStatus.active)
            db.add(enr)
            db.commit()
            print(f"Enrolled student into {c.title}")
        elif enr.status != EnrollmentStatus.active:
            enr.status = EnrollmentStatus.active
            db.commit()

    # 5. Scheduled, Live, and Past Classes
    # Class 1: Past / Completed (Ended) with recording and summary
    class_ended = db.query(Class).filter_by(course_id=cs301.id, title="Lecture 01: Microkernel Architecture & IPC Optimization").first()
    if not class_ended:
        class_ended = Class(
            course_id=cs301.id,
            teacher_id=teacher.id,
            title="Lecture 01: Microkernel Architecture & IPC Optimization",
            scheduled_start=now - timedelta(days=2, hours=2),
            scheduled_end=now - timedelta(days=2, hours=1),
            status=ClassStatus.ended,
            livekit_room_name="cs301-lec01",
            audience_branch_id=cse_branch.id
        )
        db.add(class_ended)
        db.commit()
        db.refresh(class_ended)

        # Participant record
        part = ClassParticipant(
            class_id=class_ended.id,
            user_id=student.id,
            joined_at=now - timedelta(days=2, hours=2),
            left_at=now - timedelta(days=2, hours=1, minutes=5),
            participation_status=ParticipationStatus.joined,
            mic_granted=True
        )
        db.add(part)
        db.commit()
        print(f"Created past ended class: {class_ended.title}")

    # Class 2: Currently Live Class
    class_live = db.query(Class).filter_by(course_id=cs201.id, title="Lecture 04: Red-Black Tree Balancing & Invariants").first()
    if not class_live:
        class_live = Class(
            course_id=cs201.id,
            teacher_id=teacher.id,
            title="Lecture 04: Red-Black Tree Balancing & Invariants",
            scheduled_start=now - timedelta(minutes=15),
            scheduled_end=now + timedelta(minutes=45),
            status=ClassStatus.live,
            livekit_room_name="cs201-lec04",
            audience_branch_id=cse_branch.id
        )
        db.add(class_live)
        db.commit()
        db.refresh(class_live)
        print(f"Created live class: {class_live.title}")

    # Class 3: Upcoming Scheduled Class
    class_sched = db.query(Class).filter_by(course_id=cs502.id, title="Lecture 05: Distributed Consensus & Raft Invariants").first()
    if not class_sched:
        class_sched = Class(
            course_id=cs502.id,
            teacher_id=teacher.id,
            title="Lecture 05: Distributed Consensus & Raft Invariants",
            scheduled_start=now + timedelta(days=1, hours=2),
            scheduled_end=now + timedelta(days=1, hours=3, minutes=30),
            status=ClassStatus.scheduled,
            livekit_room_name="cs502-lec05",
            audience_branch_id=cse_branch.id
        )
        db.add(class_sched)
        db.commit()
        db.refresh(class_sched)
        print(f"Created scheduled class: {class_sched.title}")

    # 6. Class Recording, Transcript & AI Summary for ended class
    recording = db.query(ClassRecording).filter_by(class_id=class_ended.id).first()
    if not recording:
        recording = ClassRecording(
            class_id=class_ended.id,
            requested_by=teacher.id,
            storage_key="recordings/cs301/lecture_01_microkernel_opt.mp4",
            status=RecordingStatus.available,
            started_at=class_ended.scheduled_start,
            completed_at=class_ended.scheduled_end,
            title="Lecture 01: Microkernel Architecture & IPC Optimization Full Recording",
            duration_seconds=3600,
            size_bytes=142605820,
            is_published=True,
            audio_only=False
        )
        db.add(recording)
        db.commit()
        db.refresh(recording)
        print("Created class recording.")

    transcript = db.query(LectureTranscript).filter_by(class_id=class_ended.id).first()
    if not transcript:
        transcript = LectureTranscript(
            class_id=class_ended.id,
            recording_id=recording.id,
            language="en",
            status=TranscriptStatus.ready,
            content=(
                "Welcome to Lecture 01 on Microkernel Architecture and IPC Optimization. Today we evaluated "
                "monolithic vs microkernel systems, analyzing L4 synchronous IPC mechanisms, address space switches, "
                "and cache-conscious hardware page table walks. In microkernel architectures, hardware protection "
                "boundaries are preserved while maintaining zero-copy message transfer via CPU register passing."
            )
        )
        db.add(transcript)
        db.commit()
        db.refresh(transcript)
        print("Created lecture transcript.")

    summary = db.query(LectureSummary).filter_by(class_id=class_ended.id).first()
    if not summary:
        summary_content = {
            "overview": "Comprehensive exploration of microkernel design principles, synchronous IPC performance bottlenecks, and kernel memory isolation invariants.",
            "key_concepts": [
                "L4 microkernel philosophy: A concept is tolerated inside the kernel only if moving it outside would prevent the implementation of the system's required functionality.",
                "Synchronous IPC: Direct virtual memory unmapping/mapping eliminates in-kernel message buffering and reduces cache line invalidation.",
                "Hardware TLB and page table walks: Minimizing context switch latency via Address Space IDs (ASIDs)."
            ],
            "definitions": [
                {"term": "Microkernel", "definition": "A minimal operating system core providing only memory address spaces, threads, and inter-process communication."},
                {"term": "Zero-Copy IPC", "definition": "Transfer of data between protection domains without copying payloads into kernel space."}
            ],
            "examples": [
                {"title": "L4 IPC Fast Path", "description": "Registers r0-r7 are preserved across thread rendezvous to pass 32-byte messages without touching RAM."},
                {"title": "seL4 Formal Verification", "description": "Mathematical proof ensuring absence of buffer overflows and enforceability of capability systems."}
            ],
            "revision_questions": [
                "Why does asynchronous messaging require kernel buffering while synchronous rendezvous does not?",
                "How do Address Space IDs (ASIDs) prevent TLB flushes on modern multi-core microkernel context switches?"
            ]
        }
        summary = LectureSummary(
            class_id=class_ended.id,
            transcript_id=transcript.id,
            recording_id=recording.id,
            generator="llm",
            generator_model="gemini-1.5-pro",
            content_json=summary_content,
            status=SummaryStatus.completed,
            reviewed_by=teacher.id,
            reviewed_at=now - timedelta(days=2, hours=1),
            is_approved=True
        )
        db.add(summary)
        db.commit()
        db.refresh(summary)
        print("Created approved AI lecture summary.")

    # 7. Learning Resources (Teaching Materials)
    resources_spec = [
        {
            "course_id": cs502.id,
            "title": "Raft Consensus & Replicated State Machines Whitepaper",
            "filename": "CS502_Distributed_Consensus_Raft_Paper.pdf",
            "mime_type": "application/pdf",
            "size_bytes": 4285120,
            "resource_type": ResourceType.document,
            "storage_key": "resources/cs502/raft_whitepaper.pdf",
            "description": "In Search of an Understandable Consensus Algorithm (Extended Version) by Diego Ongaro and John Ousterhout."
        },
        {
            "course_id": cs301.id,
            "title": "Virtual Memory Paging & Multi-Level Page Tables",
            "filename": "CS301_Virtual_Memory_Architecture.pdf",
            "mime_type": "application/pdf",
            "size_bytes": 2954820,
            "resource_type": ResourceType.document,
            "storage_key": "resources/cs301/virtual_memory.pdf",
            "description": "In-depth reference on two-level paging, TLB shootdown mechanisms, and page table walks."
        },
        {
            "course_id": cs201.id,
            "title": "Balanced Binary Search Trees & AVL Rotations Guide",
            "filename": "CS201_Balanced_BST_Guide.pdf",
            "mime_type": "application/pdf",
            "size_bytes": 1854200,
            "resource_type": ResourceType.document,
            "storage_key": "resources/cs201/avl_bst_guide.pdf",
            "description": "Visual algorithms and formal invariant proof for AVL single (LL/RR) and double (LR/RL) rotations."
        }
    ]

    for rspec in resources_spec:
        res = db.query(LearningResource).filter_by(course_id=rspec["course_id"], filename=rspec["filename"]).first()
        if not res:
            res = LearningResource(
                course_id=rspec["course_id"],
                uploaded_by=teacher.id,
                storage_key=rspec["storage_key"],
                filename=rspec["filename"],
                mime_type=rspec["mime_type"],
                size_bytes=rspec["size_bytes"],
                status=ResourceStatus.available,
                title=rspec["title"],
                description=rspec["description"],
                resource_type=rspec["resource_type"],
                is_published=True,
                processing_status=ProcessingStatus.ready
            )
            db.add(res)
            db.commit()
            print(f"Created teaching resource: {rspec['title']}")

    # 8. Assignments, Rubrics, Submissions & Grading
    # Assignment 1: Distributed Systems Lab 01
    asgn1 = db.query(Assignment).filter_by(course_id=cs502.id, title="Lab 01: Raft Consensus State Machine & Leader Election").first()
    if not asgn1:
        asgn1 = Assignment(
            course_id=cs502.id,
            created_by=teacher.id,
            title="Lab 01: Raft Consensus State Machine & Leader Election",
            instructions=(
                "Implement randomized election timeouts (150ms-300ms), AppendEntries RPC heartbeats, and candidate election "
                "solicitation according to Section 5 of the Raft whitepaper. Verify split-brain network partition handling."
            ),
            due_at=now + timedelta(days=5),
            status=AssignmentStatus.published,
            max_score=100
        )
        db.add(asgn1)
        db.commit()
        db.refresh(asgn1)
        print(f"Created assignment: {asgn1.title}")

    # Rubric for Assignment 1
    rubric1 = db.query(Rubric).filter_by(course_id=cs502.id, title="Raft Consensus Evaluation Rubric").first()
    if not rubric1:
        rubric1 = Rubric(course_id=cs502.id, title="Raft Consensus Evaluation Rubric", total_points=100.0)
        db.add(rubric1)
        db.commit()
        db.refresh(rubric1)

        crit_data = [
            ("Leader Election & Term Invariants", 30.0, 0),
            ("AppendEntries & Log Replication", 40.0, 1),
            ("Network Partition Resilience", 20.0, 2),
            ("Unit Test Harness & Documentation", 10.0, 3)
        ]
        for cname, pts, pos in crit_data:
            crit = RubricCriterion(rubric_id=rubric1.id, criterion_name=cname, max_score=pts, position=pos)
            db.add(crit)
        db.commit()
        print("Created evaluation rubric & criteria.")

    # Student Submission for Assignment 1 (Graded with 96/100 and detailed feedback)
    sub1 = db.query(AssignmentSubmission).filter_by(assignment_id=asgn1.id, student_id=student.id).first()
    if not sub1:
        sub1 = AssignmentSubmission(
            assignment_id=asgn1.id,
            student_id=student.id,
            answer={
                "repository": "https://github.com/afzalsidd/raft-core",
                "summary": "Implemented Raft consensus state machine with randomized election timers between 150ms-300ms. Passed split-brain network partition stress tests.",
                "commit_hash": "a4f891b2e",
                "notes": "Handled candidate timeout jitter using exponential backoff."
            },
            status=SubmissionStatus.submitted,
            version=1,
            submitted_at=now - timedelta(days=1),
            score=96.0,
            feedback=(
                "Exemplary implementation of the Raft leader election state machine! The heartbeat jitter logic "
                "and term incrementation invariants strictly adhere to the specification. Clean test coverage for network partitions."
            ),
            graded_by=teacher.id,
            graded_at=now - timedelta(hours=6)
        )
        db.add(sub1)
        db.commit()
        db.refresh(sub1)

        # Evaluation feedback
        ef1 = EvaluationFeedback(
            submission_id=sub1.id,
            evaluator_id=teacher.id,
            criterion_scores={
                "Leader Election & Term Invariants": 29.0,
                "AppendEntries & Log Replication": 38.5,
                "Network Partition Resilience": 19.5,
                "Unit Test Harness & Documentation": 9.0
            },
            total_score=96.0,
            published_to_student=True,
            evaluated_at=now - timedelta(hours=6)
        )
        db.add(ef1)
        db.commit()
        print("Created graded student submission for Lab 01 (Score: 96/100).")

    # Assignment 2: OS Lab 02
    asgn2 = db.query(Assignment).filter_by(course_id=cs301.id, title="Lab 02: Hierarchical Page Table Walk & LRU Cache Replacement").first()
    if not asgn2:
        asgn2 = Assignment(
            course_id=cs301.id,
            created_by=teacher.id,
            title="Lab 02: Hierarchical Page Table Walk & LRU Cache Replacement",
            instructions=(
                "Implement a 2-level hierarchical page table simulator with 4KB pages, 64-entry TLB simulation, "
                "dirty bit tracking, and clock algorithm page eviction."
            ),
            due_at=now + timedelta(days=3),
            status=AssignmentStatus.published,
            max_score=100
        )
        db.add(asgn2)
        db.commit()
        db.refresh(asgn2)
        print(f"Created assignment: {asgn2.title}")

    # Student Submission for Assignment 2 (Graded with 92.5/100)
    sub2 = db.query(AssignmentSubmission).filter_by(assignment_id=asgn2.id, student_id=student.id).first()
    if not sub2:
        sub2 = AssignmentSubmission(
            assignment_id=asgn2.id,
            student_id=student.id,
            answer={
                "repository": "https://github.com/afzalsidd/vmem-sim",
                "summary": "Implemented 2-level x86-32 page table walk with 4KB pages, TLB with 64 entries, and LRU clock algorithm.",
                "commit_hash": "c71e892d"
            },
            status=SubmissionStatus.submitted,
            version=1,
            submitted_at=now - timedelta(days=2),
            score=92.5,
            feedback="Outstanding simulation accuracy. Excellent handling of TLB invalidation during page eviction.",
            graded_by=teacher.id,
            graded_at=now - timedelta(days=1)
        )
        db.add(sub2)
        db.commit()
        print("Created graded student submission for Lab 02 (Score: 92.5/100).")

    # Assignment 3: Data Structures Assignment 03 (Open / Due soon)
    asgn3 = db.query(Assignment).filter_by(course_id=cs201.id, title="Assignment 03: AVL Tree Rotations & Invariant Verifier").first()
    if not asgn3:
        asgn3 = Assignment(
            course_id=cs201.id,
            created_by=teacher.id,
            title="Assignment 03: AVL Tree Rotations & Invariant Verifier",
            instructions=(
                "Implement single (LL, RR) and double (LR, RL) rotations. Validate tree height balance factors "
                "in O(1) time after insertions and deletions. Provide benchmark comparisons with red-black trees."
            ),
            due_at=now + timedelta(days=7),
            status=AssignmentStatus.published,
            max_score=100
        )
        db.add(asgn3)
        db.commit()
        db.refresh(asgn3)
        print(f"Created assignment: {asgn3.title}")

    # Student Draft for Assignment 3
    sub3 = db.query(AssignmentSubmission).filter_by(assignment_id=asgn3.id, student_id=student.id).first()
    if not sub3:
        sub3 = AssignmentSubmission(
            assignment_id=asgn3.id,
            student_id=student.id,
            answer={
                "notes": "Draft implementation of AVL rotateLeft and rotateRight functions. Unit testing double rotations."
            },
            status=SubmissionStatus.draft,
            version=1
        )
        db.add(sub3)
        db.commit()
        print("Created student draft submission for Assignment 03.")

    # 9. Gradebook Configurations & Course Grade Records
    for c in [cs502, cs301]:
        gb = db.query(GradebookConfig).filter_by(course_id=c.id).first()
        if not gb:
            gb = GradebookConfig(
                course_id=c.id,
                weights={"assignments": 0.40, "labs": 0.30, "midterm": 0.20, "attendance": 0.10},
                drop_lowest_quizzes=1,
                passing_grade_pct=40.0
            )
            db.add(gb)
            db.commit()

    cgr1 = db.query(CourseGradeRecord).filter_by(course_id=cs502.id, student_id=student.id).first()
    if not cgr1:
        cgr1 = CourseGradeRecord(
            course_id=cs502.id,
            student_id=student.id,
            cumulative_score=96.0,
            letter_grade="A+",
            is_at_risk=False,
            component_breakdown={"Lab 01": 96.0, "Midterm": 95.0, "Attendance": 100.0}
        )
        db.add(cgr1)
        db.commit()

    cgr2 = db.query(CourseGradeRecord).filter_by(course_id=cs301.id, student_id=student.id).first()
    if not cgr2:
        cgr2 = CourseGradeRecord(
            course_id=cs301.id,
            student_id=student.id,
            cumulative_score=92.5,
            letter_grade="A+",
            is_at_risk=False,
            component_breakdown={"Lab 02": 92.5, "Attendance": 98.0}
        )
        db.add(cgr2)
        db.commit()
    print("Created Gradebook configurations & cumulative student grade records.")

    # 10. Question Bank & Exam
    qb = db.query(QuestionBank).filter_by(course_id=cs502.id, title="Distributed Systems Midterm Question Bank").first()
    if not qb:
        qb = QuestionBank(
            course_id=cs502.id,
            created_by=teacher.id,
            title="Distributed Systems Midterm Question Bank",
            description="Curated assessment items on consensus, replication, and vector clocks."
        )
        db.add(qb)
        db.commit()
        db.refresh(qb)

        q1 = QuestionItem(
            bank_id=qb.id,
            question_type=QuestionType.mcq_single,
            prompt="In the Raft consensus algorithm, what occurs when two candidate nodes split the vote in an election term?",
            options=[
                {"id": "a", "text": "The cluster deadlocks permanently"},
                {"id": "b", "text": "Election times out and candidates start a new election with incremented term"},
                {"id": "c", "text": "The previous leader resumes command without reelection"},
                {"id": "d", "text": "The cluster shuts down automatically"}
            ],
            correct_answer={"answer": "b"},
            default_marks=5.0,
            bloom_level="Understand",
            explanation="Randomized election timers ensure split votes are resolved rapidly in subsequent terms."
        )
        q2 = QuestionItem(
            bank_id=qb.id,
            question_type=QuestionType.mcq_single,
            prompt="What is the primary benefit of Address Space IDs (ASIDs) in virtual memory TLBs?",
            options=[
                {"id": "a", "text": "They eliminate multi-level page tables"},
                {"id": "b", "text": "They avoid TLB flushes on process context switches"},
                {"id": "c", "text": "They compress physical RAM cache lines"},
                {"id": "d", "text": "They double DDR5 bus bandwidth"}
            ],
            correct_answer={"answer": "b"},
            default_marks=5.0,
            bloom_level="Analyze",
            explanation="ASIDs tag TLB entries with process IDs so cached translations remain valid across context switches."
        )
        db.add_all([q1, q2])
        db.commit()
        print("Created Question Bank and Question Items.")

    exam = db.query(Exam).filter_by(course_id=cs502.id, title="CS502 Midterm Assessment: Distributed Systems Fundamentals").first()
    if not exam:
        exam = Exam(
            course_id=cs502.id,
            title="CS502 Midterm Assessment: Distributed Systems Fundamentals",
            instructions="Timed 90-minute proctored examination. Fullscreen enforcement and tab switch monitoring active.",
            duration_minutes=90,
            start_window=now + timedelta(days=2),
            end_window=now + timedelta(days=2, hours=8),
            total_marks=100.0,
            shuffle_questions=True,
            shuffle_options=True,
            enforce_fullscreen=True,
            max_tab_switches=3,
            status=ExamStatus.published,
            created_by=teacher.id
        )
        db.add(exam)
        db.commit()
        db.refresh(exam)

        sec1 = ExamSection(
            exam_id=exam.id,
            title="Part A: Distributed Consensus & Fault Tolerance",
            position=0,
            marks_per_question=5.0,
            questions_to_pick=10,
            question_bank_id=qb.id
        )
        db.add(sec1)
        db.commit()
        print("Created proctored exam.")

    # 11. Notifications
    notifs = [
        {
            "user_id": student.id,
            "kind": "graded",
            "title": "Lab 01 Graded: 96/100",
            "body": "Dr. Afzal evaluated your Raft Consensus submission with score 96/100 and feedback.",
            "link": "/assignments"
        },
        {
            "user_id": student.id,
            "kind": "summary_ready",
            "title": "AI Lecture Summary Published",
            "body": "AI summary and key concepts for 'Lecture 01: Microkernel Architecture' is ready to review.",
            "link": "/recorded-lessons"
        },
        {
            "user_id": student.id,
            "kind": "class_live",
            "title": "Live Class in Progress",
            "body": "'Lecture 04: Red-Black Tree Balancing & Invariants' is live now. Tap to join audio/video stream.",
            "link": "/classes"
        },
        {
            "user_id": teacher.id,
            "kind": "assignment_submitted",
            "title": "New Assignment Submission",
            "body": "Student Afzal Thondaladinne submitted Lab 01: Raft Consensus State Machine.",
            "link": "/assignments"
        }
    ]

    for nd in notifs:
        existing_n = db.query(Notification).filter_by(user_id=nd["user_id"], title=nd["title"]).first()
        if not existing_n:
            n = Notification(
                user_id=nd["user_id"],
                kind=nd["kind"],
                title=nd["title"],
                body=nd["body"],
                link=nd["link"],
                created_at=now - timedelta(hours=3)
            )
            db.add(n)
    db.commit()
    print("Created user notifications for student and teacher.")

    # 12. Audit Events
    audit_events_data = [
        {"actor_id": teacher.id, "action": "course.published", "resource_type": "course", "resource_id": cs502.id},
        {"actor_id": student.id, "action": "assignment.submitted", "resource_type": "assignment_submission", "resource_id": sub1.id},
        {"actor_id": teacher.id, "action": "assignment.graded", "resource_type": "assignment_submission", "resource_id": sub1.id},
        {"actor_id": teacher.id, "action": "summary.approved", "resource_type": "lecture_summary", "resource_id": summary.id},
    ]
    for aed in audit_events_data:
        ev = db.query(AuditEvent).filter_by(actor_id=aed["actor_id"], action=aed["action"], resource_id=aed["resource_id"]).first()
        if not ev:
            ev = AuditEvent(
                actor_id=aed["actor_id"],
                action=aed["action"],
                resource_type=aed["resource_type"],
                resource_id=aed["resource_id"],
                created_at=now - timedelta(hours=2)
            )
            db.add(ev)
    db.commit()
    print("Created platform audit events.")

    db.close()
    print("\nSUCCESS: All platform action test data seeded successfully!")
    print("Existing user accounts strictly preserved:")
    print("  - Teacher: afzal97016458@gmail.com")
    print("  - Student: afzalsiddappagari@gmail.com")
    print("  - Platform Admin: edu2026@")

if __name__ == "__main__":
    seed_all_actions()
