# AI Career Coach

ATS-style CV analysis for computer science students: upload a CV, paste a job description, get a match score, missing requirements and skill gaps, then edit an AI-drafted CV and export it as PDF.

## Tech stack
- **Frontend:** Next.js 14, React, TypeScript, Tailwind CSS
- **Backend:** FastAPI (Python), sentence-transformers, scikit-learn, ReportLab

## Run locally

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1        # mac/linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env            # mac/linux: cp .env.example .env
uvicorn app.main:app --reload
```
API: http://127.0.0.1:8000 · Docs: http://127.0.0.1:8000/docs

### Frontend
```bash
cd frontend
npm install
copy .env.example .env.local      # mac/linux: cp .env.example .env.local
npm run dev
```
App: http://localhost:3000