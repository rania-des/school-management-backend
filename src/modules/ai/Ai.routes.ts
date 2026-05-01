import { Router, Request, Response, NextFunction } from 'express';
import { aiController } from './ai.controller';
import { aiService } from './ai.service';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { strictRateLimit } from '../../middleware/rateLimit.middleware';
import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../middleware/error.middleware';

const router = Router();
router.use(authenticate);

// ─────────────────────────────────────────────────────────────────────────────
// Fonctions Ollama locales
// ─────────────────────────────────────────────────────────────────────────────
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral:7b';

async function callOllama(prompt: string, maxTokens = 600, temperature = 0.7): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature, num_predict: maxTokens, top_p: 0.9 },
      }),
    });
    const data = await response.json() as { response?: string };
    return data.response || '';
  } catch { 
    return ''; 
  } finally { 
    clearTimeout(timeout); 
  }
}

function safeParseJson<T>(raw: string, fallback: T): T {
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try { 
    return JSON.parse(clean) as T; 
  } catch { 
    // continue 
  }
  let depth = 0, start = -1;
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === '{') { 
      if (depth === 0) start = i; 
      depth++; 
    } else if (clean[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try { 
          return JSON.parse(clean.slice(start, i + 1)) as T; 
        } catch { 
          break; 
        }
      }
    }
  }
  return fallback;
}

