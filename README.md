# Good Diet / FlavorGuard AI

React + Vite 기반의 AI 식단 분석 앱입니다. 사용자가 음식 사진을 올리면 서버 API가 Claude, Gemini, xAI Grok 계열 vision provider를 호출해 음식명, 칼로리, 영양성분, 식사 팁을 분석하고 Supabase에 식사 기록을 저장합니다.

## 주요 기능

- 단일 사진/여러 사진 일괄 음식 분석
- AI provider fallback 및 서버 사이드 API 키 보호
- Supabase Auth 기반 계정, 식사 기록, cal 잔액 관리
- `foods` DB 기반 식품 매칭과 영양정보 보정
- 편의점/PB 브랜드 alias 매칭 강화
- Capacitor 기반 Android/iOS 빌드 준비

## 로컬 실행

**필수:** Node.js 22 권장

```bash
npm install
npm run dev:all
```

웹 앱은 기본 `http://localhost:3000`, 로컬 API 서버는 `http://localhost:3001`에서 실행됩니다. Vite 개발 서버는 `/api/*` 요청을 로컬 API 서버로 프록시합니다.

## 환경변수

`.env.example`을 참고해 로컬/배포 환경에 값을 설정합니다.

서버 전용:

```bash
GEMINI_API_KEY="..."
ANTHROPIC_API_KEY="..."
GROQ_API_KEY="..."
SUPABASE_URL="https://xxx.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="..."
```

클라이언트 노출 가능:

```bash
VITE_SUPABASE_URL="https://xxx.supabase.co"
VITE_SUPABASE_ANON_KEY="..."
VITE_API_BASE=""
```

광고 보상은 AdMob SSV 검증 구현 전까지 기본 차단됩니다. 로컬/QA에서만 임시로 열어야 할 때 `ALLOW_UNVERIFIED_AD_REWARD=true`를 사용합니다. 프로덕션에는 설정하지 마세요.

## Supabase 마이그레이션

`migrations/`의 SQL 파일을 번호 순서대로 Supabase SQL Editor에서 실행합니다. 최근 핵심 변경:

- `T-080_pb_brand_matching.sql`: 유어스, 헤이루, CU 득템, 아임e, 세븐셀렉트, 노브랜드 brand 정규화와 alias 가중치 매칭
- `T-081_food_match_misses.sql`: 자동 DB 보정에 실패한 AI foodName 로그 수집 테이블

## 검증

```bash
npm run lint
npm run build
npm run test:filter
```

빌드는 React/runtime과 아이콘 라이브러리를 별도 chunk로 분리해 초기 번들 경고가 나지 않도록 구성되어 있습니다.

## 모바일 빌드

모바일 빌드는 Capacitor 설정을 사용합니다.

```bash
npm run build:mobile
```

모바일에서는 `VITE_API_BASE`를 배포 API 절대 URL로 설정해야 합니다.
