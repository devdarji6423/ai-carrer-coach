from ast import alias

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.feature_extraction.text import TfidfVectorizer
import nltk
from nltk.corpus import stopwords
import pdfplumber
import docx
import io
import re
from typing import Dict, List, Tuple
import httpx
from pydantic import BaseModel
from transformers import pipeline

import re
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from cs_profile import CS_SKILL_ALIASES


# Free local AI model for rewriting and summarization
rewrite_model = pipeline(
    "text2text-generation",
    model="google/flan-t5-base",
    max_length=512
)

try:
    nltk.data.find("corpora/stopwords")
except LookupError:
    nltk.download("stopwords")

STOPWORDS = set(stopwords.words("english"))


# =========================
# CS Entry-Level Skill List (General)
# =========================
CS_SKILLS = {
    # Programming languages
    "python": ["python"],
    "javascript": ["javascript", "js"],
    "typescript": ["typescript", "ts"],
    "java": ["java"],
    "c++": ["c++", "cpp"],
    "c#": ["c#", "csharp"],
    "sql": ["sql"],
    "html": ["html"],
    "css": ["css"],

    # Frameworks / libraries
    "react": ["react", "reactjs"],
    "next.js": ["next.js", "nextjs", "next"],
    "node.js": ["node.js", "nodejs", "node"],
    "express": ["express", "express.js"],
    "fastapi": ["fastapi"],
    "django": ["django"],
    "flask": ["flask"],

    # Frontend-specific
    "frontend": ["frontend", "front-end", "front end"],
    "redux": ["redux", "redux toolkit", "rtk"],
    "react hooks": ["react hooks", "hooks", "useeffect", "usestate", "usememo"],
    "ui testing": ["react testing library", "rtl", "cypress", "playwright", "e2e"],
    "jest": ["jest"],
    "tailwind": ["tailwind", "tailwindcss"],
    "sass": ["sass", "scss"],
    "responsive design": ["responsive", "mobile-first", "media queries"],
    "accessibility": ["accessibility", "a11y", "aria"],
    "performance optimization": ["performance", "lazy loading", "code splitting", "bundle"],
    "state management": ["state management", "context api", "zustand", "recoil"],
    "ui frameworks": ["mui", "material ui", "chakra", "bootstrap", "shadcn"],
    "api integration": ["axios", "fetch", "api integration"],
    "web security": ["xss", "csrf", "cors"],

    # Databases
    "postgresql": ["postgres", "postgresql"],
    "mysql": ["mysql"],
    "mongodb": ["mongodb", "mongo"],
    "sqlite": ["sqlite"],

    # Software engineering practices
    "git": ["git", "github", "gitlab"],
    "rest api": ["rest", "rest api", "api", "apis"],
    "unit testing": ["unit testing", "pytest", "jest", "testing", "tests"],
    "oop": ["oop", "object oriented", "object-oriented"],
    "data structures": ["data structures", "dsa"],
    "algorithms": ["algorithms"],
    "debugging": ["debugging", "debug", "troubleshoot", "troubleshooting"],

    # Dev tools / platform
    "docker": ["docker"],
    "linux": ["linux"],
    "ci/cd": ["ci", "cd", "ci/cd", "github actions", "pipeline", "pipelines"],
    "cloud": ["aws", "amazon web services"],
    "azure": ["azure"],
    "gcp": ["gcp", "google cloud"],
    "cloud": ["cloud", "cloud platforms", "cloud services"],
}

SKILL_SIMILARITY_GROUPS = {
    "python_backend": ["fastapi", "django", "flask"],
    "frontend_react": ["react", "next.js"],
    "js_typescript": ["javascript", "typescript"],
    "sql_databases": ["sql", "postgresql", "mysql", "sqlite"],
    "nosql_databases": ["mongodb"],
    "devops_containers": ["docker", "kubernetes"],
    "cloud_platforms": ["aws", "azure", "gcp"],
    "version_control": ["git", "github", "gitlab"],
    "api_development": ["rest api", "fastapi", "express", "django", "flask"],
    "backend_node": ["node.js", "express"],
    "testing_tools": ["pytest", "jest", "unit testing", "testing"],
}

SKILL_WEIGHTS = {
    # core backend
    "python": 2.0,
    "fastapi": 2.0,
    "django": 2.0,
    "flask": 2.0,
    "node.js": 2.0,

    # frontend
    "react": 1.8,
    "next.js": 1.8,
    "javascript": 1.5,
    "typescript": 1.5,

    # databases
    "sql": 1.8,
    "postgresql": 1.8,
    "mongodb": 1.5,

    # devops
    "docker": 1.3,
    "kubernetes": 1.3,
    "aws": 1.3,

    # tools
    "git": 1.2,
    "linux": 1.0,
}


def weighted_skill_coverage(jd_skills: List[str], resume_skills: List[str]) -> float:
    if not jd_skills:
        return 0.0
    total = 0
    got = 0
    for s in jd_skills:
        w = CS_SKILL_WEIGHTS.get(s, 1)
        total += w
        if s in resume_skills:
            got += w
    return round((got / total) * 100, 2) if total else 0.0


def detect_cs_skills(text: str) -> list:
    """
    Return canonical skill names found in text.
    Uses simple substring matching.
    """
    t = (text or "").lower()
    found = []

    for canonical, variants in CS_SKILLS.items():
        for v in variants:
            if v in t:
                found.append(canonical)
                break

    # unique + stable order
    seen = set()
    out = []
    for s in found:
        if s not in seen:
            seen.add(s)
            out.append(s)

    return out


def get_skill_group(skill: str) -> str | None:
    s = (skill or "").lower()
    for group_name, skills in SKILL_SIMILARITY_GROUPS.items():
        if s in skills:
            return group_name
    return None


def cs_skill_gap_analysis(resume_text: str, jd_text: str) -> dict:
    jd_skills = detect_cs_skills(jd_text)
    resume_skills = detect_cs_skills(resume_text)

    exact_present = []
    similar_present = []
    missing = []

    resume_skill_set = set(resume_skills)

    for jd_skill in jd_skills:
        if jd_skill in resume_skill_set:
            exact_present.append(jd_skill)
            continue

        jd_group = get_skill_group(jd_skill)
        found_similar = False

        if jd_group:
            for rs in resume_skills:
                if get_skill_group(rs) == jd_group:
                    similar_present.append({
                        "required_skill": jd_skill,
                        "matched_with": rs
                    })
                    found_similar = True
                    break

        if not found_similar:
            missing.append(jd_skill)

    # weighted scoring
    exact_score = 0.0
    similar_score = 0.0
    total_possible = 0.0

    for skill in jd_skills:
        weight = SKILL_WEIGHTS.get(skill, 1.0)
        total_possible += weight

        if skill in exact_present:
            exact_score += weight
        elif any(s["required_skill"] == skill for s in similar_present):
            similar_score += weight * 0.5

    coverage = round(((exact_score + similar_score) / total_possible) * 100, 2) if total_possible else 0.0

    return {
        "jd_skills": jd_skills,
        "resume_skills": resume_skills,
        "exact_present_skills": exact_present,
        "similar_present_skills": similar_present,
        "missing_skills": missing,
        "skill_coverage_percent": coverage,
        "coverage_percent": coverage
    }


def frontend_must_have_gap(resume_text: str, jd_text: str) -> dict:
    resume_skills = detect_cs_skills(resume_text)
    jd_skills = detect_cs_skills(jd_text)

    # Only check must-have skills if JD looks frontend-ish
    jd_is_frontend = any(s in jd_skills for s in ["react", "next.js", "frontend"])

    if not jd_is_frontend:
        return {
            "jd_is_frontend": False,
            "must_have": FRONTEND_MUST_HAVE,
            "present": [],
            "missing": [],
            "coverage_percent": 0.0,
        }

    present = [s for s in FRONTEND_MUST_HAVE if s in resume_skills]
    missing = [s for s in FRONTEND_MUST_HAVE if s not in resume_skills]
    cov = round((len(present) / len(FRONTEND_MUST_HAVE)) * 100, 2)

    return {
        "jd_is_frontend": True,
        "must_have": FRONTEND_MUST_HAVE,
        "present": present,
        "missing": missing,
        "coverage_percent": cov,
    }


