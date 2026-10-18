// Story framing for each debrief, and lessons drawn across all of them.
// Headlines and takeaways are written for NilObs from the de-identified debriefs.
import { DEBRIEFS, fmtDate, placeLabel, type Debrief } from "@/data"
import { EXTRAS, REPORT_DEBRIEFS } from "@/fleet"

export interface StoryMeta {
  headline: string
  dek: string
  takeaways: string[]
  featured?: boolean // free to read in full on the landing page
}

export const STORY: Record<number, StoryMeta> = {
  1: {
    headline: "Thirteen crew questioned, from master to messman",
    dek: "Ampol's inspector spoke to nearly every rank and compared their answers. What the 3/O said about the lifeboat drill was checked with the AB.",
    takeaways: [
      "Brief every rating on stop work and how to reach the DPA.",
      "Have permits for the small jobs too: gangway rigging, work aloft for SIRE photos, bunker sample disposal.",
      "Expect the same question to different ranks. Answers should match.",
    ],
  },
  2: {
    headline: "A clean bridge and a positive observation",
    dek: "The master demonstrated route activation and validation. Fifteen bridge topics later: no negatives, one positive.",
    takeaways: ["Know why your GPS HDOP alarm is set where it is, and where the company says so.", "Put the piracy countermeasures in the passage plan risk assessment."],
  },
  3: {
    headline: "The inspector who barely looked at his tablet",
    dek: "A conversational walk round a Singapore bridge, ending with cargo questions for the third officer in the CCR. No remarks on the bridge.",
    takeaways: ["Bridge PCs get checked for browsing. Know the distraction policy.", "Know your CATZOC D and U procedure.", "Be ready to show 24 hours of echo sounder memory."],
  },
  4: {
    headline: "Every question, with the written reference",
    dek: "A Maxcom inspector went through the whole tablet and wanted the SMS section, code or circular behind each answer.",
    takeaways: ["For every answer, know where it's written.", "Gas meters: know why CO2 is fitted, sensor poisoning, and bump test vs full calibration."],
  },
  5: {
    headline: "ECDIS from first principles",
    dek: "SCAMIN, CATZOC, date-dependent objects, and a propulsion failure drill that had to be a real drill, not table talk.",
    takeaways: ["Drill records must show a real drill.", "Test all three BNWAS stages on DC power, as the maker says."],
  },
  6: {
    headline: "A second officer interview with no remarks",
    dek: "Equinor's inspector covered radar, ECDIS markings and even the cargo's hazards, all from the bridge.",
    takeaways: ["Use sea-stabilised speed (STW) for collision avoidance, and know why.", "Navigating officers get cargo questions too: toxicity, precautions alongside."],
  },
  7: {
    headline: "No negotiations: a whole-ship ENOC inspection",
    dek: "Fifty-two questions across the master's cabin, bridge, boats, CCR and engine room. The oiler and the wiper were questioned too.",
    takeaways: [
      "Every rating should know the escape routes and where the emergency fire pump starts.",
      "The deck was compared with the uploaded vessel photos.",
      "Logs are cross-checked: UMS alarms against the alarm system and rest hours.",
    ],
  },
  8: {
    headline: "Chapter and verse on a gas carrier",
    dek: "A CDI inspector wanted the exact regulation behind steering gear timings, and found the near-miss procedure thin.",
    takeaways: [
      "Know which regulation each test comes from.",
      "Check mooring line and tail MBL against the ship design MBL.",
      "Lifeboat drills: only designated crew in each boat.",
    ],
  },
  9: {
    headline: "All clear on the bridge",
    dek: "Twenty bridge topics, from GPS datum to piracy planning. No observations.",
    takeaways: ["Practise the failures: gyro, GPS, radar and ECDIS.", "Know how to cancel a false distress alert."],
  },
  10: {
    headline: "Six positive remarks from Shell",
    dek: "Nine hours on a gas carrier: three in the master's cabin, three on deck, then the CCR and bridge. No negatives.",
    takeaways: [
      "Master's cabin time tests whether you understand the procedures, not whether you have them.",
      "Know your vessel software's limitations.",
      "Have the blackout and steering failure checklists at your fingertips.",
    ],
    featured: true,
  },
  11: {
    headline: "Two hours of tests, zero observations",
    dek: "ENOC's bridge check was all power-failure tests and records that matched the PMS.",
    takeaways: ["Run every power-failure test before arrival and record it.", "Make sure each checklist is the latest version in force."],
  },
  12: {
    headline: "A methodical bridge list",
    dek: "Fourteen checks in Colombia, from GMDSS records to VDR backup and an AIS test with another ship.",
    takeaways: ["Know how alarms are acknowledged when the engine room is on UMS.", "Keep PMS records for bridge and GMDSS equipment current."],
  },
  13: {
    headline: "Looking for company gaps, not crew mistakes",
    dek: "Feedback on an inspector who said he was there to find weaknesses in company procedures, not to penalise the crew.",
    takeaways: ["Understand your procedures; having them on board isn't enough.", "Find gaps between the SMS and practice before an inspector does."],
  },
  14: {
    headline: "Count your immersion suits",
    dek: "A CDI bridge check with one surprise: he expected a suit for everyone on the highest watch level.",
    takeaways: ["Four people at the top watch level means four suits on the bridge, for this inspector.", "Verify the abort point against the wheelhouse poster."],
  },
  15: {
    headline: "A negative over one line in the SMS",
    dek: "The SMS said every GNSS receiver feeds position. On board, GLONASS didn't. That mismatch became the observation.",
    takeaways: [
      "Read your SMS for promises your ship can't keep.",
      "You don't need to memorise the SMS, but you must know where to look.",
      "Expect about two hours each on the bridge and in the CCR.",
    ],
    featured: true,
  },
  16: {
    headline: "UKC when the master isn't on the bridge",
    dek: "A Mollendo bridge check focused on UKC sheets, EPIRB flash codes and signed standing orders.",
    takeaways: ["Know the precautions when the UKC policy can't be met.", "Standing orders signed by every OOW and the cadet."],
  },
  17: {
    headline: "The UKC answer he was waiting for",
    dek: "At a Fujairah STS anchorage, the inspector wanted one answer: risk-assess it, then inform the company.",
    takeaways: ["If you can't meet the UKC policy: risk assessment, then tell the company.", "Know why no abort point is marked, and show the last port approach."],
  },
  18: {
    headline: "Four negatives in nine hours",
    dek: "BP ran an hour-by-hour inspection of a chemical tanker. Every negative was a record the crew could have checked beforehand.",
    takeaways: [
      "Check running hours and due dates against maker limits: magnetron, OWS.",
      "PIQ photos must match the ship as she is today.",
      "Use the defect system the way the SMS says.",
    ],
    featured: true,
  },
  19: {
    headline: "Boarded at 0520, bridge last",
    dek: "With two hours of discharge left, the inspector started at the gangway, walked the ship and saved the bridge for last.",
    takeaways: ["The gangway watch should know what cargo operation is going on.", "Know when and where not to do the GMDSS battery load test."],
  },
}

