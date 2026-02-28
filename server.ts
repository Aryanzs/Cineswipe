import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import path from 'path';
import { z } from 'zod';
import db from './server/db.js';

// --- Startup Validation ---
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required.');
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || '3000');

// --- Validation Schemas ---
const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const interactionSchema = z.object({
  media_id: z.number().int().positive(),
  media_type: z.enum(['movie', 'tv']),
  interaction_type: z.enum(['like', 'reject']),
  media_data: z.object({ id: z.number() }).passthrough(),
});

async function startServer() {
  const app = express();

  // --- Security Middleware ---
  app.use(helmet({
    contentSecurityPolicy: false, // Disabled to allow Vite HMR & TMDB images in dev
  }));
  app.use(cors({
    origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
    credentials: true,
  }));
  app.use(express.json({ limit: '50kb' }));

  if (process.env.NODE_ENV === 'production') {
    app.use(compression());
  }

  // --- Rate Limiting ---
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: { error: 'Too many attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    message: { error: 'Too many requests, please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/auth', authLimiter);
  app.use('/api', apiLimiter);

  // --- Auth Middleware ---
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET!, (err: any, user: any) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  };

  // --- Health Check ---
  app.get('/api/health', (req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unhealthy' });
    }
  });

  // --- Auth Routes ---

  // Register
  app.post('/api/auth/register', async (req, res) => {
    const result = registerSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }
    const { username, password } = result.data;
    try {
      const hashedPassword = await bcrypt.hash(password, 12);
      const stmt = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
      const info = stmt.run(username, hashedPassword);

      const token = jwt.sign({ id: info.lastInsertRowid, username }, JWT_SECRET!, { expiresIn: '7d' });
      res.status(201).json({ token, user: { id: info.lastInsertRowid, username } });
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(400).json({ error: 'Username already taken' });
      }
      console.error('[register]', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  // Login
  app.post('/api/auth/login', async (req, res) => {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const { username, password } = result.data;
    try {
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;

      // Use generic message to prevent username enumeration
      if (!user) return res.status(400).json({ error: 'Invalid username or password' });

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) return res.status(400).json({ error: 'Invalid username or password' });

      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET!, { expiresIn: '7d' });
      res.json({ token, user: { id: user.id, username: user.username } });
    } catch (error) {
      console.error('[login]', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // Get current user
  app.get('/api/auth/me', authenticateToken, (req: any, res) => {
    res.json({ user: { id: req.user.id, username: req.user.username } });
  });

  // Delete account (GDPR compliance)
  app.delete('/api/auth/account', authenticateToken, (req: any, res) => {
    try {
      db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
      res.json({ success: true });
    } catch (error) {
      console.error('[delete account]', error);
      res.status(500).json({ error: 'Failed to delete account' });
    }
  });

  // --- Interaction Routes ---

  // Save / update interaction
  app.post('/api/interactions', authenticateToken, (req: any, res) => {
    const result = interactionSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }
    const { media_id, media_type, interaction_type, media_data } = result.data;
    try {
      const stmt = db.prepare(`
        INSERT INTO interactions (user_id, media_id, media_type, interaction_type, media_data)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, media_id, media_type) DO UPDATE SET
        interaction_type = excluded.interaction_type,
        media_data = excluded.media_data,
        created_at = CURRENT_TIMESTAMP
      `);
      stmt.run(req.user.id, media_id, media_type, interaction_type, JSON.stringify(media_data));
      res.json({ success: true });
    } catch (error) {
      console.error('[save interaction]', error);
      res.status(500).json({ error: 'Failed to save interaction' });
    }
  });

  // Get interactions (paginated, optional type filter)
  app.get('/api/interactions', authenticateToken, (req: any, res) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 100));
    const offset = (page - 1) * limit;
    const type = req.query.type as string | undefined;

    try {
      let query = 'SELECT * FROM interactions WHERE user_id = ?';
      const params: any[] = [req.user.id];

      if (type === 'like' || type === 'reject') {
        query += ' AND interaction_type = ?';
        params.push(type);
      }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const interactions = db.prepare(query).all(...params) as any[];
      const formatted = interactions.map(row => ({
        ...row,
        media_data: JSON.parse(row.media_data),
      }));

      res.json(formatted);
    } catch (error) {
      console.error('[get interactions]', error);
      res.status(500).json({ error: 'Failed to fetch interactions' });
    }
  });

  // Delete a single interaction (remove from watchlist)
  app.delete('/api/interactions/:id', authenticateToken, (req: any, res) => {
    const id = parseInt(req.params.id);
    if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid interaction ID' });

    try {
      const result = db
        .prepare('DELETE FROM interactions WHERE id = ? AND user_id = ?')
        .run(id, req.user.id);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Interaction not found' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('[delete interaction]', error);
      res.status(500).json({ error: 'Failed to delete interaction' });
    }
  });

  // Public watchlist for sharing (read-only, no auth required)
  app.get('/api/users/:username/watchlist', (req, res) => {
    try {
      const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username) as any;
      if (!user) return res.status(404).json({ error: 'User not found' });

      const interactions = db
        .prepare(`SELECT id, media_type, media_data, created_at FROM interactions WHERE user_id = ? AND interaction_type = 'like' ORDER BY created_at DESC`)
        .all(user.id) as any[];

      const formatted = interactions.map(row => ({
        id: row.id,
        media_type: row.media_type,
        media_data: JSON.parse(row.media_data),
        created_at: row.created_at,
      }));

      res.json({ username: req.params.username, watchlist: formatted });
    } catch (error) {
      console.error('[public watchlist]', error);
      res.status(500).json({ error: 'Failed to fetch watchlist' });
    }
  });

  // --- Vite / Static Middleware ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist', { maxAge: '1y', immutable: true }));
    // SPA fallback — must come after API routes
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  // --- Centralized Error Handler ---
  app.use((err: any, req: any, res: any, _next: any) => {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}:`, err.message);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
