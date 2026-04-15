import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse } from '../../utils/pagination';

const router = Router();
router.use(authenticate);

const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';

// GET /student/download-file - Télécharger un fichier depuis Supabase Storage
router.get('/download-file', async (req, res, next) => {
  try {
    const { url, name } = req.query;
    
    if (!url || typeof url !== 'string') {
      throw new AppError('URL parameter required', 400);
    }

    // Vérifier que l'URL appartient bien à notre bucket
    if (!url.startsWith(`${SUPABASE_URL}/storage/v1/object/submissions/`)) {
      throw new AppError('Invalid file URL', 403);
    }

    // Télécharger le fichier depuis Supabase
    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (!response.ok) {
      throw new AppError('File not found', 404);
    }

    const buffer = await response.arrayBuffer();
    const fileName = name || url.split('/').pop() || 'file';

    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
});

export default router;