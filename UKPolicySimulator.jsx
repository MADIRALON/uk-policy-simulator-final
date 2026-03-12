import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

// ─── Constants ────────────────────────────────────────────────────────────────
const YEARS = Array.from({ length: 11 }, (_, i) => 2010 + i);

const BASELINE = {
  gdpGrowth: 1.9,
  debtToGDP: 76,
  govSpending: 47,
  taxRevenue: 37,
  unemployment: 7.9,
  inflation: 3.3,
};

const REAL_AUSTERITY_BN = 100;
const REAL_QE_BN = 445;

const C = {
  salmon: "#FFF1E5",
  ftBlue: "#0D6DB7",
  gold: "#C8A951",
  ink: "#1A1A1A",
  inkLight: "#3A3A3A",
  inkMuted: "#7A7060",
  border: "#D8C8B4",
  cardBg: "#FFFAF5",
  red: "#C0392B",
  green: "#217A4B",
  purple: "#6B3FA0",
  orange: "#C05A00",
};

// ─── Economic Model ───────────────────────────────────────────────────────────
function computeEconomics(austeritySlider, qeSlider, isKeynesian) {
  const austerityBn = (austeritySlider / 100) * REAL_AUSTERITY_BN;
  const qeBn = (qeSlider / 100) * REAL_QE_BN;

  // Fiscal multiplier revised upward by Blanchard & Leigh (2013)
  const fiscalMultiplier = isKeynesian ? 1.5 : 0.7;
  const qeMultiplier = 0.3;

  const austerityGdpDrag = -(austerityBn / 1000) * fiscalMultiplier * 10;
  const qeGdpBoost = (qeBn / 1000) * qeMultiplier * 2;
  const keynesianBoost = isKeynesian ? 0.8 : 0;

  let debtToGDP = BASELINE.debtToGDP;
  let govSpending = BASELINE.govSpending;
  let taxRevenue = BASELINE.taxRevenue;
  let unemployment = BASELINE.unemployment;
  let inflation = BASELINE.inflation;
  let gdpLevel = 100;

  const series = [];

  for (let i = 0; i < YEARS.length; i++) {
    const year = YEARS[i];
    const t = i;

    const austerityProfile = t < 4 ? 1.0 : Math.max(0, 1 - (t - 4) * 0.2);
    const qeProfile = t < 2 ? 0.3 : t < 6 ? 0.8 : 0.5;
    const zeroLowerBoundFactor = t < 3 ? 0.6 : 1.0;
    const hysteresisEffect = t > 3 ? -(austeritySlider / 100) * 0.15 * (t - 3) : 0;
    const trendGrowth = BASELINE.gdpGrowth + keynesianBoost * 0.3;

    const gdpGrowth = Math.max(
      -2.5,
      Math.min(
        4.5,
        trendGrowth +
          austerityGdpDrag * austerityProfile * 0.4 +
          qeGdpBoost * qeProfile * zeroLowerBoundFactor * 0.4 +
          hysteresisEffect
      )
    );

    gdpLevel *= 1 + gdpGrowth / 100;

    const targetSpending = isKeynesian
      ? BASELINE.govSpending - (austeritySlider / 100) * 3 + keynesianBoost
      : BASELINE.govSpending - (austeritySlider / 100) * 8;
    govSpending += (targetSpending - govSpending) * 0.25;

    taxRevenue = Math.max(
      30,
      Math.min(45, taxRevenue + gdpGrowth * 0.4 * 0.15 - (austeritySlider / 100) * 0.05)
    );

    const gdpGap = gdpGrowth - 2.0;
    unemployment = Math.max(
      3.5,
      Math.min(12, unemployment - gdpGap * 0.35 + (isKeynesian ? -0.1 : 0.05))
    );

    const demandInflation = -(austeritySlider / 100) * 0.08 + (qeSlider / 100) * 0.06;
    const inflationTrend = t < 2 ? 0.3 : t < 5 ? -0.1 : -0.2;
    inflation = Math.max(-0.5, Math.min(6, inflation + demandInflation + inflationTrend));

    const deficit = govSpending - taxRevenue;
    debtToGDP = Math.max(40, debtToGDP + (deficit / 100) * 1.5 - gdpGrowth * 0.4);

    series.push({
      year,
      gdpGrowth: +gdpGrowth.toFixed(2),
      debtToGDP: +debtToGDP.toFixed(1),
      govSpending: +govSpending.toFixed(1),
      taxRevenue: +taxRevenue.toFixed(1),
      unemployment: +unemployment.toFixed(1),
      inflation: +inflation.toFixed(2),
      gdpLevel: +gdpLevel.toFixed(1),
    });
  }
  return series;
}