// Liste de livres de secours variés par matière
function getFallbackBooks(subjects: string[], language: string): any[] {
  const subject = subjects[0] || 'general';
  const bookMap: Record<string, {fr: any[], en: any[]}> = {
    'Mathématiques': {
      fr: [
        { title: 'Mathématiques magiques', author: 'Arthur Benjamin', reason: 'Découvre les astuces pour calculer rapidement et aimer les maths' },
        { title: 'Le Théorème du parapluie', author: 'Mickaël Launay', reason: 'Les maths expliquées simplement avec humour' },
        { title: 'L\'équation du bonheur', author: 'Danica McKellar', reason: 'Apprends les maths en t\'amusant avec des exemples concrets' }
      ],
      en: [
        { title: 'The Magic of Math', author: 'Arthur Benjamin', reason: 'Discover tricks to calculate quickly and love math' },
        { title: 'Humble Pi', author: 'Matt Parker', reason: 'Funny and fascinating math mistakes we all make' },
        { title: 'The Math Book', author: 'Clifford Pickover', reason: '250 milestones in mathematical history' }
      ]
    },
    'Français': {
      fr: [
        { title: 'Le Petit Prince', author: 'Antoine de Saint-Exupéry', reason: 'Un classique qui fait réfléchir sur la vie et l\'amitié' },
        { title: 'L\'Étranger', author: 'Albert Camus', reason: 'Un roman philosophique incontournable' },
        { title: 'Les Misérables', author: 'Victor Hugo', reason: 'Une fresque sociale puissante et émouvante' }
      ],
      en: [
        { title: 'The Little Prince', author: 'Antoine de Saint-Exupéry', reason: 'A classic that makes you reflect on life and friendship' },
        { title: 'The Stranger', author: 'Albert Camus', reason: 'An essential philosophical novel' },
        { title: 'Les Misérables', author: 'Victor Hugo', reason: 'A powerful and moving social fresco' }
      ]
    },
    'Sciences': {
      fr: [
        { title: 'Brève histoire du temps', author: 'Stephen Hawking', reason: 'Comprendre l\'univers simplement' },
        { title: 'Le monde quantique', author: 'Julien Bobroff', reason: 'La physique quantique expliquée aux lycéens' },
        { title: 'La vie secrète des arbres', author: 'Peter Wohlleben', reason: 'Découvre l\'intelligence cachée de la nature' }
      ],
      en: [
        { title: 'A Brief History of Time', author: 'Stephen Hawking', reason: 'Understand the universe simply' },
        { title: 'The Hidden Life of Trees', author: 'Peter Wohlleben', reason: 'Discover the hidden intelligence of nature' },
        { title: 'Cosmos', author: 'Carl Sagan', reason: 'The story of cosmic evolution' }
      ]
    },
    'Histoire': {
      fr: [
        { title: 'Sapiens', author: 'Yuval Noah Harari', reason: 'L\'histoire de l\'humanité racontée simplement' },
        { title: 'Le Moyen Âge expliqué aux ados', author: 'Régine Pernoud', reason: 'Les clés pour comprendre cette période fascinante' },
        { title: 'Les grandes civilisations', author: 'Collectif', reason: 'Voyage à travers les époques et les cultures' }
      ],
      en: [
        { title: 'Sapiens', author: 'Yuval Noah Harari', reason: 'A brief history of humankind' },
        { title: 'Guns, Germs, and Steel', author: 'Jared Diamond', reason: 'The fates of human societies' },
        { title: 'The History Book', author: 'DK', reason: 'Big ideas simply explained' }
      ]
    }
  };

  const defaultBooks = language === 'fr'
    ? [
        { title: '1984', author: 'George Orwell', reason: 'Un classique qui te fera réfléchir sur la société' },
        { title: 'Le Meilleur des mondes', author: 'Aldous Huxley', reason: 'Une dystopie captivante sur le futur' },
        { title: 'Fahrenheit 451', author: 'Ray Bradbury', reason: 'Un hommage puissant à la lecture et la liberté' }
      ]
    : [
        { title: '1984', author: 'George Orwell', reason: 'A classic that will make you think about society' },
        { title: 'Brave New World', author: 'Aldous Huxley', reason: 'A captivating dystopia about the future' },
        { title: 'Fahrenheit 451', author: 'Ray Bradbury', reason: 'A powerful tribute to reading and freedom' }
      ];

  const matched = bookMap[subject];
  if (matched) {
    return language === 'fr' ? matched.fr : matched.en;
  }
  return defaultBooks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/ai/books-recommend
 * 
 * Body (JSON):
 *   language? — "fr" | "en" (default: "fr")
 * 
 * Response 200:
 *   { success: true, data: { books: [{title, author, reason}] } }
 */
router.post('/books-recommend', async (req, res, next) => {
  try {
    const { language = 'fr' } = req.body;
    const studentId = req.user!.id;

    console.log('📚 books-recommend called for student:', studentId);

    // Récupérer les matières de l'étudiant
    const { data: student, error: studentError } = await supabaseAdmin
      .from('students')
      .select('class_id')
      .eq('profile_id', studentId)
      .single();

    if (studentError) {
      console.error('❌ Student fetch error:', studentError);
      throw new AppError('Student not found', 404);
    }

    const { data: slots, error: slotsError } = await supabaseAdmin
      .from('schedule_slots')
      .select('subjects(name)')
      .eq('class_id', student?.class_id || '');

    if (slotsError) {
      console.error('❌ Slots fetch error:', slotsError);
    }

    const subjectsArray = [...new Set((slots || [])
      .map((s: any) => s.subjects?.name).filter(Boolean))];
    
    const subjects = subjectsArray.join(', ');
    const mainSubject = subjectsArray[0] || 'général';

    console.log('📚 Subjects found:', subjects || 'none');

    // Ajouter un timestamp et un seed pour la variabilité
    const seed = Math.floor(Math.random() * 10000);
    const timestamp = Date.now();

    const prompt = language === 'fr'
      ? `[Timestamp: ${timestamp}, Seed: ${seed}] Tu es un bibliothécaire expert. 
L'étudiant étudie ces matières PRINCIPALES : ${subjects || 'matières générales'}.

IMPORTANT - RÈGLES STRICTES :
1. Propose des livres VARIÉS et DIFFÉRENTS à chaque appel
2. Ne répète JAMAIS les mêmes livres que la fois précédente
3. Adapte les livres à la matière principale "${mainSubject}"
4. Choisis des livres adaptés à un lycéen (15-18 ans)

Réponds UNIQUEMENT en JSON valide, sans texte avant ou après, sans backticks :
{"books":[
  {"title":"Titre du livre 1","author":"Auteur","reason":"Pourquoi ce livre est parfait pour cet élève (1 phrase)"},
  {"title":"Titre du livre 2","author":"Auteur","reason":"Pourquoi ce livre est parfait pour cet élève (1 phrase)"},
  {"title":"Titre du livre 3","author":"Auteur","reason":"Pourquoi ce livre est parfait pour cet élève (1 phrase)"}
]}`

      : `[Timestamp: ${timestamp}, Seed: ${seed}] You are an expert librarian.
The student studies these MAIN subjects: ${subjects || 'general subjects'}.

IMPORTANT - STRICT RULES:
1. Propose VARIED and DIFFERENT books each time
2. NEVER repeat the same books as the previous time
3. Adapt books to the main subject "${mainSubject}"
4. Choose books suitable for a high school student (15-18 years old)

Reply ONLY with valid JSON, no text before or after, no backticks:
{"books":[
  {"title":"Book Title 1","author":"Author","reason":"Why this book is perfect for this student (1 sentence)"},
  {"title":"Book Title 2","author":"Author","reason":"Why this book is perfect for this student (1 sentence)"},
  {"title":"Book Title 3","author":"Author","reason":"Why this book is perfect for this student (1 sentence)"}
]}`;

    console.log('📚 Calling Ollama with temperature 0.9...');
    const raw = await callOllama(prompt, 800, 0.9);
    console.log('📚 Ollama raw response length:', raw.length);
    console.log('📚 Ollama raw response preview:', raw.substring(0, 300));

    let result = safeParseJson(raw, { books: [] });
    
    // Si Ollama n'a pas retourné de livres valides, utiliser les livres de secours
    if (!result.books || result.books.length === 0) {
      console.log('📚 Using fallback books');
      result = { books: getFallbackBooks(subjectsArray, language) };
    }

    // Limiter à 3 livres
    if (result.books.length > 3) {
      result.books = result.books.slice(0, 3);
    }

    console.log('📚 Final result:', JSON.stringify(result, null, 2));

    return res.json({ success: true, data: result });
  } catch (err) { 
    console.error('❌ books-recommend error:', err);
    return next(err); 
  }
});

/**
 * POST /api/v1/ai/predict
 */
router.post('/predict', strictRateLimit, (req, res, next) => aiController.predict(req, res, next));

/**
 * POST /api/v1/ai/chat
 */
router.post('/chat', strictRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userMessage, language = 'fr', history = [] } = req.body;
    if (!userMessage) throw new AppError('userMessage requis', 400);

    const historyText = history.slice(-8)
      .map((m: any) => `${m.role === 'user' ? 'Élève' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const systemPrompt = language === 'fr'
      ? `Tu es un assistant scolaire intelligent pour un élève tunisien. Réponds en français de manière claire, pédagogique et encourageante. Sois concis mais utile.`
      : `You are an intelligent school assistant for a Tunisian student. Respond in English clearly, pedagogically and encouragingly.`;

    const prompt = `${systemPrompt}\n\nHistorique:\n${historyText}\n\nÉlève: ${userMessage}\nAssistant:`;

    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, options: { temperature: 0.7, num_predict: 800 } }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) throw new AppError(`Ollama HTTP ${response.status}`, 502);
    const data = await response.json() as { response?: string };

    return res.json({ success: true, data: { prediction: data.response || '' } });
  } catch (err: any) {
    return next(err);
  }
});

/**
 * GET /api/v1/ai/teacher/students/predictions
 */
router.get(
  '/teacher/students/predictions',
  authorize('teacher', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { classId, academicYearId, language = 'fr' } = req.query as Record<string, string>;
      
      if (!classId) throw new AppError('classId is required', 400);

      const { data: students, error } = await supabaseAdmin
        .from('students')
        .select('id, student_number, profiles:profile_id(first_name, last_name, avatar_url)')
        .eq('class_id', classId);

      if (error) throw new AppError('Failed to fetch students', 500);
      if (!students || students.length === 0) {
        return res.json({ success: true, data: [] });
      }

      const settled = await Promise.allSettled(
        students.map(async (s: any) => {
          const profile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;

          const result = await aiService.predict({
            studentId: s.id,
            language: (language as 'fr' | 'en' | 'ar') || 'fr',
          });

          return {
            studentId:       s.id,
            studentNumber:   s.student_number,
            firstName:       profile?.first_name  ?? '',
            lastName:        profile?.last_name   ?? '',
            avatarUrl:       profile?.avatar_url  ?? null,
            averageGrade:    result.averageGrade,
            attendanceRate:  result.attendanceRate,
            riskLevel:       result.riskLevel,
            prediction:      result.prediction,
            recommendations: result.recommendations,
          };
        })
      );

      const results = settled.map((r, i) => {
        if (r.status === 'fulfilled') return r.value;

        const s = students[i] as any;
        const profile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
        return {
          studentId:       s.id,
          studentNumber:   s.student_number,
          firstName:       profile?.first_name ?? '',
          lastName:        profile?.last_name  ?? '',
          avatarUrl:       profile?.avatar_url ?? null,
          averageGrade:    null,
          attendanceRate:  null,
          riskLevel:       'unknown' as const,
          prediction:      'Prédiction indisponible (Ollama hors ligne ou données manquantes).',
          recommendations: [],
          error:           (r.reason as Error)?.message ?? 'Unknown error',
        };
      });

      const order: Record<string, number> = { high: 0, medium: 1, low: 2, unknown: 3 };
      results.sort((a, b) => (order[a.riskLevel] ?? 3) - (order[b.riskLevel] ?? 3));

      return res.json({ success: true, data: results });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;