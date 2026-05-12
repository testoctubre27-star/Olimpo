import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '@prisma/client';
import { prisma } from '../config/database';
import { config } from '../config/env';
import { UnauthorizedError, NotFoundError } from '../utils/errors';
import { JwtPayload } from '../middleware/auth';

export const AuthService = {
  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      throw new UnauthorizedError('Credenciales incorrectas');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedError('Credenciales incorrectas');
    }

    return AuthService.generateTokens(user);
  },

  generateTokens(user: User) {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      role: user.role,
      name: user.name,
    };

    const accessToken = jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });

    const refreshToken = jwt.sign(
      { sub: user.id },
      config.JWT_SECRET,
      { expiresIn: config.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
    );

    // Persist refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Fire and forget — non-blocking
    prisma.userSession.create({
      data: { userId: user.id, refreshToken, expiresAt },
    }).catch(() => { /* non-critical */ });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  },

  async refresh(token: string) {
    let payload: { sub: string };
    try {
      payload = jwt.verify(token, config.JWT_SECRET) as { sub: string };
    } catch {
      throw new UnauthorizedError('Refresh token inválido');
    }

    const session = await prisma.userSession.findUnique({
      where: { refreshToken: token },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedError('Sesión expirada');
    }

    if (session.userId !== payload.sub) {
      throw new UnauthorizedError();
    }

    // Rotate refresh token
    await prisma.userSession.delete({ where: { id: session.id } });

    return AuthService.generateTokens(session.user);
  },

  async logout(refreshToken: string) {
    await prisma.userSession.deleteMany({ where: { refreshToken } });
  },

  async createAdminUser(data: {
    email: string;
    password: string;
    name: string;
  }) {
    const hashed = await bcrypt.hash(data.password, 12);
    return prisma.user.create({
      data: {
        email: data.email,
        password: hashed,
        name: data.name,
        role: 'ADMIN',
      },
      select: { id: true, email: true, name: true, role: true },
    });
  },

  async getUserById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
    if (!user) throw new NotFoundError('Usuario');
    return user;
  },
};