// ─── Policy Evaluation ────────────────────────────────────────────────────────
function getEvaluation(austerity, qe, isKeynesian, data) {
  const last = data[data.length - 1];
  const avg = data.reduce((s, d) => s + d.gdpGrowth, 0) / data.length;
  const debtDelta = last.debtToGDP - BASELINE.debtToGDP;

  if (austerity > 70 && qe < 30)
    return {
      tone: "critical",
      label: "HIGH RISK",
      color: C.red,
      context:
        "This configuration closely mirrors Chancellor Osborne's initial austerity programme without sufficient monetary accommodation. The OBR's June 2010 Budget forecast proved overly optimistic; with fiscal multipliers estimated by the IMF at 0.9–1.7 during periods of liquidity trap (Blanchard & Leigh, 2013), aggressive front-loaded consolidation risks significant output losses and a self-defeating fiscal dynamic as tax receipts collapse.",
      verdict: `At ${avg.toFixed(1)}% average annual growth, this path risks resembling Japan's lost decade. The debt-to-GDP ratio ${debtDelta > 0 ? "rises" : "falls"} by ${Math.abs(debtDelta).toFixed(0)} percentage points — a sobering indicator of the consolidation paradox, where spending cuts reduce the denominator (GDP) faster than the numerator (debt).`,
    };

  if (austerity > 70 && qe > 60)
    return {
      tone: "mixed",
      label: "TRADE-OFFS",
      color: C.orange,
      context:
        "This configuration mirrors 2010–2013 UK policy: austere fiscal stance offset by aggressive monetary easing. The Bank of England's £375bn QE programme was explicitly designed to compensate for the contractionary fiscal impulse. Transmission channels — portfolio rebalancing, lower gilt yields, credit easing — provide partial offset, at the cost of asset price inflation and growing wealth inequality.",
      verdict: `The liquidity trap dynamic limits QE effectiveness near the zero lower bound. Asset purchases primarily inflate equity and property prices. Average growth of ${avg.toFixed(1)}% represents a moderate recovery, but productivity growth — the key determinant of long-run living standards — remains structurally impaired by underinvestment during consolidation.`,
    };

  if (austerity < 30 && qe > 60)
    return {
      tone: "optimistic",
      label: "CONSTRUCTIVE",
      color: C.green,
      context:
        "A Keynesian-monetary synthesis: accommodative fiscal policy paired with substantial QE represents the prescription favoured by Delong, Summers, and Blanchard in post-GFC literature. Automatic stabilisers are preserved, the output gap closes more rapidly, and the fiscal multiplier operates in the intended direction. Infrastructure investment at this stage yields high social returns given suppressed financing costs.",
      verdict: `With average growth of ${avg.toFixed(1)}%, this path achieves faster debt stabilisation through the growth channel — consistent with Keynes: 'the boom, not the slump, is the right time for austerity at the Treasury.' Debt dynamics are ${debtDelta < 10 ? "manageable" : "elevated"} but the nominal anchor provided by QE helps contain inflation expectations.`,
    };

  if (isKeynesian && austerity < 40)
    return {
      tone: "positive",
      label: "FAVOURABLE",
      color: C.green,
      context:
        "The Keynesian stimulus path prioritises demand management and automatic stabilisers. Government as spender-of-last-resort during private sector deleveraging is consistent with the original Keynesian prescription. Public investment multipliers at the zero lower bound are estimated at 1.5–2.0x, substantially exceeding the Treasury's orthodox assumptions in the pre-crisis period.",
      verdict: `By accepting higher near-term borrowing, this path generates stronger growth and employment, which in turn boosts tax receipts and reduces the structural deficit more rapidly — the 'expansionary fiscal expansion' thesis. At ${avg.toFixed(1)}% average growth, the economy closes the output gap faster. Long-run debt sustainability improves through the denominator effect.`,
    };

  if (austerity < 30 && !isKeynesian)
    return {
      tone: "cautious",
      label: "VIGILANT",
      color: C.orange,
      context:
        "Moderate consolidation without significant monetary support is a cautious middle path. Without monetary accommodation, the private sector deleveraging dynamic — post-GFC, households and corporates simultaneously reducing debt — creates a fallacy-of-composition drag on aggregate demand that government policy insufficiently offsets.",
      verdict: `The structural deficit persists at this pace of consolidation. Rating agencies and gilt markets may grow impatient, particularly if external headwinds materialise — eurozone sovereign debt crisis, emerging market slowdowns. Average growth of ${avg.toFixed(1)}% implies a permanent income loss for households relative to the pre-crisis trend of ~2.5%.`,
    };

  return {
    tone: "neutral",
    label: "BALANCED",
    color: C.inkMuted,
    context:
      "This configuration represents a balanced approach to post-crisis fiscal and monetary management. The tension between fiscal credibility — essential for maintaining low gilt yields and avoiding a sovereign debt spiral — and demand management remains the central challenge. The OBR's independent remit provides institutional credibility but cannot substitute for the underlying macroeconomic trade-offs.",
    verdict: `With ${avg.toFixed(1)}% average growth and debt-to-GDP ${debtDelta > 0 ? "rising" : "falling"} by ${Math.abs(debtDelta).toFixed(0)} percentage points over the decade, the policy mix delivers moderate outcomes. The key uncertainty remains the fiscal multiplier: if higher than assumed, consolidation has been too aggressive; if lower, it has been appropriately calibrated.`,
  };
}

