// Atlas — single shared mock dataset.
// The optimizer, simulator, explainability, reports, and copilot all read from
// this so numbers stay consistent across every page.

export type Severity = "critical" | "high" | "elevated" | "nominal";

export interface Hotspot {
  id: string;
  name: string;
  corridor: string;
  // normalized map coords 0..1
  x: number;
  y: number;
  severity: Severity;
  riskScore: number; // 0..100
  congestionContribution: number; // %
  violationVolume: number; // count / day
  logisticsImpact: number; // 0..100
  confidence: number; // %
  delayEstimate: number; // minutes
  officers: number; // recommended
  timeWindow: string;
  delayDelta: number; // minutes saved by intervention
  // explainability factor breakdown (sums ~ to 100)
  factors: { label: string; weight: number }[];
}

export const CITY_NAME = "Bengaluru";

export const HOTSPOTS: Hotspot[] = [
  {
    id: "silk-board",
    name: "Silk Board Junction",
    corridor: "ORR · Silk Board → HSR",
    x: 0.58,
    y: 0.74,
    severity: "critical",
    riskScore: 94,
    congestionContribution: 21,
    violationVolume: 412,
    logisticsImpact: 88,
    confidence: 86,
    delayEstimate: 72,
    officers: 6,
    timeWindow: "08:00 – 11:00",
    delayDelta: 23,
    factors: [
      { label: "Commercial density", weight: 31 },
      { label: "Transit density", weight: 24 },
      { label: "Historical violations", weight: 19 },
      { label: "Vulnerability index", weight: 14 },
      { label: "Lane bottleneck", weight: 12 },
    ],
  },
  {
    id: "kr-market",
    name: "KR Market",
    corridor: "Avenue Rd → KR Market",
    x: 0.34,
    y: 0.55,
    severity: "critical",
    riskScore: 89,
    congestionContribution: 17,
    violationVolume: 388,
    logisticsImpact: 81,
    confidence: 83,
    delayEstimate: 61,
    officers: 5,
    timeWindow: "10:00 – 13:00",
    delayDelta: 19,
    factors: [
      { label: "Commercial density", weight: 38 },
      { label: "Historical violations", weight: 22 },
      { label: "Transit density", weight: 17 },
      { label: "Vulnerability index", weight: 13 },
      { label: "Lane bottleneck", weight: 10 },
    ],
  },
  {
    id: "marathahalli",
    name: "Marathahalli Bridge",
    corridor: "ORR · Marathahalli → KR Puram",
    x: 0.72,
    y: 0.5,
    severity: "high",
    riskScore: 78,
    congestionContribution: 13,
    violationVolume: 296,
    logisticsImpact: 74,
    confidence: 80,
    delayEstimate: 48,
    officers: 4,
    timeWindow: "17:30 – 20:30",
    delayDelta: 15,
    factors: [
      { label: "Corporate density", weight: 34 },
      { label: "Transit density", weight: 21 },
      { label: "Historical violations", weight: 18 },
      { label: "Lane bottleneck", weight: 15 },
      { label: "Vulnerability index", weight: 12 },
    ],
  },
  {
    id: "hebbal",
    name: "Hebbal Flyover",
    corridor: "Bellary Rd · Hebbal → Mekhri",
    x: 0.46,
    y: 0.18,
    severity: "high",
    riskScore: 73,
    congestionContribution: 12,
    violationVolume: 248,
    logisticsImpact: 69,
    confidence: 79,
    delayEstimate: 44,
    officers: 4,
    timeWindow: "08:30 – 11:00",
    delayDelta: 13,
    factors: [
      { label: "Transit density", weight: 29 },
      { label: "Corporate density", weight: 24 },
      { label: "Historical violations", weight: 19 },
      { label: "Lane bottleneck", weight: 16 },
      { label: "Vulnerability index", weight: 12 },
    ],
  },
  {
    id: "whitefield",
    name: "Whitefield Main",
    corridor: "Whitefield Rd → ITPL",
    x: 0.86,
    y: 0.36,
    severity: "elevated",
    riskScore: 64,
    congestionContribution: 9,
    violationVolume: 191,
    logisticsImpact: 72,
    confidence: 77,
    delayEstimate: 37,
    officers: 3,
    timeWindow: "18:00 – 21:00",
    delayDelta: 11,
    factors: [
      { label: "Corporate density", weight: 41 },
      { label: "Historical violations", weight: 18 },
      { label: "Transit density", weight: 16 },
      { label: "Lane bottleneck", weight: 14 },
      { label: "Vulnerability index", weight: 11 },
    ],
  },
  {
    id: "indiranagar",
    name: "Indiranagar 100ft Rd",
    corridor: "CMH Rd → 100ft Rd",
    x: 0.62,
    y: 0.42,
    severity: "elevated",
    riskScore: 58,
    congestionContribution: 7,
    violationVolume: 167,
    logisticsImpact: 63,
    confidence: 75,
    delayEstimate: 31,
    officers: 3,
    timeWindow: "19:00 – 22:00",
    delayDelta: 9,
    factors: [
      { label: "Dining density", weight: 36 },
      { label: "Commercial density", weight: 22 },
      { label: "Historical violations", weight: 18 },
      { label: "Lane bottleneck", weight: 13 },
      { label: "Vulnerability index", weight: 11 },
    ],
  },
  {
    id: "jayanagar",
    name: "Jayanagar 4th Block",
    corridor: "11th Main → 4th Block",
    x: 0.4,
    y: 0.72,
    severity: "nominal",
    riskScore: 41,
    congestionContribution: 5,
    violationVolume: 122,
    logisticsImpact: 48,
    confidence: 74,
    delayEstimate: 22,
    officers: 2,
    timeWindow: "11:00 – 14:00",
    delayDelta: 6,
    factors: [
      { label: "Commercial density", weight: 33 },
      { label: "Dining density", weight: 24 },
      { label: "Historical violations", weight: 17 },
      { label: "Lane bottleneck", weight: 14 },
      { label: "Vulnerability index", weight: 12 },
    ],
  },
  {
    id: "majestic",
    name: "Majestic / KSR",
    corridor: "Gubbi Thotadappa Rd",
    x: 0.3,
    y: 0.42,
    severity: "nominal",
    riskScore: 37,
    congestionContribution: 4,
    violationVolume: 104,
    logisticsImpact: 44,
    confidence: 73,
    delayEstimate: 19,
    officers: 2,
    timeWindow: "09:00 – 12:00",
    delayDelta: 5,
    factors: [
      { label: "Transit density", weight: 39 },
      { label: "Commercial density", weight: 21 },
      { label: "Historical violations", weight: 16 },
      { label: "Lane bottleneck", weight: 13 },
      { label: "Vulnerability index", weight: 11 },
    ],
  },
];

