import { Router } from 'express';
import authRoutes    from './auth.routes';
import webhookRoutes from './webhook.routes';
import studentRoutes from './student.routes';
import paymentRoutes from './payment.routes';
import reportRoutes  from './report.routes';
import scheduleRoutes from './schedule.routes';
import teacherRoutes from './teacher.routes';
import setupRoutes   from './setup.routes';

const router = Router();

router.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

router.use('/auth',     authRoutes);
router.use('/webhook',  webhookRoutes);
router.use('/students', studentRoutes);
router.use('/payments', paymentRoutes);
router.use('/reports',  reportRoutes);
router.use('/schedules', scheduleRoutes);
router.use('/teachers', teacherRoutes);

// ⚠️  First-run only — auto-disables after first admin is created
router.use('/setup',    setupRoutes);

export default router;
