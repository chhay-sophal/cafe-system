import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { compare, hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { env } from '../env.js';

export interface AuthUser {
  id: string;
  name: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const JWT_SECRET = env.JWT_SECRET;
const JWT_EXPIRES_IN = '8h';

function isBcryptHash(value: string) {
  return /^\$2[aby]\$\d{2}\$.{53}$/.test(value);
}

export async function verifyPin(pin: string, storedHash: string) {
  if (isBcryptHash(storedHash)) {
    return compare(pin, storedHash);
  }

  return pin === storedHash;
}

export async function hashPin(pin: string) {
  return hash(pin, 10);
}

export function signToken(user: AuthUser) {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

export function verifyToken(token: string) {
  return jwt.verify(token, JWT_SECRET) as JwtPayload & { sub?: string; role?: string };
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = verifyToken(token);
    const userId = payload.sub;

    if (!userId) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    const user = await db
      .select({
        id: users.id,
        name: users.name,
        role: users.role,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User is no longer active' });
    }

    req.user = {
      id: user.id,
      name: user.name,
      role: user.role,
    };

    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(roles: string | string[]) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}