// ─── Consequences ─────────────────────────────────────────────────────────────
function getConsequences(austerity, qe, isKeynesian, data) {
  const last = data[data.length - 1];
  const items = [];

  if (austerity > 60)
    items.push({ icon: "⚕️", label: "NHS & public service funding pressures", severity: "high", detail: "Prolonged spending constraint squeezes real-terms per-capita NHS budgets, generating waiting list growth and reduced social care provision." });
  if (austerity > 50 && qe < 40)
    items.push({ icon: "📉", label: "Productivity gap vs G7 peers widens", severity: "high", detail: "Public investment cuts reduce the capital stock available to private firms; human capital depreciates through long-term unemployment scarring." });
  if (qe > 60)
    items.push({ icon: "🏠", label: "Asset price inflation — property & equities", severity: "medium", detail: "Portfolio rebalancing from QE disproportionately benefits asset-holders; house price growth accelerates, worsening affordability for first-time buyers." });
  if (austerity > 70)
    items.push({ icon: "🗺️", label: "Regional inequality divergence accelerates", severity: "high", detail: "Public sector employment concentration outside London means austerity hits Northern, Welsh, and Midlands regions hardest — structural imbalance deepens." });
  if (last.debtToGDP > 100)
    items.push({ icon: "📊", label: "Risk of sovereign debt downgrade", severity: "high", detail: "Debt-to-GDP above 100% raises sustainability questions; credit agencies may revise outlook, increasing gilt yields and debt servicing costs." });
  if (last.inflation > 4)
    items.push({ icon: "💵", label: "Inflation overshoot — real wage erosion", severity: "medium", detail: "Above-target inflation (>4%) erodes purchasing power, particularly for lower-income households with higher consumption-to-income ratios." });
  if (last.unemployment > 9)
    items.push({ icon: "👷", label: "Structural unemployment & hysteresis", severity: "high", detail: "Prolonged unemployment generates skill atrophy and labour market detachment — temporary cyclical unemployment becomes permanent structural unemployment." });
  if (isKeynesian && austerity < 30)
    items.push({ icon: "🔧", label: "Infrastructure investment dividend", severity: "positive", detail: "Countercyclical public investment in transport, energy, and digital infrastructure captures high social returns and crowds in private capital." });
  if (qe > 50 && last.inflation < 2)
    items.push({ icon: "🔄", label: "Deflation risk contained by monetary easing", severity: "positive", detail: "QE successfully prevents deflationary spiral; anchored inflation expectations support nominal demand recovery and reduce real debt burden." });
  if (austerity < 25 && !isKeynesian)
    items.push({ icon: "💳", label: "Fiscal credibility risk — potential gilt yield spike", severity: "medium", detail: "Without credible medium-term consolidation plan, bond markets may demand a premium; rising debt servicing costs could crowd out productive spending." });

  return items.slice(0, 6);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const Mono = ({ children, style }) => (
  <span style={{ fontFamily: "'IBM Plex Mono', monospace", ...style }}>{children}</span>
);

const Serif = ({ children, style, as: Tag = "p" }) => (
  <Tag style={{ fontFamily: "'Playfair Display', serif", ...style }}>{children}</Tag>
);

function CustomSlider({ value, onChange, accentColor = C.ftBlue }) {
  return (
    <div style={{ position: "relative", height: 20, display: "flex", alignItems: "center" }}>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          WebkitAppearance: "none",
          appearance: "none",
          width: "100%",
          height: 4,
          borderRadius: 2,
          outline: "none",
          cursor: "pointer",
          background: `linear-gradient(to right, ${accentColor} 0%, ${accentColor} ${value}%, ${C.border} ${value}%, ${C.border} 100%)`,
        }}
      />
      <style>{`
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: ${accentColor};
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 1px 4px rgba(0,0,0,0.25);
        }
        input[type=range]::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: ${accentColor};
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 1px 4px rgba(0,0,0,0.25);
        }
      `}</style>
    </div>
  );
}

