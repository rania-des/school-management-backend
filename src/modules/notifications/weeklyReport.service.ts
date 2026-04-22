// src/modules/notifications/weeklyReport.service.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cron hebdomadaire (dimanche 20h00) → génère un email narratif IA par parent
// Utilise : node-cron  |  utils/email.ts  |  Ollama (mistral)
// ─────────────────────────────────────────────────────────────────────────────

import cron from 'node-cron';
import { supabaseAdmin } from '../../config/supabase';
import { sendWeeklyParentReport } from '../../utils/email';

// ── Types internes ────────────────────────────────────────────────────────────

interface ParentRow {
  id: string;
  profile_id: string;
  preferred_language?: string | null;
  profiles: {
    first_name: string;
    last_name: string;
    email: string;
  } | null;
}

interface StudentRow {
  id: string;
  student_number: string;
  profiles: {
    first_name: string;
    last_name: string;
  } | null;
  classes: {
    name: string;
  } | null;
}

interface GradeRow {
  score: number;
  max_score: number;
  coefficient: number;
  title: string;
  grade_date: string;
  subjects: { name: string } | null;
}

interface AttendanceRow {
  status: 'present' | 'absent' | 'late';
  date: string;
}

interface AssignmentRow {
  title: string;
  due_date: string;
  submitted: boolean;
  subjects: { name: string } | null;
}

interface StudentWeekData {
  student: StudentRow;
  grades: GradeRow[];
  absences: AttendanceRow[];
  assignments: AssignmentRow[];
}

// ── Appel LLM (Ollama - mistral) ──────────────────────────────────────────────

async function generateNarrative(
  parentName: string,
  studentName: string,
  weekData: StudentWeekData,
  language: 'fr' | 'ar' | 'en'
): Promise<string> {
  const { grades, absences, assignments } = weekData;

  const gradesSummary = grades.length
    ? grades
        .map(
          (g) =>
            `${g.subjects?.name ?? 'Matière'} : ${g.score}/${g.max_score ?? 20} (${g.title})`
        )
        .join('\n')
    : language === 'fr'
    ? 'Aucune note cette semaine.'
    : language === 'ar'
    ? 'لا توجد درجات هذا الأسبوع.'
    : 'No grades this week.';

  const absencesSummary = absences.length
    ? absences.map((a) => `${a.date} — ${a.status}`).join('\n')
    : language === 'fr'
    ? 'Aucune absence.'
    : language === 'ar'
    ? 'لا غياب.'
    : 'No absences.';

  const assignmentsSummary = assignments.length
    ? assignments
        .map(
          (a) =>
            `${a.subjects?.name ?? 'Matière'} — "${a.title}" (rendu: ${
              a.submitted ? '✅' : '❌'
            }, échéance: ${a.due_date})`
        )
        .join('\n')
    : language === 'fr'
    ? 'Aucun devoir cette semaine.'
    : language === 'ar'
    ? 'لا واجبات هذا الأسبوع.'
    : 'No assignments this week.';

  const prompts: Record<'fr' | 'ar' | 'en', string> = {
    fr: `Tu es un assistant scolaire bienveillant. Rédige un email narratif chaleureux et personnalisé pour le parent "${parentName}" concernant la semaine scolaire de son enfant "${studentName}". 
Voici les données :
NOTES :
${gradesSummary}

ABSENCES / RETARDS :
${absencesSummary}

DEVOIRS :
${assignmentsSummary}

Rédige un texte fluide en 3-4 paragraphes. Commence par un résumé positif, puis aborde les points d'attention si nécessaire, et termine par un encouragement. Écris uniquement le corps du texte, sans objet ni salutation finale.`,

    en: `You are a caring school assistant. Write a warm, personalized narrative email for the parent "${parentName}" about their child "${studentName}"'s school week.
Data:
GRADES:
${gradesSummary}

ABSENCES / LATE:
${absencesSummary}

ASSIGNMENTS:
${assignmentsSummary}

Write a flowing 3-4 paragraph text. Start with a positive summary, address any concerns if needed, and end with encouragement. Write only the body text, no subject line or closing.`,

    ar: `أنت مساعد مدرسي لطيف. اكتب بريداً إلكترونياً سردياً دافئاً وشخصياً للوالد/الوالدة "${parentName}" حول أسبوع ابنه/ابنتهم "${studentName}" الدراسي.
البيانات:
الدرجات:
${gradesSummary}

الغياب / التأخر:
${absencesSummary}

الواجبات:
${assignmentsSummary}

اكتب نصاً متدفقاً من 3-4 فقرات. ابدأ بملخص إيجابي، ثم تناول نقاط الاهتمام إن وجدت، وانتهِ بتشجيع. اكتب نص الجسم فقط بدون سطر الموضوع أو الخاتمة.`,
  };

  const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
  const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'mistral';

  try {
    console.log(`🤖 [WeeklyReport] Génération narrative via Ollama (${OLLAMA_MODEL})...`);

    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: prompts[language],
        stream: false,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('❌ Ollama API error:', err);
      throw new Error(`Ollama HTTP ${response.status}`);
    }

    const data = (await response.json()) as { response: string };

    return data.response?.trim() || 'Résumé indisponible.';
  } catch (error) {
    console.error('❌ LLM narrative generation failed:', error);
    // Fallback texte simple si Ollama ne répond pas
    return language === 'fr'
      ? `Bonjour ${parentName},\n\nVoici le résumé de la semaine de ${studentName}.\n\nNotes : ${gradesSummary}\nAbsences : ${absencesSummary}\nDevoirs : ${assignmentsSummary}\n\nBonne semaine !`
      : language === 'ar'
      ? `مرحباً ${parentName},\n\nإليك ملخص أسبوع ${studentName}.\n\nالدرجات: ${gradesSummary}\nالغياب: ${absencesSummary}\nالواجبات: ${assignmentsSummary}\n\nأسبوع سعيد!`
      : `Dear ${parentName},\n\nHere is ${studentName}'s weekly summary.\n\nGrades: ${gradesSummary}\nAbsences: ${absencesSummary}\nAssignments: ${assignmentsSummary}\n\nHave a great week!`;
  }
}

