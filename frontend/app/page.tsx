"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Sparkles,
  ArrowRight,
  UploadCloud,
  Target,
  FileText,
  CheckCircle2,
  Brain,
  ScanSearch,
  BadgeCheck,
} from "lucide-react";

export default function Page() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-slate-50 text-black overflow-hidden">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[-80px] top-20 h-72 w-72 rounded-full bg-sky-200/40 blur-3xl" />
        <div className="absolute right-[-60px] top-40 h-80 w-80 rounded-full bg-blue-200/30 blur-3xl" />
        <div className="absolute bottom-10 left-1/3 h-64 w-64 rounded-full bg-cyan-100/40 blur-3xl" />
      </div>

      {/* NAVBAR */}
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-3"
        >
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-sky-100 ring-1 ring-sky-200">
            <Sparkles className="h-5 w-5 text-sky-700" />
          </div>
          <div>
            <h1 className="font-bold text-lg">AI Career Coach</h1>
            <p className="text-xs text-black/50">ATS-focused CV analysis for CS students</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
        >
          <Link
            href="/analyze"
            className="rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
          >
            Start Analysis
          </Link>
        </motion.div>
      </header>

      {/* HERO */}
      <section className="mx-auto grid min-h-[88vh] max-w-7xl items-center gap-12 px-6 py-12 lg:grid-cols-2">
        {/* LEFT */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7 }}
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black/70 ring-1 ring-black/10 shadow-sm">
            <BadgeCheck className="h-4 w-4 text-sky-700" />
            Built for internships, graduate and junior CS roles
          </div>

          <h2 className="mt-6 text-4xl font-extrabold leading-tight sm:text-5xl lg:text-6xl">
            Improve your CV with
            <span className="text-sky-600"> AI-powered ATS analysis</span>
          </h2>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-black/70">
            Upload your resume and paste a job description to get an ATS-style match score,
            missing must-have requirements, skill gap analysis, explainable evidence,
            and AI suggestions to improve your CV for computer science roles.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/analyze"
              className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-6 py-3 font-semibold text-white shadow-md transition hover:bg-sky-700 hover:-translate-y-0.5"
            >
              Start Now
              <ArrowRight size={18} />
            </Link>

            <a
              href="#how-it-works"
              className="rounded-2xl border border-black/10 bg-white px-6 py-3 font-semibold transition hover:bg-sky-50"
            >
              Learn More
            </a>
          </div>

          {/* mini info chips */}
          <div className="mt-8 flex flex-wrap gap-3">
            <Chip text="Resume parsing" />
            <Chip text="ATS scoring" />
            <Chip text="Role detection" />
            <Chip text="Skill gap analysis" />
            <Chip text="AI CV draft" />
            <Chip text="PDF export" />
          </div>
        </motion.div>

        {/* RIGHT PREVIEW */}
        <motion.div
          initial={{ opacity: 0, x: 30, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="relative"
        >
          <div className="absolute inset-0 rounded-[32px] bg-sky-200/30 blur-2xl" />
          <div className="relative rounded-[32px] bg-white p-6 shadow-xl ring-1 ring-black/5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Example ATS Output</p>
                <p className="text-xs text-black/50">Backend / Full-stack graduate role</p>
              </div>
              <div className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-200">
                Borderline
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Metric label="Final match score" value="73 / 100" />
              <Metric label="Role detected" value="backend" />
              <Metric label="Keyword coverage" value="70%" />
              <Metric label="Must requirements" value="70%" />
            </div>

            <div className="mt-4 rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
              <p className="text-sm font-semibold text-red-800">Missing MUST requirements</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-700">
                <li>Docker and Linux exposure</li>
                <li>Agile collaboration evidence</li>
                <li>REST API project evidence</li>
              </ul>
            </div>

            <div className="mt-4 rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
              <p className="text-sm font-semibold">AI suggestion</p>
              <p className="mt-2 text-sm text-black/70">
                Add project bullets showing <b>REST APIs</b>, <b>Docker</b>, and <b>Git workflow</b>.
                Use <b>Action + Impact</b> bullet points and keep your CV ATS-friendly.
              </p>
            </div>
          </div>
        </motion.div>
      </section>

      {/* WHO IS IT FOR */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-3xl text-center"
        >
          <h3 className="text-2xl font-bold sm:text-3xl">Who this system is for</h3>
          <p className="mt-4 text-lg text-black/70">
            Designed for computer science students and recent graduates applying for entry-level technical roles.
          </p>
        </motion.div>

        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard
            icon={<FileText className="h-5 w-5 text-sky-700" />}
            title="Final-year students"
            text="Students preparing CVs for internships, placements, and graduate applications."
          />
          <InfoCard
            icon={<Brain className="h-5 w-5 text-sky-700" />}
            title="Junior software roles"
            text="Best suited for frontend, backend, full-stack, and early-career software engineering jobs."
          />
          <InfoCard
            icon={<Target className="h-5 w-5 text-sky-700" />}
            title="ATS-focused applicants"
            text="Useful for people who want to improve keyword alignment and requirement coverage."
          />
          <InfoCard
            icon={<CheckCircle2 className="h-5 w-5 text-sky-700" />}
            title="Career preparation"
            text="Helps users understand whether they are qualified, borderline, or not ready yet."
          />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="mx-auto max-w-7xl px-6 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h3 className="text-3xl font-bold sm:text-4xl">How it works</h3>
          <p className="mt-4 text-lg text-black/70">
            A simple workflow that combines parsing, ATS-style scoring, and AI suggestions.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <StepCard
            number="01"
            icon={<UploadCloud className="h-5 w-5 text-sky-700" />}
            title="Upload your resume"
            text="The system extracts text from PDF or DOCX files and prepares it for analysis."
          />
          <StepCard
            number="02"
            icon={<Target className="h-5 w-5 text-sky-700" />}
            title="Paste the job description"
            text="The tool reads requirements, key terms, role focus, and expected technical skills."
          />
          <StepCard
            number="03"
            icon={<ScanSearch className="h-5 w-5 text-sky-700" />}
            title="Get ATS-style analysis"
            text="Receive match score, must-have coverage, missing skills, and role-aware decision output."
          />
          <StepCard
            number="04"
            icon={<Sparkles className="h-5 w-5 text-sky-700" />}
            title="Improve with AI"
            text="Generate an editable ATS-friendly CV draft and export it as PDF."
          />
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h3 className="text-3xl font-bold sm:text-4xl">Core system features</h3>
          <p className="mt-4 text-lg text-black/70">
            Built to go beyond a generic CV checker by focusing on explainable ATS analysis.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <Feature
            title="Resume Parsing"
            text="Extracts cleaned text from uploaded PDF or DOCX resumes for structured analysis."
          />
          <Feature
            title="Semantic Matching"
            text="Uses AI embeddings to compare resume meaning against job requirements, not just exact words."
          />
          <Feature
            title="Keyword Coverage"
            text="Identifies missing terms and ATS-style keyword gaps from the job description."
          />
          <Feature
            title="Requirement Analysis"
            text="Separates must-have and nice-to-have requirements to produce more realistic ATS decisions."
          />
          <Feature
            title="Role Detection"
            text="Detects role focus such as backend, frontend, or general software engineering."
          />
          <Feature
            title="AI Resume Draft"
            text="Generates an editable ATS-friendly CV draft with suggestions to improve alignment."
          />
        </div>
      </section>

      {/* WHY THIS SYSTEM */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="rounded-[32px] bg-white p-8 shadow-soft ring-1 ring-black/5 sm:p-12">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h3 className="text-3xl font-bold sm:text-4xl">Why use this system?</h3>
              <p className="mt-4 text-lg leading-8 text-black/70">
                Generic CV tools often only count keywords. This system is designed specifically for computer
                science roles and combines semantic matching, role-aware requirement analysis, skill gap detection,
                and AI-generated improvement suggestions.
              </p>

              <ul className="mt-6 space-y-2 text-base text-black/75">
                <li className="leading-relaxed">• Built for internships, graduate roles, and junior CS jobs</li>
                <li className="leading-relaxed">• Explains what is missing, not just the score</li>
                <li className="leading-relaxed">• Helps improve ATS readiness before applying</li>
                <li >• Produces clearer, more targeted resume drafts</li>
              </ul>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard number="ATS-style" label="decision support" />
              <StatCard number="AI + rules" label="hybrid scoring logic" />
              <StatCard number="Role-aware" label="CS-focused analysis" />
              <StatCard number="Explainable" label="evidence-based feedback" />
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="rounded-[32px] bg-black px-8 py-12 text-white sm:px-12"
        >
          <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div>
              <h3 className="text-2xl font-bold">Ready to test your CV?</h3>
              <p className="mt-3 max-w-xl text-base leading-relaxed text-white/75">
                Upload your resume, paste a job description, and get ATS-style feedback tailored for computer science roles.
              </p>
            </div>

            <Link
              href="/analyze"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-2 font-semibold text-black transition hover:bg-sky-50"
            >
              Start Analysis
              <ArrowRight size={18} />
            </Link>
          </div>
        </motion.div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white px-4 py-4 shadow-sm">
      <div className="text-sm text-black/55">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tracking-tight">{value}</div>
    </div>
  );
}

function Feature({ title, text }: { title: string; text: string }) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-black/5 space-y-2"
    >
      <h4 className="text-base font-semibold">{title}</h4>
      <p className="mt-2 text-sm leading-relaxed text-black/70">
  {text}
</p>
    </motion.div>
  );
}

function InfoCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-black/5 space-y-2"
    >
      <div className="mb-4 inline-flex rounded-2xl bg-sky-50 p-3 ring-1 ring-sky-200">
        {icon}
      </div>
      <h4 className="text-base font-semibold">{title}</h4>
      <p className="mt-2 text-sm leading-relaxed text-black/70 max-w-xs">
  {text}
</p>
    </motion.div>
  );
}

function StepCard({
  number,
  icon,
  title,
  text,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="rounded-3xl bg-white p-6 shadow-soft ring-1 ring-black/5 space-y-2"
    >
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-2xl bg-sky-50 p-3 ring-1 ring-sky-200">
          {icon}
        </div>
        <div className="text-sm font-bold text-sky-600">{number}</div>
      </div>
      <h4 className="mt-5 text-lg font-semibold">{title}</h4>
      <p className="mt-2 text-sm leading-relaxed text-black/70">
  {text}
</p>
    </motion.div>
  );
}

function StatCard({ number, label }: { number: string; label: string }) {
  return (
    <div className="rounded-3xl bg-sky-50 p-6 ring-1 ring-sky-200/60">
      <div className="text-lg font-bold">{number}</div>
      <div className="mt-1 text-sm text-black/70">{label}</div>
    </div>
  );
}

function Chip({ text }: { text: string }) {
  return (
    <div className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black/70 ring-1 ring-black/10 shadow-sm">
      {text}
    </div>
  );
}