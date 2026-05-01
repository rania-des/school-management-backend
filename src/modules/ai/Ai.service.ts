import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../middleware/error.middleware';

// ─── Ollama config (matches front-end) ───────────────────
const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral:7b';

// ─── Types ────────────────────────────────────────────────
export interface PredictInput {
  studentId: string;
  /** Optionally passed from the front-end quiz result */
  quizScore?: number;
  /** 0–10 LLM rubric score (from /api/student/evaluate-answer) */
  oralScore?: number;
  /** Lang hint for the LLM response */
  language?: 'fr' | 'en' | 'ar';
}

export interface PredictOutput {
  prediction:      string;
  recommendations: string[];
  riskLevel:       'low' | 'medium' | 'high';
  averageGrade:    number | null;
  attendanceRate:  number | null;
  strongSubjects?: string[];
  weakSubjects?:   string[];
  trend?:          string;
  nextGoal?:       string;
}

// ─── Helpers ──────────────────────────────────────────────
async function callOllama(prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(OLLAMA_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal:  controller.signal,
      body:    JSON.stringify({
        model:   OLLAMA_MODEL,
        prompt,
        stream:  false,
        options: { temperature: 0.35, num_predict: 800 },
      }),
    });

    if (!response.ok) {
      throw new AppError(`Ollama returned HTTP ${response.status}`, 502);
    }

    const data = await response.json() as { response?: string };
    return data.response || '';
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new AppError('Ollama timeout (30 s). Is `ollama serve` running?', 504);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function safeParseJson<T>(raw: string, fallback: T): T {
  const clean = raw
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  try {
    return JSON.parse(clean) as T;
  } catch {
    return fallback;
  }
}

