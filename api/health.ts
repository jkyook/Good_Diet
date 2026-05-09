import type { ApiReq, ApiRes } from './_lib/types';
import { PROVIDER_AVAILABLE } from './_lib/providers';
import { handlePreflight } from './_lib/cors';

export default function handler(req: ApiReq, res: ApiRes) {
  if (handlePreflight(req, res)) return;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 200;
  res.end(JSON.stringify({
    ok: true,
    providers: {
      groq: PROVIDER_AVAILABLE.groq,
      claude: PROVIDER_AVAILABLE.claude,
      gemini: PROVIDER_AVAILABLE.gemini,
    },
  }));
}