export interface Story extends StoryMeta {
  d: Debrief
  place: string
  date: string
  resultLabel: string
  resultTone: "good" | "bad" | "neutral"
}

function resultOf(d: Debrief): Pick<Story, "resultLabel" | "resultTone"> {
  if (d.src === "report" && d.report) {
    const r = d.report
    const n = r.negatives.length, p = r.positives.length
    const pos = p ? `, ${p} positive${p > 1 ? "s" : ""}` : ""
    if (n) return { resultLabel: `${n} observation${n > 1 ? "s" : ""}${pos}`, resultTone: "bad" }
    if (r.result === "nil") return { resultLabel: `No observations${pos}`, resultTone: "good" }
    if (r.result === "negatives") return { resultLabel: "Observations recorded", resultTone: "bad" }
    return { resultLabel: "Result not stated", resultTone: "neutral" }
  }
  if (d.negatives?.length) return { resultLabel: `${d.negatives.length} negative${d.negatives.length > 1 ? "s" : ""}${d.positives ? `, ${d.positives} positive` : ""}`, resultTone: "bad" }
  if (d.result === "nil") return { resultLabel: d.positives ? `No negatives, ${d.positives} positive` : "No negatives", resultTone: "good" }
  if (d.id === 3 || d.id === 6) return { resultLabel: "No bridge remarks", resultTone: "good" }
  return { resultLabel: "Result not shared", resultTone: "neutral" }
}

// Channel debriefs that we also hold the full report for (same port and date)
for (const d of DEBRIEFS) if (EXTRAS[d.id]) d.report = EXTRAS[d.id]

