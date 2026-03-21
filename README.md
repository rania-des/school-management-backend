# 🏫 School Management Platform — Backend API

Backend professionnel pour une plateforme de gestion scolaire avec Supabase.

---

## 🚀 Stack Technique

| Couche | Technologie |
|--------|------------|
| Runtime | Node.js 20+ |
| Framework | Express.js (TypeScript) |
| Base de données | Supabase (PostgreSQL) |
| Auth | Supabase Auth (JWT) |
| Storage | Supabase Storage |
| Email | Resend |
| Validation | Zod |
| Upload | Multer |

---

## 📁 Structure du projet

```
backend/
├── src/
│   ├── config/
│   │   ├── supabase.ts          # Client Supabase (admin + public)
│   │   └── constants.ts         # Constantes globales
│   ├── middleware/
│   │   ├── auth.middleware.ts   # JWT + RBAC
│   │   ├── error.middleware.ts  # Gestion d'erreurs centralisée
│   │   └── rateLimit.middleware.ts
│   ├── utils/
│   │   ├── pagination.ts        # Helpers pagination
│   │   ├── notifications.ts     # Service notifications
│   │   ├── storage.ts           # Supabase Storage
│   │   └── email.ts             # Emails (Resend)
│   ├── modules/
│   │   ├── auth/                # Login, register, JWT refresh
│   │   ├── users/               # Profils, avatars, CRUD admin
│   │   ├── grades/              # Notes, bulletins, commentaires
│   │   ├── schedule/            # Emplois du temps
│   │   ├── assignments/         # Devoirs + soumissions
│   │   ├── attendance/          # Absences et retards
│   │   ├── messages/            # Messagerie avec conversations
│   │   ├── notifications/       # Notifications temps réel
│   │   ├── announcements/       # Annonces école/classe
│   │   ├── payments/            # Paiements et reçus
│   │   ├── canteen/             # Menus cantine
│   │   ├── meetings/            # Réunions parent-prof
│   │   ├── analytics/           # Tableaux de bord
│   │   └── admin/               # Administration système
│   └── app.ts                   # Entry point
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql
```

---

## ⚙️ Installation

```bash
# 1. Cloner et installer
npm install

# 2. Configurer l'environnement
cp .env.example .env
# Remplir les variables Supabase

# 3. Appliquer la migration SQL
# Copier le contenu de supabase/migrations/001_initial_schema.sql
# et l'exécuter dans l'éditeur SQL de Supabase

# 4. Créer les buckets Supabase Storage
# Dans Supabase > Storage, créer: avatars, assignments, submissions, receipts, documents

# 5. Lancer en dev
npm run dev

# 6. Build production
npm run build && npm start
```

---

## 🔑 Variables d'environnement

```env
PORT=3000
NODE_ENV=development

SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

RESEND_API_KEY=re_...
EMAIL_FROM=noreply@yourschool.com

APP_NAME=School Management Platform
FRONTEND_URL=http://localhost:5173
```

---

## 📡 API Endpoints

### Auth
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/v1/auth/login` | Connexion |
| POST | `/api/v1/auth/register` | Inscription |
| POST | `/api/v1/auth/refresh` | Refresh token |
| POST | `/api/v1/auth/logout` | Déconnexion |
| GET | `/api/v1/auth/me` | Profil complet |
| PATCH | `/api/v1/auth/password` | Changer mot de passe |
| POST | `/api/v1/auth/forgot-password` | Mot de passe oublié |

### Notes (Grades)
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/v1/grades` | Liste des notes (par rôle) |
| POST | `/api/v1/grades` | Ajouter une note (enseignant/admin) |
| PATCH | `/api/v1/grades/:id` | Modifier une note |
| DELETE | `/api/v1/grades/:id` | Supprimer une note |
| GET | `/api/v1/grades/bulletin` | Bulletin scolaire complet |
| POST | `/api/v1/grades/comments` | Commentaire pédagogique |

### Emploi du temps
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/v1/schedule` | EDT de la classe courante |
| GET | `/api/v1/schedule/teacher` | EDT de l'enseignant |
| POST | `/api/v1/schedule` | Créer un créneau (admin) |
| PATCH | `/api/v1/schedule/:id` | Modifier un créneau |
| DELETE | `/api/v1/schedule/:id` | Supprimer un créneau |

### Devoirs
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/v1/assignments` | Liste des devoirs |
| POST | `/api/v1/assignments` | Publier un devoir |
| GET | `/api/v1/assignments/:id/submissions` | Voir les rendus |
| POST | `/api/v1/assignments/:id/submissions` | Rendre un devoir (élève) |
| PATCH | `/api/v1/assignments/:id/submissions/:id/grade` | Noter un rendu |

### Absences
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/v1/attendance` | Liste des présences |
| GET | `/api/v1/attendance/stats` | Statistiques d'absences |
| POST | `/api/v1/attendance` | Marquer une présence |
| POST | `/api/v1/attendance/bulk` | Appel en lot |

### Messagerie
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/v1/messages/conversations` | Liste des conversations |
| POST | `/api/v1/messages/conversations` | Nouvelle conversation |
| GET | `/api/v1/messages/conversations/:id/messages` | Messages |
| POST | `/api/v1/messages/conversations/:id/messages` | Envoyer un message |

### Notifications
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/v1/notifications` | Mes notifications |
| GET | `/api/v1/notifications/unread-count` | Nombre non lues |
| PATCH | `/api/v1/notifications/:id/read` | Marquer comme lu |
| PATCH | `/api/v1/notifications/read-all` | Tout marquer comme lu |

### Paiements
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/v1/payments` | Liste des paiements |
| GET | `/api/v1/payments/stats` | Statistiques financières |
| POST | `/api/v1/payments` | Créer un paiement (admin) |
| PATCH | `/api/v1/payments/:id/mark-paid` | Marquer payé + reçu |

### Analytics
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/v1/analytics/dashboard/student` | Tableau de bord élève |
| GET | `/api/v1/analytics/dashboard/teacher` | Tableau de bord enseignant |
| GET | `/api/v1/analytics/dashboard/admin` | Tableau de bord admin |
| GET | `/api/v1/analytics/progression/:studentId` | Progression sur l'année |

---

## 🔐 Authentification

Toutes les routes protégées nécessitent un header :
```
Authorization: Bearer <supabase_access_token>
```

## 👥 Rôles

| Rôle | Accès |
|------|-------|
| `student` | Ses propres notes, devoirs, absences, etc. |
| `parent` | Données de ses enfants liés |
| `teacher` | Gestion pédagogique de ses classes |
| `admin` | Accès total + administration système |

---

## 🗄️ Configuration Supabase Storage

Créer les buckets suivants dans **Supabase > Storage** :

| Bucket | Usage | Visibilité |
|--------|-------|-----------|
| `avatars` | Photos de profil | Public |
| `assignments` | Fichiers de devoirs | Authentifié |
| `submissions` | Rendus d'élèves | Authentifié |
| `receipts` | Reçus de paiement | Authentifié |
| `documents` | Documents divers | Authentifié |

---

## 📊 Modèle de données

Voir `supabase/migrations/001_initial_schema.sql` pour le schéma complet avec :
- 20+ tables relationnelles
- Row Level Security (RLS) complète
- Fonctions SQL (moyennes, classements)
- Index de performance
- Triggers auto-update