FRONTEND_MUST_HAVE = [
    "react",
    "typescript",
    "javascript",
    "html",
    "css",
    "git",
    "rest api",
]

app = FastAPI()

# Allow frontend to call backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
headers = ["*"]


class PDFRequest(BaseModel):
    filename: str = "ATS_CV.pdf"
    content: str


@app.post("/export_pdf")
async def export_pdf(req: PDFRequest):
    text = (req.content or "").strip()
    if len(text) < 50:
        raise HTTPException(status_code=400, detail="PDF content too short.")

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    # Simple ATS-friendly PDF
    x = 40
    y = height - 50
    line_height = 14

    c.setFont("Helvetica", 11)

    for line in text.split("\n"):
        if y < 50:
            c.showPage()
            c.setFont("Helvetica", 11)
            y = height - 50

        c.drawString(x, y, line[:110])
        y -= line_height

    c.save()
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{req.filename}"'}
    )


class StructuredCVPDFRequest(BaseModel):
    filename: str = "ATS_CV.pdf"
    template: str = "modern-blue"
    cv_data: dict


@app.post("/export_structured_cv_pdf")
async def export_structured_cv_pdf(req: StructuredCVPDFRequest):
    cv = req.cv_data or {}
    header = cv.get("header", {})
    summary = cv.get("summary", "")
    skills = cv.get("skills", [])
    experience = cv.get("experience", [])
    education = cv.get("education", [])
    projects = cv.get("projects", [])
    additional = cv.get("additional", [])

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    x = 45
    y = height - 45
    line_h = 15

    def new_page_if_needed(current_y, needed=60):
        nonlocal c
        if current_y < needed:
            c.showPage()
            return height - 45
        return current_y

    def draw_line(text, font="Helvetica", size=10):
        nonlocal y
        y = new_page_if_needed(y)
        c.setFont(font, size)
        c.drawString(x, y, text[:115])
        y -= line_h

    def draw_section(title):
        nonlocal y
        y = new_page_if_needed(y, 80)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(x, y, title.upper())
        y -= 6
        c.line(x, y, width - 45, y)
        y -= 14

    # Header
    c.setFont("Helvetica-Bold", 18)
    c.drawString(x, y, (header.get("full_name", "") or "YOUR NAME")[:60])
    y -= 20

    c.setFont("Helvetica", 10)
    contact_line = " | ".join([
        header.get("phone", ""),
        header.get("email", ""),
        header.get("linkedin", ""),
        header.get("github", ""),
        header.get("location", ""),
    ])
    contact_line = " | ".join([p for p in contact_line.split(" | ") if p.strip()])

    if header.get("target_role"):
        draw_line(header["target_role"], "Helvetica-Bold", 10)
    if contact_line:
        draw_line(contact_line, "Helvetica", 9)

    # Summary
    if summary.strip():
        draw_section("Summary")
        for ln in summary.split("\n"):
            if ln.strip():
                draw_line(ln.strip())

    # Skills
    if skills:
        draw_section("Skills")
        draw_line(", ".join(skills))

    # Experience
    if experience:
        draw_section("Experience")
        for item in experience:
            title_line = " | ".join([
                item.get("job_title", ""),
                item.get("company", ""),
                item.get("dates", ""),
            ])
            title_line = " | ".join([p for p in title_line.split(" | ") if p.strip()])
            if title_line:
                draw_line(title_line, "Helvetica-Bold", 10)
            for bullet in item.get("bullets", []):
                draw_line(f"- {bullet}")

    # Projects
    if projects:
        draw_section("Projects")
        for item in projects:
            proj_line = " | ".join([
                item.get("project_name", ""),
                item.get("tech_stack", ""),
            ])
            proj_line = " | ".join([p for p in proj_line.split(" | ") if p.strip()])
            if proj_line:
                draw_line(proj_line, "Helvetica-Bold", 10)
            for bullet in item.get("bullets", []):
                draw_line(f"- {bullet}")

    # Education
    if education:
        draw_section("Education")
        for item in education:
            edu_line = " | ".join([
                item.get("degree", ""),
                item.get("institution", ""),
                item.get("dates", ""),
            ])
            edu_line = " | ".join([p for p in edu_line.split(" | ") if p.strip()])
            if edu_line:
                draw_line(edu_line, "Helvetica-Bold", 10)
            if item.get("details"):
                draw_line(item["details"])

    # Additional
    if additional:
        draw_section("Additional")
        for item in additional:
            draw_line(f"- {item}")

    c.save()
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{req.filename}"'}
    )


class AISuggestRequest(BaseModel):
    resume_text: str
    job_description_text: str


# load once at startup
summarizer = pipeline("summarization", model="sshleifer/distilbart-cnn-12-6")

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
embedding_model = SentenceTransformer(MODEL_NAME)


# add request and response schemas
class TailorRequest(BaseModel):
    resume_text: str
    job_description_text: str
    target_pages: int = 1


class TailorResponse(BaseModel):
    ats_resume_draft: str
    changes: list
    missing_or_weak_points: list
    disclaimer: str


# Ollama helper
OLLAMA_URL = "http://127.0.0.1:11434/api/chat"
OLLAMA_MODEL = "llama3"


async def call_ollama(system_prompt: str, user_prompt: str) -> str:
    """
    Calls local Ollama model and returns raw text response.
    """
    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
        "options": {
            "temperature": 0.3,
        },
    }

    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(OLLAMA_URL, json=payload)
        r.raise_for_status()
        data = r.json()
        return data["message"]["content"]


@app.post("/tailor_resume", response_model=TailorResponse)
async def tailor_resume(req: TailorRequest):
    resume_text = normalize_text(req.resume_text)
    jd_text = normalize_text(req.job_description_text)

    if len(resume_text) < 200:
        raise HTTPException(status_code=400, detail="resume_text too short. Provide full extracted text.")
    if len(jd_text) < 200:
        raise HTTPException(status_code=400, detail="job_description_text too short. Paste full JD.")
    if req.target_pages not in [1, 2]:
        raise HTTPException(status_code=400, detail="target_pages must be 1 or 2.")

    word_limit = 650 if req.target_pages == 1 else 1200

    system_prompt = f"""
You are an ATS-friendly resume editor.
Rules:
- DO NOT invent experience, education, skills, or tools not present in the resume text.
- You MAY rewrite, reorder, summarize, and improve phrasing based on the job description.
- If the job description requires something not in the resume, list it under "Missing_or_weak_points".
- Keep formatting ATS-friendly: simple headings, bullet points, no tables, no icons.
- Keep the final draft under {word_limit} words.
Output format MUST be valid JSON with keys:
- ats_resume_draft (string, ATS-friendly resume in plain text/markdown)
- changes (array of objects: {{"section": "...", "before": "...", "after": "...", "reason": "..."}})
- missing_or_weak_points (array of strings)
"""

    user_prompt = f"""
RESUME TEXT:
{resume_text}

JOB DESCRIPTION:
{jd_text}

Task:
1) Produce an ATS-friendly tailored resume draft for this job.
2) Summarize to {req.target_pages} page(s) max.
3) Show key changes and why.
4) List missing/weak points that cannot be claimed from the resume.
"""

    try:
        raw = await call_ollama(system_prompt, user_prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ollama call failed: {str(e)}")

    try:
        import json
        parsed = json.loads(raw)
        draft = parsed.get("ats_resume_draft", "")
        changes = parsed.get("changes", [])
        missing = parsed.get("missing_or_weak_points", [])
    except Exception:
        draft = raw
        changes = []
        missing = ["Model output was not valid JSON. Consider retrying or switching model."]

    return TailorResponse(
        ats_resume_draft=draft,
        changes=changes,
        missing_or_weak_points=missing,
        disclaimer="Guidance only. You must ensure all content remains truthful and accurately reflects your experience."
    )


# ----------------------------
# Health check
# ----------------------------
@app.get("/health")
def health_check():
    return {"status": "ok", "message": "Backend is running!"}


# ----------------------------
# File parsing
# ----------------------------
def extract_text_from_pdf(file_bytes: bytes) -> str:
    """
    PDF text extraction:
    1) pdfplumber
    2) PyMuPDF fallback
    3) word-based fallback
    """
    try:
        text_parts = []
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text(layout=True) or page.extract_text() or ""
                if page_text.strip():
                    text_parts.append(page_text)
        joined = "\n".join(text_parts).strip()
        if joined:
            return joined
    except Exception:
        pass

    try:
        import fitz
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        text = []
        for page in doc:
            t = page.get_text("text")
            if t.strip():
                text.append(t)
        joined = "\n".join(text).strip()
        if joined:
            return joined
    except Exception:
        pass

    try:
        text_parts = []
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                words = page.extract_words() or []
                if words:
                    line = " ".join(w["text"] for w in words)
                    text_parts.append(line)
        return "\n".join(text_parts).strip()
    except Exception:
        return ""


def extract_text_from_docx(file_bytes: bytes) -> str:
    doc = docx.Document(io.BytesIO(file_bytes))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paragraphs).strip()


