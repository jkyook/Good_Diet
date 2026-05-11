import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import analyzeHandler from './api/analyze.js';
import analyzeBatchHandler from './api/analyze-batch.js';
import healthHandler from './api/health.js';
import meHandler from './api/me.js';
import calChargeAdHandler from './api/cal/charge/ad.js';
import calPaymentInitHandler from './api/cal/charge/payment/init.js';
import calPaymentWebhookHandler from './api/cal/charge/payment/webhook.js';
import calTransactionsHandler from './api/cal/transactions.js';
import adminUsersHandler from './api/admin/users.js';
import adminAdjustHandler from './api/admin/cal/adjust.js';
import adminStatsHandler from './api/admin/stats.js';
import type { ApiReq, ApiRes } from './api/_lib/types.js';

dotenv.config();

const app = express();
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'capacitor://localhost', 'ionic://localhost', 'https://localhost', 'http://localhost'],
  credentials: true,
}));
app.use(express.json({ limit: '90mb' }));

function run(handler: (req: ApiReq, res: ApiRes) => unknown) {
  return (req: express.Request, res: express.Response) => {
    void Promise.resolve(handler(req as ApiReq, res as unknown as ApiRes)).catch(err => {
      console.error('[local-api] handler error:', err);
      if (!res.headersSent) res.status(500).json({ error: '로컬 API 처리 중 오류가 발생했습니다.' });
      else res.end();
    });
  };
}

app.all('/api/health', run(healthHandler));
app.all('/api/analyze', run(analyzeHandler));
app.all('/api/analyze-batch', run(analyzeBatchHandler));
app.all('/api/me', run(meHandler));
app.all('/api/cal/charge/ad', run(calChargeAdHandler));
app.all('/api/cal/charge/payment/init', run(calPaymentInitHandler));
app.all('/api/cal/charge/payment/webhook', run(calPaymentWebhookHandler));
app.all('/api/cal/transactions', run(calTransactionsHandler));
app.all('/api/admin/users', run(adminUsersHandler));
app.all('/api/admin/cal/adjust', run(adminAdjustHandler));
app.all('/api/admin/stats', run(adminStatsHandler));

const PORT = process.env.PORT ? Number(process.env.PORT) + 1 : 3001;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
