import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireAdmin } from '../middleware/auth';
import { PaymentService } from '../services/payment.service';
import { respond } from '../utils/response';
import { audit } from '../middleware/audit';

const router = Router();
router.use(authenticate, requireAdmin);

const monthlySchema = z.object({
  studentId: z.string().cuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Período debe ser YYYY-MM'),
  amount: z.number().positive().optional(),
  notes: z.string().optional(),
});

router.get('/student/:studentId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const payments = await PaymentService.listByStudent(req.params.studentId);
    respond.ok(res, { data: payments });
  } catch (err) { next(err); }
});

router.post('/enrollment', audit('PAYMENT_ENROLLMENT', 'Payment'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { studentId } = z.object({ studentId: z.string().cuid() }).parse(req.body);
      const payment = await PaymentService.createEnrollment(studentId, req.user!.sub);
      respond.created(res, { data: payment, message: 'Inscripción registrada' });
    } catch (err) { next(err); }
  }
);

router.post('/monthly', audit('PAYMENT_MONTHLY', 'Payment'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = monthlySchema.parse(req.body);
      const payment = await PaymentService.createMonthly({ ...body, confirmedById: req.user!.sub });
      respond.created(res, { data: payment, message: 'Mensualidad registrada' });
    } catch (err) { next(err); }
  }
);

export default router;