# ----------------------------
# Cleaning + Sectioning
# ----------------------------
SECTION_PATTERNS: List[Tuple[str, re.Pattern]] = [
    ("education", re.compile(r"^\s*(education|academic|qualifications)\s*$", re.IGNORECASE)),
    ("experience", re.compile(r"^\s*(experience|work experience|work history|employment|employment history|professional experience|work experience)\s*$", re.IGNORECASE)),
    ("skills", re.compile(r"^\s*(skills|technical skills|core skills|key skills|skills\s*&\s*interests|skills\s+and\s+interests)\s*$", re.IGNORECASE)),
    ("projects", re.compile(r"^\s*(projects|personal projects|academic projects)\s*$", re.IGNORECASE)),
]


def normalize_text(text: str) -> str:
    """
    Basic cleanup:
    - unify newlines
    - remove repeated spaces
    - remove trailing spaces
    """
    if not text:
        return ""

    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)

    cleaned_lines = []
    for line in text.split("\n"):
        line = line.strip()
        line = re.sub(r"[ \t]{2,}", " ", line)
        cleaned_lines.append(line)

    cleaned = "\n".join(cleaned_lines).strip()
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned


def best_evidence_for_requirement(resume_sents: List[str], requirement: str) -> Dict[str, object]:
    """
    Return best matching resume sentence and score.
    """
    if not resume_sents:
        return {"evidence": "", "score": 0.0}

    sent_embs = embedding_model.encode(resume_sents, normalize_embeddings=True)
    req_emb = embedding_model.encode([requirement], normalize_embeddings=True)

    sims = cosine_similarity(sent_embs, req_emb).reshape(-1)
    if sims.size == 0:
        return {"evidence": "", "score": 0.0}

    best_idx = int(sims.argmax())
    best_score = float(sims[best_idx]) * 100.0

    return {
        "evidence": resume_sents[best_idx],
        "score": round(best_score, 2)
    }


def split_into_sections(text: str) -> Dict[str, str]:
    """
    Heuristic section splitter.
    """
    sections: Dict[str, List[str]] = {
        "education": [],
        "experience": [],
        "skills": [],
        "projects": [],
        "other": [],
    }

    current_section = "other"

    for raw_line in text.split("\n"):
        line = raw_line.strip()

        if not line:
            sections[current_section].append("")
            continue

        matched = False
        for section_name, pattern in SECTION_PATTERNS:
            if pattern.match(line):
                current_section = section_name
                matched = True
                break

        if matched:
            continue

        sections[current_section].append(line)

    joined: Dict[str, str] = {}
    for k, lines in sections.items():
        s = "\n".join(lines).strip()
        s = re.sub(r"\n{3,}", "\n\n", s)
        joined[k] = s

    return joined


def extract_skills_simple(skills_section_text: str) -> List[str]:
    """
    Simple skill extraction baseline.
    """
    if not skills_section_text.strip():
        return []

    t = skills_section_text
    t = t.replace("•", ",").replace("·", ",").replace("|", ",").replace("/", ",")
    t = t.replace("\n", ",")
    candidates = [c.strip() for c in t.split(",")]

    cleaned = []
    for c in candidates:
        c = re.sub(r"\s{2,}", " ", c).strip()
        if len(c) >= 2 and not c.isdigit():
            cleaned.append(c)

    seen = set()
    out = []
    for item in cleaned:
        key = item.lower()
        if key not in seen:
            seen.add(key)
            out.append(item)

    return out[:60]


def split_into_sentences(text: str) -> List[str]:
    """
    Simple sentence splitter for resumes.
    """
    if not text.strip():
        return []

    t = text.replace("•", ". ").replace("·", ". ")
    lines = [ln.strip() for ln in t.split("\n") if ln.strip()]
    sentences: List[str] = []

    for ln in lines:
        parts = re.split(r"(?<=[.!?])\s+", ln)
        for p in parts:
            p = p.strip()
            if len(p.split()) < 3:
                continue
            sentences.append(p)

    seen = set()
    out = []
    for s in sentences:
        key = s.lower()
        if key not in seen:
            seen.add(key)
            out.append(s)

    return out[:200]


def clean_job_description(jd: str) -> str:
    jd = normalize_text(jd)

    STOP_MARKERS = [
        "working for us has great rewards",
        "we truly value our colleagues",
        "discount card",
        "pension",
        "generous holiday",
        "shopping discounts",
        "wellbeing support",
        "please note that our vacancies",
        "if you need an update on your application",
        "you can find contact details",
    ]

    lower = jd.lower()
    cut = len(jd)

    for m in STOP_MARKERS:
        idx = lower.find(m)
        if idx != -1:
            cut = min(cut, idx)

    jd = jd[:cut].strip()
    return jd[:1800]


def max_sentence_match(resume_text: str, requirement: str) -> float:
    """
    Requirement vs resume sentences.
    """
    resume_clean = remove_resume_noise(resume_text)
    sents = split_into_sentences(resume_clean)
    if not sents:
        return 0.0

    sent_embs = embedding_model.encode(sents, normalize_embeddings=True)
    req_emb = embedding_model.encode([requirement], normalize_embeddings=True)

    sims = cosine_similarity(sent_embs, req_emb).reshape(-1)
    return float(sims.max()) if sims.size else 0.0


def requirement_rule_match(requirement: str, resume_text: str) -> bool:
    requirement = (requirement or "").lower()
    resume_text = (resume_text or "").lower()

    if "sql" in requirement or "database" in requirement:
        return any(x in resume_text for x in [
            "sql", "postgresql", "postgres", "mysql", "sqlite", "database", "databases", "queries"
        ])

    if "collaborate" in requirement or "team" in requirement:
        return any(x in resume_text for x in [
            "team", "teams", "collaborate", "collaboration", "worked with", "led team", "teamwork", "cross-functional"
        ])

    if "rest" in requirement or "api" in requirement:
        return any(x in resume_text for x in [
            "rest api", "rest apis", "api", "apis", "backend api", "fastapi"
        ])

    if "git" in requirement or "version control" in requirement:
        return any(x in resume_text for x in [
            "git", "github", "gitlab", "version control", "source control"
        ])

    if "python" in requirement:
        return "python" in resume_text

    if "docker" in requirement:
        return "docker" in resume_text

    if "aws" in requirement or "cloud" in requirement:
        return any(x in resume_text for x in [
            "aws", "amazon web services", "cloud"
        ])

    return False