// ─── Main service ─────────────────────────────────────────
export const aiService = {

  async predict(input: PredictInput): Promise<PredictOutput> {
    const { studentId, quizScore, oralScore, language = 'fr' } = input;

    // ── 1. Fetch grades for this student ──────────────────
    const { data: gradesRaw, error: gradesErr } = await supabaseAdmin
      .from('grades')
      .select('score, max_score, coefficient, created_at, subjects(name)')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (gradesErr) {
      throw new AppError('Failed to fetch student grades', 500);
    }

    const grades = (gradesRaw || []) as Array<{
      score: number;
      max_score: number;
      coefficient: number;
      created_at: string;
      subjects: { name: string } | null;
    }>;

    // Weighted average on 20
    let totalWeighted = 0;
    let totalWeight   = 0;
    for (const g of grades) {
      const normalized = (g.score / (g.max_score || 20)) * 20;
      totalWeighted   += normalized * (g.coefficient || 1);
      totalWeight     += (g.coefficient || 1);
    }
    const averageGrade = totalWeight > 0
      ? Math.round((totalWeighted / totalWeight) * 100) / 100
      : null;

    // ── 2. Calculate trend ────────────────────────────────
    const recentGrades = grades.slice(0, 5);
    const olderGrades = grades.slice(5, 15);
    const recentAvg = recentGrades.length > 0
      ? recentGrades.reduce((s, g) => s + (g.score / g.max_score) * 20, 0) / recentGrades.length
      : null;
    const olderAvg = olderGrades.length > 0
      ? olderGrades.reduce((s, g) => s + (g.score / g.max_score) * 20, 0) / olderGrades.length
      : null;
    const trend = recentAvg && olderAvg
      ? recentAvg > olderAvg ? 'en hausse 📈' : recentAvg < olderAvg ? 'en baisse 📉' : 'stable ➡️'
      : 'non déterminée';

    // ── 3. Identify strong/weak subjects ─────────────────
    const subjectAverages = new Map<string, number[]>();
    for (const g of grades) {
      const subName = g.subjects?.name || 'Matière';
      const normalized = (g.score / (g.max_score || 20)) * 20;
      if (!subjectAverages.has(subName)) subjectAverages.set(subName, []);
      subjectAverages.get(subName)!.push(normalized);
    }
    
    const strongSubjects: string[] = [];
    const weakSubjects: string[] = [];
    for (const [subject, scores] of subjectAverages.entries()) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (avg >= 14) strongSubjects.push(subject);
      if (avg < 10) weakSubjects.push(subject);
    }

    // ── 4. Fetch attendance ───────────────────────────────
    const { data: attendanceRaw } = await supabaseAdmin
      .from('attendance')
      .select('status')
      .eq('student_id', studentId)
      .limit(100);

    const attendance    = (attendanceRaw || []) as Array<{ status: string }>;
    const totalSessions = attendance.length;
    const presentCount  = attendance.filter(
      (a) => a.status === 'present' || a.status === 'late'
    ).length;
    const attendanceRate = totalSessions > 0
      ? Math.round((presentCount / totalSessions) * 100)
      : null;

    // ── 5. Determine risk level heuristically ─────────────
    let riskScore = 0;
    if (averageGrade !== null) {
      if (averageGrade < 8)  riskScore += 3;
      else if (averageGrade < 10) riskScore += 2;
      else if (averageGrade < 12) riskScore += 1;
    }
    if (attendanceRate !== null) {
      if (attendanceRate < 70)  riskScore += 3;
      else if (attendanceRate < 85) riskScore += 1;
    }
    if (quizScore !== undefined) {
      if (quizScore < 2) riskScore += 2;
      else if (quizScore < 3) riskScore += 1;
    }
    if (oralScore !== undefined) {
      if (oralScore < 4) riskScore += 2;
      else if (oralScore < 6) riskScore += 1;
    }

    const riskLevel: 'low' | 'medium' | 'high' =
      riskScore >= 5 ? 'high' : riskScore >= 2 ? 'medium' : 'low';

    // ── 6. Build LLM prompt ───────────────────────────────
    const gradesSummary = grades
      .slice(0, 10)
      .map((g) => `• ${g.subjects?.name || 'Matière'}: ${g.score}/${g.max_score || 20}`)
      .join('\n');

    const langInstructions: Record<string, string> = {
      fr: `Tu es un conseiller pédagogique expert. Analyse le profil scolaire ci-dessous et génère une prédiction de performance personnalisée.

Données de l'élève :
- Moyenne générale : ${averageGrade !== null ? averageGrade + '/20' : 'Non disponible'}
- Tendance : ${trend}
- Taux de présence : ${attendanceRate !== null ? attendanceRate + '%' : 'Non disponible'}
${quizScore !== undefined ? `- Score quiz IA : ${quizScore}/5` : ''}
${oralScore !== undefined ? `- Score oral LLM : ${oralScore}/10` : ''}
- Niveau de risque estimé : ${riskLevel === 'high' ? 'Élevé' : riskLevel === 'medium' ? 'Moyen' : 'Faible'}
- Dernières notes :
${gradesSummary || '(Aucune note disponible)'}

Réponds UNIQUEMENT en JSON valide, sans texte autour :
{"prediction":"Prédiction en 2-3 phrases.","recommendations":["conseil 1","conseil 2","conseil 3"],"strongSubjects":["matière forte 1"],"weakSubjects":["matière faible 1"],"nextGoal":"Objectif concret pour le prochain trimestre."}`,

      en: `You are an expert academic advisor. Analyze the student profile below and generate a personalized performance prediction.

Student data:
- Overall average: ${averageGrade !== null ? averageGrade + '/20' : 'N/A'}
- Trend: ${trend === 'en hausse 📈' ? 'upward 📈' : trend === 'en baisse 📉' ? 'downward 📉' : 'stable ➡️'}
- Attendance rate: ${attendanceRate !== null ? attendanceRate + '%' : 'N/A'}
${quizScore !== undefined ? `- AI quiz score: ${quizScore}/5` : ''}
${oralScore !== undefined ? `- LLM oral score: ${oralScore}/10` : ''}
- Estimated risk level: ${riskLevel}
- Recent grades:
${gradesSummary || '(No grades available)'}

Respond ONLY with valid JSON, no markdown:
{"prediction":"2-3 sentence prediction.","recommendations":["tip 1","tip 2","tip 3"],"strongSubjects":["strong subject 1"],"weakSubjects":["weak subject 1"],"nextGoal":"Concrete goal for next term."}`,

      ar: `أنت مستشار أكاديمي خبير. حلل الملف الدراسي أدناه وأنشئ توقعاً شخصياً للأداء.

بيانات الطالب:
- المعدل العام: ${averageGrade !== null ? averageGrade + '/20' : 'غير متاح'}
- الاتجاه: ${trend === 'en hausse 📈' ? 'صاعد' : trend === 'en baisse 📉' ? 'هابط' : 'مستقر'}
- نسبة الحضور: ${attendanceRate !== null ? attendanceRate + '%' : 'غير متاحة'}
${quizScore !== undefined ? `- درجة الاختبار: ${quizScore}/5` : ''}
${oralScore !== undefined ? `- الدرجة الشفهية: ${oralScore}/10` : ''}
- مستوى الخطر: ${riskLevel}

أجب بـ JSON صالح فقط، بدون markdown:
{"prediction":"توقع في 2-3 جمل.","recommendations":["نصيحة 1","نصيحة 2","نصيحة 3"],"strongSubjects":["مادة قوية"],"weakSubjects":["مادة ضعيفة"],"nextGoal":"هدف ملموس للفصل القادم"}`,
    };

    const prompt = langInstructions[language] || langInstructions.fr;

    // ── 7. Call Ollama ────────────────────────────────────
    const raw     = await callOllama(prompt);
    const llmData = safeParseJson<{ 
      prediction: string; 
      recommendations: string[];
      strongSubjects: string[];
      weakSubjects: string[];
      nextGoal: string;
    }>(
      raw,
      {
        prediction: language === 'fr'
          ? 'Analyse disponible uniquement si Ollama est en ligne.'
          : 'Analysis available only if Ollama is running.',
        recommendations: [],
        strongSubjects: strongSubjects,
        weakSubjects: weakSubjects,
        nextGoal: language === 'fr' ? 'Améliorer sa moyenne générale de 2 points' : 'Improve overall average by 2 points',
      }
    );

    return {
      prediction:      llmData.prediction      || '',
      recommendations: llmData.recommendations || [],
      riskLevel,
      averageGrade,
      attendanceRate,
      strongSubjects:  llmData.strongSubjects  || strongSubjects,
      weakSubjects:    llmData.weakSubjects    || weakSubjects,
      trend:           trend,
      nextGoal:        llmData.nextGoal        || '',
    };
  },
};