export interface Corridor {
  id: string;
  name: string;
  // path points (normalized) for the map
  path: { x: number; y: number }[];
  severity: Severity;
  risk: number;
  delay: number;
  logisticsImpact: number;
}

export const CORRIDORS: Corridor[] = [
  {
    id: "orr-south",
    name: "ORR · Silk Board → Marathahalli",
    path: [
      { x: 0.58, y: 0.74 },
      { x: 0.62, y: 0.62 },
      { x: 0.72, y: 0.5 },
    ],
    severity: "critical",
    risk: 91,
    delay: 64,
    logisticsImpact: 85,
  },
  {
    id: "avenue-market",
    name: "Avenue Rd → KR Market",
    path: [
      { x: 0.3, y: 0.42 },
      { x: 0.34, y: 0.55 },
      { x: 0.4, y: 0.72 },
    ],
    severity: "high",
    risk: 82,
    delay: 55,
    logisticsImpact: 78,
  },
  {
    id: "bellary",
    name: "Bellary Rd · Hebbal Corridor",
    path: [
      { x: 0.46, y: 0.18 },
      { x: 0.5, y: 0.3 },
      { x: 0.62, y: 0.42 },
    ],
    severity: "high",
    risk: 74,
    delay: 46,
    logisticsImpact: 67,
  },
  {
    id: "whitefield-axis",
    name: "Whitefield → ITPL Axis",
    path: [
      { x: 0.72, y: 0.5 },
      { x: 0.8, y: 0.42 },
      { x: 0.86, y: 0.36 },
    ],
    severity: "elevated",
    risk: 63,
    delay: 36,
    logisticsImpact: 70,
  },
  {
    id: "south-ring",
    name: "Jayanagar Ring",
    path: [
      { x: 0.4, y: 0.72 },
      { x: 0.48, y: 0.78 },
      { x: 0.58, y: 0.74 },
    ],
    severity: "nominal",
    risk: 44,
    delay: 24,
    logisticsImpact: 41,
  },
];

