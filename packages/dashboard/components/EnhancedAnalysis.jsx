'use client';

// packages/dashboard/components/EnhancedAnalysis.jsx
//
// Renders enhanced analysis results from upgradeAnalysis.js.
// Shows 6 sections: suggestion, better approach, change breakdown,
// alignment check, architectural decisions, and context confirmation.
//
// Falls back gracefully: if a section has no data, it is hidden.

import { useState } from 'react';

// ─── Severity color map ───────────────────────────────────────────────────────

const SEVERITY_COLORS = {
  critical:      { bg: 'bg-red-950',    border: 'border-red-600',    badge: 'bg-red-600 text-white',         dot: 'bg-red-500' },
  warning:       { bg: 'bg-yellow-950', border: 'border-yellow-600', badge: 'bg-yellow-500 text-black',      dot: 'bg-yellow-400' },
  hallucination: { bg: 'bg-purple-950', border: 'border-purple-600', badge: 'bg-purple-600 text-white',      dot: 'bg-purple-500' },
  good:          { bg: 'bg-green-950',  border: 'border-green-700',  badge: 'bg-green-600 text-white',       dot: 'bg-green-500' },
  info:          { bg: 'bg-zinc-900',   border: 'border-zinc-700',   badge: 'bg-zinc-600 text-white',        dot: 'bg-zinc-400' },
  context:       { bg: 'bg-zinc-900',   border: 'border-zinc-800',   badge: 'bg-zinc-700 text-zinc-300',     dot: 'bg-zinc-500' },
};

// ─── Section Cards ────────────────────────────────────────────────────────────

function SectionCard({ title, icon, colorClass, borderClass, bgClass, children, collapsible = false }) {
  const [open, setOpen] = useState(true);

  return (
    <div className={`rounded-lg border ${bgClass} ${borderClass} p-4 mb-3 transition-all`}>
      <div
        className={`flex items-center gap-2 mb-2 ${collapsible ? 'cursor-pointer select-none' : ''}`}
        onClick={collapsible ? () => setOpen((v) => !v) : undefined}
      >
        <span className="text-base">{icon}</span>
        <span className={`text-xs font-bold uppercase tracking-wider ${colorClass}`}>{title}</span>
        {collapsible && (
          <span className="ml-auto text-zinc-500 text-xs">{open ? '▲' : '▼'}</span>
        )}
      </div>
      {open && children}
    </div>
  );
}

// ─── 1. Suggestion card ───────────────────────────────────────────────────────

function SuggestionCard({ suggestion, filePath }) {
  if (!suggestion) return null;
  const colors = SEVERITY_COLORS[suggestion.severity] || SEVERITY_COLORS.info;

  return (
    <SectionCard
      title="Suggested Approach"
      icon="💡"
      colorClass="text-blue-400"
      borderClass={colors.border}
      bgClass={colors.bg}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors.badge}`}>
          {suggestion.severity}
        </span>
        <span className="text-xs text-zinc-400 font-mono truncate">{filePath}</span>
      </div>
      <p className="text-sm font-semibold text-white mb-1">{suggestion.title}</p>
      <p className="text-sm text-zinc-300 leading-relaxed">{suggestion.body}</p>
      {suggestion.fix && (
        <div className="mt-3 p-2 rounded bg-zinc-800 border border-zinc-700">
          <p className="text-xs font-semibold text-zinc-400 mb-1">🔧 Fix:</p>
          <p className="text-xs text-zinc-300 font-mono leading-relaxed">{suggestion.fix}</p>
        </div>
      )}
    </SectionCard>
  );
}

// ─── 2. Better approach card ──────────────────────────────────────────────────

function BetterApproachCard({ betterApproach }) {
  if (!betterApproach) return null;
  const hasAlternative = betterApproach.exists && betterApproach.description;

  return (
    <SectionCard
      title="Better Approach"
      icon={hasAlternative ? '⚡' : '✅'}
      colorClass={hasAlternative ? 'text-yellow-400' : 'text-green-400'}
      borderClass={hasAlternative ? 'border-yellow-700' : 'border-green-800'}
      bgClass={hasAlternative ? 'bg-yellow-950' : 'bg-green-950'}
    >
      {hasAlternative ? (
        <>
          <p className="text-sm text-yellow-200 leading-relaxed mb-2">{betterApproach.description}</p>
          {betterApproach.reason && (
            <p className="text-xs text-zinc-400 italic">{betterApproach.reason}</p>
          )}
        </>
      ) : (
        <p className="text-sm text-green-300">Current approach looks optimal for this project context.</p>
      )}
    </SectionCard>
  );
}

// ─── 3. Change breakdown card ─────────────────────────────────────────────────

function ChangeBreakdownCard({ changeAnalysis, explanations }) {
  const hasChanges = changeAnalysis && changeAnalysis.length > 0;
  if (!hasChanges && !explanations) return null;

  return (
    <SectionCard
      title="Change Breakdown"
      icon="🔍"
      colorClass="text-purple-400"
      borderClass="border-purple-800"
      bgClass="bg-purple-950"
      collapsible
    >
      {explanations && (
        <p className="text-sm text-zinc-300 leading-relaxed mb-3">{explanations}</p>
      )}
      {hasChanges && (
        <div className="space-y-2">
          {changeAnalysis.map((change, i) => (
            <div key={i} className="p-2 rounded bg-zinc-900 border border-zinc-700">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-mono px-1.5 rounded ${
                  change.type === 'add'    ? 'bg-green-900 text-green-300' :
                  change.type === 'remove' ? 'bg-red-900 text-red-300' :
                  'bg-blue-900 text-blue-300'
                }`}>
                  {change.type}
                </span>
                {change.lines && (
                  <span className="text-xs text-zinc-500 font-mono">L{change.lines}</span>
                )}
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">{change.description}</p>
              {change.impact && (
                <p className="text-xs text-zinc-500 mt-1 italic">{change.impact}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ─── 4. Alignment card ────────────────────────────────────────────────────────

function AlignmentCard({ alignment }) {
  if (!alignment) return null;

  const score  = alignment.score ?? 0;
  const color  = score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-400' : 'bg-red-500';
  const textC  = score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400';

  return (
    <SectionCard
      title="Architecture Alignment"
      icon="📐"
      colorClass="text-indigo-400"
      borderClass="border-indigo-800"
      bgClass="bg-indigo-950"
    >
      <div className="flex items-center gap-3 mb-3">
        {/* Score ring */}
        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
          <span className={`text-lg font-bold ${textC}`}>{score}</span>
        </div>
        <div className="flex-1">
          <div className="w-full bg-zinc-800 rounded-full h-2 mb-1">
            <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
          </div>
          <p className="text-xs text-zinc-400">{alignment.notes}</p>
        </div>
      </div>
      {alignment.issues && alignment.issues.length > 0 && (
        <div className="space-y-1">
          {alignment.issues.map((issue, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="text-red-400 text-xs mt-0.5 flex-shrink-0">⚠</span>
              <p className="text-xs text-zinc-300">{issue}</p>
            </div>
          ))}
        </div>
      )}
      {(!alignment.issues || alignment.issues.length === 0) && alignment.aligned && (
        <p className="text-xs text-green-400 flex items-center gap-1">
          <span>✓</span> No alignment issues detected
        </p>
      )}
    </SectionCard>
  );
}

// ─── 5. Decisions card ────────────────────────────────────────────────────────

function DecisionsCard({ decisions }) {
  if (!decisions || !decisions.found || !decisions.list?.length) return null;

  return (
    <SectionCard
      title="Architectural Decisions"
      icon="🏗"
      colorClass="text-teal-400"
      borderClass="border-teal-800"
      bgClass="bg-teal-950"
      collapsible
    >
      <div className="space-y-1 mb-2">
        {decisions.list.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="text-teal-400 text-xs">→</span>
            <p className="text-xs text-zinc-300">{d}</p>
          </div>
        ))}
      </div>
      {decisions.impact && (
        <p className="text-xs text-zinc-500 italic mt-2">{decisions.impact}</p>
      )}
    </SectionCard>
  );
}

