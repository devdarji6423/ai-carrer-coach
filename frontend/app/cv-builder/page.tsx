"use client";

import React, { useEffect, useMemo, useState } from "react";

const BACKEND_URL = "http://127.0.0.1:8000";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type CVData = {
  header: {
    full_name: string;
    email: string;
    phone: string;
    location: string;
    linkedin: string;
    github: string;
    target_role: string;
  };
  summary: string;
  skills: string[];
  experience: {
    job_title: string;
    company: string;
    location: string;
    dates: string;
    bullets: string[];
  }[];
  projects: {
    project_name: string;
    tech_stack: string;
    dates: string;
    bullets: string[];
  }[];
  education: {
    degree: string;
    institution: string;
    dates: string;
    details: string;
  }[];
  additional: string[];
};

type BuilderPayload = {
  cv_data: CVData;
  ats_rewrite_tips?: string[];
  disclaimer?: string;
};

type SectionKey = "summary" | "experience" | "projects" | "skills" | "education";

/* -------------------------------------------------------------------------- */
/* Initial empty CV                                                           */
/* -------------------------------------------------------------------------- */

const emptyCV: CVData = {
  header: {
    full_name: "",
    email: "",
    phone: "+44",
    location: "",
    linkedin: "",
    github: "",
    target_role: "",
  },
  summary: "",
  skills: [],
  experience: [],
  projects: [],
  education: [],
  additional: [],
};

/* -------------------------------------------------------------------------- */
/* Validation helpers                                                         */
/* -------------------------------------------------------------------------- */