// Flipkart logistics hubs (dashed signal overlay)
export const LOGISTICS_HUBS = [
  { id: "hub-hsr", name: "Flipkart HSR Hub", x: 0.64, y: 0.82, priorityIndex: 91, routes: 38, delay: 27, disruptionRisk: 84 },
  { id: "hub-hebbal", name: "Flipkart Hebbal FC", x: 0.5, y: 0.1, priorityIndex: 77, routes: 24, delay: 18, disruptionRisk: 66 },
  { id: "hub-whitefield", name: "Flipkart Whitefield FC", x: 0.9, y: 0.3, priorityIndex: 83, routes: 31, delay: 22, disruptionRisk: 73 },
];

export const LOGISTICS_ROUTES = [
  { from: "hub-hsr", to: "silk-board" },
  { from: "hub-hsr", to: "marathahalli" },
  { from: "hub-hebbal", to: "hebbal" },
  { from: "hub-whitefield", to: "whitefield" },
  { from: "hub-whitefield", to: "marathahalli" },
];

export const CITY_RISK_INDEX = 76;
export const OFFICERS_DEPLOYED = 47;
export const CRITICAL_HOTSPOTS = HOTSPOTS.filter((h) => h.severity === "critical").length;

export const EXEC_BRIEF = [
  { eyebrow: "Congestion from junction zones", value: "63", unit: "%" },
  { eyebrow: "Delay cut by top 10 interventions", value: "18", unit: "%" },
  { eyebrow: "Critical hotspots", value: String(CRITICAL_HOTSPOTS), unit: "" },
  { eyebrow: "City risk index", value: String(CITY_RISK_INDEX), unit: "" },
];

export const MAP_LAYERS = [
  "Commercial Density",
  "Transit Density",
  "Dining Density",
  "Corporate Density",
  "Road Capacity",
  "Vulnerability Index",
  "Flipkart Logistics Hubs",
  "Elevation / Slope",
];

// Forecast time series (6 AM -> 10 PM), 17 frames
export const FORECAST_HOURS = Array.from({ length: 17 }, (_, i) => 6 + i);

export function forecastSeries(seed = 1) {
  return FORECAST_HOURS.map((h) => {
    const morning = Math.exp(-((h - 9) ** 2) / 6) * 40;
    const evening = Math.exp(-((h - 18.5) ** 2) / 7) * 46;
    const base = 28 + morning + evening + (((h * seed) % 5) - 2);
    const value = Math.round(base);
    return {
      hour: `${String(h).padStart(2, "0")}:00`,
      h,
      value,
      lower: Math.max(0, Math.round(value * 0.86)),
      upper: Math.round(value * 1.14),
    };
  });
}

export const DEPLOYMENT_FRONTIER = Array.from({ length: 11 }, (_, i) => {
  const officers = i * 8;
  const reduction = Math.round(62 * (1 - Math.exp(-officers / 28)));
  return { officers, reduction };
});

export const STATION_BURDEN = [
  { station: "Silk Board PS", workload: 92, stress: 88, deficit: 6 },
  { station: "KR Market PS", workload: 86, stress: 81, deficit: 5 },
  { station: "Marathahalli PS", workload: 71, stress: 64, deficit: 3 },
  { station: "Hebbal PS", workload: 68, stress: 60, deficit: 3 },
  { station: "Whitefield PS", workload: 59, stress: 52, deficit: 2 },
  { station: "Jayanagar PS", workload: 44, stress: 38, deficit: 1 },
];

export const sevWeight: Record<Severity, number> = {
  critical: 4,
  high: 3,
  elevated: 2,
  nominal: 1,
};
