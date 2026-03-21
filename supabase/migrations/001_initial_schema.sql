-- ============================================================
-- SCHOOL MANAGEMENT PLATFORM - SUPABASE MIGRATION
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('student', 'parent', 'teacher', 'admin');
CREATE TYPE gender AS ENUM ('male', 'female');
CREATE TYPE grade_period AS ENUM ('trimester_1', 'trimester_2', 'trimester_3', 'semester_1', 'semester_2', 'annual');
CREATE TYPE assignment_type AS ENUM ('homework', 'project', 'exam', 'exercise', 'report');
CREATE TYPE submission_status AS ENUM ('pending', 'submitted', 'graded', 'late');
CREATE TYPE notification_type AS ENUM ('grade', 'assignment', 'absence', 'message', 'announcement', 'payment', 'meeting', 'general');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'overdue', 'cancelled');
CREATE TYPE payment_type AS ENUM ('tuition', 'canteen', 'trip', 'activity', 'other');
CREATE TYPE meeting_status AS ENUM ('requested', 'confirmed', 'cancelled', 'completed');
CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late', 'excused');
CREATE TYPE day_of_week AS ENUM ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday');

-- ============================================================
-- CORE TABLES
-- ============================================================

-- Academic years
CREATE TABLE academic_years (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(20) NOT NULL UNIQUE,  -- e.g. "2024-2025"
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Schools / Establishments
CREATE TABLE establishments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  address TEXT,
  phone VARCHAR(20),
  email VARCHAR(255),
  logo_url TEXT,
  website VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Levels (e.g. 1ère année, 2ème année...)
CREATE TABLE levels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Classes (e.g. 1A, 2B, Terminale S...)
CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  level_id UUID REFERENCES levels(id) ON DELETE SET NULL,
  academic_year_id UUID REFERENCES academic_years(id) ON DELETE CASCADE,
  capacity INTEGER DEFAULT 30,
  room VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subjects / Matières
CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(20),
  coefficient DECIMAL(4,2) DEFAULT 1.0,
  color VARCHAR(7) DEFAULT '#3B82F6',  -- hex color
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USERS & PROFILES
-- ============================================================

-- User profiles (extends Supabase Auth users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  gender gender,
  date_of_birth DATE,
  phone VARCHAR(20),
  address TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Students
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  student_number VARCHAR(50) UNIQUE NOT NULL,
  class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  enrollment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  scholarship BOOLEAN DEFAULT false,
  medical_info TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Teachers
CREATE TABLE teachers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  employee_number VARCHAR(50) UNIQUE NOT NULL,
  hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
  specialization VARCHAR(255),
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Parents
CREATE TABLE parents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  occupation VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Parent-Student relationships
CREATE TABLE parent_student (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID REFERENCES parents(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  relationship VARCHAR(50) DEFAULT 'parent',  -- 'mother', 'father', 'guardian'
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(parent_id, student_id)
);

-- Teacher-Subject-Class assignments
CREATE TABLE teacher_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID REFERENCES teachers(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES academic_years(id) ON DELETE CASCADE,
  is_main_teacher BOOLEAN DEFAULT false,  -- class main teacher
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(teacher_id, subject_id, class_id, academic_year_id)
);

-- ============================================================
-- GRADES & ACADEMIC
-- ============================================================

CREATE TABLE grades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES academic_years(id) ON DELETE CASCADE,
  period grade_period NOT NULL,
  score DECIMAL(5,2) NOT NULL CHECK (score >= 0 AND score <= 20),
  max_score DECIMAL(5,2) DEFAULT 20,
  coefficient DECIMAL(4,2) DEFAULT 1.0,
  title VARCHAR(255),
  description TEXT,
  grade_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Teacher comments on students
CREATE TABLE teacher_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID REFERENCES teachers(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES academic_years(id) ON DELETE CASCADE,
  period grade_period NOT NULL,
  comment TEXT NOT NULL,
  is_positive BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SCHEDULE / EMPLOI DU TEMPS
-- ============================================================

CREATE TABLE schedule_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  academic_year_id UUID REFERENCES academic_years(id) ON DELETE CASCADE,
  day_of_week day_of_week NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ASSIGNMENTS / DEVOIRS
-- ============================================================

CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID REFERENCES teachers(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES academic_years(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type assignment_type NOT NULL DEFAULT 'homework',
  due_date TIMESTAMPTZ,
  points DECIMAL(5,2),
  file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Student submissions
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  status submission_status DEFAULT 'pending',
  file_url TEXT,
  text_content TEXT,
  score DECIMAL(5,2),
  feedback TEXT,
  submitted_at TIMESTAMPTZ,
  graded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(assignment_id, student_id)
);

-- ============================================================
-- ATTENDANCE / ABSENCES
-- ============================================================

CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  schedule_slot_id UUID REFERENCES schedule_slots(id) ON DELETE SET NULL,
  teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status attendance_status NOT NULL,
  reason TEXT,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, date, schedule_slot_id)
);

-- ============================================================
-- MESSAGING
-- ============================================================

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject VARCHAR(255),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE conversation_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(conversation_id, profile_id)
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  file_url TEXT,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ANNOUNCEMENTS
-- ============================================================

CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,  -- null = school-wide
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PAYMENTS
-- ============================================================

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  type payment_type NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status payment_status DEFAULT 'pending',
  description TEXT,
  due_date DATE,
  paid_at TIMESTAMPTZ,
  receipt_url TEXT,
  academic_year_id UUID REFERENCES academic_years(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CANTEEN
-- ============================================================

CREATE TABLE canteen_menus (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL UNIQUE,
  starter TEXT,
  main_course TEXT NOT NULL,
  side_dish TEXT,
  dessert TEXT,
  is_vegetarian_option BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MEETINGS / RÉUNIONS
-- ============================================================

CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID REFERENCES teachers(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES parents(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  status meeting_status DEFAULT 'requested',
  requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  duration_minutes INTEGER DEFAULT 30,
  location VARCHAR(255),
  notes TEXT,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_grades_student ON grades(student_id);
CREATE INDEX idx_grades_class ON grades(class_id);
CREATE INDEX idx_grades_period ON grades(period);
CREATE INDEX idx_attendance_student ON attendance(student_id);
CREATE INDEX idx_attendance_date ON attendance(date);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_notifications_recipient ON notifications(recipient_id);
CREATE INDEX idx_notifications_unread ON notifications(recipient_id) WHERE is_read = false;
CREATE INDEX idx_assignments_class ON assignments(class_id);
CREATE INDEX idx_assignments_due ON assignments(due_date);
CREATE INDEX idx_submissions_student ON submissions(student_id);
CREATE INDEX idx_schedule_class ON schedule_slots(class_id);
CREATE INDEX idx_payments_student ON payments(student_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_meetings_teacher ON meetings(teacher_id);
CREATE INDEX idx_meetings_parent ON meetings(parent_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;

-- Helper function: get user role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: get student id from auth
CREATE OR REPLACE FUNCTION get_student_id()
RETURNS UUID AS $$
  SELECT id FROM students WHERE profile_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: get teacher id from auth
CREATE OR REPLACE FUNCTION get_teacher_id()
RETURNS UUID AS $$
  SELECT id FROM teachers WHERE profile_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: get parent id from auth
CREATE OR REPLACE FUNCTION get_parent_id()
RETURNS UUID AS $$
  SELECT id FROM parents WHERE profile_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Profiles: users see own profile; admins see all
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (id = auth.uid() OR get_user_role() IN ('admin', 'teacher'));

CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "profiles_admin_all" ON profiles FOR ALL
  USING (get_user_role() = 'admin');

-- Grades: students see their own; teachers see their class; parents see their children; admin sees all
CREATE POLICY "grades_select_student" ON grades FOR SELECT
  USING (student_id = get_student_id() OR get_user_role() = 'admin' OR
    teacher_id = get_teacher_id() OR
    student_id IN (SELECT s.id FROM students s JOIN parent_student ps ON s.id = ps.student_id WHERE ps.parent_id = get_parent_id())
  );

CREATE POLICY "grades_teacher_manage" ON grades FOR ALL
  USING (teacher_id = get_teacher_id() OR get_user_role() = 'admin');

-- Notifications: users see only their own
CREATE POLICY "notifications_own" ON notifications FOR ALL
  USING (recipient_id = auth.uid());

-- Messages: participants only
CREATE POLICY "messages_participants" ON messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT conversation_id FROM conversation_participants WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "messages_insert_participants" ON messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    conversation_id IN (
      SELECT conversation_id FROM conversation_participants WHERE profile_id = auth.uid()
    )
  );

-- Payments: students/parents see their own; admin manages all
CREATE POLICY "payments_student" ON payments FOR SELECT
  USING (
    student_id = get_student_id() OR
    student_id IN (SELECT s.id FROM students s JOIN parent_student ps ON s.id = ps.student_id WHERE ps.parent_id = get_parent_id()) OR
    get_user_role() = 'admin'
  );

CREATE POLICY "payments_admin_manage" ON payments FOR ALL
  USING (get_user_role() = 'admin');

-- Assignments: class members see their assignments
CREATE POLICY "assignments_select" ON assignments FOR SELECT
  USING (
    get_user_role() = 'admin' OR
    teacher_id = get_teacher_id() OR
    class_id IN (SELECT class_id FROM students WHERE profile_id = auth.uid()) OR
    class_id IN (SELECT s.class_id FROM students s JOIN parent_student ps ON s.id = ps.student_id WHERE ps.parent_id = get_parent_id())
  );

CREATE POLICY "assignments_teacher_manage" ON assignments FOR ALL
  USING (teacher_id = get_teacher_id() OR get_user_role() = 'admin');

-- Attendance: students see own; parents see children; teachers manage; admin all
CREATE POLICY "attendance_select" ON attendance FOR SELECT
  USING (
    student_id = get_student_id() OR
    get_user_role() IN ('admin', 'teacher') OR
    student_id IN (SELECT s.id FROM students s JOIN parent_student ps ON s.id = ps.student_id WHERE ps.parent_id = get_parent_id())
  );

-- Meetings: participants only
CREATE POLICY "meetings_select" ON meetings FOR SELECT
  USING (
    teacher_id = get_teacher_id() OR
    parent_id = get_parent_id() OR
    get_user_role() = 'admin'
  );

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_students_updated_at BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_teachers_updated_at BEFORE UPDATE ON teachers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_grades_updated_at BEFORE UPDATE ON grades FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_assignments_updated_at BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_meetings_updated_at BEFORE UPDATE ON meetings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to calculate student average for a period
CREATE OR REPLACE FUNCTION get_student_average(p_student_id UUID, p_period grade_period, p_academic_year_id UUID)
RETURNS DECIMAL AS $$
  SELECT ROUND(
    SUM(g.score * g.coefficient * s.coefficient) / NULLIF(SUM(g.coefficient * s.coefficient), 0),
    2
  )
  FROM grades g
  JOIN subjects s ON g.subject_id = s.id
  WHERE g.student_id = p_student_id
    AND g.period = p_period
    AND g.academic_year_id = p_academic_year_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Function to get class ranking
CREATE OR REPLACE FUNCTION get_class_ranking(p_class_id UUID, p_period grade_period, p_academic_year_id UUID)
RETURNS TABLE(student_id UUID, average DECIMAL, rank BIGINT) AS $$
  SELECT 
    s.id as student_id,
    get_student_average(s.id, p_period, p_academic_year_id) as average,
    RANK() OVER (ORDER BY get_student_average(s.id, p_period, p_academic_year_id) DESC NULLS LAST) as rank
  FROM students s
  WHERE s.class_id = p_class_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- SEED: initial setup
-- ============================================================

-- Insert default academic year
INSERT INTO academic_years (name, start_date, end_date, is_current)
VALUES ('2024-2025', '2024-09-01', '2025-06-30', true)
ON CONFLICT (name) DO NOTHING;

-- Insert default establishment
INSERT INTO establishments (name, email, phone)
VALUES ('École de Démonstration', 'contact@ecole.tn', '+216 71 000 000')
ON CONFLICT DO NOTHING;
