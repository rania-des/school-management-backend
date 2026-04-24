import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth.middleware';
import { strictRateLimit } from '../../middleware/rateLimit.middleware';

const router = Router();
const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 20 * 1024 * 1024 } 
});

router.post('/extract', authenticate, strictRateLimit, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(req.file.buffer) });
    const pdfDoc = await loadingTask.promise;
    
    let fullText = '';
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }

    if (!fullText.trim()) {
      return res.status(422).json({ error: 'Aucun texte trouvé dans ce PDF' });
    }

    return res.json({ text: fullText.trim(), pages: pdfDoc.numPages });
  } catch (err: any) {
    console.error('❌ PDF extract error:', err.message);
    return res.status(500).json({ error: 'Impossible de lire le PDF', detail: err.message });
  }
});

export default router;