def requirements_coverage(resume_text: str, jd_text: str, threshold: float = 0.30) -> Dict[str, object]:
    """
    Requirements coverage using sentence-level semantic matching.
    """
    resume_text = remove_resume_noise(resume_text)
    resume_relevant = get_resume_relevant_text(resume_text)

    req_obj = extract_requirements_from_jd(jd_text)
    must_reqs = req_obj.get("must", []) or []
    nice_reqs = req_obj.get("nice", []) or []
    all_reqs = must_reqs + nice_reqs

    if not all_reqs:
        return {
            "requirements_found": 0,
            "coverage_percent": 0.0,
            "must_coverage_percent": 0.0,
            "present_requirements": [],
            "missing_requirements": [],
            "missing_must": [],
            "missing_nice": [],
        }

    resume_sents = split_into_sentences(resume_relevant)
    if not resume_sents:
        evidence_list = []
        for r in all_reqs:
            bucket = "must" if r in must_reqs else "nice"
            evidence_list.append({
                "requirement": r,
                "bucket": bucket,
                "best_score": 0.0,
                "evidence": "",
                "status": "missing",
            })

        return {
            "coverage_percent": 0.0,
            "must_coverage_percent": 0.0,
            "present_requirements": [],
            "missing_requirements": all_reqs,
            "missing_must": must_reqs,
            "missing_nice": nice_reqs,
            "requirement_evidence": evidence_list,
        }

    sent_embs = embedding_model.encode(resume_sents, normalize_embeddings=True)

    present, missing = [], []
    evidence_list = []

    must_present, must_missing = [], []
    nice_present, nice_missing = [], []

    for r in all_reqs:
        r_emb = embedding_model.encode([r], normalize_embeddings=True)
        sims = cosine_similarity(sent_embs, r_emb).reshape(-1)

        best = float(sims.max()) if sims.size else 0.0
        best_idx = int(sims.argmax()) if sims.size else -1
        best_sent = resume_sents[best_idx] if best_idx >= 0 else ""
        best_score_pct = round(best * 100.0, 2)
        rule_ok = requirement_rule_match(r, resume_text)
        ok = best >= threshold or rule_ok
        status = "present" if ok else "missing"

        bucket = "must" if r in must_reqs else "nice"

        if ok:
            present.append(r)
            if bucket == "must":
                must_present.append(r)
            else:
                nice_present.append(r)
        else:
            missing.append(r)
            if bucket == "must":
                must_missing.append(r)
            else:
                nice_missing.append(r)

        evidence_list.append({
            "requirement": r,
            "bucket": bucket,
            "best_score": best_score_pct,
            "evidence": best_sent,
            "status": status,
        })

    coverage = round((len(present) / len(all_reqs)) * 100.0, 2) if all_reqs else 0.0
    must_cov = round((len(must_present) / len(must_reqs)) * 100.0, 2) if must_reqs else 0.0

    return {
        "coverage_percent": coverage,
        "must_coverage_percent": must_cov,
        "present_requirements": present,
        "missing_requirements": missing,
        "missing_must": must_missing,
        "missing_nice": nice_missing,
        "requirement_evidence": evidence_list,
    }


def remove_resume_noise(text: str) -> str:
    lines = text.split("\n")
    cleaned = []

    for line in lines:
        l = line.lower().strip()

        if "@" in l:
            continue

        if re.search(r"\+?\d[\d\s\-]{8,}", l):
            continue

        if any(w in l for w in ["address", "linkedin.com", "github.com"]):
            continue

        cleaned.append(line)

    return "\n".join(cleaned)


def boost_skills(text: str) -> str:
    skills = [
        "python", "java", "javascript", "react", "node", "fastapi",
        "django", "sql", "aws", "docker", "git", "rest api"
    ]

    boosted = text
    lower = text.lower()

    for s in skills:
        if s in lower:
            boosted += f" {s} {s}"

    return boosted


def compute_similarity_score(resume_text: str, jd_text: str) -> int:
    resume_text = boost_skills(resume_text)
    jd_text = boost_skills(jd_text)

    resume_emb = embedding_model.encode([resume_text], normalize_embeddings=True)
    jd_emb = embedding_model.encode([jd_text], normalize_embeddings=True)
    sim = cosine_similarity(resume_emb, jd_emb)[0][0]
    return int(round(sim * 100))


def detect_cs_role(jd_text: str) -> str:
    t = (jd_text or "").lower()

    frontend_hits = ["frontend", "react", "next.js", "typescript", "css", "ui"]
    backend_hits = ["backend", "fastapi", "django", "flask", "api", "postgres", "sql"]
    data_hits = ["data", "machine learning", "ml", "pipeline", "pandas", "numpy"]

    f = sum(1 for w in frontend_hits if w in t)
    b = sum(1 for w in backend_hits if w in t)
    d = sum(1 for w in data_hits if w in t)

    if max(f, b, d) == 0:
        return "general"
    if f >= b and f >= d:
        return "frontend"
    if b >= f and b >= d:
        return "backend"
    return "data"


def ats_decision(role: str, req_cov: float, skill_cov: float, final_score: int) -> str:
    gates = {
        "frontend": 60,
        "backend": 60,
        "data": 60,
        "general": 55
    }

    gate = gates.get(role, 55)

    if req_cov < 40:
        return "Not Qualified"

    if final_score >= 75 and skill_cov >= 70 and req_cov >= gate:
        return "Qualified"
    if final_score >= 55:
        return "Borderline"
    return "Not Qualified"


def extract_skill_hits(text: str) -> set:
    t = (text or "").lower()
    hits = set()

    for canonical, aliases in CS_SKILL_ALIASES.items():
        for a in aliases:
            if a in t:
                hits.add(canonical)
                break

    return hits


def evidence_lines_for_skill(resume_text: str, skill: str, max_lines: int = 2) -> list:
    lines = [ln.strip() for ln in (resume_text or "").split("\n") if ln.strip()]
    out = []

    for ln in lines:
        if skill.lower() in ln.lower():
            out.append(ln)
        if len(out) >= max_lines:
            break

    return out


def entry_level_decision(must_cov: float, final_score: int) -> str:
    if must_cov < 60:
        return "Not qualified"
    if final_score >= 75 and must_cov >= 80:
        return "Qualified"
    return "Borderline"


def entry_level_requirements_score(resume_text: str, jd_text: str) -> dict:
    resume_skills = extract_skill_hits(resume_text)
    jd_skills = extract_skill_hits(jd_text)

    must_have = set(list(jd_skills)[:6])
    preferred = set(list(jd_skills)[6:12])

    must_met = sorted(list(must_have & resume_skills))
    must_missing = sorted(list(must_have - resume_skills))

    pref_met = sorted(list(preferred & resume_skills))
    pref_missing = sorted(list(preferred - resume_skills))

    must_cov = round((len(must_met) / len(must_have)) * 100, 2) if must_have else 0.0
    pref_cov = round((len(pref_met) / len(preferred)) * 100, 2) if preferred else 0.0

    semantic = compute_similarity_score(resume_text, jd_text)
    final_score = int(round(0.60 * must_cov + 0.20 * pref_cov + 0.20 * semantic))
    decision = entry_level_decision(must_cov, final_score)

    evidence = {}
    for s in must_met[:8]:
        evidence[s] = evidence_lines_for_skill(resume_text, s)

    return {
        "semantic_score": int(semantic),
        "must_have_coverage": must_cov,
        "preferred_coverage": pref_cov,
        "final_match_score": final_score,
        "decision": decision,
        "must_have": sorted(list(must_have)),
        "must_have_met": must_met,
        "must_have_missing": must_missing,
        "preferred": sorted(list(preferred)),
        "preferred_met": pref_met,
        "preferred_missing": pref_missing,
        "evidence": evidence,
    }


def compute_final_match_score(resume_text: str, jd_text: str) -> dict:
    semantic = compute_similarity_score(resume_text, jd_text)

    gaps = keyword_gap_analysis(resume_text, jd_text, top_jd_terms=30)
    keyword = float(gaps.get("keyword_coverage_percent", 0.0))

    skill_gap = cs_skill_gap_analysis(resume_text, jd_text)
    skill_cov = float(skill_gap.get("coverage_percent", 0.0))

    req = requirements_coverage(resume_text, jd_text, threshold=0.30)
    must_cov = float(req.get("must_coverage_percent", 0.0))
    req_cov = float(req.get("coverage_percent", 0.0))

    final_score = int(round(
        0.40 * semantic +
        0.15 * keyword +
        0.20 * skill_cov +
        0.15 * must_cov +
        0.10 * req_cov
    ))

    return {
        "semantic_score": int(round(semantic)),
        "keyword_coverage": int(round(keyword)),
        "cs_skill_coverage": round(skill_cov, 2),
        "must_requirements_coverage": round(must_cov, 2),
        "requirements_coverage": round(req_cov, 2),
        "final_match_score": final_score,
        "keyword_gap_analysis": gaps,
        "cs_skill_gap_analysis": skill_gap,
        "requirements_gap": req,
    }


