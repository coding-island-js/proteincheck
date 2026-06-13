# Protein Check

Snap a photo of your meal and get an instant protein estimate with a per-item breakdown.
Live: **https://proteincheck.withmagic.ai**

A small, real full-stack app: an **Astro + TypeScript** front end talking to a typed
**NestJS (Fastify) + Prisma + PostgreSQL** API, with vision by **Gemini**. The photo is
analyzed and discarded — only the derived estimate is stored.

## Stack
| Layer | Tech |
|-------|------|
| Front end | Astro, TypeScript, accessible vanilla components → Netlify |
| API | NestJS on the **Fastify** adapter, TypeScript, OpenAPI/Swagger → Railway |
| Data | PostgreSQL + **Prisma** (schema + migrations) |
| Vision | Google Gemini (`gemini-2.5-flash`), server-side only |
| CI | GitHub Actions: install → prisma generate → build → test |

## Structure
```
proteincheck/
├── web/                Astro front end (capture UI, calls the API)
│   └── netlify/functions/analyze.mjs   serverless fallback so the demo runs without the API
├── api/                NestJS + Fastify API
│   ├── src/analyze/    analyze endpoint, Gemini service, DTOs, tests
│   ├── src/prisma.service.ts
│   └── prisma/schema.prisma   (Scan model)
└── .github/workflows/ci.yml
```

## Run locally
```bash
# API
cd api
cp .env.example .env          # add GEMINI_API_KEY (DATABASE_URL optional locally)
npx prisma generate
npm run start:dev             # http://localhost:3000  (OpenAPI docs at /docs)

# Web
cd ../web
echo "PUBLIC_API_URL=http://localhost:3000" > .env
npm run dev                   # http://localhost:4321
```
The API degrades gracefully: with no database it still returns estimates (persistence is skipped).

## API
`POST /analyze` → `{ totalProtein, items[], verdict, summary, confidence }`
`GET /health` → `{ ok: true }` · OpenAPI docs at `/docs`.
