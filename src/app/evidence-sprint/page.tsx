"use client";

import Link from "next/link";
import { Logo } from "@/components/logo";
import { useLocale } from "@/lib/useLocale";
import {
  Shield,
  ShieldCheck,
  FileCheck,
  Check,
  Lock,
  ExternalLink,
  ListChecks,
  CalendarClock,
  FileText,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Bilingual content. Mirrors the existing marketing-page i18n pattern
// (see src/app/features/page.tsx): content is keyed by locale and every
// non-JA locale falls back to English so no locale ever sees a mixed language.
// ---------------------------------------------------------------------------
interface MappingRow {
  article: string;
  topic: string;
  evidence: string;
}
interface Step {
  title: string;
  desc: string;
}
interface FaqItem {
  q: string;
  a: string;
}
interface EvidenceSprintContent {
  nav: { pricing: string; contact: string };
  hero: {
    eyebrow: string;
    headline: string;
    subhead: string;
    ctaLabel: string;
    priceNote: string;
  };
  offer: { heading: string; subheading: string; deliverables: string[] };
  mappingTable: {
    heading: string;
    note: string;
    colArticle: string;
    colTopic: string;
    colEvidence: string;
    rows: MappingRow[];
  };
  howItWorks: { heading: string; steps: Step[]; dataNote: string };
  needFromYou: { heading: string; items: string[] };
  pricing: { heading: string; price: string; priceUnit: string; terms: string[] };
  faq: { heading: string; items: FaqItem[] };
  closing: { heading: string; subhead: string; ctaLabel: string };
  disclaimer: string;
}

const CONTENT: Record<"en" | "ja", EvidenceSprintContent> = {
  en: {
    nav: { pricing: "Pricing", contact: "Contact" },
    hero: {
      eyebrow: "DORA pre-audit resilience evidence",
      headline: "Audit-ready DORA resilience evidence in 5 business days",
      subhead:
        "A fixed-scope Sprint using sanitized data only to produce a structured evidence pack for DORA pre-audit preparation. $2,500 fixed; no production access, no PII. Decision-support only, not legal advice.",
      ctaLabel: "Book a 20-min Evidence Sprint scoping call",
      priceNote: "$2,500 fixed · 50% upfront · 5 business days",
    },
    offer: {
      heading: "What you get",
      subheading:
        "A fixed-scope evidence pack that organizes resilience signals, gaps, and assumptions for DORA pre-audit preparation.",
      deliverables: [
        "Resilience evidence pack structured for DORA pre-audit preparation",
        "Critical service dependency map from sanitized topology and service data",
        "ICT asset and control traceability matrix for in-scope services",
        "Failure mode and scenario catalogue for key infrastructure dependencies",
        "Recovery and continuity evidence summary with RTO/RPO inputs captured",
        "Backup, restoration, and recovery procedure evidence checklist",
        "Digital operational resilience testing evidence matrix",
        "Third-party ICT dependency and contract evidence gap log",
        "Risk, gap, and remediation register prioritized for audit preparation",
        "Executive readout with assumptions, limitations, and next-step actions",
      ],
    },
    mappingTable: {
      heading: "DORA article coverage",
      note: "Indicative mapping to support preparation; it is not a legal determination of applicability or compliance.",
      colArticle: "DORA Article",
      colTopic: "Topic",
      colEvidence: "Evidence produced",
      rows: [
        {
          article: "Art. 11",
          topic: "ICT response & recovery / business continuity",
          evidence: "Continuity and recovery evidence summary for in-scope critical services",
        },
        {
          article: "Art. 12",
          topic: "Backup, restoration & recovery",
          evidence: "Backup, restore, and recovery procedure evidence checklist",
        },
        {
          article: "Art. 24",
          topic: "Testing of ICT tools & systems",
          evidence: "Testing evidence matrix for ICT tools, systems, and resilience controls",
        },
        {
          article: "Art. 25",
          topic: "Testing of ICT tools/programs",
          evidence: "Scenario catalogue and test-readiness notes for in-scope services",
        },
        {
          article: "Art. 28",
          topic: "General principles, third-party risk",
          evidence: "Third-party ICT dependency map and concentration-risk evidence log",
        },
        {
          article: "Art. 30",
          topic: "Key contractual provisions, third-party",
          evidence: "Contract evidence checklist for resilience, access, exit, and reporting terms",
        },
      ],
    },
    howItWorks: {
      heading: "How it works",
      steps: [
        {
          title: "Day 0 — Scoping call",
          desc: "20-minute call to confirm in-scope critical services, sanitized inputs, owners, and handover timing.",
        },
        {
          title: "Days 1-2 — Evidence intake and modeling",
          desc: "Review sanitized topology, service dependencies, recovery inputs, and third-party links.",
        },
        {
          title: "Days 3-4 — Mapping and gap analysis",
          desc: "Map evidence to selected DORA articles, identify gaps, assumptions, and audit-prep risks.",
        },
        {
          title: "Day 5 — Delivery",
          desc: "Deliver the evidence pack, gap register, and executive readout for internal review.",
        },
      ],
      dataNote:
        "We work only on sanitized data: no production access, no PII, and no live-system credentials.",
    },
    needFromYou: {
      heading: "What we need from you",
      items: [
        "Sanitized topology or architecture diagram for in-scope services",
        "Inventory of critical services, systems, and key dependencies",
        "Existing recovery, backup, testing, and continuity artifacts",
        "Third-party ICT provider list and relevant contract extracts, sanitized",
      ],
    },
    pricing: {
      heading: "Pricing",
      price: "$2,500",
      priceUnit: "fixed scope",
      terms: [
        "50% upfront, 50% on delivery",
        "5 business days",
        "Sanitized data only — no production access, no PII",
        "Decision-support material for DORA pre-audit preparation",
      ],
    },
    faq: {
      heading: "FAQ",
      items: [
        {
          q: "Is this an audit or certification?",
          a: "No. The Sprint produces decision-support material for DORA pre-audit preparation. It is not legal advice, an audit, or certification, and it does not guarantee regulatory approval.",
        },
        {
          q: "Do you need production access or PII?",
          a: "No. FaultRay works only with sanitized data and does not require production access, PII, live credentials, or direct connections to your systems.",
        },
        {
          q: "What exactly do we receive?",
          a: "A structured evidence pack: dependency map, article mapping, control and test evidence, recovery/backup checklists, third-party risk notes, gaps, and executive readout.",
        },
        {
          q: "How fast, and what's the commitment?",
          a: "Delivery is 5 business days after intake is complete. The Sprint is $2,500 fixed scope, with 50% upfront and 50% on delivery.",
        },
      ],
    },
    closing: {
      heading: "Get your DORA evidence pack scoped",
      subhead:
        "Book a 20-minute call to confirm scope, sanitized inputs, and whether the Sprint fits your pre-audit timeline.",
      ctaLabel: "Book a 20-min Evidence Sprint scoping call",
    },
    disclaimer:
      "FaultRay provides decision-support material for DORA pre-audit preparation only. The Sprint is not legal advice, an audit, or certification and does not guarantee approval. Independent legal and technical review is required.",
  },
  ja: {
    nav: { pricing: "料金", contact: "お問い合わせ" },
    hero: {
      eyebrow: "DORA 事前監査レジリエンス証跡",
      headline: "監査対応可能な DORA レジリエンス証跡を5営業日で",
      subhead:
        "サニタイズ済みデータのみを用いる固定スコープのスプリントで、DORA 事前監査準備のための構造化された証跡パックを作成します。固定価格 $2,500・本番環境アクセスなし・PII なし。意思決定支援であり、法的助言ではありません。",
      ctaLabel: "20分の Evidence Sprint スコーピング通話を予約する",
      priceNote: "固定価格 $2,500 ・ 50%前払い ・ 5営業日",
    },
    offer: {
      heading: "提供内容",
      subheading:
        "DORA 事前監査準備に向けて、レジリエンスの根拠・ギャップ・前提条件を整理した固定スコープの証跡パックです。",
      deliverables: [
        "DORA 事前監査準備向けに構造化されたレジリエンス証跡パック",
        "サニタイズ済みトポロジー・サービスデータから作成する重要サービス依存関係マップ",
        "対象サービスの ICT 資産・統制トレーサビリティマトリクス",
        "主要インフラ依存に対する障害モード・シナリオカタログ",
        "RTO/RPO 入力値を記録した復旧・事業継続の証跡サマリー",
        "バックアップ・リストア・復旧手順の証跡チェックリスト",
        "デジタルオペレーショナルレジリエンステストの証跡マトリクス",
        "サードパーティ ICT 依存・契約に関する証跡ギャップログ",
        "監査準備向けに優先度付けしたリスク・ギャップ・是正登録簿",
        "前提条件・限界・次のアクションを示す経営層向けサマリー",
      ],
    },
    mappingTable: {
      heading: "DORA 条文カバレッジ",
      note: "準備を支援するための参考的な対応づけであり、適用可能性やコンプライアンスに関する法的判断ではありません。",
      colArticle: "DORA 条文",
      colTopic: "テーマ",
      colEvidence: "作成される証跡",
      rows: [
        {
          article: "Art. 11",
          topic: "ICT 対応・復旧／事業継続",
          evidence: "対象となる重要サービスの事業継続・復旧に関する証跡サマリー",
        },
        {
          article: "Art. 12",
          topic: "バックアップ・リストア・復旧",
          evidence: "バックアップ・リストア・復旧手順の証跡チェックリスト",
        },
        {
          article: "Art. 24",
          topic: "ICT ツール・システムのテスト",
          evidence: "ICT ツール・システム・レジリエンス統制のテスト証跡マトリクス",
        },
        {
          article: "Art. 25",
          topic: "ICT ツール／プログラムのテスト",
          evidence: "対象サービスのシナリオカタログとテスト準備状況メモ",
        },
        {
          article: "Art. 28",
          topic: "一般原則・サードパーティリスク",
          evidence: "サードパーティ ICT 依存マップと集中リスクの証跡ログ",
        },
        {
          article: "Art. 30",
          topic: "主要な契約条項・サードパーティ",
          evidence: "レジリエンス・アクセス・撤退・報告条項に関する契約証跡チェックリスト",
        },
      ],
    },
    howItWorks: {
      heading: "進め方",
      steps: [
        {
          title: "Day 0 — スコーピング通話",
          desc: "対象となる重要サービス、サニタイズ済み入力、担当者、引き渡し時期を確認する20分の通話。",
        },
        {
          title: "Day 1-2 — 証跡の受領とモデリング",
          desc: "サニタイズ済みトポロジー、サービス依存関係、復旧入力、サードパーティ連携を確認します。",
        },
        {
          title: "Day 3-4 — 対応づけとギャップ分析",
          desc: "証跡を選定した DORA 条文に対応づけ、ギャップ・前提条件・監査準備上のリスクを特定します。",
        },
        {
          title: "Day 5 — 納品",
          desc: "証跡パック、ギャップ登録簿、経営層向けサマリーを社内レビュー用に納品します。",
        },
      ],
      dataNote:
        "サニタイズ済みデータのみで作業します。本番環境アクセス・PII・稼働システムの認証情報は不要です。",
    },
    needFromYou: {
      heading: "ご用意いただくもの",
      items: [
        "対象サービスのサニタイズ済みトポロジーまたはアーキテクチャ図",
        "重要サービス・システム・主要依存関係の一覧",
        "既存の復旧・バックアップ・テスト・事業継続に関する資料",
        "サードパーティ ICT プロバイダー一覧と関連契約の抜粋（サニタイズ済み）",
      ],
    },
    pricing: {
      heading: "料金",
      price: "$2,500",
      priceUnit: "固定スコープ",
      terms: [
        "50%前払い、50%納品時",
        "5営業日",
        "サニタイズ済みデータのみ — 本番環境アクセスなし、PII なし",
        "DORA 事前監査準備のための意思決定支援資料",
      ],
    },
    faq: {
      heading: "よくあるご質問",
      items: [
        {
          q: "これは監査や認証ですか？",
          a: "いいえ。本スプリントは DORA 事前監査準備のための意思決定支援資料を作成します。法的助言・監査・認証ではなく、規制当局の承認を保証するものではありません。",
        },
        {
          q: "本番環境へのアクセスや PII は必要ですか？",
          a: "いいえ。FaultRay はサニタイズ済みデータのみで作業し、本番環境アクセス・PII・稼働認証情報・システムへの直接接続を必要としません。",
        },
        {
          q: "具体的に何を受け取れますか？",
          a: "構造化された証跡パックです。依存関係マップ、条文対応づけ、統制・テスト証跡、復旧／バックアップのチェックリスト、サードパーティリスクのメモ、ギャップ、経営層向けサマリーを含みます。",
        },
        {
          q: "どのくらいの期間で、どのような条件ですか？",
          a: "受領完了後、5営業日で納品します。本スプリントは固定スコープ $2,500、50%前払い・50%納品時のお支払いです。",
        },
      ],
    },
    closing: {
      heading: "DORA 証跡パックのスコープを確認しましょう",
      subhead:
        "スコープ、サニタイズ済み入力、貴社の事前監査スケジュールへの適合性を確認する20分の通話をご予約ください。",
      ctaLabel: "20分の Evidence Sprint スコーピング通話を予約する",
    },
    disclaimer:
      "FaultRay は DORA 事前監査準備のための意思決定支援資料のみを提供します。本スプリントは法的助言・監査・認証ではなく、承認を保証しません。独立した法務・技術レビューが必要です。",
  },
};

export default function EvidenceSprintPage() {
  const locale = useLocale();
  const t = CONTENT[locale === "ja" ? "ja" : "en"];
  const homeHref = `/${locale === "ja" ? "ja" : "en"}`;

  return (
    <div className="min-h-screen text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-[var(--border-color)]/95 backdrop-blur-sm">
        <div className="w-full px-6 h-16 flex items-center justify-between">
          <Link href={homeHref} className="flex items-center gap-2 font-bold">
            <Logo size={24} />
            FaultRay
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href={`${homeHref}#pricing`}
              className="text-sm text-[var(--text-secondary)] hover:text-white transition-colors"
            >
              {t.nav.pricing}
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--gold)] text-[#0a0e1a] font-semibold rounded-xl text-sm hover:bg-[#ffe44d] transition-all"
            >
              <ExternalLink size={14} />
              {t.nav.contact}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-20 text-center">
        <div className="max-w-[820px] mx-auto px-6">
          <div className="inline-block px-4 py-1.5 text-[0.8125rem] font-medium text-[var(--gold)] border border-[var(--gold)]/25 rounded-full bg-[var(--gold)]/5 mb-6">
            {t.hero.eyebrow}
          </div>
          <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-tight mb-4">
            {t.hero.headline}
          </h1>
          <p className="text-lg text-[var(--text-secondary)] leading-relaxed mb-6">
            {t.hero.subhead}
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-[var(--text-muted)] mb-8">
            <ShieldCheck size={15} className="text-[var(--gold)] shrink-0" />
            <span>{t.hero.priceNote}</span>
          </div>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-7 py-3 bg-[var(--gold)] text-[#0a0e1a] font-semibold rounded-xl hover:bg-[#ffe44d] shadow-[0_0_20px_rgba(255,215,0,0.2)] hover:shadow-[0_0_30px_rgba(255,215,0,0.35)] transition-all"
            >
              <ExternalLink size={16} />
              {t.hero.ctaLabel}
            </Link>
            <Link
              href={homeHref}
              className="inline-flex items-center gap-2 px-7 py-3 border border-[var(--border-color)] text-white rounded-xl hover:border-[#64748b] hover:bg-white/[0.03] transition-all"
            >
              FaultRay
            </Link>
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="py-16 border-t border-[var(--border-color)]">
        <div className="max-w-[980px] mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold mb-2">{t.offer.heading}</h2>
            <p className="text-[var(--text-secondary)] max-w-[640px] mx-auto">
              {t.offer.subheading}
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {t.offer.deliverables.map((d) => (
              <div
                key={d}
                className="flex items-start gap-3 p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]"
              >
                <FileCheck size={18} className="text-[var(--gold)] mt-0.5 shrink-0" />
                <span className="text-[0.9375rem] text-[var(--text-secondary)] leading-relaxed">{d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DORA article coverage */}
      <section className="py-16 border-t border-[var(--gold)]/15">
        <div className="max-w-[980px] mx-auto px-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2">{t.mappingTable.heading}</h2>
            <p className="text-sm text-[var(--text-muted)] max-w-[640px] mx-auto">{t.mappingTable.note}</p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-[var(--border-color)]">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th scope="col" className="px-5 py-4 text-left bg-[var(--bg-tertiary)] text-[var(--text-secondary)] font-semibold whitespace-nowrap">{t.mappingTable.colArticle}</th>
                  <th scope="col" className="px-5 py-4 text-left bg-[var(--bg-tertiary)] text-[var(--text-secondary)] font-semibold">{t.mappingTable.colTopic}</th>
                  <th scope="col" className="px-5 py-4 text-left bg-[var(--bg-tertiary)] text-[var(--text-secondary)] font-semibold">{t.mappingTable.colEvidence}</th>
                </tr>
              </thead>
              <tbody>
                {t.mappingTable.rows.map((row, i) => (
                  <tr key={row.article} className={i < t.mappingTable.rows.length - 1 ? "border-b border-[var(--border-color)]" : ""}>
                    <td className="px-5 py-4 font-semibold text-[var(--gold)] bg-[var(--bg-card)] whitespace-nowrap align-top">{row.article}</td>
                    <td className="px-5 py-4 text-[var(--text-primary)] bg-[var(--bg-card)] align-top">{row.topic}</td>
                    <td className="px-5 py-4 text-[var(--text-secondary)] bg-[var(--bg-card)] align-top">{row.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 border-t border-[var(--border-color)]">
        <div className="max-w-[980px] mx-auto px-6">
          <h2 className="text-2xl font-bold text-center mb-10">{t.howItWorks.heading}</h2>
          <div className="grid md:grid-cols-4 gap-5 mb-8">
            {t.howItWorks.steps.map((s, i) => (
              <div key={s.title} className="p-6 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">
                <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-[var(--gold)]/[0.06] border border-[var(--gold)]/10 mb-4">
                  <CalendarClock size={18} className="text-[var(--gold)]" />
                </div>
                <div className="text-xs font-semibold text-[var(--text-muted)] mb-1">Step {i + 1}</div>
                <h3 className="text-base font-bold mb-2">{s.title}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-3 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] max-w-[720px] mx-auto">
            <Lock size={18} className="text-emerald-400 mt-0.5 shrink-0" />
            <p className="text-sm text-emerald-300 leading-relaxed">{t.howItWorks.dataNote}</p>
          </div>
        </div>
      </section>

      {/* What we need from you + Pricing */}
      <section className="py-16 border-t border-[var(--border-color)]">
        <div className="max-w-[980px] mx-auto px-6 grid md:grid-cols-2 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-5">
              <ListChecks size={20} className="text-[var(--gold)]" />
              <h2 className="text-xl font-bold">{t.needFromYou.heading}</h2>
            </div>
            <ul className="space-y-3">
              {t.needFromYou.items.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[0.9375rem] text-[var(--text-secondary)]">
                  <Check size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="p-8 rounded-2xl border border-[var(--gold)]/25 bg-[var(--gold)]/[0.04]">
            <h2 className="text-xl font-bold mb-3">{t.pricing.heading}</h2>
            <div className="flex items-baseline gap-2 mb-5">
              <span className="text-4xl font-extrabold tracking-tight text-[var(--gold)]">{t.pricing.price}</span>
              <span className="text-sm text-[var(--text-muted)]">{t.pricing.priceUnit}</span>
            </div>
            <ul className="space-y-3">
              {t.pricing.terms.map((term) => (
                <li key={term} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
                  <ShieldCheck size={16} className="text-[var(--gold)] mt-0.5 shrink-0" />
                  {term}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 border-t border-[var(--border-color)]">
        <div className="max-w-[820px] mx-auto px-6">
          <h2 className="text-2xl font-bold text-center mb-10">{t.faq.heading}</h2>
          <div className="space-y-4">
            {t.faq.items.map((item) => (
              <div key={item.q} className="p-6 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)]">
                <div className="flex items-start gap-3 mb-2">
                  <FileText size={18} className="text-[var(--gold)] mt-0.5 shrink-0" />
                  <h3 className="text-base font-bold">{item.q}</h3>
                </div>
                <p className="text-[0.9375rem] text-[var(--text-secondary)] leading-relaxed pl-[30px]">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="py-20 text-center border-t border-[var(--gold)]/15">
        <div className="max-w-[640px] mx-auto px-6">
          <h2 className="text-2xl font-bold mb-4">{t.closing.heading}</h2>
          <p className="text-[var(--text-secondary)] mb-8 leading-relaxed">{t.closing.subhead}</p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 px-7 py-3 bg-[var(--gold)] text-[#0a0e1a] font-semibold rounded-xl hover:bg-[#ffe44d] shadow-[0_0_20px_rgba(255,215,0,0.2)] hover:shadow-[0_0_30px_rgba(255,215,0,0.35)] transition-all"
          >
            <ExternalLink size={16} />
            {t.closing.ctaLabel}
          </Link>
        </div>
      </section>

      {/* Disclaimer + footer */}
      <footer className="py-8 border-t border-[var(--border-color)]">
        <div className="max-w-[820px] mx-auto px-6 text-center">
          <div className="flex items-start gap-2.5 justify-center mb-4 text-xs text-[var(--text-muted)] leading-relaxed">
            <Shield size={14} className="mt-0.5 shrink-0" />
            <p className="max-w-[640px]">{t.disclaimer}</p>
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            <Link href={homeHref} className="hover:text-white transition-colors">FaultRay</Link>
            {" · "}
            <Link href="/pricing" className="hover:text-white transition-colors">{t.nav.pricing}</Link>
            {" · "}
            <Link href="/contact" className="hover:text-white transition-colors">{t.nav.contact}</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