def top_matching_sentences(resume_text: str, jd_text: str, top_k: int = 5) -> List[Dict[str, object]]:
    """
    Explainability: find resume sentences most similar to the JD.
    """
    resume_text = remove_resume_noise(resume_text)
    jd_text = clean_job_description(jd_text)
    sents = split_into_sentences(resume_text)
    if not sents:
        return []

    sent_embs = embedding_model.encode(sents, normalize_embeddings=True)
    jd_emb = embedding_model.encode([jd_text], normalize_embeddings=True)

    sims = cosine_similarity(sent_embs, jd_emb).reshape(-1)
    top_idx = sims.argsort()[::-1][:top_k]

    results = []
    for idx in top_idx:
        results.append({
            "sentence": sents[int(idx)],
            "score": float(round(float(sims[int(idx)]) * 100, 2))
        })

    return results


def truncate_to_model_limit(text: str, tokenizer, max_input_tokens: int = 480) -> str:
    """
    Truncate text to fit model input length.
    """
    ids = tokenizer.encode(text, truncation=True, max_length=max_input_tokens)
    return tokenizer.decode(ids, skip_special_tokens=True)


import re


def build_structured_cv_from_sections(
    sections: dict,
    resume_text: str,
    job_description: str
) -> dict:
    header = extract_contact_info(resume_text)

    jd_lower = (job_description or "").lower()
    if "backend" in jd_lower:
        header["target_role"] = "Junior Backend Engineer"
    elif "frontend" in jd_lower:
        header["target_role"] = "Frontend Developer"
    elif "full stack" in jd_lower or "full-stack" in jd_lower:
        header["target_role"] = "Full Stack Developer"
    elif "data analyst" in jd_lower:
        header["target_role"] = "Data Analyst"
    elif "devops" in jd_lower:
        header["target_role"] = "DevOps Engineer"
    else:
        header["target_role"] = "Software Engineer"

    # Summary
    other_text = sections.get("other", "") or ""
    other_lines = [ln.strip() for ln in other_text.split("\n") if ln.strip()]

    summary = ""
    for ln in other_lines:
        low = ln.lower()

        if "@" in ln:
            continue
        if re.search(r"\+?\d[\d\s\-\(\)]{7,}", ln):
            continue
        if "linkedin" in low or "github" in low:
            continue
        if len(ln.split()) <= 4:
            continue

        summary = ln
        break

    if not summary:
        summary = "Computer Science student with technical experience aligned to software development roles."

    # Skills
    raw_skills_text = sections.get("skills", "") or ""
    if isinstance(raw_skills_text, str):
        skills = extract_skills_simple(raw_skills_text)
        if not skills:
            skills = detect_cs_skills(resume_text)[:12]
    else:
        skills = detect_cs_skills(resume_text)[:12]

    # Experience
    exp_text = sections.get("experience", "") or ""
    exp_lines = [ln.strip() for ln in exp_text.split("\n") if ln.strip()]

    experience = []
    if exp_lines:
        current = {
            "job_title": "",
            "company": "",
            "location": "",
            "dates": "",
            "bullets": []
        }

        for ln in exp_lines:
            low = ln.lower()

            if (
                ("|" in ln or "—" in ln or "-" in ln)
                and len(ln.split()) <= 18
                and not low.startswith("•")
            ):
                if current["job_title"] or current["bullets"]:
                    experience.append(current)

                current = {
                    "job_title": ln,
                    "company": "",
                    "location": "",
                    "dates": "",
                    "bullets": []
                }
            else:
                cleaned = re.sub(r"^[•\-\–\—]\s*", "", ln).strip()
                if cleaned:
                    current["bullets"].append(cleaned)

        if current["job_title"] or current["bullets"]:
            experience.append(current)

    # Projects
    proj_text = sections.get("projects", "") or ""
    proj_lines = [ln.strip() for ln in proj_text.split("\n") if ln.strip()]

    projects = []
    if proj_lines:
        current = {
            "project_name": "",
            "tech_stack": "",
            "bullets": []
        }

        for ln in proj_lines:
            low = ln.lower()

            if (
                ("|" in ln or "—" in ln or "-" in ln)
                and len(ln.split()) <= 18
                and not low.startswith("•")
            ):
                if current["project_name"] or current["bullets"]:
                    projects.append(current)

                current = {
                    "project_name": ln,
                    "tech_stack": "",
                    "bullets": []
                }
            else:
                cleaned = re.sub(r"^[•\-\–\—]\s*", "", ln).strip()
                if cleaned:
                    current["bullets"].append(cleaned)

        if current["project_name"] or current["bullets"]:
            projects.append(current)

    # Education
    edu_text = sections.get("education", "") or ""
    edu_lines = [ln.strip() for ln in edu_text.split("\n") if ln.strip()]

    education = []
    if edu_lines:
        first = edu_lines[0] if edu_lines else ""
        rest = edu_lines[1:4] if len(edu_lines) > 1 else []

        education.append({
            "degree": first,
            "institution": "",
            "dates": "",
            "details": " | ".join(rest)
        })

    return {
        "header": header,
        "summary": summary,
        "skills": skills[:12],
        "experience": experience[:4],
        "projects": projects[:4],
        "education": education[:2],
        "additional": []
    }


def extract_contact_info(resume_text: str) -> dict:
    text = resume_text or ""

    email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', text)
    phone_match = re.search(r'(\+?\d[\d\s\-\(\)]{8,}\d)', text)

    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    full_name = lines[0] if lines else ""

    linkedin = ""
    github = ""

    for ln in lines[:15]:
        low = ln.lower()
        if "linkedin" in low and not linkedin:
            linkedin = ln
        if "github" in low and not github:
            github = ln

    return {
        "full_name": full_name,
        "email": email_match.group(0) if email_match else "",
        "phone": phone_match.group(0) if phone_match else "",
        "location": "",
        "linkedin": linkedin,
        "github": github,
        "target_role": "",
    }


def build_structured_cv_from_sections(sections: dict, resume_text: str, job_description: str) -> dict:
    header = extract_contact_info(resume_text)

    jd_lower = (job_description or "").lower()
    if "backend" in jd_lower:
        header["target_role"] = "Junior Backend Engineer"
    elif "frontend" in jd_lower:
        header["target_role"] = "Frontend Developer"
    elif "full stack" in jd_lower or "full-stack" in jd_lower:
        header["target_role"] = "Full Stack Developer"
    elif "data analyst" in jd_lower:
        header["target_role"] = "Data Analyst"
    elif "devops" in jd_lower:
        header["target_role"] = "DevOps Engineer"
    else:
        header["target_role"] = "Software Engineer"

    profile = sections.get("profile", "") or ""
    skills = sections.get("skills", []) or []
    experience_lines = sections.get("experience", []) or []
    education_lines = sections.get("education", []) or []
    project_lines = sections.get("projects", []) or []

    experience = []
    for line in experience_lines:
        experience.append({
            "job_title": "",
            "company": "",
            "location": "",
            "dates": "",
            "bullets": [line] if line else []
        })

    projects = []
    for line in project_lines:
        projects.append({
            "project_name": "",
            "tech_stack": "",
            "bullets": [line] if line else []
        })

    education = []
    for line in education_lines:
        education.append({
            "degree": "",
            "institution": "",
            "dates": "",
            "details": line
        })

    return {
        "header": header,
        "summary": profile,
        "skills": skills,
        "experience": experience,
        "projects": projects,
        "education": education,
        "additional": []
    }


def extract_contact_info(resume_text: str) -> dict:
    text = resume_text or ""
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]

    email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', text)
    phone_match = re.search(r'(\+?\d[\d\s\-\(\)]{7,}\d)', text)

    linkedin_match = re.search(
        r'(https?://)?(www\.)?linkedin\.com/in/[A-Za-z0-9\-_\/]+',
        text,
        re.I
    )
    github_match = re.search(
        r'(https?://)?(www\.)?github\.com/[A-Za-z0-9\-_\/]+',
        text,
        re.I
    )

    full_name = ""
    for ln in lines[:5]:
        low = ln.lower()
        if "@" in ln:
            continue
        if re.search(r"\d", ln):
            continue
        if "linkedin" in low or "github" in low:
            continue
        if 2 <= len(ln.split()) <= 5:
            full_name = ln
            break

    location = ""
    for ln in lines[:8]:
        low = ln.lower()
        if "@" in ln:
            continue
        if re.search(r"\+?\d", ln):
            continue
        if "linkedin" in low or "github" in low:
            continue
        if any(x in low for x in [
            "london", "uk", "manchester", "birmingham", "leeds",
            "glasgow", "bristol", "liverpool", "coventry"
        ]):
            location = ln
            break

    return {
        "full_name": full_name,
        "email": email_match.group(0) if email_match else "",
        "phone": phone_match.group(0) if phone_match else "",
        "location": location,
        "linkedin": linkedin_match.group(0) if linkedin_match else "",
        "github": github_match.group(0) if github_match else "",
        "target_role": "",
    }