// Only letters, spaces, apostrophes, hyphens
const NAME_REGEX = /^[A-Za-z\s'-]*$/;

// Safe general text (allows normal punctuation commonly used in CVs)
const SAFE_TEXT_REGEX = /^[A-Za-z0-9\s&.,'()\-\/:+]*$/;

// Email validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Simple URL validation
const URL_REGEX = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/.*)?$/i;

// Accept:
// MM/YYYY
// MM/YYYY - MM/YYYY
// MM/YYYY - Present
// YYYY - YYYY
// Present
const DATE_REGEX =
  /^(?:(0[1-9]|1[0-2])\/\d{4}|(?:0[1-9]|1[0-2])\/\d{4}\s*-\s*(?:0[1-9]|1[0-2])\/\d{4}|(?:0[1-9]|1[0-2])\/\d{4}\s*-\s*(?:Present|present)|\d{4}\s*-\s*\d{4}|Present|present)$/;

function sanitizeName(value: string) {
  return value.replace(/[^A-Za-z\s'-]/g, "");
}

function sanitizeSafeText(value: string) {
  return value.replace(/[^A-Za-z0-9\s&.,'()\-\/:+]/g, "");
}

function sanitizeDate(value: string) {
  return value.replace(/[^0-9A-Za-z\/\-\s]/g, "");
}

function sanitizePhoneUK(value: string) {
  let digits = value.replace(/\D/g, "");

  // Remove 44 if typed manually
  if (digits.startsWith("44")) digits = digits.slice(2);

  // Remove leading zero after country code
  if (digits.startsWith("0")) digits = digits.slice(1);

  // Keep max 10 digits after +44
  digits = digits.slice(0, 10);

  return `+44${digits}`;
}

function isValidEmail(value: string) {
  return !value.trim() || EMAIL_REGEX.test(value.trim());
}

function isValidUrl(value: string) {
  return !value.trim() || URL_REGEX.test(value.trim());
}

function isValidDate(value: string) {
  return !value.trim() || DATE_REGEX.test(value.trim());
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function CVBuilderPage() {
  const [cvData, setCvData] = useState<CVData>(emptyCV);
  const [tips, setTips] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [originalScore, setOriginalScore] = useState<number | null>(null);
  const [currentScore, setCurrentScore] = useState<number | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [rechecking, setRechecking] = useState(false);
  const [hasEdits, setHasEdits] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionKey>("summary");

  // Validation errors: field path -> message
  const [errors, setErrors] = useState<Record<string, string>>({});

  /* ------------------------------------------------------------------------ */
  /* Load saved data                                                          */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const raw = localStorage.getItem("cv_builder_data");
    const rawAnalysis =
      localStorage.getItem("cv_analysis_result") ||
      localStorage.getItem("original_analyze_result");
    const rawJD = localStorage.getItem("original_job_description");

    if (rawAnalysis) {
      try {
        const parsedAnalysis = JSON.parse(rawAnalysis);
        setAnalysisResult(parsedAnalysis);
        setOriginalScore(parsedAnalysis.final_match_score ?? null);
      } catch (err) {
        console.error("Failed to load analysis result", err);
      }
    }

    if (rawJD) {
      setJobDescription(rawJD);
    }

    if (!raw) {
      setLoaded(true);
      return;
    }

    try {
      const parsed: BuilderPayload = JSON.parse(raw);

      if (parsed?.cv_data) {
        const safeData: CVData = {
          ...parsed.cv_data,
          header: {
            ...parsed.cv_data.header,
            phone: parsed.cv_data.header.phone
              ? sanitizePhoneUK(parsed.cv_data.header.phone)
              : "+44",
          },
          projects: (parsed.cv_data.projects || []).map((p) => ({
            ...p,
            dates: p.dates || "",
          })),
        };
        setCvData(safeData);
      }

      if (parsed?.ats_rewrite_tips) setTips(parsed.ats_rewrite_tips);
    } catch (err) {
      console.error("Failed to load cv_builder_data", err);
    } finally {
      setLoaded(true);
    }
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Error helpers                                                            */
  /* ------------------------------------------------------------------------ */

  function setFieldError(key: string, message: string) {
    setErrors((prev) => ({
      ...prev,
      [key]: message,
    }));
  }

  function clearFieldError(key: string) {
    setErrors((prev) => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  }

  function markEdited() {
    setHasEdits(true);
    setCurrentScore(null);
  }

  /* ------------------------------------------------------------------------ */
  /* Preview text for export                                                  */
  /* ------------------------------------------------------------------------ */

  const previewText = useMemo(() => {
    const parts: string[] = [];

    const contactLine = [
      cvData.header.phone,
      cvData.header.email,
      cvData.header.linkedin,
      cvData.header.github,
      cvData.header.location,
    ]
      .filter(Boolean)
      .join(" | ");

    if (cvData.header.full_name?.trim()) parts.push(cvData.header.full_name.trim());
    if (cvData.header.target_role?.trim()) parts.push(cvData.header.target_role.trim());
    if (contactLine) parts.push(contactLine);

    if (cvData.summary.trim()) {
      parts.push("SUMMARY");
      parts.push(cvData.summary.trim());
    }

    if (cvData.skills.length) {
      parts.push("SKILLS");
      parts.push(cvData.skills.filter(Boolean).join(", "));
    }

    if (cvData.experience.length) {
      parts.push("EXPERIENCE");
      cvData.experience.forEach((item) => {
        const titleLine = [item.job_title, item.company, item.dates].filter(Boolean).join(" | ");
        if (titleLine) parts.push(titleLine);
        item.bullets.filter(Boolean).forEach((b) => parts.push(`- ${b}`));
      });
    }

    if (cvData.projects.length) {
      parts.push("PROJECTS");
      cvData.projects.forEach((item) => {
        const titleLine = [item.project_name, item.tech_stack, item.dates]
          .filter(Boolean)
          .join(" | ");
        if (titleLine) parts.push(titleLine);
        item.bullets.filter(Boolean).forEach((b) => parts.push(`- ${b}`));
      });
    }

    if (cvData.education.length) {
      parts.push("EDUCATION");
      cvData.education.forEach((item) => {
        const titleLine = [item.degree, item.institution, item.dates].filter(Boolean).join(" | ");
        if (titleLine) parts.push(titleLine);
        if (item.details?.trim()) parts.push(`- ${item.details.trim()}`);
      });
    }

    if (cvData.additional.length) {
      parts.push("ADDITIONAL");
      cvData.additional.filter(Boolean).forEach((x) => parts.push(`- ${x}`));
    }

    return parts.join("\n");
  }, [cvData]);

  /* ------------------------------------------------------------------------ */
  /* ATS re-check text (exclude personal contact details)                     */
  /* ------------------------------------------------------------------------ */

  const atsCheckText = useMemo(() => {
    const parts: string[] = [];

    if (cvData.header.target_role?.trim()) {
      parts.push(cvData.header.target_role.trim());
    }

    if (cvData.summary.trim()) {
      parts.push("SUMMARY");
      parts.push(cvData.summary.trim());
    }

    if (cvData.skills.length) {
      parts.push("SKILLS");
      parts.push(cvData.skills.filter(Boolean).join(", "));
    }

    if (cvData.experience.length) {
      parts.push("EXPERIENCE");
      cvData.experience.forEach((item) => {
        const titleLine = [item.job_title, item.company, item.dates].filter(Boolean).join(" | ");
        if (titleLine) parts.push(titleLine);
        item.bullets.filter(Boolean).forEach((b) => parts.push(`- ${b}`));
      });
    }

    if (cvData.projects.length) {
      parts.push("PROJECTS");
      cvData.projects.forEach((item) => {
        const titleLine = [item.project_name, item.tech_stack, item.dates]
          .filter(Boolean)
          .join(" | ");
        if (titleLine) parts.push(titleLine);
        item.bullets.filter(Boolean).forEach((b) => parts.push(`- ${b}`));
      });
    }

    if (cvData.education.length) {
      parts.push("EDUCATION");
      cvData.education.forEach((item) => {
        const titleLine = [item.degree, item.institution, item.dates].filter(Boolean).join(" | ");
        if (titleLine) parts.push(titleLine);
        if (item.details?.trim()) parts.push(`- ${item.details.trim()}`);
      });
    }

    if (cvData.additional.length) {
      parts.push("ADDITIONAL");
      cvData.additional.filter(Boolean).forEach((x) => parts.push(`- ${x}`));
    }

    return parts.join("\n");
  }, [cvData]);

  /* ------------------------------------------------------------------------ */
  /* Backend actions                                                          */
  /* ------------------------------------------------------------------------ */

  async function recheckATSScore() {
    if (Object.keys(errors).length > 0) {
      alert("Please fix validation errors before re-checking the ATS score.");
      return;
    }

    try {
      setRechecking(true);

      const res = await fetch(`${BACKEND_URL}/analyze_match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_text: atsCheckText,
          job_description_text: jobDescription,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Failed to re-check ATS score.");
      }

      const data = await res.json();
      setCurrentScore(data.final_match_score ?? null);
    } catch (err: any) {
      alert(err?.message || "ATS re-check failed.");
    } finally {
      setRechecking(false);
    }
  }

  async function downloadPDF() {
    if (Object.keys(errors).length > 0) {
      alert("Please fix validation errors before downloading the PDF.");
      return;
    }

    try {
      setDownloading(true);

      const res = await fetch(`${BACKEND_URL}/export_structured_cv_pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: "ATS_CV.pdf",
          template: "modern-blue",
          cv_data: cvData,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Failed to export PDF.");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "ATS_CV.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err?.message || "PDF export failed.");
    } finally {
      setDownloading(false);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Input update handlers with validation                                    */
  /* ------------------------------------------------------------------------ */

  function updateHeader(field: keyof CVData["header"], value: string) {
    markEdited();

    let nextValue = value;

    switch (field) {
      case "full_name":
        nextValue = sanitizeName(value);
        if (!nextValue.trim()) {
          setFieldError("header.full_name", "Full name is required.");
        } else if (!NAME_REGEX.test(nextValue)) {
          setFieldError("header.full_name", "Only letters are allowed in the name field.");
        } else {
          clearFieldError("header.full_name");
        }
        break;

      case "phone":
        nextValue = sanitizePhoneUK(value);
        if (nextValue.replace(/\D/g, "").length !== 12) {
          setFieldError("header.phone", "Enter a valid UK phone number.");
        } else {
          clearFieldError("header.phone");
        }
        break;

      case "email":
        nextValue = value.trim();
        if (!isValidEmail(nextValue)) {
          setFieldError("header.email", "Enter a valid email address.");
        } else {
          clearFieldError("header.email");
        }
        break;

      case "linkedin":
      case "github":
        nextValue = value.trim();
        if (!isValidUrl(nextValue)) {
          setFieldError(`header.${field}`, "Enter a valid URL.");
        } else {
          clearFieldError(`header.${field}`);
        }
        break;

      case "location":
      case "target_role":
        nextValue = sanitizeSafeText(value);
        if (!SAFE_TEXT_REGEX.test(nextValue)) {
          setFieldError(`header.${field}`, "Invalid characters entered.");
        } else {
          clearFieldError(`header.${field}`);
        }
        break;

      default:
        break;
    }

    setCvData((prev) => ({
      ...prev,
      header: {
        ...prev.header,
        [field]: nextValue,
      },
    }));
  }

  function updateSummary(value: string) {
    markEdited();
    const nextValue = sanitizeSafeText(value);

    if (nextValue.trim() && nextValue.trim().length < 20) {
      setFieldError("summary", "Summary is too short.");
    } else {
      clearFieldError("summary");
    }

    setCvData((prev) => ({ ...prev, summary: nextValue }));
  }

  function updateSkill(index: number, value: string) {
    markEdited();
    const nextValue = sanitizeSafeText(value);

    if (!nextValue.trim()) {
      setFieldError(`skills.${index}`, "Skill cannot be empty.");
    } else {
      clearFieldError(`skills.${index}`);
    }

    setCvData((prev) => ({
      ...prev,
      skills: prev.skills.map((s, i) => (i === index ? nextValue : s)),
    }));
  }

  function addSkill() {
    markEdited();
    setCvData((prev) => ({
      ...prev,
      skills: [...prev.skills, ""],
    }));
  }

  function removeSkill(index: number) {
    markEdited();
    clearFieldError(`skills.${index}`);
    setCvData((prev) => ({
      ...prev,
      skills: prev.skills.filter((_, i) => i !== index),
    }));
  }

  function updateExperienceField(
    index: number,
    field: keyof CVData["experience"][number],
    value: string
  ) {
    markEdited();
    let nextValue = value;

    if (field === "job_title" || field === "company" || field === "location") {
      nextValue = sanitizeSafeText(value);

      if (!nextValue.trim()) {
        setFieldError(`experience.${index}.${field}`, `${field.replace("_", " ")} is required.`);
      } else {
        clearFieldError(`experience.${index}.${field}`);
      }
    }

    if (field === "dates") {
      nextValue = sanitizeDate(value);

      if (!isValidDate(nextValue)) {
        setFieldError(
          `experience.${index}.dates`,
          "Use MM/YYYY, MM/YYYY - MM/YYYY, MM/YYYY - Present, YYYY - YYYY, or Present."
        );
      } else {
        clearFieldError(`experience.${index}.dates`);
      }
    }

    setCvData((prev) => ({
      ...prev,
      experience: prev.experience.map((item, i) =>
        i === index ? { ...item, [field]: nextValue } : item
      ),
    }));
  }

  function updateExperienceBullet(expIndex: number, bulletIndex: number, value: string) {
    markEdited();
    const nextValue = sanitizeSafeText(value);

    if (!nextValue.trim()) {
      setFieldError(
        `experience.${expIndex}.bullets.${bulletIndex}`,
        "Experience bullet cannot be empty."
      );
    } else {
      clearFieldError(`experience.${expIndex}.bullets.${bulletIndex}`);
    }

    setCvData((prev) => ({
      ...prev,
      experience: prev.experience.map((item, i) =>
        i === expIndex
          ? {
              ...item,
              bullets: item.bullets.map((b, j) => (j === bulletIndex ? nextValue : b)),
            }
          : item
      ),
    }));
  }

  function addExperience() {
    markEdited();
    setCvData((prev) => ({
      ...prev,
      experience: [
        ...prev.experience,
        {
          job_title: "",
          company: "",
          location: "",
          dates: "",
          bullets: [""],
        },
      ],
    }));
  }

  function removeExperience(index: number) {
    markEdited();
    setCvData((prev) => ({
      ...prev,
      experience: prev.experience.filter((_, i) => i !== index),
    }));
  }

  function addExperienceBullet(index: number) {
    markEdited();
    setCvData((prev) => ({
      ...prev,
      experience: prev.experience.map((item, i) =>
        i === index ? { ...item, bullets: [...item.bullets, ""] } : item
      ),
    }));
  }

  function removeExperienceBullet(expIndex: number, bulletIndex: number) {
    markEdited();
    clearFieldError(`experience.${expIndex}.bullets.${bulletIndex}`);

    setCvData((prev) => ({
      ...prev,
      experience: prev.experience.map((item, i) =>
        i === expIndex
          ? { ...item, bullets: item.bullets.filter((_, j) => j !== bulletIndex) }
          : item
      ),
    }));
  }

  function updateProjectField(
    index: number,
    field: keyof CVData["projects"][number],
    value: string
  ) {
    markEdited();
    let nextValue = value;

    if (field === "project_name" || field === "tech_stack") {
      nextValue = sanitizeSafeText(value);

      if (!nextValue.trim()) {
        setFieldError(`projects.${index}.${field}`, `${field.replace("_", " ")} is required.`);
      } else {
        clearFieldError(`projects.${index}.${field}`);
      }
    }

    if (field === "dates") {
      nextValue = sanitizeDate(value);

      if (!isValidDate(nextValue)) {
        setFieldError(
          `projects.${index}.dates`,
          "Use MM/YYYY, MM/YYYY - MM/YYYY, MM/YYYY - Present, YYYY - YYYY, or Present."
        );
      } else {
        clearFieldError(`projects.${index}.dates`);
      }
    }

    setCvData((prev) => ({
      ...prev,
      projects: prev.projects.map((item, i) =>
        i === index ? { ...item, [field]: nextValue } : item
      ),
    }));
  }

  function updateProjectBullet(projectIndex: number, bulletIndex: number, value: string) {
    markEdited();
    const nextValue = sanitizeSafeText(value);

    if (!nextValue.trim()) {
      setFieldError(`projects.${projectIndex}.bullets.${bulletIndex}`, "Project bullet cannot be empty.");
    } else {
      clearFieldError(`projects.${projectIndex}.bullets.${bulletIndex}`);
    }

    setCvData((prev) => ({
      ...prev,
      projects: prev.projects.map((item, i) =>
        i === projectIndex
          ? {
              ...item,
              bullets: item.bullets.map((b, j) => (j === bulletIndex ? nextValue : b)),
            }
          : item
      ),
    }));
  }

  function addProject() {
    markEdited();
    setCvData((prev) => ({
      ...prev,
      projects: [
        ...prev.projects,
        {
          project_name: "",
          tech_stack: "",
          dates: "",
          bullets: [""],
        },
      ],
    }));
  }

  function removeProject(index: number) {
    markEdited();
    setCvData((prev) => ({
      ...prev,
      projects: prev.projects.filter((_, i) => i !== index),
    }));
  }

  function addProjectBullet(index: number) {
    markEdited();
    setCvData((prev) => ({
      ...prev,
      projects: prev.projects.map((item, i) =>
        i === index ? { ...item, bullets: [...item.bullets, ""] } : item
      ),
    }));
  }

  function removeProjectBullet(projectIndex: number, bulletIndex: number) {
    markEdited();
    clearFieldError(`projects.${projectIndex}.bullets.${bulletIndex}`);

    setCvData((prev) => ({
      ...prev,
      projects: prev.projects.map((item, i) =>
        i === projectIndex
          ? { ...item, bullets: item.bullets.filter((_, j) => j !== bulletIndex) }
          : item
      ),
    }));
  }

  function updateEducationField(
    index: number,
    field: keyof CVData["education"][number],
    value: string
  ) {
    markEdited();
    let nextValue = value;

    if (field === "degree" || field === "institution") {
      nextValue = sanitizeSafeText(value);

      if (!nextValue.trim()) {
        setFieldError(`education.${index}.${field}`, `${field} is required.`);
      } else {
        clearFieldError(`education.${index}.${field}`);
      }
    }

    if (field === "dates") {
      nextValue = sanitizeDate(value);

      if (!isValidDate(nextValue)) {
        setFieldError(
          `education.${index}.dates`,
          "Use MM/YYYY, MM/YYYY - MM/YYYY, MM/YYYY - Present, YYYY - YYYY, or Present."
        );
      } else {
        clearFieldError(`education.${index}.dates`);
      }
    }

    if (field === "details") {
      nextValue = sanitizeSafeText(value);
      clearFieldError(`education.${index}.details`);
    }

    setCvData((prev) => ({
      ...prev,
      education: prev.education.map((item, i) =>
        i === index ? { ...item, [field]: nextValue } : item
      ),
    }));
  }

  function addEducation() {
    markEdited();
    setCvData((prev) => ({
      ...prev,
      education: [
        ...prev.education,
        {
          degree: "",
          institution: "",
          dates: "",
          details: "",
        },
      ],
    }));
  }

  function removeEducation(index: number) {
    markEdited();
    setCvData((prev) => ({
      ...prev,
      education: prev.education.filter((_, i) => i !== index),
    }));
  }

  function updateAdditional(index: number, value: string) {
    markEdited();
    const nextValue = sanitizeSafeText(value);

    if (!nextValue.trim()) {
      setFieldError(`additional.${index}`, "This field cannot be empty.");
    } else {
      clearFieldError(`additional.${index}`);
    }

    setCvData((prev) => ({
      ...prev,
      additional: prev.additional.map((x, i) => (i === index ? nextValue : x)),
    }));
  }

  function addAdditional() {
    markEdited();
    setCvData((prev) => ({
      ...prev,
      additional: [...prev.additional, ""],
    }));
  }

  function removeAdditional(index: number) {
    markEdited();
    clearFieldError(`additional.${index}`);

    setCvData((prev) => ({
      ...prev,
      additional: prev.additional.filter((_, i) => i !== index),
    }));
  }

  /* ------------------------------------------------------------------------ */
  /* Section suggestions                                                      */
  /* ------------------------------------------------------------------------ */

  function getSectionSuggestions() {
    const missingMust = analysisResult?.requirements_gap?.missing_must ?? [];
    const missingSkills = analysisResult?.cs_skill_gap_analysis?.missing_skills ?? [];

    const map: Record<SectionKey, string[]> = {
      summary: [
        "Make the summary match the target role clearly.",
        "Mention only genuine strengths relevant to the job.",
        "Keep the summary short, specific, and truthful.",
        ...missingMust.slice(0, 1).map((x: string) => `If true, mention evidence related to: ${x}`),
      ],
      experience: [
        "Add measurable results where possible.",
        "Mention only genuine work, internship, or practical evidence relevant to the role.",
        ...missingMust.slice(0, 2).map((x: string) => `Add work evidence for: ${x} (only if true)`),
      ],
      projects: [
        "Show what you built, which tools you used, and the outcome.",
        "Highlight project features that directly support the target role.",
        ...missingSkills.slice(0, 2).map((x: string) => `If genuinely used in a project, mention: ${x}`),
      ],
      skills: [
        "List only verified skills.",
        "Group similar skills together if helpful.",
        ...missingSkills.slice(0, 4).map((x: string) => `Add this skill only if true: ${x}`),
      ],
      education: [
        "Keep this section concise and factual.",
        "Add relevant modules only if they genuinely support the target role.",
        "Do not add technical claims here unless they come from academic work or coursework.",
      ],
    };

    return map[activeSection];
  }

  /* ------------------------------------------------------------------------ */
  /* Loading state                                                            */
  /* ------------------------------------------------------------------------ */

  if (!loaded) {
    return <main className="p-10">Loading CV Builder...</main>;
  }

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 via-sky-50 to-white text-black">
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight">Edit your CV</h1>
          <p className="mt-2 text-sm text-black/60">
            The AI draft is pre-filled below. Edit content section by section using ATS suggestions.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[200px_1.15fr_0.9fr]">
          {/* ---------------------------------------------------------------- */}
          {/* Left side section navigation                                     */}
          {/* ---------------------------------------------------------------- */}
          <aside className="h-fit rounded-3xl bg-white p-4 shadow-soft ring-1 ring-black/5 lg:sticky lg:top-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-black/50">
              Sections
            </div>

            <div className="space-y-2">
              {[
                { key: "summary", label: "Summary" },
                { key: "experience", label: "Experience" },
                { key: "projects", label: "Projects" },
                { key: "skills", label: "Skills" },
                { key: "education", label: "Education" },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setActiveSection(item.key as SectionKey)}
                  className={`block w-full rounded-2xl px-3 py-2.5 text-left text-sm transition ${
                    activeSection === item.key
                      ? "bg-sky-100 font-semibold text-sky-800 ring-1 ring-sky-200"
                      : "text-black/70 hover:bg-sky-50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {tips.length > 0 && (
              <div className="mt-5 rounded-2xl bg-slate-50 p-3 ring-1 ring-black/5">
                <div className="text-xs font-semibold uppercase tracking-wide text-black/50">
                  ATS tips
                </div>
                <ul className="mt-2 space-y-2 text-xs text-black/70">
                  {tips.slice(0, 3).map((tip, i) => (
                    <li key={i}>• {tip}</li>
                  ))}
                </ul>
              </div>
            )}
          </aside>

          {/* ---------------------------------------------------------------- */}
          {/* Main editor column                                               */}
          {/* ---------------------------------------------------------------- */}
          <section className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-black/5">
            <div className="space-y-8">
              {/* Header */}
              <EditorBlock title="Header">
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    label="Full name"
                    value={cvData.header.full_name}
                    onChange={(v) => updateHeader("full_name", v)}
                    error={errors["header.full_name"]}
                  />
                  <Input
                    label="Target role"
                    value={cvData.header.target_role}
                    onChange={(v) => updateHeader("target_role", v)}
                    error={errors["header.target_role"]}
                  />
                  <Input
                    label="Email"
                    value={cvData.header.email}
                    onChange={(v) => updateHeader("email", v)}
                    error={errors["header.email"]}
                    type="email"
                  />
                  <Input
                    label="Phone"
                    value={cvData.header.phone}
                    onChange={(v) => updateHeader("phone", v)}
                    error={errors["header.phone"]}
                    type="tel"
                  />
                  <Input
                    label="Location"
                    value={cvData.header.location}
                    onChange={(v) => updateHeader("location", v)}
                    error={errors["header.location"]}
                  />
                  <Input
                    label="LinkedIn"
                    value={cvData.header.linkedin}
                    onChange={(v) => updateHeader("linkedin", v)}
                    error={errors["header.linkedin"]}
                  />
                  <Input
                    label="GitHub"
                    value={cvData.header.github}
                    onChange={(v) => updateHeader("github", v)}
                    error={errors["header.github"]}
                  />
                </div>
              </EditorBlock>

              {/* Summary */}
              <EditorBlock title="Summary">
                <TextArea
                  label="Professional Summary"
                  rows={5}
                  value={cvData.summary}
                  onChange={(v) => updateSummary(v)}
                  error={errors["summary"]}
                />
              </EditorBlock>

              {/* Skills */}
              <EditorBlock title="Skills">
                <div className="space-y-2">
                  {cvData.skills.map((skill, i) => (
                    <div key={i} className="flex gap-2">
                      <div className="w-full">
                        <input
                          value={skill}
                          onChange={(e) => updateSkill(i, e.target.value)}
                          className={`w-full rounded-2xl border p-3 text-sm focus:outline-none focus:ring-2 ${
                            errors[`skills.${i}`]
                              ? "border-red-400 focus:ring-red-300"
                              : "border-black/10 focus:ring-sky-300"
                          }`}
                        />
                        {errors[`skills.${i}`] ? (
                          <p className="mt-1 text-xs text-red-600">{errors[`skills.${i}`]}</p>
                        ) : null}
                      </div>
                      <button
                        onClick={() => removeSkill(i)}
                        className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={addSkill}
                  className="mt-3 rounded-xl bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-200"
                >
                  + Add Skill
                </button>
              </EditorBlock>

              {/* Experience */}
              <EditorBlock title="Experience">
                <div className="space-y-6">
                  {cvData.experience.map((exp, i) => (
                    <div key={i} className="rounded-2xl border border-black/10 p-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input
                          label="Job title"
                          value={exp.job_title}
                          onChange={(v) => updateExperienceField(i, "job_title", v)}
                          error={errors[`experience.${i}.job_title`]}
                        />
                        <Input
                          label="Company"
                          value={exp.company}
                          onChange={(v) => updateExperienceField(i, "company", v)}
                          error={errors[`experience.${i}.company`]}
                        />
                        <Input
                          label="Location"
                          value={exp.location}
                          onChange={(v) => updateExperienceField(i, "location", v)}
                          error={errors[`experience.${i}.location`]}
                        />
                        <Input
                          label="Dates"
                          value={exp.dates}
                          onChange={(v) => updateExperienceField(i, "dates", v)}
                          error={errors[`experience.${i}.dates`]}
                          placeholder="MM/YYYY - MM/YYYY or MM/YYYY - Present"
                        />
                      </div>

                      <div className="mt-4 space-y-2">
                        {exp.bullets.map((bullet, j) => (
                          <div key={j} className="flex gap-2">
                            <div className="w-full">
                              <textarea
                                rows={2}
                                value={bullet}
                                onChange={(e) => updateExperienceBullet(i, j, e.target.value)}
                                className={`w-full rounded-2xl border p-3 text-sm focus:outline-none focus:ring-2 ${
                                  errors[`experience.${i}.bullets.${j}`]
                                    ? "border-red-400 focus:ring-red-300"
                                    : "border-black/10 focus:ring-sky-300"
                                }`}
                              />
                              {errors[`experience.${i}.bullets.${j}`] ? (
                                <p className="mt-1 text-xs text-red-600">
                                  {errors[`experience.${i}.bullets.${j}`]}
                                </p>
                              ) : null}
                            </div>
                            <button
                              onClick={() => removeExperienceBullet(i, j)}
                              className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => addExperienceBullet(i)}
                          className="rounded-xl bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-200"
                        >
                          + Add Bullet
                        </button>
                        <button
                          onClick={() => removeExperience(i)}
                          className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
                        >
                          Remove Job
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={addExperience}
                  className="mt-4 rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  + Add Experience
                </button>
              </EditorBlock>

              {/* Projects */}
              <EditorBlock title="Projects">
                <div className="space-y-6">
                  {cvData.projects.map((proj, i) => (
                    <div key={i} className="rounded-2xl border border-black/10 p-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input
                          label="Project name"
                          value={proj.project_name}
                          onChange={(v) => updateProjectField(i, "project_name", v)}
                          error={errors[`projects.${i}.project_name`]}
                        />
                        <Input
                          label="Tech stack"
                          value={proj.tech_stack}
                          onChange={(v) => updateProjectField(i, "tech_stack", v)}
                          error={errors[`projects.${i}.tech_stack`]}
                        />
                        <Input
                          label="Project dates"
                          value={proj.dates}
                          onChange={(v) => updateProjectField(i, "dates", v)}
                          error={errors[`projects.${i}.dates`]}
                          placeholder="MM/YYYY - MM/YYYY or MM/YYYY - Present"
                        />
                      </div>

                      <div className="mt-4 space-y-2">
                        {proj.bullets.map((bullet, j) => (
                          <div key={j} className="flex gap-2">
                            <div className="w-full">
                              <textarea
                                rows={2}
                                value={bullet}
                                onChange={(e) => updateProjectBullet(i, j, e.target.value)}
                                className={`w-full rounded-2xl border p-3 text-sm focus:outline-none focus:ring-2 ${
                                  errors[`projects.${i}.bullets.${j}`]
                                    ? "border-red-400 focus:ring-red-300"
                                    : "border-black/10 focus:ring-sky-300"
                                }`}
                              />
                              {errors[`projects.${i}.bullets.${j}`] ? (
                                <p className="mt-1 text-xs text-red-600">
                                  {errors[`projects.${i}.bullets.${j}`]}
                                </p>
                              ) : null}
                            </div>
                            <button
                              onClick={() => removeProjectBullet(i, j)}
                              className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => addProjectBullet(i)}
                          className="rounded-xl bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-200"
                        >
                          + Add Bullet
                        </button>
                        <button
                          onClick={() => removeProject(i)}
                          className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
                        >
                          Remove Project
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={addProject}
                  className="mt-4 rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  + Add Project
                </button>
              </EditorBlock>

              {/* Education */}
              <EditorBlock title="Education">
                <div className="space-y-6">
                  {cvData.education.map((edu, i) => (
                    <div key={i} className="rounded-2xl border border-black/10 p-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input
                          label="Degree"
                          value={edu.degree}
                          onChange={(v) => updateEducationField(i, "degree", v)}
                          error={errors[`education.${i}.degree`]}
                        />
                        <Input
                          label="Institution"
                          value={edu.institution}
                          onChange={(v) => updateEducationField(i, "institution", v)}
                          error={errors[`education.${i}.institution`]}
                        />
                        <Input
                          label="Dates"
                          value={edu.dates}
                          onChange={(v) => updateEducationField(i, "dates", v)}
                          error={errors[`education.${i}.dates`]}
                          placeholder="MM/YYYY - MM/YYYY or MM/YYYY - Present"
                        />
                      </div>

                      <div className="mt-3">
                        <TextArea
                          label="Details"
                          rows={3}
                          value={edu.details}
                          onChange={(v) => updateEducationField(i, "details", v)}
                          error={errors[`education.${i}.details`]}
                        />
                      </div>

                      <button
                        onClick={() => removeEducation(i)}
                        className="mt-3 rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
                      >
                        Remove Education
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={addEducation}
                  className="mt-4 rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  + Add Education
                </button>
              </EditorBlock>

              {/* Additional */}
              <EditorBlock title="Additional">
                <div className="space-y-2">
                  {cvData.additional.map((item, i) => (
                    <div key={i} className="flex gap-2">
                      <div className="w-full">
                        <input
                          value={item}
                          onChange={(e) => updateAdditional(i, e.target.value)}
                          className={`w-full rounded-2xl border p-3 text-sm focus:outline-none focus:ring-2 ${
                            errors[`additional.${i}`]
                              ? "border-red-400 focus:ring-red-300"
                              : "border-black/10 focus:ring-sky-300"
                          }`}
                        />
                        {errors[`additional.${i}`] ? (
                          <p className="mt-1 text-xs text-red-600">{errors[`additional.${i}`]}</p>
                        ) : null}
                      </div>
                      <button
                        onClick={() => removeAdditional(i)}
                        className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={addAdditional}
                  className="mt-3 rounded-xl bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-200"
                >
                  + Add Additional
                </button>
              </EditorBlock>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* Right side suggestion panel                                      */}
          {/* ---------------------------------------------------------------- */}
          <section className="h-fit rounded-3xl bg-white p-5 shadow-soft ring-1 ring-black/5 lg:sticky lg:top-4">
            <h2 className="text-xl font-bold">Section Suggestions</h2>
            <p className="mt-1 text-sm text-black/60">
              Suggestions for: <span className="font-semibold capitalize">{activeSection}</span>
            </p>

            <div className="mt-4 space-y-3">
              {getSectionSuggestions().map((item: string, i: number) => (
                <div
                  key={i}
                  className="rounded-2xl bg-sky-50 p-3 text-sm text-black/80 ring-1 ring-sky-200"
                >
                  {item}
                </div>
              ))}
            </div>

            {(() => {
              const missingMust = analysisResult?.requirements_gap?.missing_must ?? [];
              const showMustBox = activeSection === "summary" || activeSection === "experience";

              return showMustBox ? (
                <div className="mt-4 rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
                  <div className="text-sm font-semibold text-red-800">Missing MUST requirements</div>
                  <div className="mt-2 text-sm text-red-700">
                    {missingMust.length ? (
                      <ul className="list-disc space-y-1 pl-5">
                        {missingMust.slice(0, 4).map((item: string, i: number) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      "No missing MUST requirements for this section."
                    )}
                  </div>
                </div>
              ) : null;
            })()}

            {(() => {
              const missingSkills = analysisResult?.cs_skill_gap_analysis?.missing_skills ?? [];
              const showSkillsBox = activeSection === "projects" || activeSection === "skills";

              return showSkillsBox ? (
                <div className="mt-4 rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
                  <div className="text-sm font-semibold">Missing skills</div>
                  <div className="mt-2 text-sm text-black/70">
                    {missingSkills.length ? (
                      <ul className="list-disc space-y-1 pl-5">
                        {missingSkills.slice(0, 4).map((item: string, i: number) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      "No missing skills for this section."
                    )}
                  </div>
                </div>
              ) : null;
            })()}

            {activeSection === "education" && (
              <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-black/5">
                <div className="text-sm font-semibold">Education guidance</div>
                <div className="mt-2 text-sm text-black/70">
                  Keep education factual and concise. Focus on degree title, institution, dates, and
                  relevant modules or academic work only if they support the target role.
                </div>
              </div>
            )}

            <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-black/80 ring-1 ring-amber-200">
              Add suggestions only if they are true for your real experience. The system helps improve
              wording and relevance, not invent content.
            </div>

            <button
              onClick={recheckATSScore}
              disabled={rechecking || !hasEdits}
              className="mt-5 w-full rounded-2xl bg-sky-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
            >
              {rechecking ? "Re-checking..." : "Experimental Re-check"}
            </button>

            <div className="mt-2 text-xs text-black/50">
              This feature is experimental and may produce unstable results if the edited CV content is incomplete.
            </div>

            {originalScore !== null && (
              <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-black/5">
                <div className="text-sm font-semibold">ATS Score Comparison</div>
                <div className="mt-2 text-sm text-black/70">
                  <div>Original score: {originalScore}/100</div>

                  {currentScore !== null ? (
                    <>
                      <div>Updated score: {currentScore}/100</div>
                      <div className="mt-1 font-semibold text-black">
                        Change: {currentScore - originalScore >= 0 ? "+" : ""}
                        {currentScore - originalScore}
                      </div>
                    </>
                  ) : (
                    <div className="mt-1 text-black/60">
                      Edit the CV content and use Experimental Re-check to compare the score.
                    </div>
                  )}
                </div>
              </div>
            )}

            {Object.keys(errors).length > 0 && (
              <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
                Please fix the highlighted validation errors before re-checking or downloading the CV.
              </div>
            )}

            <button
              onClick={downloadPDF}
              disabled={downloading}
              className="mt-5 w-full rounded-2xl bg-emerald-500 px-6 py-3 text-base font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-60"
            >
              {downloading ? "Downloading..." : "Download PDF"}
            </button>
          </section>
        </div>

        {/* Hidden plain-text preview if needed later */}
        <div className="hidden">{previewText}</div>
      </section>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Reusable UI blocks                                                         */
/* -------------------------------------------------------------------------- */

function EditorBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  error,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-2xl border p-3 text-sm focus:outline-none focus:ring-2 ${
          error ? "border-red-400 focus:ring-red-300" : "border-black/10 focus:ring-sky-300"
        }`}
      />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  error,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold">{label}</label>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-2xl border p-3 text-sm focus:outline-none focus:ring-2 ${
          error ? "border-red-400 focus:ring-red-300" : "border-black/10 focus:ring-sky-300"
        }`}
      />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}