// ── Collecte des données de la semaine ────────────────────────────────────────

function getWeekRange(): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=dimanche
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  };
}

async function fetchStudentWeekData(
  studentId: string,
  weekStart: string,
  weekEnd: string
): Promise<StudentWeekData> {
  // Student info
  const { data: student } = await supabaseAdmin
    .from('students')
    .select('id, student_number, profiles:profile_id(first_name, last_name), classes:class_id(name)')
    .eq('id', studentId)
    .single();

  // Grades cette semaine
  const { data: grades } = await supabaseAdmin
    .from('grades')
    .select('score, max_score, coefficient, title, grade_date, subjects:subject_id(name)')
    .eq('student_id', studentId)
    .gte('grade_date', weekStart)
    .lte('grade_date', weekEnd);

  // Absences / retards cette semaine
  const { data: absences } = await supabaseAdmin
    .from('attendance')
    .select('status, date')
    .eq('student_id', studentId)
    .in('status', ['absent', 'late'])
    .gte('date', weekStart)
    .lte('date', weekEnd);

  // Devoirs dont l'échéance est cette semaine
  const { data: assignments } = await supabaseAdmin
    .from('assignments')
    .select('title, due_date, subjects:subject_id(name)')
    .eq('class_id', (student as any)?.classes?.id ?? '')
    .gte('due_date', weekStart)
    .lte('due_date', weekEnd);

  // Soumissions pour savoir si rendu
  const assignmentIds = ((assignments as any[]) || []).map((a: any) => a.id).filter(Boolean);
  let submittedIds: Set<string> = new Set();

  if (assignmentIds.length > 0) {
    const { data: submissions } = await supabaseAdmin
      .from('assignment_submissions')
      .select('assignment_id')
      .eq('student_id', studentId)
      .in('assignment_id', assignmentIds);
    submittedIds = new Set(
      ((submissions as any[]) || []).map((s: any) => s.assignment_id)
    );
  }

  const assignmentsWithStatus: AssignmentRow[] = ((assignments as any[]) || []).map(
    (a: any) => ({
      title: a.title,
      due_date: a.due_date,
      submitted: submittedIds.has(a.id),
      subjects: a.subjects,
    })
  );

  return {
    student: student as any,
    grades: (grades as any[]) || [],
    absences: (absences as any[]) || [],
    assignments: assignmentsWithStatus,
  };
}