def build_fallback_cv_from_resume(resume_text: str, job_description: str) -> dict:
    cleaned = normalize_text(resume_text)
    sections = split_into_sections(cleaned)
    return build_structured_cv_from_sections(
        sections=sections,
        resume_text=cleaned,
        job_description=job_description
    )


@app.post("/ai_resume_suggestions")
async def ai_resume_suggestions(payload: Dict[str, str]):
    resume_text = normalize_text(payload.get("resume_text", ""))
    job_description = normalize_text(payload.get("job_description_text", ""))

    if len(resume_text) < 120:
        raise HTTPException(status_code=400, detail="Resume text too short.")
    if len(job_description) < 120:
        raise HTTPException(status_code=400, detail="Job description too short.")

    resume_text = resume_text[:4500]
    job_description = job_description[:1800]

    skill_gap = cs_skill_gap_analysis(resume_text, job_description)
    req_gap = requirements_coverage(resume_text, job_description, threshold=0.30)
    suggestions = generate_ats_suggestions(req_gap, skill_gap)

    header = extract_contact_info(resume_text)

    jd_lower = job_description.lower()
    if "backend" in jd_lower:
        header["target_role"] = "Junior Backend Engineer"
    elif "frontend" in jd_lower:
        header["target_role"] = "Frontend Developer"
    elif "full stack" in jd_lower or "full-stack" in jd_lower:
        header["target_role"] = "Full Stack Developer"
    elif "data analyst" in jd_lower:
        header["target_role"] = "Data Analyst"
    elif "devops" in jd_lower:
        header["target_role"] = "DevOps Engineer"
    else:
        header["target_role"] = "Software Engineer"

    prompt = f"""
You are an ATS resume writer.

Return ONLY valid JSON.
Do NOT invent skills, education, experience, or projects not present in the resume.
You may rewrite, reorder, and emphasize relevant evidence already present in the resume.

IMPORTANT RULE:
If a missing requirement is not supported by the resume, do NOT add it.
Only strengthen wording where truthful evidence already exists.

Goal:
Create a stronger ATS-friendly CV draft that improves match with the target job.

Use these ATS gap signals:
Missing MUST requirements:
{req_gap.get("missing_must", [])}

Missing NICE requirements:
{req_gap.get("missing_nice", [])}

Missing skills:
{skill_gap.get("missing_skills", [])}

ATS improvement suggestions:
{suggestions}

Required JSON schema:
{{
  "summary": "2-3 lines summary",
  "skills": ["skill1", "skill2"],
  "experience": [
    {{
      "job_title": "",
      "company": "",
      "location": "",
      "dates": "",
      "bullets": ["bullet1", "bullet2"]
    }}
  ],
  "projects": [
    {{
      "project_name": "",
      "tech_stack": "",
      "bullets": ["bullet1", "bullet2"]
    }}
  ],
  "education": [
    {{
      "degree": "",
      "institution": "",
      "dates": "",
      "details": ""
    }}
  ],
  "additional": ["item1", "item2"]
}}

JOB DESCRIPTION:
{job_description}

RESUME:
{resume_text}
""".strip()

    raw = ""
    structured = {}

    try:
        tok = rewrite_model.tokenizer
        safe_prompt = truncate_to_model_limit(prompt, tok, 480)

        out = rewrite_model(
            safe_prompt,
            max_new_tokens=300,
            truncation=True,
            do_sample=False
        )[0]

        raw = (out.get("generated_text") or "").strip()
    except Exception:
        raw = ""

    if raw:
        try:
            import json
            json_match = re.search(r"\{.*\}", raw, re.S)
            if json_match:
                structured = json.loads(json_match.group(0))
        except Exception:
            structured = {}

    if not isinstance(structured, dict):
        structured = {}

    required_keys = ["summary", "skills", "experience", "projects", "education", "additional"]
    has_valid_schema = all(k in structured for k in required_keys)

    if not has_valid_schema:
        cv_data = build_fallback_cv_from_resume(resume_text, job_description)
    if not cv_data.get("summary") or len(cv_data.get("summary", "").split()) < 3:
        cv_data["summary"] = "Computer Science student with technical experience aligned to software development roles."
    cv_data["skills"] = [s for s in cv_data.get("skills", []) if s.strip()][:12]
    for key in ["experience", "projects", "education", "additional"]:
        if key not in cv_data or not isinstance(cv_data[key], list):
            cv_data[key] = []
    else:
        cv_data = {
            "header": header,
            "summary": structured.get("summary", ""),
            "skills": structured.get("skills", []),
            "experience": structured.get("experience", []),
            "projects": structured.get("projects", []),
            "education": structured.get("education", []),
            "additional": structured.get("additional", [])
        }

    raw_draft_parts = []

    if cv_data["summary"]:
        raw_draft_parts.append("PROFILE:\n" + cv_data["summary"])

    if cv_data["skills"]:
        raw_draft_parts.append("SKILLS:\n" + "\n".join([f"- {x}" for x in cv_data["skills"]]))

    if cv_data["experience"]:
        exp_lines = []
        for item in cv_data["experience"]:
            title_line = " | ".join([
                item.get("job_title", ""),
                item.get("company", ""),
                item.get("dates", "")
            ]).strip(" |")
            if title_line:
                exp_lines.append(title_line)
            for b in item.get("bullets", []):
                exp_lines.append(f"- {b}")
        raw_draft_parts.append("EXPERIENCE:\n" + "\n".join(exp_lines))

    if cv_data["projects"]:
        proj_lines = []
        for item in cv_data["projects"]:
            title_line = " | ".join([
                item.get("project_name", ""),
                item.get("tech_stack", "")
            ]).strip(" |")
            if title_line:
                proj_lines.append(title_line)
            for b in item.get("bullets", []):
                proj_lines.append(f"- {b}")
        raw_draft_parts.append("PROJECTS:\n" + "\n".join(proj_lines))

    if cv_data["education"]:
        edu_lines = []
        for item in cv_data["education"]:
            title_line = " | ".join([
                item.get("degree", ""),
                item.get("institution", ""),
                item.get("dates", "")
            ]).strip(" |")
            if title_line:
                edu_lines.append(title_line)
            if item.get("details"):
                edu_lines.append(f"- {item['details']}")
        raw_draft_parts.append("EDUCATION:\n" + "\n".join(edu_lines))

    one_page_summary_draft = "\n\n".join(raw_draft_parts).strip()

    return {
        "one_page_summary_draft": one_page_summary_draft,
        "sections": {
            "profile": cv_data["summary"],
            "skills": cv_data["skills"],
            "experience": [b for e in cv_data["experience"] for b in e.get("bullets", [])],
            "education": [f"{x.get('degree', '')} {x.get('institution', '')}".strip() for x in cv_data["education"]],
            "projects": [b for p in cv_data["projects"] for b in p.get("bullets", [])],
        },
        "cv_data": cv_data,
        "raw_draft": raw,
        "ats_rewrite_tips": [
            "Use Action + Impact bullet points (verb + result).",
            "Mirror job keywords naturally (no fake claims).",
            "Keep ATS formatting: simple headings, no tables/icons.",
            "Keep to 1–2 pages by removing weak/repeated bullets.",
        ],
        "disclaimer": "Guidance only. Ensure all information remains truthful and accurate."
    }


def get_resume_relevant_text(resume_cleaned: str) -> str:
    sections = split_into_sections(resume_cleaned)
    parts = [
        sections.get("skills", ""),
        sections.get("experience", ""),
        sections.get("projects", ""),
        sections.get("education", ""),
    ]
    return "\n".join([p for p in parts if p.strip()])