const channelStories: Story[] = DEBRIEFS.map((d) => ({ ...STORY[d.id], d, place: placeLabel(d), date: fmtDate(d.date), ...resultOf(d) }))
const reportStories: Story[] = REPORT_DEBRIEFS.map((d) => ({
  headline: d.report!.headline,
  dek: d.report!.dek,
  takeaways: d.report!.takeaways,
  d,
  place: placeLabel(d),
  date: fmtDate(d.date),
  ...resultOf(d),
}))
export const CHANNEL_STORIES = channelStories.sort((a, b) => b.d.date.localeCompare(a.d.date))
export const REPORT_STORIES = reportStories.sort((a, b) => b.d.date.localeCompare(a.d.date))
export const STORIES: Story[] = [...channelStories, ...reportStories].sort((a, b) => b.d.date.localeCompare(a.d.date))

export const storyById = (id: number) => STORIES.find((s) => s.d.id === id)!

// Group a debrief's questions by who was asked
export function groupByWho(d: Debrief) {
  const order = ["Master", "C/O", "2/O", "3/O", "C/E", "2/E", "3/E", "4/E", "Pumpman", "Bosun", "AB", "OS", "Oiler", "Wiper", "Cook", "Gas engineer"]
  const groups = new Map<string, string[]>()
  for (const q of d.questions) {
    const k = q.who || d.rank || "Bridge & rounds"
    groups.set(k, [...(groups.get(k) || []), q.q])
  }
  return [...groups.entries()].sort((a, b) => {
    const ia = order.indexOf(a[0]), ib = order.indexOf(b[0])
    return (ia < 0 ? -1 : ia) - (ib < 0 ? -1 : ib)
  })
}

export interface Lesson {
  title: string
  body: string
  sources: number[]
  tag: string
}

const radarCount = DEBRIEFS.filter((d) => d.questions.some((q) => q.topic === "Radar") || d.negTopics?.includes("Radar")).length

export const LESSONS: Lesson[] = [
  {
    tag: "Documents & SMS",
    title: "Know where it's written",
    body: "Inspectors asked for the SMS section, code or regulation behind answers. One gave the crew time to look things up: you don't need to memorise the SMS, but you need to know where to find it.",
    sources: [4, 8, 15, 17],
  },
  {
    tag: "Documents & SMS",
    title: "Your SMS has to match your ship",
    body: "The Port Arthur negative came from one SMS line the ship didn't follow. Another inspector told the crew he was there to find company gaps, not crew mistakes.",
    sources: [15, 13],
  },
  {
    tag: "Records",
    title: "Records get compared with each other",
    body: "Rest hours against the bell book and deck log. UMS alarms against the alarm system. Checklist times against log entries. Test dates against the PMS and the maker's interval.",
    sources: [4, 7, 11, 17],
  },
  {
    tag: "Equipment",
    title: "Be ready to demonstrate, not describe",
    body: "Crews were asked to start the emergency generator (including the manual or spring start), run lifeboat engines, pull a nav light fuse, run power-failure tests and change over gyros and GPS.",
    sources: [1, 7, 10, 11, 18, 19],
  },
  {
    tag: "Crew",
    title: "Every rank gets asked",
    body: "Ratings were asked about stop work, the DPA, escape routes and where to start the emergency fire pump. At Manzanillo the very first question went to the gangway AB.",
    sources: [1, 7, 19],
  },
  {
    tag: "Radar",
    title: "Radar comes up almost every time",
    body: `Radar questions appear in ${radarCount} of ${DEBRIEFS.length} debriefs: X vs S band, sea-stabilised speed, which radar in rain, performance checks. Magnetron hours over the maker's limit was a negative at Toamasina.`,
    sources: [6, 15, 18, 19],
  },
  {
    tag: "UKC",
    title: "Know what to do when you can't meet the UKC policy",
    body: "The answer one inspector waited for: carry out a risk assessment, then inform the company. Others asked why the echo sounder alarm is set where it is, and why UKC at the berth is a share of the ship's breadth.",
    sources: [17, 16, 15, 19],
  },
  {
    tag: "PIQ",
    title: "Keep PIQ photos honest",
    body: "A winch photo that didn't match the ship was a negative. Another inspector compared the deck with the uploaded photos, and a master was asked why the photos weren't date-stamped.",
    sources: [18, 7, 1],
  },
  {
    tag: "Results",
    title: "Clean results happen",
    body: "Four inspections reported no negative observations and two more had no remarks on the bridge. Shell gave one gas carrier six positive remarks.",
    sources: [10, 11, 9, 2],
  },
  {
    tag: "The day",
    title: "Plan for a long day",
    body: "Toamasina ran from 0600 to 1500. Shell spent three hours in the master's cabin alone. Know who is needed where, and when.",
    sources: [18, 10, 15],
  },
]
