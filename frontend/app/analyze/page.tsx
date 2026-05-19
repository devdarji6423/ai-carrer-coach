"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  FileText,
  UploadCloud,
  Target,
  AlertTriangle,
  Sparkles,
  Wand2,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

const BACKEND_URL = "http://127.0.0.1:8000";
const MAX_FILE_MB = 5;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type ParseResult = {
  filename: string;
  filetype: string;
  cleaned_text: string;
  warning?: string;
};

type AnalyzeResult = {
  semantic_score: number;
  keyword_coverage: number;
  final_match_score: number;
  match_confidence?: string;
  skill_evidence?: Record<string, string[]>;
  cs_skill_coverage?: number;
  requirements_coverage?: number;
  role_detected?: string;
  keyword_gap_analysis: { missing_terms: string[] };
  ats_suggestions?: string[];
  must_requirements_coverage?: number;
  requirements_gap?: {
    missing_requirements: string[];
    present_requirements: string[];
    missing_must?: string[];
    missing_nice?: string[];
    requirement_evidence?: {
      requirement: string;
      bucket: string;
      best_score: number;
      evidence: string;
      status: string;
    }[];
  };
  cs_skill_gap_analysis?: {
    skill_coverage_percent: number;
    missing_skills: string[];
    exact_present_skills?: string[];
    similar_present_skills?: {
      required_skill: string;
      matched_with: string;
    }[];
  };
  decision?: string;
  top_matching_resume_sentences?: {
    score: number;
    sentence: string;
  }[];
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Safely reads backend error responses.
 * Tries JSON first, then falls back to status text.
 */
async function safeError(res: Response) {
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") return data.detail;
    return JSON.stringify(data?.detail ?? data);
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

/* -------------------------------------------------------------------------- */
/* Main Page Component                                                        */
/* -------------------------------------------------------------------------- */

export default function AnalyzePage() {
  /* -------------------------------- State -------------------------------- */

  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState("");

  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);

  /* ---------------------------- Derived values ---------------------------- */

  const fileInfo = useMemo(() => {
    if (!file) return null;
    const mb = (file.size / (1024 * 1024)).toFixed(2);
    return `${file.name} (${mb} MB)`;
  }, [file]);

  const canAnalyze =
    !!file && jobDescription.trim().length >= 80 && !loading;

  const canGenerateAI =
    !!parseResult?.cleaned_text &&
    parseResult.cleaned_text.length > 50 &&
    !!analyzeResult &&
    !aiLoading;

  /* ---------------------------- File selection ---------------------------- */

  /**
   * Handles file selection and validates:
   * - extension type
   * - max file size
   */
  function onPickFile(f: File | null) {
    setError(null);
    setParseResult(null);
    setAnalyzeResult(null);

    if (!f) {
      setFile(null);
      return;
    }

    const name = f.name.toLowerCase();
    const okType = name.endsWith(".pdf") || name.endsWith(".docx");

    if (!okType) {
      setError("Only PDF or DOCX files are supported.");
      setFile(null);
      return;
    }

    if (f.size > MAX_FILE_BYTES) {
      setError(`File too large. Max size is ${MAX_FILE_MB} MB.`);
      setFile(null);
      return;
    }

    setFile(f);
  }

  /* ---------------------------- Main analysis ----------------------------- */

  /**
   * Step 1: Parse uploaded resume
   * Step 2: Analyze parsed resume against the job description
   * Step 3: Save results for CV builder use
   */
  async function handleAnalyze() {
    setError(null);
    setParseResult(null);
    setAnalyzeResult(null);

    if (!file) {
      setError("Please upload a resume (PDF/DOCX).");
      return;
    }

    if (jobDescription.trim().length < 80) {
      setError("Please paste a fuller job description (80+ characters).");
      return;
    }

    setLoading(true);

    try {
      /* -------------------------- Parse resume file ------------------------- */
      const fd = new FormData();
      fd.append("file", file);

      const p = await fetch(`${BACKEND_URL}/parse_resume`, {
        method: "POST",
        body: fd,
      });

      if (!p.ok) {
        throw new Error(`parse_resume failed: ${await safeError(p)}`);
      }

      const parsed: ParseResult = await p.json();
      setParseResult(parsed);

      if (!parsed.cleaned_text || parsed.cleaned_text.trim().length < 50) {
        throw new Error(
          parsed.warning ||
            "No text extracted. Try uploading a DOCX (some PDFs are scanned images)."
        );
      }

      /* ------------------------- Analyze parsed text ------------------------ */
      const a = await fetch(`${BACKEND_URL}/analyze_match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_text: parsed.cleaned_text,
          job_description_text: jobDescription,
        }),
      });

      if (!a.ok) {
        throw new Error(`analyze_match failed: ${await safeError(a)}`);
      }

      const analyzed: AnalyzeResult = await a.json();
      setAnalyzeResult(analyzed);

      /* --------------------------- Persist results ------------------------- */
      localStorage.setItem("original_analyze_result", JSON.stringify(analyzed));
      localStorage.setItem("original_job_description", jobDescription);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  /* ---------------------------- AI CV Builder ----------------------------- */

  /**
   * Sends parsed resume text + job description to AI endpoint,
   * then stores structured CV builder data and navigates to builder page.
   */
  async function handleGenerateAI() {
    setError(null);

    if (!parseResult?.cleaned_text) {
      setError("Please analyze first.");
      return;
    }

    setAiLoading(true);

    try {
      const r = await fetch(`${BACKEND_URL}/ai_resume_suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_text: parseResult.cleaned_text,
          job_description_text: jobDescription,
        }),
      });

      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`AI API error: ${r.status} ${txt}`);
      }

      const data = await r.json();

      if (!data.cv_data) {
        throw new Error("AI did not return structured CV data.");
      }

      localStorage.setItem("cv_builder_data", JSON.stringify(data));

      if (analyzeResult) {
        localStorage.setItem(
          "original_analyze_result",
          JSON.stringify(analyzeResult)
        );
      }

      localStorage.setItem("original_job_description", jobDescription);

      window.location.href = "/cv-builder";
    } catch (e: any) {
      setError(e?.message ?? "AI request failed.");
    } finally {
      setAiLoading(false);
    }
  }

  /* -------------------------------- Render ------------------------------- */

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 via-sky-50 to-white text-black">
      {/* -------------------------------------------------------------------- */}
      {/* Header                                                               */}
      {/* -------------------------------------------------------------------- */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-black/70 transition hover:text-black"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 shadow-soft ring-1 ring-black/5">
          <FileText className="h-4 w-4 text-sky-700" />
          <span className="text-sm font-semibold">Resume Analysis</span>
        </div>
      </header>

      {/* -------------------------------------------------------------------- */}
      {/* Page Body                                                            */}
      {/* -------------------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-6 pb-14">
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Analyze your resume against a job
          </h1>
          <p className="mt-2 text-base text-black/70">
            Upload a resume and paste a job description to get ATS-style match
            scoring, missing requirements, skill gap analysis, explainable
            evidence, and AI-guided CV improvement.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
          {/* ---------------------------------------------------------------- */}
          {/* Left Column: Inputs                                              */}
          {/* ---------------------------------------------------------------- */}
          <div className="space-y-5">
            {/* Resume Upload Card */}
            <div className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-black/5">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-sky-50 ring-1 ring-sky-200/60">
                  <UploadCloud className="h-5 w-5 text-sky-700" />
                </div>

                <div className="flex-1">
                  <h2 className="text-lg font-bold">1) Upload Resume</h2>
                  <p className="mt-1 text-sm text-black/60">
                    Accepted: <b>PDF</b>, <b>DOCX</b> (max {MAX_FILE_MB}MB).
                    Best: DOCX.
                  </p>

                  <input
                    type="file"
                    accept=".pdf,.docx"
                    onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                    className="mt-4 block w-full text-sm file:mr-4 file:rounded-2xl file:border-0 file:bg-sky-100 file:px-4 file:py-2 file:font-semibold file:text-black transition hover:file:bg-sky-200"
                  />

                  {fileInfo && (
                    <div className="mt-3 text-sm text-green-700">
                      Selected: <b>{fileInfo}</b>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Job Description Card */}
            <div className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-black/5">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-sky-50 ring-1 ring-sky-200/60">
                  <Target className="h-5 w-5 text-sky-700" />
                </div>

                <div className="flex-1">
                  <h2 className="text-lg font-bold">2) Paste Job Description</h2>
                  <p className="mt-1 text-sm text-black/60">
                    Recommended: 80+ characters.
                  </p>

                  <textarea
                    rows={10}
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder="Paste job description here..."
                    className="mt-4 w-full rounded-2xl border border-black/10 p-4 text-base text-black placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-sky-300"
                  />
                </div>
              </div>
            </div>

            {/* Analyze Button */}
            <button
              className="w-full rounded-2xl bg-sky-600 py-3 text-base font-semibold text-white shadow-soft transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canAnalyze}
              onClick={handleAnalyze}
            >
              {loading ? "Analyzing..." : "Analyze Resume"}
            </button>

            {/* Error Message */}
            {error && (
              <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <div>{error}</div>
              </div>
            )}

            {/* Parse Warning */}
            {parseResult?.warning && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <b>Note:</b> {parseResult.warning}
              </div>
            )}
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Right Column: Results                                            */}
          {/* ---------------------------------------------------------------- */}
          <div className="space-y-5">
            <div className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-black/5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-sky-700" />
                <h2 className="text-lg font-bold">Results</h2>
              </div>

              {!analyzeResult ? (
                <p className="mt-3 text-sm text-black/60">
                  Run analysis to see results.
                </p>
              ) : (
                <>
                  {/* ---------------------------------------------------------- */}
                  {/* Top metrics                                                */}
                  {/* ---------------------------------------------------------- */}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                      label="Final match score"
                      value={`${analyzeResult.final_match_score ?? 0} / 100`}
                    />
                    <MetricCard
                      label="Role detected"
                      value={analyzeResult.role_detected ?? "N/A"}
                    />
                    <MetricCard
                      label="Decision"
                      value={analyzeResult.decision ?? "N/A"}
                    />
                    <MetricCard
                      label="Match confidence"
                      value={analyzeResult.match_confidence ?? "N/A"}
                    />
                    <MetricCard
                      label="Keyword coverage"
                      value={`${analyzeResult.keyword_coverage ?? 0}%`}
                    />
                    <MetricCard
                      label="Must requirements coverage"
                      value={`${analyzeResult.must_requirements_coverage ?? 0}%`}
                    />
                    <MetricCard
                      label="CS skill coverage"
                      value={`${
                        analyzeResult.cs_skill_gap_analysis
                          ?.skill_coverage_percent ?? 0
                      }%`}
                    />
                    <MetricCard
                      label="Requirements coverage"
                      value={`${analyzeResult.requirements_coverage ?? 0}%`}
                    />
                  </div>

                  {/* ---------------------------------------------------------- */}
                  {/* Score breakdown                                            */}
                  {/* ---------------------------------------------------------- */}
                  <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-black/5">
                    <div className="text-sm font-semibold">Score breakdown</div>
                    <div className="mt-2 space-y-1 text-sm text-black/70">
                      <div>
                        Semantic similarity: {analyzeResult.semantic_score ?? 0}%
                      </div>
                      <div>
                        Keyword coverage: {analyzeResult.keyword_coverage ?? 0}%
                      </div>
                      <div>
                        CS skill coverage:{" "}
                        {analyzeResult.cs_skill_gap_analysis
                          ?.skill_coverage_percent ?? 0}
                        %
                      </div>
                      <div>
                        Must requirements coverage:{" "}
                        {analyzeResult.must_requirements_coverage ?? 0}%
                      </div>
                      <div>
                        Requirements coverage:{" "}
                        {analyzeResult.requirements_coverage ?? 0}%
                      </div>
                    </div>
                  </div>

                  {/* ---------------------------------------------------------- */}
                  {/* Missing MUST requirements                                  */}
                  {/* ---------------------------------------------------------- */}
                  <div className="mt-4 rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
                    <div className="text-sm font-semibold text-red-800">
                      Missing MUST requirements
                    </div>
                    <div className="mt-2 text-sm text-red-700">
                      {(analyzeResult.requirements_gap?.missing_must ?? []).length ? (
                        <ul className="list-disc space-y-1 pl-5">
                          {(analyzeResult.requirements_gap?.missing_must ?? [])
                            .slice(0, 5)
                            .map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                        </ul>
                      ) : (
                        "No missing MUST requirements."
                      )}
                    </div>
                  </div>

                  {/* ---------------------------------------------------------- */}
                  {/* Missing skills                                              */}
                  {/* ---------------------------------------------------------- */}
                  <div className="mt-4 rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
                    <div className="text-sm font-semibold">Missing skills</div>
                    <div className="mt-2 text-sm text-black/70">
                      {analyzeResult.cs_skill_gap_analysis?.missing_skills?.length ? (
                        <ul className="list-disc space-y-1 pl-5">
                          {analyzeResult.cs_skill_gap_analysis.missing_skills
                            .slice(0, 5)
                            .map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                        </ul>
                      ) : (
                        "No missing CS skills detected."
                      )}
                    </div>
                  </div>

                  {/* ---------------------------------------------------------- */}
                  {/* Missing nice-to-have requirements                           */}
                  {/* ---------------------------------------------------------- */}
                  <div className="mt-4 rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
                    <div className="text-sm font-semibold">
                      Missing nice-to-have requirements
                    </div>
                    <div className="mt-2 text-sm text-black/70">
                      {(analyzeResult.requirements_gap?.missing_nice ?? []).length ? (
                        <ul className="list-disc space-y-1 pl-5">
                          {(analyzeResult.requirements_gap?.missing_nice ?? [])
                            .slice(0, 5)
                            .map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                        </ul>
                      ) : (
                        "No missing nice-to-have requirements."
                      )}
                    </div>
                  </div>

                  {/* ---------------------------------------------------------- */}
                  {/* ATS suggestions                                             */}
                  {/* ---------------------------------------------------------- */}
                  {analyzeResult.ats_suggestions?.length ? (
                    <div className="mt-4 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
                      <div className="text-sm font-semibold">
                        How to improve your ATS score
                      </div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-black/70">
                        {analyzeResult.ats_suggestions
                          .slice(0, 5)
                          .map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* ---------------------------------------------------------- */}
                  {/* AI draft button                                             */}
                  {/* ---------------------------------------------------------- */}
                  <button
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black py-3 text-base font-semibold text-white shadow-soft transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canGenerateAI}
                    onClick={handleGenerateAI}
                  >
                    <Wand2 className="h-4 w-4" />
                    {aiLoading
                      ? "Opening CV Builder..."
                      : "Generate ATS Draft (AI)"}
                  </button>

                  {/* ---------------------------------------------------------- */}
                  {/* Evidence section header                                     */}
                  {/* ---------------------------------------------------------- */}
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold">
                      Evidence and matching details
                    </h3>
                  </div>

                  {/* ---------------------------------------------------------- */}
                  {/* Requirement evidence                                        */}
                  {/* ---------------------------------------------------------- */}
                  {analyzeResult.requirements_gap?.requirement_evidence?.length ? (
                    <div className="mt-3 rounded-2xl bg-white p-4 ring-1 ring-black/10">
                      <div className="text-sm font-semibold">
                        Requirement evidence
                      </div>
                      <div className="mt-3 space-y-3">
                        {analyzeResult.requirements_gap.requirement_evidence
                          .slice(0, 5)
                          .map((item, i) => (
                            <div
                              key={i}
                              className="rounded-xl border border-black/10 p-3 text-sm"
                            >
                              <div className="font-semibold">
                                {item.requirement}
                              </div>
                              <div className="mt-1 text-xs text-black/50">
                                Match score: {item.best_score}% • {item.status}
                              </div>
                              <div className="mt-1 text-black/70">
                                Evidence:{" "}
                                {item.evidence ||
                                  "No clear evidence found in resume."}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : null}

                  {/* ---------------------------------------------------------- */}
                  {/* Similar skill matches                                       */}
                  {/* ---------------------------------------------------------- */}
                  {analyzeResult.cs_skill_gap_analysis?.similar_present_skills
                    ?.length ? (
                    <div className="mt-4 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
                      <div className="text-sm font-semibold">
                        Similar skill matches
                      </div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-black/70">
                        {analyzeResult.cs_skill_gap_analysis.similar_present_skills
                          .slice(0, 5)
                          .map((s, i) => (
                            <li key={i}>
                              {s.required_skill} matched with {s.matched_with}
                            </li>
                          ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* ---------------------------------------------------------- */}
                  {/* Skill evidence tags                                         */}
                  {/* ---------------------------------------------------------- */}
                  {analyzeResult.skill_evidence &&
                  Object.keys(analyzeResult.skill_evidence).length > 0 ? (
                    <div className="mt-4 rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200/60">
                      <div className="text-sm font-semibold">Skill evidence</div>

                      <div className="mt-3 flex flex-wrap gap-3">
                        {Object.entries(analyzeResult.skill_evidence)
                          .slice(0, 5)
                          .map(([skill], i) => (
                            <span
                              key={i}
                              className="rounded-full bg-white px-3 py-1 text-sm text-black/70 ring-1 ring-black/10"
                            >
                              {skill}
                            </span>
                          ))}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Small reusable metric card                                                 */
/* -------------------------------------------------------------------------- */

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <div className="text-sm text-black/60">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tracking-tight">
        {value}
      </div>
    </div>
  );
}