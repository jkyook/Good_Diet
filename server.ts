import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import analyzeHandler from './api/analyze.js';
import analyzeBatchHandler from './api/analyze-batch.js';
import healthHandler from './api/health.js';
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

const PORT = process.env.PORT ? Number(process.env.PORT) + 1 : 3001;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