// ─── 6. Context saved confirmation ───────────────────────────────────────────

function ContextSavedCard({ usedFallback }) {
  return (
    <SectionCard
      title={usedFallback ? 'Analysis Mode: Basic' : 'Analysis Mode: Enhanced'}
      icon={usedFallback ? '⚡' : '🧠'}
      colorClass={usedFallback ? 'text-zinc-400' : 'text-zinc-400'}
      borderClass="border-zinc-700"
      bgClass="bg-zinc-900"
    >
      <p className="text-xs text-zinc-500">
        {usedFallback
          ? 'Used basic analysis (context analysis unavailable). Check Groq API key and rate limits.'
          : 'Context-aware analysis complete — project .md files were included in analysis.'}
      </p>
    </SectionCard>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * @param {object} props
 * @param {object} props.item - Feed item with enhanced analysis fields
 * @param {function} [props.onMarkReviewed] - Callback to mark item as reviewed
 * @param {boolean} [props.isReviewed] - Whether this item has been reviewed
 */
export default function EnhancedAnalysis({ item, onMarkReviewed, isReviewed }) {
  const [marking, setMarking] = useState(false);

  if (!item) return null;

  const handleMark = async (e) => {
    e.stopPropagation();
    if (!onMarkReviewed) return;
    setMarking(true);
    try {
      await onMarkReviewed(item.id);
    } catch (err) {
      console.error('Failed to mark reviewed:', err);
      setMarking(false);
    }
  };

  return (
    <div className={`mb-3 transition-all duration-300 ${
      isReviewed ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'
    }`}>
      {/* Review header */}
      {onMarkReviewed && !isReviewed && (
        <div className="flex justify-end mb-1">
          <button
            onClick={handleMark}
            disabled={marking}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium
              bg-zinc-800 hover:bg-green-900 border border-zinc-700 hover:border-green-600
              text-zinc-400 hover:text-green-300 transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed"
            title="Mark as reviewed"
          >
            {marking ? '...' : '✓ Reviewed'}
          </button>
        </div>
      )}
      <SuggestionCard     suggestion={item.suggestion}         filePath={item.filePath} />
      <BetterApproachCard betterApproach={item.betterApproach} />
      <ChangeBreakdownCard
        changeAnalysis={item.changeAnalysis}
        explanations={item.explanations}
      />
      <AlignmentCard  alignment={item.alignment}   />
      <DecisionsCard  decisions={item.decisions}   />
      <ContextSavedCard usedFallback={item.usedFallback} />
    </div>
  );
}

