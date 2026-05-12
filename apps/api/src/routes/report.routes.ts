// report.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { ReportService } from '../services/report.service';
import { respond } from '../utils/response';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/dashboard', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await ReportService.getDashboard();
    return respond.ok(res, { data });
  } catch (err) { next(err); }
});

router.get('/financial', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const from = new Date((req.query.from as string) ?? new Date().toISOString().slice(0, 7) + '-01');
    const to = new Date((req.query.to as string) ?? new Date());
    const data = await ReportService.getFinancialReport({ from, to });
    return respond.ok(res, { data });
  } catch (err) { next(err); }
});

router.get('/financial/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const from = new Date((req.query.from as string) ?? new Date().toISOString().slice(0, 7) + '-01');
    const to = new Date((req.query.to as string) ?? new Date());
    const buffer = await ReportService.exportFinancialExcel({ from, to });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=olimpo-reporte-${from.toISOString().slice(0, 7)}.xlsx`);
    res.send(buffer);
  } catch (err) { next(err); }
});

export default router;