function ToggleSwitch({ checked, onChange, id }) {
  return (
    <label htmlFor={id} style={{ display: "inline-block", cursor: "pointer", position: "relative", width: 40, height: 22, flexShrink: 0 }}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ opacity: 0, width: 0, height: 0, position: "absolute" }}
      />
      <span style={{
        position: "absolute", inset: 0,
        background: checked ? C.green : C.border,
        borderRadius: 11,
        transition: "background 0.2s",
      }} />
      <span style={{
        position: "absolute",
        top: 3, left: checked ? 21 : 3,
        width: 16, height: 16,
        background: "white",
        borderRadius: "50%",
        transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </label>
  );
}

function Card({ children, style }) {
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 4, ...style }}>
      {children}
    </div>
  );
}

function MetricCard({ icon, label, value, unit, delta, baseline }) {
  const isNeutral = delta === undefined;
  const isGood = label.includes("GDP") || label.includes("Tax") ? delta > 0 : delta < 0;
  const deltaColor = isNeutral ? C.inkMuted : isGood ? C.green : C.red;
  const sign = delta > 0 ? "+" : "";

  return (
    <Card style={{ padding: "14px 16px" }}>
      <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>
        {icon} {label}
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 4 }}>
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 26, fontWeight: 700, color: C.ink, lineHeight: 1 }}>
          {value}<span style={{ fontSize: 13, fontWeight: 400, color: C.inkMuted }}>{unit}</span>
        </p>
        {delta !== undefined && (
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: deltaColor, background: `${deltaColor}15`, padding: "2px 7px", borderRadius: 2, border: `1px solid ${deltaColor}25` }}>
            {sign}{Math.abs(delta).toFixed(1)}{unit}
          </span>
        )}
      </div>
      {baseline && (
        <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.inkMuted, marginTop: 4 }}>{baseline}</p>
      )}
    </Card>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, padding: "10px 14px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, boxShadow: "0 2px 10px rgba(0,0,0,0.12)" }}>
      <p style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, marginBottom: 6, color: C.ink, fontSize: 13 }}>{label}</p>
      {payload.map((e) => (
        <p key={e.dataKey} style={{ color: e.color, margin: "2px 0" }}>{e.name}: {e.value}%</p>
      ))}
    </div>
  );
};