def extract_requirements_from_jd(jd_text) -> dict:
    """
    Returns:
    {
      "must": [...],
      "nice": [...]
    }
    """
    jd = normalize_text(str(jd_text or ""))
    if not jd.strip():
        return {"must": [], "nice": []}

    jd = re.sub(r"\s+(?=\d+\s+)", "\n", jd)
    jd = re.sub(r"\s+(?=[•\-–—]\s+)", "\n", jd)
    jd = re.sub(
        r"(Required Skills|Must[- ]have|Preferred|Nice[- ]to[- ]have|Responsibilities)\s*:",
        r"\1:\n",
        jd,
        flags=re.I
    )

    lines = [ln.strip() for ln in jd.split("\n") if ln.strip()]

    must, nice = [], []
    current_bucket = "must"

    for ln in lines:
        l = ln.lower()

        if any(h in l for h in ["preferred", "nice to have", "nice-to-have"]):
            current_bucket = "nice"
            continue
        if any(h in l for h in ["required", "must have", "must-have"]):
            current_bucket = "must"
            continue
        if l in {"responsibilities", "requirements", "nice to have", "preferred", "must have"}:
            continue

        if any(x in l for x in [
            "benefits", "discount", "pension", "holiday", "apply", "application",
            "equal opportunity", "contact", "we offer"
        ]):
            continue

        if re.match(r"^(\d+[\.\)]+\s+|[-•–—\*\u2022]\s+)", ln):
            ln2 = re.sub(r"^(\d+[\.\)]+\s+|[-•–—\*\u2022]\s+)", "", ln).strip()
        else:
            continue

        if not (4 <= len(ln2.split()) <= 22):
            continue

        if current_bucket == "must":
            must.append(ln2)
        else:
            nice.append(ln2)

    def dedupe(items: list) -> list:
        seen = set()
        out = []
        for x in items:
            key = re.sub(r"[^a-z0-9 ]+", "", x.lower()).strip()
            key = re.sub(r"\s+", " ", key)
            if key and key not in seen:
                seen.add(key)
                out.append(x)
        return out

    return {
        "must": dedupe(must)[:12],
        "nice": dedupe(nice)[:10],
    }


def evidence_for_terms(resume_text: str, terms: List[str], max_lines_each: int = 1) -> Dict[str, List[str]]:
    lines = [ln.strip() for ln in (resume_text or "").split("\n") if ln.strip()]
    out = {}

    for t in terms:
        hits = []
        for ln in lines:
            if t.lower() in ln.lower():
                hits.append(ln)
            if len(hits) >= max_lines_each:
                break
        if hits:
            out[t] = hits

    return out


def skill_evidence_map(resume_text: str, skills: list, max_lines_each: int = 1) -> dict:
    """
    Returns a mapping of skill to evidence lines.
    """
    lines = [ln.strip() for ln in (resume_text or "").split("\n") if ln.strip()]
    out = {}

    for skill in skills:
        found = []
        skill_lower = skill.lower()

        for ln in lines:
            ln_lower = ln.lower()
            if skill_lower in ln_lower:
                found.append(ln)
            else:
                aliases = CS_SKILL_ALIASES.get(skill, [])
                if any(a.lower() in ln_lower for a in aliases):
                    found.append(ln)

            if len(found) >= max_lines_each:
                break

        out[skill] = found

    return out


def generate_ats_suggestions(req_gap: dict, skill_gap: dict) -> List[str]:
    suggestions = []

    for req in req_gap.get("missing_must", [])[:3]:
        suggestions.append(f"Add evidence for: {req}")

    for req in req_gap.get("missing_nice", [])[:2]:
        suggestions.append(f"If true, mention: {req}")

    for skill in skill_gap.get("missing_skills", [])[:3]:
        suggestions.append(f"Add project or skill evidence for: {skill}")

    return suggestions[:6]


@app.post("/analyze_match")
async def analyze_match(payload: Dict[str, str]):
    resume_text = normalize_text(payload.get("resume_text", ""))
    jd_text = clean_job_description(payload.get("job_description_text", ""))

    resume_text = remove_resume_noise(resume_text)
    resume_relevant = get_resume_relevant_text(resume_text)

    MIN_LEN = 50
    if len(resume_text) < MIN_LEN:
        raise HTTPException(status_code=400, detail=f"resume_text is too short (min {MIN_LEN} chars).")
    if len(jd_text) < MIN_LEN:
        raise HTTPException(status_code=400, detail=f"job_description_text is too short (min {MIN_LEN} chars).")

    scores = compute_final_match_score(resume_text, jd_text)

    semantic = float(scores["semantic_score"])
    keyword = float(scores["keyword_coverage"])
    skill_cov = float(scores["cs_skill_coverage"])
    must_cov = float(scores["must_requirements_coverage"])
    req_cov = float(scores["requirements_coverage"])

    matches = top_matching_sentences(resume_relevant, jd_text)

    skill_gap = scores["cs_skill_gap_analysis"]
    req = scores["requirements_gap"]

    role = detect_cs_role(jd_text)
    decision = ats_decision(role, must_cov, skill_cov, scores["final_match_score"])
    confidence = get_match_confidence(scores["final_match_score"])

    skill_evidence = skill_evidence_map(
        resume_relevant,
        skill_gap.get("exact_present_skills", [])[:10],
        max_lines_each=1
    )

    suggestions = generate_ats_suggestions(req, skill_gap)

    return {
        "model": MODEL_NAME,
        "role_detected": role,
        "decision": decision,
        "match_confidence": confidence,
        "semantic_score": int(round(semantic)),
        "keyword_coverage": int(round(keyword)),
        "cs_skill_coverage": skill_cov,
        "must_requirements_coverage": must_cov,
        "requirements_coverage": req_cov,
        "final_match_score": scores["final_match_score"],
        "ats_suggestions": suggestions,
        "keyword_gap_analysis": scores["keyword_gap_analysis"],
        "cs_skill_gap_analysis": skill_gap,
        "skill_evidence": skill_evidence,
        "requirements_gap": {
            "missing_requirements": req.get("missing_requirements", []),
            "present_requirements": req.get("present_requirements", []),
            "missing_must": req.get("missing_must", []),
            "missing_nice": req.get("missing_nice", []),
            "requirement_evidence": req.get("requirement_evidence", []),
        },
        "top_matching_resume_sentences": matches,
    }


def get_match_confidence(final_score: int) -> str:
    if final_score >= 80:
        return "High"
    if final_score >= 60:
        return "Medium"
    return "Low"


def tokenize_for_keywords(text: str) -> List[str]:
    """
    Simple keyword tokenization.
    """
    text = text.lower()
    tokens = re.findall(r"[a-zA-Z][a-zA-Z0-9\+\#\.\-]{1,}", text)
    cleaned = []

    for t in tokens:
        t = t.strip(".-")
        if len(t) < 2:
            continue
        if t in STOPWORDS:
            continue
        cleaned.append(t)

    return cleaned


RETAIL_SKILLS = [
    "customer service", "stock replenishment", "replenishing stock", "merchandising",
    "food safety", "hygiene", "date checking", "temperature checks", "cleaning",
    "teamwork", "complaint handling", "till", "pos", "cash handling",
    "inventory", "shelf stacking", "product knowledge", "promotions",
    "fast-paced", "attention to detail", "flexible", "digital tools", "technology"
]


def skill_gap_analysis(resume: str, jd: str):
    r = resume.lower()
    j = jd.lower()

    jd_skills = [s for s in RETAIL_SKILLS if s in j]
    present = [s for s in jd_skills if s in r]
    missing = [s for s in jd_skills if s not in r]

    coverage = round((len(present) / len(jd_skills)) * 100, 2) if jd_skills else 0.0

    return {
        "present_skills": present,
        "missing_skills": missing,
        "coverage_percent": coverage,
        "jd_skills_detected": jd_skills
    }