// ── Job principal ─────────────────────────────────────────────────────────────

export async function runWeeklyReportJob(): Promise<void> {
  console.log('📬 [WeeklyReport] Démarrage du job dimanche soir…');

  const { start: weekStart, end: weekEnd } = getWeekRange();
  console.log(`📅 Semaine couverte : ${weekStart} → ${weekEnd}`);

  // 1. Récupérer tous les parents avec email + langue préférée
  const { data: parents, error: parentsErr } = await supabaseAdmin
    .from('parents')
    .select(
      'id, profile_id, preferred_language, profiles:profile_id(first_name, last_name, email)'
    );

  if (parentsErr || !parents || parents.length === 0) {
    console.warn('⚠️ [WeeklyReport] Aucun parent trouvé ou erreur:', parentsErr?.message);
    return;
  }

  console.log(`👨‍👩 [WeeklyReport] ${parents.length} parents à traiter`);

  for (const parent of parents as ParentRow[]) {
    const profile = parent.profiles;
    if (!profile?.email) {
      console.warn(`⚠️ [WeeklyReport] Parent ${parent.id} sans email, ignoré.`);
      continue;
    }

    const parentName = `${profile.first_name} ${profile.last_name}`;
    const lang = (parent.preferred_language ?? 'fr') as 'fr' | 'ar' | 'en';

    // 2. Récupérer les enfants de ce parent
    const { data: links } = await supabaseAdmin
      .from('parent_student')
      .select('student_id')
      .eq('parent_id', parent.id);

    if (!links || links.length === 0) continue;

    const studentIds = links.map((l: any) => l.student_id);
    const allWeekData: StudentWeekData[] = [];

    for (const studentId of studentIds) {
      try {
        const weekData = await fetchStudentWeekData(studentId, weekStart, weekEnd);
        if (weekData.student) allWeekData.push(weekData);
      } catch (err) {
        console.error(`❌ [WeeklyReport] Erreur données étudiant ${studentId}:`, err);
      }
    }

    if (allWeekData.length === 0) continue;

    // 3. Générer le narratif IA pour chaque enfant
    const narratives: Array<{ studentName: string; narrative: string; data: StudentWeekData }> = [];

    for (const wd of allWeekData) {
      const studentName = wd.student.profiles
        ? `${wd.student.profiles.first_name} ${wd.student.profiles.last_name}`
        : wd.student.student_number;

      try {
        const narrative = await generateNarrative(parentName, studentName, wd, lang);
        narratives.push({ studentName, narrative, data: wd });
      } catch (err) {
        console.error(`❌ [WeeklyReport] Erreur LLM pour ${studentName}:`, err);
      }
    }

    if (narratives.length === 0) continue;

    // 4. Envoyer l'email
    try {
      await sendWeeklyParentReport(
        profile.email,
        parentName,
        narratives,
        weekStart,
        weekEnd,
        lang
      );
      console.log(`✅ [WeeklyReport] Email envoyé à ${profile.email}`);
    } catch (err) {
      console.error(`❌ [WeeklyReport] Échec envoi email à ${profile.email}:`, err);
    }

    // Petite pause pour ne pas surcharger Ollama
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log('✅ [WeeklyReport] Job terminé.');
}

// ── Enregistrement du cron ────────────────────────────────────────────────────

export function registerWeeklyReportCron(): void {
  // Chaque dimanche à 20h00 (heure serveur)
  cron.schedule('0 20 * * 0', async () => {
    try {
      await runWeeklyReportJob();
    } catch (err) {
      console.error('❌ [WeeklyReport] Erreur critique dans le cron:', err);
    }
  });

  console.log('⏰ [WeeklyReport] Cron enregistré — chaque dimanche à 20h00');
}