// ─── Chart line config ─────────────────────────────────────────────────────────
const LINES = [
  { key: "gdpGrowth",   name: "GDP Growth",   color: C.ftBlue,  axis: "L" },
  { key: "unemployment",name: "Unemployment", color: C.red,     axis: "L" },
  { key: "inflation",   name: "Inflation",    color: C.gold,    axis: "L" },
  { key: "debtToGDP",   name: "Debt/GDP",     color: C.purple,  axis: "R" },
  { key: "govSpending", name: "Gov. Spending",color: C.green,   axis: "R" },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function UKPolicySimulator() {
  const [austerity, setAusterity] = useState(75);
  const [qe, setQe] = useState(65);
  const [isKeynesian, setIsKeynesian] = useState(false);
  const [activeLines, setActiveLines] = useState(new Set(["gdpGrowth", "unemployment", "inflation", "debtToGDP"]));

  const austerityBn = Math.round((austerity / 100) * REAL_AUSTERITY_BN);
  const qeBn = Math.round((qe / 100) * REAL_QE_BN);

  const data = useMemo(() => computeEconomics(austerity, qe, isKeynesian), [austerity, qe, isKeynesian]);
  const last = data[data.length - 1];
  const avgGrowth = data.reduce((s, d) => s + d.gdpGrowth, 0) / data.length;
  const ev = useMemo(() => getEvaluation(austerity, qe, isKeynesian, data), [austerity, qe, isKeynesian, data]);
  const cons = useMemo(() => getConsequences(austerity, qe, isKeynesian, data), [austerity, qe, isKeynesian, data]);

  const toggleLine = (key) =>
    setActiveLines((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { background: ${C.salmon}; min-height: 100vh; }
        .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
        .g3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .g6 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        @media (max-width: 860px) { .g2 { grid-template-columns: 1fr; } .g3 { grid-template-columns: 1fr 1fr; } .g6 { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 540px) { .g3,.g6 { grid-template-columns: 1fr; } }
        .line-btn { cursor: pointer; transition: all 0.15s ease; }
        .line-btn:hover { opacity: 0.8; }
        .con-row { display: flex; gap: 11px; padding: 11px 0; border-bottom: 1px solid ${C.border}; }
        .con-row:last-child { border-bottom: none; }
      `}</style>

      <div style={{ minHeight: "100vh", background: C.salmon, fontFamily: "'IBM Plex Mono', monospace", color: C.ink }}>

        {/* ─ Header ─ */}
        <div style={{ background: C.ink, borderBottom: `3px solid ${C.gold}` }}>
          <div style={{ maxWidth: 1160, margin: "0 auto", padding: "22px 24px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <div>
              <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.gold, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 7 }}>
                Interactive Policy Analysis · UK Economy 2010–2020
              </p>
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(20px, 3.5vw, 34px)", fontWeight: 700, color: "#fff", lineHeight: 1.15, marginBottom: 8 }}>
                UK Post-GFC Policy Simulator
              </h1>
              <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#B0A090", lineHeight: 1.65, maxWidth: 600 }}>
                Explore the trade-offs of austerity and stimulus in the wake of the 2008 financial crisis. You are the Chancellor — set the levers and observe the consequences.
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ display: "inline-block", background: `${ev.color}25`, color: ev.color, border: `1px solid ${ev.color}50`, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.1em", padding: "3px 10px", borderRadius: 2, marginBottom: 8 }}>
                {ev.label}
              </div>
              <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#807060" }}>10-yr avg. growth</p>
              <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 24, fontWeight: 700, color: avgGrowth > 2 ? C.green : avgGrowth > 1 ? C.gold : C.red, lineHeight: 1.1 }}>
                {avgGrowth.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1160, margin: "0 auto", padding: "26px 24px 60px" }}>

          {/* ─ Levers ─ */}
          <section style={{ marginBottom: 26 }}>
            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 13, fontWeight: 600, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>Policy Levers</p>
            <div className="g2">

              {/* Austerity */}
              <Card style={{ padding: "18px 22px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                  <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 13, fontWeight: 600, color: C.ink }}>Austerity Intensity</p>
                  <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 700, color: C.ftBlue }}>£{austerityBn}bn</p>
                </div>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.inkMuted, marginBottom: 14 }}>
                  Osborne 2010 target: £100bn · 0 = no cuts, 100 = maximum austerity
                </p>
                <CustomSlider value={austerity} onChange={setAusterity} accentColor={C.ftBlue} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.inkMuted }}>
                  <span>No cuts</span><span>Maximum austerity</span>
                </div>
                <div style={{ marginTop: 12, padding: "7px 11px", background: `${C.ftBlue}0E`, border: `1px solid ${C.ftBlue}22`, borderRadius: 3 }}>
                  <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.ftBlue }}>
                    {austerity > 70 ? "↳ Resembles Osborne 2010 emergency budget" : austerity > 40 ? "↳ Moderate consolidation path" : austerity > 15 ? "↳ Gradual consolidation" : "↳ Structural deficit left largely intact"}
                  </p>
                </div>
              </Card>

              {/* QE */}
              <Card style={{ padding: "18px 22px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                  <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 13, fontWeight: 600, color: C.ink }}>Quantitative Easing Scale</p>
                  <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 700, color: C.gold }}>£{qeBn}bn</p>
                </div>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.inkMuted, marginBottom: 14 }}>
                  BoE actual: £445bn by 2013 · 0 = no QE, 100 = maximum accommodation
                </p>
                <CustomSlider value={qe} onChange={setQe} accentColor={C.gold} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.inkMuted }}>
                  <span>No QE</span><span>Maximum QE</span>
                </div>
                <div style={{ marginTop: 12, padding: "7px 11px", background: `${C.gold}12`, border: `1px solid ${C.gold}35`, borderRadius: 3 }}>
                  <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#8B6914" }}>
                    {qe > 70 ? "↳ Above BoE historical QE — ultra-aggressive easing" : qe > 45 ? "↳ Approximates BoE 2009–2013 programme" : qe > 20 ? "↳ Moderate monetary accommodation" : "↳ Conventional monetary policy only"}
                  </p>
                </div>
              </Card>
            </div>

            {/* Regime toggle */}
            <Card style={{ padding: "14px 20px", marginTop: 14, display: "flex", alignItems: "center", gap: 14 }}>
              <ToggleSwitch checked={isKeynesian} onChange={setIsKeynesian} id="regime" />
              <label htmlFor="regime" style={{ cursor: "pointer", flex: 1 }}>
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 13, fontWeight: 600, color: C.ink }}>
                  Policy Regime:{" "}
                  <span style={{ color: isKeynesian ? C.green : C.ftBlue }}>
                    {isKeynesian ? "Keynesian Stimulus Path" : "Austerity Consolidation Path"}
                  </span>
                </p>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.inkMuted, marginTop: 2 }}>
                  {isKeynesian
                    ? "Higher fiscal multipliers · Demand-led recovery · Counter-cyclical public spending"
                    : "Supply-side orientation · Fiscal credibility signal · Private investment crowding-in"}
                </p>
              </label>
            </Card>
          </section>

          <hr style={{ border: "none", borderTop: `1px solid ${C.border}`, marginBottom: 26 }} />

          {/* ─ Metric Cards ─ */}
          <section style={{ marginBottom: 26 }}>
            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 13, fontWeight: 600, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>2020 Projections</p>
            <div className="g6">
              <MetricCard icon="📉" label="Debt-to-GDP"    value={last.debtToGDP.toFixed(1)} unit="%" delta={last.debtToGDP - BASELINE.debtToGDP} baseline={`2010: ${BASELINE.debtToGDP}%`} />
              <MetricCard icon="📈" label="Avg. GDP Growth" value={avgGrowth.toFixed(2)}      unit="%" delta={avgGrowth - BASELINE.gdpGrowth}   baseline={`2010 rate: ${BASELINE.gdpGrowth}%`} />
              <MetricCard icon="🏛️" label="Gov. Spending"  value={last.govSpending.toFixed(1)} unit="% GDP" delta={last.govSpending - BASELINE.govSpending} baseline={`2010: ${BASELINE.govSpending}%`} />
              <MetricCard icon="💰" label="Tax Revenue"    value={last.taxRevenue.toFixed(1)}  unit="% GDP" delta={last.taxRevenue - BASELINE.taxRevenue}   baseline={`2010: ${BASELINE.taxRevenue}%`} />
              <MetricCard icon="👷" label="Unemployment"   value={last.unemployment.toFixed(1)} unit="%" delta={last.unemployment - BASELINE.unemployment} baseline={`2010: ${BASELINE.unemployment}%`} />
              <MetricCard icon="📊" label="Inflation"      value={last.inflation.toFixed(2)}    unit="%" delta={last.inflation - BASELINE.inflation}   baseline={`BoE target: 2% · 2010: ${BASELINE.inflation}%`} />
            </div>
          </section>

          <hr style={{ border: "none", borderTop: `1px solid ${C.border}`, marginBottom: 26 }} />

          {/* ─ Chart ─ */}
          <section style={{ marginBottom: 26 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
              <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 13, fontWeight: 600, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                10-Year Economic Trajectory
              </p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {LINES.map((l) => (
                  <button
                    key={l.key}
                    className="line-btn"
                    onClick={() => toggleLine(l.key)}
                    style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "3px 10px", borderRadius: 2, border: `1px solid ${l.color}`, background: activeLines.has(l.key) ? l.color : "transparent", color: activeLines.has(l.key) ? "#fff" : l.color, cursor: "pointer" }}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            </div>
            <Card style={{ padding: "20px 6px 10px" }}>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={data} margin={{ top: 6, right: 36, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="year" tick={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fill: C.inkMuted }} tickLine={false} axisLine={{ stroke: C.border }} />
                  <YAxis yAxisId="L" domain={[-3, 15]} tick={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fill: C.inkMuted }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={34} />
                  <YAxis yAxisId="R" orientation="right" domain={[30, 130]} tick={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fill: C.inkMuted }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={36} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine yAxisId="L" y={0} stroke={C.border} strokeDasharray="4 4" />
                  <ReferenceLine yAxisId="L" y={2} stroke={C.gold} strokeDasharray="4 4" strokeOpacity={0.5}
                    label={{ value: "BoE 2%", position: "insideTopLeft", fontSize: 9, fill: C.gold, fontFamily: "'IBM Plex Mono', monospace" }} />
                  {LINES.map((l) => activeLines.has(l.key) ? (
                    <Line key={l.key} yAxisId={l.axis} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2}
                      dot={{ r: 3, fill: l.color, strokeWidth: 0 }} activeDot={{ r: 5 }} animationDuration={350} />
                  ) : null)}
                </LineChart>
              </ResponsiveContainer>
              <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.inkMuted, textAlign: "center", marginTop: 6, padding: "0 10px" }}>
                Left axis: GDP growth / Unemployment / Inflation (%) · Right axis: Debt/GDP / Gov. Spending (% of GDP)
              </p>
            </Card>
          </section>

          <hr style={{ border: "none", borderTop: `1px solid ${C.border}`, marginBottom: 26 }} />

          {/* ─ Evaluation + Consequences ─ */}
          <div className="g2" style={{ marginBottom: 26 }}>

            <section>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 13, fontWeight: 600, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Policy Evaluation</p>
                <span style={{ background: `${ev.color}20`, color: ev.color, border: `1px solid ${ev.color}40`, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "2px 8px", borderRadius: 2 }}>{ev.label}</span>
              </div>
              <Card style={{ padding: "18px 20px", height: "calc(100% - 42px)" }}>
                <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.inkLight, lineHeight: 1.78, marginBottom: 16 }}>
                  {ev.context}
                </p>
                <div style={{ borderLeft: `3px solid ${ev.color}`, paddingLeft: 14 }}>
                  <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.ink, lineHeight: 1.78, fontStyle: "italic" }}>
                    {ev.verdict}
                  </p>
                </div>
              </Card>
            </section>

            <section>
              <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 13, fontWeight: 600, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>Long-Term Consequences</p>
              <Card style={{ padding: "8px 18px", height: "calc(100% - 42px)" }}>
                {cons.length === 0 && (
                  <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.inkMuted, padding: "14px 0" }}>
                    Adjust levers to see consequence projections.
                  </p>
                )}
                {cons.map((c, i) => (
                  <div key={i} className="con-row">
                    <span style={{ fontSize: 17, flexShrink: 0 }}>{c.icon}</span>
                    <div>
                      <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 13, fontWeight: 600, color: c.severity === "positive" ? C.green : c.severity === "high" ? C.red : C.ink, marginBottom: 3 }}>
                        {c.label}
                      </p>
                      <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.inkMuted, lineHeight: 1.65 }}>
                        {c.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </Card>
            </section>
          </div>

          {/* ─ Summary strip ─ */}
          <Card style={{ padding: "16px 20px", marginBottom: 26, background: `${C.ink}06` }}>
            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 12, fontWeight: 600, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Policy Summary</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "8px 24px" }}>
              {[
                ["Fiscal cuts", `£${austerityBn}bn (${austerity}%)`],
                ["QE programme", `£${qeBn}bn (${qe}%)`],
                ["Policy regime", isKeynesian ? "Keynesian" : "Consolidation"],
                ["Deficit 2020", `${(last.govSpending - last.taxRevenue).toFixed(1)}% GDP`],
                ["GDP level 2020", `+${(last.gdpLevel - 100).toFixed(1)}% vs 2010`],
                ["Fiscal credibility", austerity > 50 ? "High" : austerity > 25 ? "Moderate" : "Low"],
              ].map(([k, v]) => (
                <div key={k}>
                  <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.inkMuted }}>{k}</p>
                  <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, color: C.ink }}>{v}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* ─ Footer ─ */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.inkMuted, lineHeight: 1.7 }}>
              <strong>Model is illustrative and based on simplified macroeconomic relationships. Not a forecast.</strong>{" "}
              Starting conditions from 2010 UK National Statistics / OBR. Economic relationships informed by Blanchard &amp; Leigh (2013), IMF Fiscal Monitor, HM Treasury Green Book multiplier estimates, and Bank of England QE research. Fiscal multipliers, hysteresis effects, and monetary transmission channels are simplified for clarity.
            </p>
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: `${C.inkMuted}70`, marginTop: 5 }}>
              UK Post-GFC Policy Simulator · Educational use only · Built with React + Recharts
            </p>
          </div>

        </div>
      </div>
    </>
  );
}
