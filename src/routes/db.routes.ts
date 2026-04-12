/**
 * /api/v1/db/* — Proxy sécurisé vers Supabase REST
 *
 * Remplace tous les appels supabaseFetch() du frontend.
 * Le frontend appelle : apiFetch('students?profile_id=eq.xxx&select=id')
 * Ce proxy appelle  : Supabase REST avec la service_role key côté serveur
 *
 * Avantages :
 * - Les clés Supabase ne sont JAMAIS exposées au navigateur
 * - Toutes les requêtes passent par Railway (authentifié)
 * - Le frontend n'a plus besoin de VITE_SUPABASE_URL ni VITE_SUPABASE_ANON_KEY
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Toutes les routes DB nécessitent d'être authentifié
router.use(authenticate);

// GET /api/v1/db/:table?...supabase_params
router.get('/:table', async (req: Request, res: Response) => {
  try {
    const table = req.params.table;
    const query = new URLSearchParams(req.query as Record<string, string>).toString();
    const url = `${SUPABASE_URL}/rest/v1/${table}${query ? '?' + query : ''}`;

    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    return res.json(data);
  } catch (err) {
    console.error('DB proxy error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/v1/db/:table
router.post('/:table', async (req: Request, res: Response) => {
  try {
    const table = req.params.table;
    const url = `${SUPABASE_URL}/rest/v1/${table}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    return res.status(201).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/v1/db/:table?id=eq.xxx
router.patch('/:table', async (req: Request, res: Response) => {
  try {
    const table = req.params.table;
    const query = new URLSearchParams(req.query as Record<string, string>).toString();
    const url = `${SUPABASE_URL}/rest/v1/${table}${query ? '?' + query : ''}`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/v1/db/:table?id=eq.xxx
router.delete('/:table', async (req: Request, res: Response) => {
  try {
    const table = req.params.table;
    const query = new URLSearchParams(req.query as Record<string, string>).toString();
    const url = `${SUPABASE_URL}/rest/v1/${table}${query ? '?' + query : ''}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const data = await response.json();
      return res.status(response.status).json(data);
    }
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;