def top_tfidf_terms(doc_a: str, doc_b: str, top_k: int = 25) -> Dict[str, List[Dict[str, object]]]:
    """
    Returns top TF-IDF terms for each document.
    """
    vectorizer = TfidfVectorizer(
        lowercase=True,
        stop_words="english",
        ngram_range=(1, 2),
        max_features=3000
    )
    X = vectorizer.fit_transform([doc_a, doc_b])
    feature_names = vectorizer.get_feature_names_out()

    def get_top_terms(row_index: int) -> List[Dict[str, object]]:
        row = X[row_index].toarray().flatten()
        top_idx = row.argsort()[::-1][:top_k]
        out = []
        for idx in top_idx:
            score = float(row[idx])
            if score <= 0:
                continue
            out.append({"term": feature_names[idx], "tfidf": round(score, 4)})
        return out

    return {
        "resume_top_terms": get_top_terms(0),
        "jd_top_terms": get_top_terms(1),
    }


def normalize_text_for_match(text: str) -> str:
    text = (text or "").lower()
    text = re.sub(r"\b\d+\b", " ", text)
    text = re.sub(r"[^a-z0-9\s+#.-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalize_text_for_match(text: str) -> str:
    text = (text or "").lower()
    text = re.sub(r"\b\d+\b", " ", text)
    text = re.sub(r"[^a-z0-9\s+#.-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def keyword_gap_analysis(resume_text: str, jd_text: str, top_jd_terms: int = 30) -> Dict[str, object]:
    """
    Smarter keyword gap analysis.
    """
    resume_text = (resume_text or "").lower()
    jd_text = (jd_text or "").lower()

    tfidf = top_tfidf_terms(resume_text, jd_text, top_k=top_jd_terms)
    raw_terms = [x["term"] for x in tfidf.get("jd_top_terms", [])]

    BAD_TERMS = {
        "role", "company", "join", "people", "person", "year", "years", "local", "excellent", "talented",
        "required", "responsible", "opportunity", "position", "employee", "business", "work", "working",
        "job", "jobs", "candidate", "candidates", "apply", "application", "vacancies",
        "benefits", "reward", "rewards", "discount", "discounts", "pension", "holiday", "scheme", "schemes",
        "hours", "timings", "week", "weeks", "day", "days",
        "provided", "provide", "needs", "need",
        "store", "stores", "shopping", "customers",
        "responsibilities", "requirements", "nice", "have"
    }

    KEYWORD_ALIASES = {
        "rest api": ["rest api", "rest apis", "restful api", "restful apis", "api development", "api", "apis"],
        "sql": ["sql", "postgresql", "postgres", "mysql", "sqlite", "database", "databases", "sql database", "sql databases", "data storage", "query optimization", "queries"],
        "git": ["git", "github", "gitlab", "version control", "source control"],
        "python": ["python"],
        "django": ["django"],
        "fastapi": ["fastapi"],
        "docker": ["docker", "container", "containerization", "containers"],
        "aws": ["aws", "cloud", "amazon web services"],
        "backend": ["backend", "backend systems", "server side", "server-side"],
        "collaborate": ["collaborate", "team", "worked with", "led team", "teamwork", "cross-functional", "coordinated"],
    }

    def normalize_term(term: str) -> str:
        t = term.lower().strip()
        t = re.sub(r"\b\d+\b", " ", t)
        t = re.sub(r"[^a-z0-9\s+#.-]", " ", t)
        t = re.sub(r"\s+", " ", t).strip()

        for canon, aliases in KEYWORD_ALIASES.items():
            if t == canon or t in aliases:
                return canon
        return t

    resume_norm = normalize_text_for_match(resume_text)

    filtered_terms = []
    seen = set()

    for term in raw_terms:
        t = normalize_term(term)
        if not t or t in BAD_TERMS:
            continue
        if len(t) < 2:
            continue
        if t not in seen:
            seen.add(t)
            filtered_terms.append(t)

    jd_detected_skills = detect_cs_skills(jd_text)
    resume_detected_skills = detect_cs_skills(resume_text)

    for skill in resume_detected_skills:
        if skill not in filtered_terms:
            filtered_terms.append(skill)

    for s in jd_detected_skills:
        if s not in seen:
            seen.add(s)
            filtered_terms.append(s)

    present_terms = []
    missing_terms = []

    for term in filtered_terms:
        aliases = KEYWORD_ALIASES.get(term, [term])
        found = any(
            alias in resume_norm or (word in resume_norm for word in alias.split())
            for alias in aliases
        )
        if found:
            present_terms.append(term)
        else:
            missing_terms.append(term)

    coverage = round((len(present_terms) / len(filtered_terms)) * 100, 2) if filtered_terms else 0.0

    return {
        "jd_top_terms": filtered_terms,
        "present_terms": present_terms,
        "missing_terms": missing_terms,
        "keyword_coverage_percent": coverage
    }


def extract_skill_hits(text: str) -> set:
    t = text.lower()
    hits = set()

    for canonical, aliases in CS_SKILL_ALIASES.items():
        if any(a in t for a in aliases):
            hits.add(canonical)

    return hits


def skill_match_score(resume_text: str, jd_text: str) -> dict:
    jd_skills = extract_skill_hits(jd_text)
    resume_skills = extract_skill_hits(resume_text)

    present = sorted(list(jd_skills & resume_skills))
    missing = sorted(list(jd_skills - resume_skills))

    coverage = round((len(present) / len(jd_skills)) * 100, 2) if jd_skills else 0.0

    return {
        "jd_skills": sorted(list(jd_skills)),
        "present_skills": present,
        "missing_skills": missing,
        "coverage": coverage,
    }


@app.post("/analyze_match_with_file")
async def analyze_match_with_file(
    file: UploadFile = File(...),
    job_description_text: str = ""
):
    filename = (file.filename or "").lower()
    file_bytes = await file.read()

    if filename.endswith(".pdf"):
        raw_text = extract_text_from_pdf(file_bytes)
    elif filename.endswith(".docx"):
        raw_text = extract_text_from_docx(file_bytes)
    else:
        raise HTTPException(status_code=400, detail="Upload a .pdf or .docx")

    resume_text = normalize_text(raw_text)
    jd_text = normalize_text(job_description_text)

    if len(resume_text) < 50:
        raise HTTPException(status_code=400, detail="Resume text extraction failed or too short.")
    if len(jd_text) < 50:
        raise HTTPException(status_code=400, detail="Job description is too short.")

    score = compute_similarity_score(resume_text, jd_text)
    matches = top_matching_sentences(resume_text, jd_text, top_k=5)

    return {
        "model": MODEL_NAME,
        "similarity_score": score,
        "top_matching_resume_sentences": matches
    }


# ----------------------------
# Endpoints
# ----------------------------
@app.post("/parse_resume")
async def parse_resume(file: UploadFile = File(...)):
    """
    Upload resume and return cleaned text, sections, and skills list.
    """
    filename = (file.filename or "").lower()
    file_bytes = await file.read()

    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")

    try:
        if filename.endswith(".pdf"):
            raw_text = extract_text_from_pdf(file_bytes)
            filetype = "pdf"
        elif filename.endswith(".docx"):
            raw_text = extract_text_from_docx(file_bytes)
            filetype = "docx"
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Upload .pdf or .docx.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse resume: {str(e)}")

    cleaned_text = normalize_text(raw_text)

    if not cleaned_text:
        return {
            "filename": file.filename,
            "filetype": filetype,
            "cleaned_text": "",
            "sections": {"education": "", "experience": "", "skills": "", "projects": "", "other": ""},
            "skills_list": [],
            "warning": "No text extracted. PDF may be scanned (image-based).",
        }

    sections = split_into_sections(cleaned_text)
    skills_list = extract_skills_simple(sections.get("skills", ""))

    return {
        "filename": file.filename,
        "filetype": filetype,
        "cleaned_text": cleaned_text,
        "sections": sections,
        "skills_list": skills_list,
    }


@app.post("/analyze_text")
async def analyze_text(payload: Dict[str, str]):
    """
    Paste raw resume text and get normalized text, section split, and skills.
    """
    text = payload.get("text", "")
    cleaned_text = normalize_text(text)
    sections = split_into_sections(cleaned_text)
    skills_list = extract_skills_simple(sections.get("skills", ""))

    return {
        "cleaned_text": cleaned_text,
        "sections": sections,
        "skills_list": skills_list,
    }