import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth.service';
import { respond } from '../utils/response';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Contraseña requerida'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const AuthController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const result = await AuthService.login(email, password);
      return respond.ok(res, { data: result, message: 'Sesión iniciada' });
    } catch (err) {
      next(err);
    }
  },

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = refreshSchema.parse(req.body);
      const result = await AuthService.refresh(refreshToken);
      return respond.ok(res, { data: result });
    } catch (err) {
      next(err);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = refreshSchema.parse(req.body);
      await AuthService.logout(refreshToken);
      return respond.noContent(res);
    } catch (err) {
      next(err);
    }
  },

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await AuthService.getUserById(req.user!.sub);
      return respond.ok(res, { data: user });
    } catch (err) {
      next(err);
    }
  },
};
