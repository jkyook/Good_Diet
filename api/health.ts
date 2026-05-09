import type { ApiReq, ApiRes } from './_lib/types';
import { PROVIDER_AVAILABLE } from './_lib/providers';

export default function handler(_req: ApiReq, res: ApiRes) {
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
