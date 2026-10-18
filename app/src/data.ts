// Debriefs transcribed (and de-identified) from posts in the "SIRE 2.0" WhatsApp channel, Apr–Oct 2026.
// Ship, crew and inspector names are removed. Questions are paraphrased.

export type Topic =
  | "ECDIS"
  | "Radar"
  | "UKC"
  | "Passage planning"
  | "GMDSS"
  | "Alarm & power-fail tests"
  | "Equipment tests vs PMS"
  | "Documents & SMS"
  | "Rest hours & drills"
  | "Defect reporting"
  | "Watchkeeping"
  | "Steering"
  | "LSA & FFA"
  | "Engine room"
  | "Cargo"
  | "PIQ accuracy"
  | "Permits & RA"
  | "Emergency equipment"
  | "Gas testing & enclosed space"
  | "PPE & personal safety"
  | "Mooring & access"
  | "Pollution prevention"
  | "Security & cyber"
  | "Training & certificates"
  | "Hull & condition"

export type Area = "Bridge" | "Master's cabin" | "Crew interview" | "Engine room" | "Cargo & deck"

export interface Question {
  q: string
  topic: Topic
  who?: string // rank asked, when the post says
}

export interface Debrief {
  id: number
  port: string
  country: string
  coords?: [number, number]
  date: string // ISO
  major?: string
  rank?: string
  areas: Area[]
  questions: Question[]
  negatives?: string[]
  positives?: number
  note?: string
  full?: boolean // read in full (not just the preview)
  shipType?: string
  result?: "nil" | "negatives"
  negTopics?: Topic[]
  style?: string
  timeSplit?: [string, number][]
  timeline?: [string, string][]
  src?: "channel" | "report"
  report?: import("@/fleet").ReportStory // full inspection report or attending superintendent's notes
}

export const DEBRIEFS: Debrief[] = [
  {
    id: 1, port: "Marsden Point", country: "New Zealand", coords: [-35.84, 174.49], date: "2026-04-14", major: "Ampol",
    areas: ["Crew interview", "Bridge", "Master's cabin", "Cargo & deck", "Engine room"],
    full: true,
    questions: [
      { q: "How many months have you done on board, and in total as third officer?", topic: "Watchkeeping", who: "3/O" },
      { q: "Who is the DPA, and when can you contact them?", topic: "Documents & SMS", who: "3/O" },
      { q: "Do you help the master file crew documents? Are all licences valid?", topic: "Documents & SMS", who: "3/O" },
      { q: "Apart from navigation, what are your duties?", topic: "Watchkeeping", who: "3/O" },
      { q: "Who enters your work and rest hours?", topic: "Rest hours & drills", who: "3/O" },
      { q: "When was the last safety familiarisation for contractors, technicians and supernumeraries? Show me.", topic: "Rest hours & drills", who: "3/O" },
      { q: "When was the lifeboat last lowered? Show photos, video and the report. Who was in which boat, and how far did it manoeuvre?", topic: "LSA & FFA", who: "3/O" },
      { q: "Who recharges the SCBA and lifeboat air bottles, and when was it last done?", topic: "LSA & FFA", who: "3/O" },
      { q: "Have you been trained on this ship's breathing-air compressor? Show the risk assessment and permit, with names.", topic: "Permits & RA", who: "3/O" },
      { q: "What are the SCBA bottle pressures and volumes, and the compressor cut-off settings? Where is that in the SMS?", topic: "LSA & FFA", who: "3/O" },
      { q: "Show the certificate and markings of the hose used to charge the lifeboat air bottles", topic: "LSA & FFA", who: "3/O" },
      { q: "Do you do rounds before taking over the cargo watch? How early do you come? Do you carry the ship-shore safety checklist?", topic: "Cargo", who: "3/O" },
      { q: "Condition of lifebuoys, MOB markers and pyrotechnics: anything expired?", topic: "LSA & FFA", who: "3/O" },
      { q: "Condition of lifejackets, and is everything in the lifeboat in order, including rations?", topic: "LSA & FFA", who: "3/O" },
      { q: "Can you start the emergency generator and put it on load?", topic: "Emergency equipment", who: "3/O" },
      { q: "Calibrate the gas meter. Do you use a bag? Show the span gas bottle.", topic: "Gas testing & enclosed space", who: "3/O" },
      { q: "Where can the emergency fire pump be started from?", topic: "Emergency equipment", who: "3/O" },
      { q: "What are the escape routes from the engine room bottom platform?", topic: "Emergency equipment", who: "3/O" },
      { q: "What do you do if a UMS alarm sounds while you're on watch?", topic: "Engine room", who: "3/O" },
      { q: "Which lifeboat were you in? How far did it manoeuvre? Was the painter attached? (cross-checked with the officers)", topic: "LSA & FFA", who: "AB" },
      { q: "Who is the DPA, and why is the number posted everywhere?", topic: "Documents & SMS", who: "AB" },
      { q: "What is stop work, and when would you use it?", topic: "Documents & SMS", who: "AB" },
      { q: "What do you use to secure yourself when rigging the gangway?", topic: "PPE & personal safety", who: "AB" },
      { q: "Show the passage plan: amendments, deviations and the whole bridge team's signatures", topic: "Passage planning", who: "2/O" },
      { q: "What's the contingency if both ECDIS fail? Show the ECDIS failure drill record.", topic: "ECDIS", who: "2/O" },
      { q: "Show evidence that the extra lookout was posted and the bridge watch level change was logged", topic: "Watchkeeping", who: "2/O" },
      { q: "Show evidence of the master handing the con to the pilot, and back", topic: "Watchkeeping", who: "2/O" },
      { q: "What is the echo sounder alarm set to, and why? (inspector referred to the Bridge Procedures Guide)", topic: "UKC", who: "2/O" },
      { q: "Does the passage plan show where safety settings change, and is it logged and set on the ECDIS?", topic: "ECDIS", who: "2/O" },
      { q: "Show the weekly navigation equipment tests and the weekly and monthly GMDSS tests", topic: "GMDSS", who: "2/O" },
      { q: "Give four reasons AIS can't be used for collision avoidance", topic: "Radar", who: "2/O" },
      { q: "How are the navigation lights and their failure alarm tested?", topic: "Alarm & power-fail tests", who: "2/O" },
      { q: "Show the permits for rigging the gangway and for working aloft to take the SIRE photos", topic: "Permits & RA", who: "C/O" },
      { q: "Show proof of the safety officer's rounds", topic: "Documents & SMS", who: "C/O" },
      { q: "Test the cargo tank pressure alarm. How many alarm levels are set, and why?", topic: "Cargo", who: "C/O" },
      { q: "Start the emergency generator in manual mode", topic: "Emergency equipment", who: "C/O" },
      { q: "Injured-person davit: maintenance records, last test and inspection", topic: "LSA & FFA", who: "C/O" },
      { q: "When was the emergency cargo pump tripod last tested? Show photos and the permit.", topic: "Cargo", who: "C/O" },
      { q: "Are winter jackets and rain coats marked anti-static? Why aren't inflatable work vests provided?", topic: "PPE & personal safety", who: "C/O" },
      { q: "Show inventory and inspection records for working lifejackets", topic: "PPE & personal safety", who: "C/O" },
      { q: "Why aren't the intrinsically safe camera photos date-stamped? When were the photos for this SIRE taken?", topic: "PIQ accuracy", who: "Master" },
      { q: "Company guidance on not walking under manifold hoses, and on marking escape routes to the gangway", topic: "Cargo", who: "Master" },
      { q: "Do you have stop work cards?", topic: "Documents & SMS", who: "Master" },
      { q: "Show the risk assessment and permit for a small craft alongside during cargo operations", topic: "Permits & RA", who: "Master" },
      { q: "Lifeboat lowering photos for the past year, with drill reports showing it manoeuvred; last evacuation drill", topic: "LSA & FFA", who: "Master" },
      { q: "Minimum UKC for this passage is 4.8 m. Why is the depth alarm set where it is, and how does that follow the UKC policy?", topic: "UKC", who: "Master" },
      { q: "Why shouldn't AIS be used for navigation or collision avoidance? (cross-checked with the 2/O)", topic: "Radar", who: "Master" },
      { q: "Has the company shared past SIRE observations with the fleet? What are its navigation audit and superintendent visit requirements?", topic: "Documents & SMS", who: "Master" },
      { q: "Last dispensation and its close-out; any class or navigation equipment defects", topic: "Defect reporting", who: "Master" },
      { q: "Company guidance on isolating manifold drains", topic: "Cargo", who: "Master" },
      { q: "Last PSC inspection and its deficiencies; last unannounced alcohol test by the office", topic: "Documents & SMS", who: "Master" },
      { q: "Non-routine work orders and defects in the PMS, with close-out evidence", topic: "Defect reporting", who: "C/E" },
      { q: "Why is the purifier room floor slippery after the new paint?", topic: "Engine room", who: "C/E" },
      { q: "Test emergency steering with all alarms", topic: "Steering", who: "C/E" },
      { q: "Test the main engine and generator fuel leak alarms, bilge alarm, quick-closing valves and funnel flaps", topic: "Alarm & power-fail tests", who: "C/E" },
      { q: "Main engine failure: what is the recovery procedure?", topic: "Engine room", who: "C/E" },
      { q: "Confirm the oily water separator 15 ppm alarm works", topic: "Engine room", who: "C/E" },
      { q: "Safety helmets: check manufacture dates against the maker's limit", topic: "PPE & personal safety", who: "C/E" },
      { q: "Is there insulation matting in front of the local switchboards?", topic: "Engine room", who: "2/E" },
      { q: "What is the UMS alarm attending procedure?", topic: "Engine room", who: "3/E" },
      { q: "Show the permit and risk assessment for small jobs, like disposing of old bunker samples", topic: "Permits & RA", who: "4/E" },
      { q: "What safety equipment is in the galley, and how is the galley fire-fighting system released?", topic: "Emergency equipment", who: "Cook" },
    ],
  },
  {
    id: 2, port: "Port not stated", country: "", date: "2026-04-23",
    areas: ["Bridge"],
    positives: 1,
    full: true,
    note: "No negative observations and one positive for the bridge.",
    questions: [
      { q: "Activate and validate the route on the ECDIS (the master was asked to demonstrate)", topic: "ECDIS" },
      { q: "What's the difference between X-band and S-band radar?", topic: "Radar" },
      { q: "Demonstrate a trial manoeuvre", topic: "Radar" },
      { q: "What is your GPS HDOP alarm set to, and why? What is the company procedure?", topic: "Equipment tests vs PMS" },
      { q: "How do you use and apply ECDIS date-dependent features?", topic: "ECDIS" },
      { q: "Compare the echo sounder reading with a manual sounding", topic: "Equipment tests vs PMS" },
      { q: "How do you verify the Doppler log?", topic: "Equipment tests vs PMS" },
      { q: "What is the EPIRB test procedure?", topic: "GMDSS" },
      { q: "Passage plan risk assessment, including the piracy countermeasures in it", topic: "Passage planning" },
      { q: "How are paper charts and publications managed?", topic: "Passage planning" },
      { q: "Check the VDR beacon battery", topic: "Equipment tests vs PMS" },
      { q: "UKC policy and the UKC sheet for the next arrival port", topic: "UKC" },
      { q: "User charts for arrival; minimum clearance from dangers while navigating", topic: "ECDIS" },
    ],
  },
  {
    id: 3, port: "Singapore", country: "Singapore", coords: [1.26, 103.84], date: "2026-06-02",
    areas: ["Bridge", "Crew interview"],
    full: true,
    note: "Inspector rarely read from the tablet. No remarks on the bridge; the 3/O was questioned on cargo in the CCR.",
    questions: [
      { q: "Show the Sat C set-up and the area selected", topic: "GMDSS" },
      { q: "Whose duty is it to carry the fireman's radio? Check radio covers for all three.", topic: "LSA & FFA" },
      { q: "Test the nav lights failure alarm and check all signal lights", topic: "Alarm & power-fail tests" },
      { q: "BNWAS: markings and battery renewal date", topic: "Equipment tests vs PMS" },
      { q: "Is any delay set on the fire panel?", topic: "Alarm & power-fail tests" },
      { q: "Show the echo sounder depth alarm and the last 24 hours of soundings", topic: "UKC" },
      { q: "Has anyone browsed random sites on the bridge PC? What is the company distraction policy?", topic: "Watchkeeping" },
      { q: "Waypoint sheet for extra lookouts during security measures, matched to the bell book", topic: "Passage planning" },
      { q: "If CATZOC is D or U, what do you do?", topic: "ECDIS" },
      { q: "Risk assessment for a port where the UKC policy couldn't be met", topic: "UKC" },
      { q: "Show records of using the hand lead line", topic: "UKC" },
      { q: "NUC day and night signals; restricted visibility sound signals", topic: "Watchkeeping" },
      { q: "How is the SART fitted in the lifeboat, and what is the line for?", topic: "LSA & FFA" },
      { q: "Why use STW on radar? What is aspect? Which radar do you use in rain?", topic: "Radar" },
      { q: "Course recorder: heading checked and signed?", topic: "Equipment tests vs PMS" },
      { q: "Navtex self-test and navigation warning management", topic: "GMDSS" },
      { q: "ECDIS: parallel index lines, contingency anchorages and speeds at waypoints", topic: "ECDIS" },
      { q: "Switch from GPS 1 to GPS 2", topic: "Equipment tests vs PMS" },
      { q: "Steering hydraulic lock alarm: what does it mean and what do you do?", topic: "Steering" },
      { q: "Compare both gyros; when was the magnetron changed?", topic: "Equipment tests vs PMS" },
      { q: "Minimum steerage speed on the wheelhouse poster; turning circle and astern power on the pilot card", topic: "Passage planning" },
      { q: "How are the digital publications updated on both PCs?", topic: "Passage planning" },
      { q: "Questions on cargo in the cargo control room", topic: "Cargo", who: "3/O" },
    ],
  },
  {
    id: 4, port: "Port not stated", country: "", date: "2026-06-30", major: "Maxcom",
    areas: ["Master's cabin", "Bridge", "Cargo & deck"],
    full: true,
    note: "Goes deep on every question and wants the written reference: SMS, code or circular. Asked every question on the tablet.",
    questions: [
      { q: "Certificates", topic: "Documents & SMS" },
      { q: "Walk me through the company defect reporting system", topic: "Defect reporting" },
      { q: "How do you apply management of change?", topic: "Documents & SMS" },
      { q: "Rest hours against the bell book; familiarisation checklists and drill records", topic: "Rest hours & drills" },
      { q: "Radar, speed log and BNWAS testing: equipment requirement compared with the SMS", topic: "Equipment tests vs PMS" },
      { q: "Passage plan, pilot card and bridge distraction policy", topic: "Passage planning" },
      { q: "Cargo leak into the double hull: procedure and ship-specific equipment", topic: "Cargo" },
      { q: "Gas meter: why CO2 on a tanker, how it works, sensor poisoning, bump test vs full calibration", topic: "Gas testing & enclosed space" },
      { q: "Toolbox meeting records", topic: "Permits & RA" },
      { q: "ODME records: sensor failure actions, and do dates and times match?", topic: "Cargo" },
      { q: "Nitrogen and inert gas requirements", topic: "Cargo" },
      { q: "High-level and overfill alarms; P/V sensor alarm settings", topic: "Cargo" },
      { q: "Are all vent flaps closed? Line pressure testing", topic: "Cargo" },
      { q: "Forecastle bilge piping diagram and valve marking", topic: "Cargo" },
      { q: "Forward liferaft light; lifeboat and rescue boat engine tests", topic: "LSA & FFA" },
      { q: "Test the bilge alarm", topic: "Alarm & power-fail tests" },
      { q: "Can a deck officer start the emergency generator and put it on load?", topic: "Emergency equipment" },
      { q: "Cargo control room files and records", topic: "Cargo" },
      { q: "Enclosed space entry procedure with the new gas meter", topic: "Gas testing & enclosed space", who: "Pumpman" },
    ],
  },
  {
    id: 5, port: "Tema", country: "Ghana", coords: [5.63, -0.01], date: "2026-07-01",
    areas: ["Bridge"],
    full: true,
    questions: [
      { q: "What ECDIS type is this, and how do you set it up?", topic: "ECDIS" },
      { q: "What is SCAMIN?", topic: "ECDIS" },
      { q: "What is CATZOC, and what's the company procedure for CATZOC D and U?", topic: "ECDIS" },
      { q: "What are date-dependent objects, what do they change, and which objects can be date-dependent?", topic: "ECDIS" },
      { q: "Bridge watch composition and engine room watch levels", topic: "Watchkeeping" },
      { q: "In UMS, is every alarm recorded with the attending engineer's name?", topic: "Engine room" },
      { q: "What is the pilot's role on the bridge? Where can the pilot take the con?", topic: "Watchkeeping" },
      { q: "Is the distraction policy in the standing orders? What do you do if the duty AB uses a mobile on the bridge?", topic: "Watchkeeping" },
      { q: "How do you test the steering gear? Show the records.", topic: "Steering" },
      { q: "BNWAS: do you test all three alarm stages on DC power? Show the company procedure and maker's manual.", topic: "Alarm & power-fail tests" },
      { q: "EPIRB test records; when is the extended GPS test done?", topic: "GMDSS" },
      { q: "Company procedure for testing sound signals, in the PMS, including the automatic sound signal", topic: "Equipment tests vs PMS" },
      { q: "Radar trial manoeuvre: company procedure for testing it", topic: "Radar" },
      { q: "When do you change the magnetron? How often do you check radar performance, even in congested waters?", topic: "Radar" },
      { q: "X-band vs S-band: what makes S-band better in bad weather?", topic: "Radar" },
      { q: "Aldis lamp spare bulbs and battery", topic: "Equipment tests vs PMS" },
      { q: "UKC calculation sheet (advised to fill in the expected list and heel)", topic: "UKC" },
      { q: "ECDIS contour settings; show the SCAMIN and CATZOC features", topic: "ECDIS" },
      { q: "Last propulsion failure drill: a real drill, not table talk? What do you do in congested waters?", topic: "Rest hours & drills" },
      { q: "NUC lights and day signal; GNSS vs GPS", topic: "Watchkeeping" },
      { q: "Compass error log, including the satellite compass", topic: "Equipment tests vs PMS" },
      { q: "Weekly fire alarm checks: are they done on DC power?", topic: "Alarm & power-fail tests" },
    ],
  },
  {
    id: 6, port: "Cartagena", country: "Spain", coords: [37.6, -0.98], date: "2026-07-05", major: "Equinor", rank: "2/O",
    areas: ["Crew interview", "Bridge"],
    full: true,
    note: "Second officer interview. No remarks on the bridge.",
    questions: [
      { q: "Radar running hours against the maker's requirement", topic: "Radar" },
      { q: "What's the difference between X-band and S-band radar?", topic: "Radar" },
      { q: "Which radar will you rely on when leaving port?", topic: "Radar" },
      { q: "Which speed do you monitor on the radar in a collision-avoidance situation, and why?", topic: "Radar" },
      { q: "Remote steering system failure: what does the OOW do?", topic: "Steering" },
      { q: "Speed log operation and tests; echo sounder accuracy check; GPS test in the PMS", topic: "Equipment tests vs PMS" },
      { q: "Aldis lamp checks and spares", topic: "Equipment tests vs PMS" },
      { q: "Can AIS be used for collision avoidance?", topic: "Radar" },
      { q: "UMS procedure as OOW", topic: "Engine room" },
      { q: "CPA and BCR settings in the master's standing orders; master's night orders", topic: "Watchkeeping" },
      { q: "Passage plan: master's approval", topic: "Passage planning" },
      { q: "Bridge watch level poster; UKC proforma", topic: "UKC" },
      { q: "ECDIS safety settings; SCAMIN on or off; ENC update log; sensors; backup procedure", topic: "ECDIS" },
      { q: "ECDIS markings: echo sounder on, abort points, contingency anchorage, parallel index, position-fixing interval, call the master, engine notice, VTS contacts", topic: "ECDIS" },
      { q: "When do you use two-way radios? Where is the SSAS? What is LRIT?", topic: "GMDSS" },
      { q: "MF/HF weekly test and GMDSS monthly checks; AIS mode; navigation warnings", topic: "GMDSS" },
      { q: "Bridge pyrotechnics inventory and expiry", topic: "LSA & FFA" },
      { q: "Cargo on board: toxicity, health and environmental effects, and precautions alongside (scuppers, SOPEP, LSA/FFA, PPE, closed operations)", topic: "Cargo" },
    ],
  },
  {
    id: 7, port: "Pozos Colorados", country: "Colombia", coords: [11.15, -74.23], date: "2026-06-26", major: "ENOC", shipType: "Oil tanker",
    areas: ["Master's cabin", "Bridge", "Cargo & deck", "Engine room", "Crew interview"],
    full: true,
    style: "Strict and thorough. The crew summed it up as “no negotiations”.",
    questions: [
      { q: "Trading and equipment certificates, checked against the questionnaire", topic: "Documents & SMS", who: "Master" },
      { q: "Rest hours file alongside the drill reports", topic: "Rest hours & drills", who: "Master" },
      { q: "Defect list and how defects are reported", topic: "Defect reporting", who: "Master" },
      { q: "Audit findings: how they were reported and closed", topic: "Documents & SMS", who: "Master" },
      { q: "Officer handover reports", topic: "Watchkeeping", who: "Master" },
      { q: "Senior officers' cargo and ballast handling courses, including the IMO/STCW code on each certificate", topic: "Cargo", who: "Master" },
      { q: "Is the DPA poster up on the bridge?", topic: "Documents & SMS" },
      { q: "ECDIS layers, safety settings and how they were calculated", topic: "ECDIS", who: "2/O" },
      { q: "UKC calculations for the whole voyage", topic: "UKC", who: "2/O" },
      { q: "Parallel index lines on the river approach legs", topic: "ECDIS", who: "2/O" },
      { q: "Bridge and engine watch levels in the passage plan, cross-checked on the ECDIS", topic: "Passage planning", who: "2/O" },
      { q: "Anchor-to-berth amendment plan with its safety settings; post-voyage signature on the last plan", topic: "Passage planning", who: "2/O" },
      { q: "Engine room alarm during UMS: what do you do as duty officer?", topic: "Engine room", who: "2/O" },
      { q: "Week of the last ENC update, and the weekly update procedure", topic: "ECDIS", who: "2/O" },
      { q: "Pre-arrival and departure checklists matched with the bell book: con handover, watch level, lookout and helmsman named", topic: "Watchkeeping", who: "2/O" },
      { q: "How do you include the pilot in the bridge team? Show the pilot card and information exchange.", topic: "Watchkeeping", who: "2/O" },
      { q: "Company requirement for changing the magnetron; S-band vs X-band", topic: "Radar", who: "2/O" },
      { q: "Last SART check in the GMDSS log; seals on the spare batteries of all three portable radios", topic: "GMDSS", who: "2/O" },
      { q: "BNWAS monthly checks: what is the third-stage alarm?", topic: "Alarm & power-fail tests", who: "2/O" },
      { q: "Aldis lamp, with all three spare bulbs checked one by one", topic: "Equipment tests vs PMS" },
      { q: "VDR: last test, storage capacity and the float-free capsule", topic: "Equipment tests vs PMS" },
      { q: "Steering gear changeover and its poster; emergency towing booklet", topic: "Steering" },
      { q: "Magnetic compass bubbles and emergency light; MOB lifebuoys and lines on both wings", topic: "LSA & FFA" },
      { q: "Pyrotechnics, bridge immersion suits and hydrostatic release expiry dates", topic: "LSA & FFA" },
      { q: "Monthly sign-offs on extinguisher cards; fire boxes and emergency lighting in the accommodation", topic: "LSA & FFA" },
      { q: "Demonstrate and explain lifeboat lowering, then run the engine ahead and astern", topic: "LSA & FFA", who: "3/O" },
      { q: "Lifeboat steering, air cylinder pressure, pyrotechnic expiry, food and water", topic: "LSA & FFA", who: "3/O" },
      { q: "Explain how to start the emergency generator and put it on load", topic: "Emergency equipment", who: "3/O" },
      { q: "Start the emergency generator by the spring (manual) method; check the fuel tank quick-closing valve", topic: "Emergency equipment", who: "2/E" },
      { q: "Close the engine room dampers and check the flaps; launch the rescue boat", topic: "Engine room", who: "2/E" },
      { q: "Demonstrate the chipping, grinding and buffing machines with their guards", topic: "PPE & personal safety", who: "Pumpman" },
      { q: "Cargo pump stack area and gauges; deck condition compared with the uploaded vessel photos", topic: "PIQ accuracy" },
      { q: "P/V breaker condition; high-level and overfill alarms tested on two tanks", topic: "Cargo" },
      { q: "Demonstrate the mooring winch brake test kit", topic: "Mooring & access", who: "C/O" },
      { q: "Is there a personnel transfer basket, and does the SMS cover ship-to-ship personnel transfers?", topic: "Mooring & access" },
      { q: "Risk assessment, cargo sampling, and ullaging when the inert gas system is down", topic: "Cargo", who: "Pumpman" },
      { q: "Enclosed space entry and how often the atmosphere is monitored under company policy", topic: "Gas testing & enclosed space", who: "AB" },
      { q: "Emergency escape routes, especially from the engine room", topic: "Emergency equipment", who: "OS" },
      { q: "Ship-shore safety checklist and the frequency of repetitive checks", topic: "Cargo", who: "C/O" },
      { q: "Inert gas failure procedure and the oxygen limits in company policy", topic: "Cargo", who: "C/O" },
      { q: "Loading procedure for non-inerted tanks (the officer was given time to find it in the manuals)", topic: "Cargo", who: "C/O" },
      { q: "Portable gas meters and the new CO2 requirement; not yet compliant, so CO2 tubes and the company minimum set were checked", topic: "Gas testing & enclosed space", who: "C/O" },
      { q: "Enclosed space permit file; rest hours against the deck log; last safety officer checklist", topic: "Permits & RA", who: "C/O" },
      { q: "High-level alarm test records, inert gas monitoring in port, and the ship-shore checklists of the last three ports", topic: "Cargo", who: "C/O" },
      { q: "Discharge plans of the last three ports. Where is the loading master's signature?", topic: "Cargo", who: "C/O" },
      { q: "ODME records; how security is kept in port (stores sealed and locked, with records)", topic: "Cargo", who: "C/O" },
      { q: "Rest hours and engine room manning procedure; last UMS alarm in the log, cross-checked with the alarm system and rest hours", topic: "Engine room", who: "3/E" },
      { q: "Where is your emergency escape, and which route do you take?", topic: "Emergency equipment", who: "Oiler" },
      { q: "Where can the emergency fire pump be started, and where are the portable extinguishers in the engine room?", topic: "Emergency equipment", who: "Wiper" },
      { q: "Emergency air compressor maintenance; ozone-depleting substance records; inert gas generator maintenance", topic: "Engine room", who: "C/E" },
      { q: "Run the OWS in recirculation; test main engine leak alarms, oil mist detector, bilge and leak-off alarms", topic: "Alarm & power-fail tests", who: "C/E" },
      { q: "Emergency steering on both motors with all alarms; emergency fire pump in local mode with line pressure", topic: "Steering", who: "C/E" },
    ],
  },
  {
    id: 8, port: "Houston", country: "USA", coords: [29.73, -95.02], date: "2026-07-22", major: "CDI", shipType: "Gas carrier",
    areas: ["Bridge", "Cargo & deck", "Crew interview"],
    full: true,
    style: "Wanted the exact chapter and regulation behind every answer.",
    questions: [
      { q: "When was the heavy-weather checklist last used? Show the log entries, and log it when you stop using it too.", topic: "Watchkeeping" },
      { q: "Steering gear hard-over times with one and two motors: which chapter and regulation?", topic: "Steering" },
      { q: "VDR check; course recorder marking guidance, and is it set to UTC or local time?", topic: "Equipment tests vs PMS" },
      { q: "Radiation hazard markings on the satcom antennas on the monkey island", topic: "Equipment tests vs PMS" },
      { q: "Are the security charts the latest editions?", topic: "Passage planning" },
      { q: "Pilot card checked against the wheelhouse poster. How do a semi-balanced rudder and right-hand fixed-pitch propeller behave ahead and astern? What is critical RPM and what does it do to the hull?", topic: "Passage planning" },
      { q: "Is the safety contour the same on the ECDIS and the waypoint sheet?", topic: "ECDIS" },
      { q: "Show an ENC number. What do the usage band and country code tell you?", topic: "ECDIS" },
      { q: "Radar performance monitor: show the maker's procedure for the attenuation figure posted by the radar", topic: "Radar" },
      { q: "GMDSS handheld radios: how and how often are they tested, and why are they on charge when already full?", topic: "GMDSS" },
      { q: "Active alarms and time set-up on the cargo computer; MSDS for the present cargo", topic: "Cargo", who: "C/O" },
      { q: "Lifeboat davit breather valve; run the rescue boat engine and turn the rudder port and starboard", topic: "LSA & FFA", who: "C/O" },
      { q: "Compressor and motor room bulkhead seals; paint locker", topic: "Cargo", who: "C/O" },
      { q: "Closed-loop sampling at the tank dome; present loading temperature against the reference temperature", topic: "Cargo", who: "C/O" },
      { q: "Ship-shore emergency shutdown link: how do you stop cargo in an emergency?", topic: "Cargo", who: "C/O" },
      { q: "Mooring winch brake band clearance and drum direction markings", topic: "Mooring & access", who: "C/O" },
      { q: "Gangway arrangement; how to rig the pilot ladder from its reel correctly", topic: "Mooring & access", who: "C/O" },
      { q: "MBL of mooring ropes and tails; certificates compared with the ship design MBL", topic: "Mooring & access", who: "C/O" },
      { q: "Loading computer: software or booklet, and how often is it tested?", topic: "Cargo", who: "C/O" },
      { q: "Enclosed space permit for the last enclosed space rescue drill", topic: "Gas testing & enclosed space", who: "C/O" },
      { q: "Lifeboat drill reports: only the designated crew in each boat, not the same crew in both", topic: "LSA & FFA", who: "C/O" },
      { q: "Near-miss reporting procedure for all crew (the company had no detailed guidance on processing them)", topic: "Documents & SMS", who: "C/O" },
      { q: "How does the water mist system work?", topic: "Emergency equipment", who: "3/O" },
      { q: "What should the brake band clearance be?", topic: "Mooring & access", who: "3/O" },
      { q: "How do you know the port security level? Is it posted? At level 1, do you lock doors, and if not, how do you control access?", topic: "Documents & SMS", who: "3/O" },
    ],
  },
  {
    id: 9, port: "Port not stated", country: "Netherlands", date: "2026-07-28",
    areas: ["Bridge"],
    full: true,
    result: "nil",
    questions: [
      { q: "Magnetic compass light, its feed to the autopilot, and corrections", topic: "Equipment tests vs PMS" },
      { q: "Emergency steering procedure", topic: "Steering" },
      { q: "Radar planned maintenance and the company guideline", topic: "Radar" },
      { q: "ECDIS updates, settings, alarms and no-go areas; anchor-to-berth route verification", topic: "ECDIS" },
      { q: "Waypoint sheet and UKC calculation sheet", topic: "UKC" },
      { q: "Company AIS guideline, and why AIS isn't used for collision avoidance", topic: "Radar" },
      { q: "Lifejacket and immersion suit requirements", topic: "LSA & FFA" },
      { q: "MF/HF and Sat C distress procedure, and how to cancel a false alert", topic: "GMDSS" },
      { q: "Echo sounder alarm guideline", topic: "UKC" },
      { q: "How paper chart corrections are made and verified", topic: "Passage planning" },
      { q: "Navigation and Navtex warning management, and plotting them on the ECDIS", topic: "GMDSS" },
      { q: "Speed log test and requirement; PMS for the bridge equipment", topic: "Equipment tests vs PMS" },
      { q: "BMP for piracy and how it changes the passage plan", topic: "Passage planning" },
      { q: "Log book and bell book entries for the con and the pilot", topic: "Watchkeeping" },
      { q: "GPS datum change and test; changing over GPS", topic: "Equipment tests vs PMS" },
      { q: "Emergencies: gyro, GPS, radar and ECDIS failure", topic: "ECDIS" },
      { q: "Disabling a fire alarm zone", topic: "Alarm & power-fail tests" },
      { q: "BNWAS test records and PMS", topic: "Alarm & power-fail tests" },
      { q: "Radar trial manoeuvre and target tracking test", topic: "Radar" },
      { q: "Passage plan verified on the ECDIS", topic: "Passage planning" },
    ],
  },
  {
    id: 10, port: "Antwerp", country: "Belgium", coords: [51.26, 4.4], date: "2026-07-23", major: "Shell", shipType: "Gas carrier",
    areas: ["Master's cabin", "Cargo & deck", "Bridge", "Crew interview"],
    full: true,
    result: "nil",
    positives: 6,
    timeSplit: [["Master's cabin", 3], ["Deck", 3], ["Cargo control room", 2], ["Bridge", 1.6]],
    questions: [
      { q: "Mooring system management plan", topic: "Mooring & access", who: "Master" },
      { q: "Emergency procedures and defect reporting", topic: "Documents & SMS", who: "Master" },
      { q: "COLREGs; squat", topic: "Watchkeeping", who: "Master" },
      { q: "Procedure for escaping from the machinery spaces", topic: "Emergency equipment", who: "Master" },
      { q: "Mooring winch brake testing", topic: "Mooring & access", who: "Master" },
      { q: "Previous observations reviewed in detail; are you aware of the vessel software's limitations?", topic: "PIQ accuracy", who: "Master" },
      { q: "Lifeboat procedure, recovery in heavy weather, and maintenance", topic: "LSA & FFA", who: "C/O" },
      { q: "Start the emergency generator on battery and by the secondary method; operate and reset its quick-closing valve", topic: "Emergency equipment", who: "C/O" },
      { q: "Gas freeing procedures, asked at the pump dome", topic: "Gas testing & enclosed space", who: "C/O" },
      { q: "How does the fuel gas system work?", topic: "Engine room", who: "Gas engineer" },
      { q: "Mooring winches and ropes: maintenance and company procedure", topic: "Mooring & access", who: "C/O" },
      { q: "Emergency towing arrangement light: working, maintained, covered by procedure?", topic: "Mooring & access", who: "C/O" },
      { q: "Procedure for rescuing someone from the ballast tank room", topic: "Gas testing & enclosed space", who: "Bosun" },
      { q: "Rigging the forward embarkation ladder; immersion suit sizes and condition", topic: "LSA & FFA" },
      { q: "Enclosed space entry and rescue, working aloft, emergency stops and escape", topic: "Gas testing & enclosed space", who: "AB" },
      { q: "All posters in the cargo control room; the discharge plan", topic: "Cargo", who: "2/O" },
      { q: "Gas meter use, alarms, calibration and testing", topic: "Gas testing & enclosed space", who: "2/O" },
      { q: "Ballast water treatment in challenging water, and the procedure", topic: "Cargo", who: "2/O" },
      { q: "Ship-shore safety checklist checks, in detail", topic: "Cargo", who: "2/O" },
      { q: "Mooring brake test, rope twisting and its effect, loads on ropes", topic: "Mooring & access", who: "2/O" },
      { q: "Fixed gas detection and sampling", topic: "Gas testing & enclosed space", who: "2/O" },
      { q: "Passage plan, safety settings, watch levels, ECDIS look-ahead and random publications", topic: "Passage planning", who: "2/O" },
      { q: "Company policies on UKC, ECDIS set-up, ECDIS failure and look-ahead", topic: "ECDIS", who: "2/O" },
      { q: "Emergency checklists for blackout and steering failure; what runs off the emergency switchboard?", topic: "Emergency equipment", who: "2/O" },
      { q: "How does the vessel drift if disabled?", topic: "Watchkeeping", who: "2/O" },
      { q: "All GMDSS tests and records; bridge checklist; magnetron replacement requirement", topic: "GMDSS", who: "2/O" },
      { q: "ENC naming, update requirements, navigation warnings and T&P corrections", topic: "ECDIS", who: "2/O" },
      { q: "BNWAS alarms, VDR storage capacity, nav light tests and replacement", topic: "Alarm & power-fail tests", who: "2/O" },
    ],
  },
  {
    id: 11, port: "Durres", country: "Albania", coords: [41.31, 19.45], date: "2026-08-06", major: "ENOC",
    areas: ["Bridge"],
    full: true,
    result: "nil",
    timeSplit: [["Bridge", 2]],
    questions: [
      { q: "Test both ECDIS UPS units", topic: "Alarm & power-fail tests" },
      { q: "VDR, BNWAS and nav lights power-failure tests", topic: "Alarm & power-fail tests" },
      { q: "GPS, AIS and radar monthly tests per maker, matched to the PMS record", topic: "Equipment tests vs PMS" },
      { q: "GMDSS battery on-load and off-load test", topic: "GMDSS" },
      { q: "Navigation equipment inventories", topic: "Equipment tests vs PMS" },
      { q: "Pilot card and master-pilot exchange", topic: "Passage planning" },
      { q: "UKC calculation at the berth, and the UKC policy", topic: "UKC" },
      { q: "Magnetron change policy, checked against the last change in the PMS", topic: "Radar" },
      { q: "Is this navigation checklist the latest version in force?", topic: "Documents & SMS" },
      { q: "Watch levels and security level in the passage plan", topic: "Passage planning" },
      { q: "Play back the ECDIS arrival at the pilot boarding ground", topic: "ECDIS" },
      { q: "ECDIS mandatory markings and safety settings, as the SMS requires", topic: "ECDIS" },
      { q: "Master's time on the con against the test hours; the AB's wheel changeover entry", topic: "Watchkeeping" },
      { q: "Chief officer's watch requirement per the SMS, confirmed in the log and checklist", topic: "Watchkeeping" },
      { q: "Security assessment; a random navigation risk assessment", topic: "Permits & RA" },
      { q: "Navigation warnings, confirmed on the ENC", topic: "GMDSS" },
    ],
  },
  {
    id: 12, port: "Port not stated", country: "Colombia", date: "2026-08-12",
    areas: ["Bridge"],
    full: true,
    questions: [
      { q: "Visual check of all bridge equipment", topic: "Equipment tests vs PMS" },
      { q: "Company UKC policy", topic: "UKC" },
      { q: "Passage plan, and the ECDIS safety settings it calls for", topic: "Passage planning" },
      { q: "Daily, weekly and monthly GMDSS records; PMS records for bridge and GMDSS equipment", topic: "GMDSS" },
      { q: "ECDIS markings; ECDIS update procedure", topic: "ECDIS" },
      { q: "Radar performance check, as the maker's instructions say", topic: "Radar" },
      { q: "Sending a distress alert on Sat C", topic: "GMDSS" },
      { q: "Company pilotage policy; pilot card and master-pilot exchange records", topic: "Passage planning" },
      { q: "Compass error log; master's standing orders", topic: "Watchkeeping" },
      { q: "Pre-arrival checks with log and bell book entries; bridge watch levels", topic: "Watchkeeping" },
      { q: "Acknowledging alarms when the engine room is on UMS", topic: "Engine room" },
      { q: "Bridge pyrotechnics, lifejackets and immersion suits", topic: "LSA & FFA" },
      { q: "AIS self-test, and a test with another ship", topic: "Equipment tests vs PMS" },
      { q: "Aldis lamp and spare bulbs; VDR backup and storage", topic: "Equipment tests vs PMS" },
    ],
  },
  {
    id: 13, port: "Port not stated", country: "Indonesia", coords: [-6.1, 106.88], date: "2026-08-14",
    areas: [],
    full: true,
    style: "Reasonable and relaxed. Looks for gaps in company procedures, not crew mistakes.",
    questions: [],
    note: "Inspector feedback only, no question list.",
  },
  {
    id: 14, port: "Huelva", country: "Spain", coords: [37.25, -6.95], date: "2026-08-30", major: "CDI",
    areas: ["Bridge"],
    full: true,
    questions: [
      { q: "GPS power-off alarm recorded in the VDR", topic: "Alarm & power-fail tests" },
      { q: "Change-of-watch checklist; bridge watch levels per company procedure", topic: "Watchkeeping" },
      { q: "Pilot card and the safety settings on it", topic: "Passage planning" },
      { q: "GMDSS log and battery test", topic: "GMDSS" },
      { q: "Master's standing orders: when to call the master", topic: "Watchkeeping" },
      { q: "Abort point, checked against the wheelhouse poster", topic: "Passage planning" },
      { q: "ECDIS chart updates", topic: "ECDIS" },
      { q: "Pyrotechnics and LSA on the bridge", topic: "LSA & FFA" },
      { q: "How many immersion suits on the bridge? (He expected one for each person at the highest watch level: 4 people on watch, 4 suits.)", topic: "LSA & FFA" },
      { q: "Aldis lamp with battery", topic: "Equipment tests vs PMS" },
      { q: "Navigation warnings; weather routing subscription; company navigation procedure", topic: "Passage planning" },
    ],
  },
  {
    id: 15, port: "Port Arthur", country: "USA", coords: [29.87, -93.93], date: "2026-09-02",
    areas: ["Bridge", "Cargo & deck", "Engine room"],
    full: true,
    result: "negatives",
    negatives: ["The SMS said position is fed from every GNSS receiver; in practice GLONASS wasn't fed to the gyro and GMDSS"],
    negTopics: ["Documents & SMS"],
    timeSplit: [["Bridge", 2], ["Cargo control room", 2], ["Deck", 1.5], ["Engine room", 0.6]],
    style: "Friendly and patient. Gave time to look things up in the SMS: “you don't need to remember it, but know where to look.”",
    questions: [
      { q: "Echo sounder printer: what interval does it print at, and does the SMS set one?", topic: "UKC" },
      { q: "X-band vs S-band, and when do you use each?", topic: "Radar" },
      { q: "ECDIS contour settings and what each means", topic: "ECDIS" },
      { q: "UKC: why different variables on different legs, and does the SMS say which to use?", topic: "UKC" },
      { q: "Standing orders: visibility criteria, when to call the master, pressure drop near a tropical storm", topic: "Watchkeeping" },
      { q: "GLONASS antenna poster and verification; log entries for switching position feed to GLONASS", topic: "Equipment tests vs PMS" },
      { q: "What does the SMS say about feeding position from different GNSS receivers?", topic: "Documents & SMS" },
      { q: "Radar performance criteria, and how you verify them", topic: "Radar" },
      { q: "Why does the magnetic compass have a Flinders bar?", topic: "Equipment tests vs PMS" },
      { q: "Radar shadow and blind sectors poster, and what it means", topic: "Radar" },
      { q: "How do you know the echo sounder shows the right depth? Last PMS entries", topic: "Equipment tests vs PMS" },
      { q: "GMDSS monthly entries", topic: "GMDSS" },
      { q: "Last navigation audit: what came up, and did you read the report?", topic: "Documents & SMS" },
      { q: "Security level in the passage plan; extra precautions logged at a risky anchorage", topic: "Passage planning" },
      { q: "Distraction policy; too many alarms during pilotage, how do you manage?", topic: "Watchkeeping" },
      { q: "Position-fixing interval on the ECDIS; GLONASS and visual fixes plotted", topic: "ECDIS" },
      { q: "Bridge watch levels; which radar antenna is which, just by looking?", topic: "Radar" },
    ],
  },
  {
    id: 16, port: "Mollendo", country: "Peru", coords: [-17.02, -72.02], date: "2026-09-09",
    areas: ["Bridge"],
    full: true,
    questions: [
      { q: "ECDIS safety settings; when do you switch SCAMIN on and off?", topic: "ECDIS" },
      { q: "Weekly updates; ECDIS markings; ECDIS failure procedure", topic: "ECDIS" },
      { q: "X-band vs S-band; why isn't the radar used during port operations?", topic: "Radar" },
      { q: "Radar safety settings", topic: "Radar" },
      { q: "If you can't comply with the UKC policy, what precautions apply when the master isn't on the bridge?", topic: "UKC" },
      { q: "UKC calculation sheets for the last and current port", topic: "UKC" },
      { q: "Passage plan, and what was discussed at the briefing", topic: "Passage planning" },
      { q: "Bridge lifejacket", topic: "LSA & FFA" },
      { q: "EPIRB test: what do one, two and three flashes mean? Annual and monthly entries in the GMDSS log", topic: "GMDSS" },
      { q: "Standing and night orders signed by every OOW and the cadet, with magnetic and true heading written", topic: "Watchkeeping" },
      { q: "CPA and TCPA settings in the standing orders; why not AIS or VHF for collision avoidance?", topic: "Radar" },
      { q: "Nav light failure alarm (wear gloves if you pull the fuse)", topic: "Alarm & power-fail tests" },
      { q: "Nautical publications and their supply certificate", topic: "Passage planning" },
      { q: "Emergency fire pump operating procedure", topic: "Emergency equipment" },
    ],
  },
  {
    id: 17, port: "Fujairah STS", country: "UAE", coords: [25.12, 56.35], date: "2026-09-09", major: "Maxcom",
    areas: ["Bridge", "Cargo & deck"],
    full: true,
    style: "Gentle and calm. He already knew this operator's SMS from earlier inspections of its fleet.",
    questions: [
      { q: "Echo sounder alarm test, set per the company UKC policy", topic: "UKC" },
      { q: "GMDSS test records and last annual battery capacity test; what if you receive an MF/HF distress, or can't reach the vessel?", topic: "GMDSS" },
      { q: "Test all three handheld GMDSS radios on channel 17; spare battery expiry", topic: "GMDSS" },
      { q: "Company cyber security policy", topic: "Documents & SMS" },
      { q: "Navarea, T&P and Navtex warnings plotted on the ECDIS; Navtex station and message type selection", topic: "ECDIS" },
      { q: "BNWAS and its power failure alarm: show evidence of the power failure test", topic: "Alarm & power-fail tests" },
      { q: "Compare inert gas pressure and oxygen percentage with the cargo control room", topic: "Cargo" },
      { q: "Fire panel free of alarms; display dimmers; nav and signal lights tested one on each panel", topic: "Alarm & power-fail tests" },
      { q: "VDR self-test and alarms (AIS was off on company instruction)", topic: "Equipment tests vs PMS" },
      { q: "Course recorder against the current heading; magnetic compass, error log and deviation card", topic: "Equipment tests vs PMS" },
      { q: "Changing from gyro 1 to gyro 2; date of the last emergency steering drill", topic: "Steering" },
      { q: "Do the standing orders allow AIS and VHF for collision avoidance? Show the same in the SMS.", topic: "Watchkeeping" },
      { q: "Radar maintenance records; fire rounds and engine room manned/unmanned entries in the deck log", topic: "Equipment tests vs PMS" },
      { q: "Show the company navigation policy in the SMS; when were the ENCs and publications last updated?", topic: "ECDIS" },
      { q: "Safety settings and look-ahead for each stage, as the company policy says", topic: "ECDIS" },
      { q: "Markings on the ECDIS: call the master, remove anchor lashings, change safety parameters", topic: "ECDIS" },
      { q: "Why is no abort point marked? (Open anchorage; he accepted, but asked to see the last port approach.) Contingency anchorages", topic: "Passage planning" },
      { q: "If you can't meet the company UKC policy, what do you do? (He wanted: risk-assess it, then inform the company.)", topic: "UKC" },
      { q: "Watch level, helmsman and lookout in the deck log, matched to checklist times", topic: "Watchkeeping" },
      { q: "Master-pilot exchange and pilot cards; turning circle on the wheelhouse poster", topic: "Passage planning" },
      { q: "Rocket parachute flares and line-throwing apparatus expiry", topic: "LSA & FFA" },
      { q: "Inert gas failure: what do you do? Fire at the manifold: which extinguishing medium? Pressure and vacuum settings on the cargo display", topic: "Cargo", who: "C/O" },
    ],
  },
  {
    id: 18, port: "Toamasina", country: "Madagascar", coords: [-18.15, 49.4], date: "2026-09-19", major: "BP", shipType: "Chemical tanker",
    areas: ["Master's cabin", "Engine room", "Bridge", "Cargo & deck", "Crew interview"],
    full: true,
    result: "negatives",
    negatives: [
      "Defect reporting system not implemented as required",
      "PIQ photo of the winch area doesn't match the ship",
      "Oily water separator 5-year inspection due",
      "S-band radar magnetron hours over the maker's limit",
    ],
    negTopics: ["Defect reporting", "PIQ accuracy", "Engine room", "Radar"],
    positives: 2,
    style: "Very thorough, an ex-tanker master who went deep into everything. Explained the scope clearly at the opening meeting.",
    timeline: [
      ["Opening", "Meeting with master, chief engineer, chief officer and second engineer; scope explained"],
      ["0600–0930", "Documents: certificates, record books, permits, manuals, drills, audits, PSC, SMPEP, crew papers"],
      ["0930–1100", "Engine room, ECR and steering gear: alarms, emergency steering, OWS, oil mist detector"],
      ["1100–1200", "Bridge with the second officer"],
      ["1220–1230", "Galley interview and inspection"],
      ["1230–1345", "Accommodation, boats, emergency generator, CO2 room, pump room, forecastle"],
      ["1345–1500", "Cargo control room with chief and second officer"],
    ],
    questions: [
      { q: "Statutory, trading and minor certificates; record books; permits; manuals checked for approval stamps", topic: "Documents & SMS", who: "Master" },
      { q: "Internal audits, PSC reports, non-conformities and company audits; SMPEP", topic: "Documents & SMS", who: "Master" },
      { q: "Defect list, and how the defect system is used on board", topic: "Defect reporting", who: "Master" },
      { q: "Crew documents, including flag state endorsements", topic: "Documents & SMS", who: "Master" },
      { q: "Emergency steering test and alarms; workshop emergency stops; fuel leak test in the generator room", topic: "Alarm & power-fail tests", who: "C/E" },
      { q: "OWS tested with the 15 ppm test; main engine oil mist detector; bilge well alarms", topic: "Engine room", who: "C/E" },
      { q: "UMS and standing orders; critical equipment list, critical spares and overdue jobs in the PMS", topic: "Engine room", who: "C/E" },
      { q: "Bunkering procedure, enclosed space entry, and lifting equipment", topic: "Permits & RA" },
      { q: "Passage plan; radar magnetron hours; deck, movement and compass error logs", topic: "Radar", who: "2/O" },
      { q: "ENC and publication updates and the backup system; arrival and departure checklists in the log", topic: "ECDIS", who: "2/O" },
      { q: "How do you switch the BNWAS on and off?", topic: "Alarm & power-fail tests", who: "2/O" },
      { q: "Master-pilot exchange procedure; master on the con vs pilot assisting during arrival and departure", topic: "Watchkeeping", who: "2/O" },
      { q: "Why can't the GMDSS radio be used on deck?", topic: "GMDSS", who: "2/O" },
      { q: "Abort point vs point of no return", topic: "Passage planning", who: "2/O" },
      { q: "Your duties when the chief officer isn't on the cargo watch", topic: "Cargo", who: "2/O" },
      { q: "Lifejackets and immersion suits; garbage, drum and paint stores; leaks at the mooring winches", topic: "LSA & FFA" },
      { q: "Free-fall lifeboat: strict LSA inventory, engine start, ahead and astern, lights; rescue boat the same", topic: "LSA & FFA" },
      { q: "Emergency generator: electric and spring start, voltage, frequency, fuel quick-closing valve", topic: "Emergency equipment" },
      { q: "How long from activation to CO2 release?", topic: "Emergency equipment", who: "2/E" },
      { q: "Pump room: rescue harness, EEBD, bilges and lighting", topic: "Gas testing & enclosed space" },
      { q: "Sample locker and MSDS; how samples are disposed of; SCBA in the SMPEP locker", topic: "Cargo" },
      { q: "P/V valves move freely; high-level and overfill alarms tested", topic: "Cargo" },
      { q: "Forecastle bilge alarm; emergency transfer pumps tested", topic: "Cargo" },
      { q: "Manifold rigging procedure; cargo details and hazards; precautions when stripping tanks", topic: "Cargo", who: "AB" },
      { q: "Gangway log baggage check entries", topic: "Documents & SMS" },
      { q: "All cargo control room equipment working; ship-shore checklist; discharge plan; chief officer's standing orders; MSDS for the cargo", topic: "Cargo", who: "C/O" },
    ],
  },
  {
    id: 19, port: "Manzanillo", country: "Mexico", coords: [19.05, -104.32], date: "2026-10-12",
    areas: ["Bridge", "Cargo & deck", "Engine room", "Master's cabin", "Crew interview"],
    full: true,
    style: "Fair. When the crew couldn't answer, he explained the answer himself.",
    timeline: [
      ["0520", "Boarded with two hours of discharge left; asked the gangway AB what was going on"],
      ["Opening", "Meeting in the conference room"],
      ["Deck", "Rounds before the bridge; pumpman, CCR, bosun"],
      ["Engine", "Engine room round; second and third engineer"],
      ["Cabins", "Chief engineer's then master's cabin: records, plans, MARPOL"],
      ["Bridge", "Bridge last, then lunch"],
    ],
    questions: [
      { q: "What cargo operation is going on?", topic: "Cargo", who: "AB" },
      { q: "Is the ECDIS newly installed? What checks before a long passage? Weekly updates; chart compilation scale", topic: "ECDIS" },
      { q: "Full passage plan on ECDIS and paper: CATZOC applied, watch levels and security level, signed by the chief engineer", topic: "Passage planning" },
      { q: "ECDIS safety settings: definition, how they're applied and used", topic: "ECDIS" },
      { q: "Any defects in bridge equipment?", topic: "Defect reporting" },
      { q: "Radar condition; X vs S; magnetron hours and replacement policy from the radar manual", topic: "Radar" },
      { q: "Parallel index: how to check and apply it; which radar in rain; which speed input for collision avoidance", topic: "Radar" },
      { q: "Performance monitor: what is it for, and how do you check it?", topic: "Radar" },
      { q: "Company policy on AIS for collision avoidance", topic: "Radar" },
      { q: "Nav lights tested by pulling the fuse; lamp test", topic: "Alarm & power-fail tests" },
      { q: "UKC policy at the berth: why 1.5% of the ship's breadth?", topic: "UKC" },
      { q: "Squat; shallow and safety contours", topic: "UKC" },
      { q: "GMDSS battery annual test record. When and where should you NOT do it? Shore-based maintenance certificate", topic: "GMDSS" },
      { q: "Why are GMDSS tests done? LRIT and SSAS tests; last weekly and monthly tests", topic: "GMDSS" },
      { q: "How are ENCs and charts kept updated?", topic: "ECDIS" },
      { q: "What is AIO?", topic: "ECDIS" },
      { q: "Emergency shutdown; is this a static accumulator cargo?", topic: "Cargo", who: "Pumpman" },
      { q: "Mooring system management plan and line management checklists", topic: "Mooring & access", who: "C/O" },
      { q: "Accommodation inspection, safety officer and cargo checklists", topic: "Documents & SMS", who: "C/O" },
      { q: "Gauges and fuel pumps on the engine room round", topic: "Engine room", who: "2/E" },
      { q: "Fuel and MARPOL records, plans and books", topic: "Engine room", who: "C/E" },
    ],
  },
]

// Topic tags on the negatives (for counts and briefs)
export const NEGATIVE_TOPICS: Topic[] = ["Defect reporting", "PIQ accuracy", "Engine room", "Radar"]

export const MAJORS = ["Shell", "BP", "ENOC", "Equinor", "Maxcom", "Ampol", "CDI", "Other"]
export const RANKS = ["Master", "C/O", "2/O", "3/O", "C/E"]

// Which topics fall to which rank (typical tanker division of duties)
export const RANK_TOPICS: Record<string, Topic[]> = {
  Master: ["Documents & SMS", "Defect reporting", "PIQ accuracy", "Watchkeeping", "Rest hours & drills", "UKC", "Passage planning", "Permits & RA"],
  "C/O": ["Cargo", "Defect reporting", "PIQ accuracy", "LSA & FFA", "Rest hours & drills", "Watchkeeping", "Permits & RA", "Gas testing & enclosed space", "Emergency equipment", "PPE & personal safety", "Mooring & access"],
  "2/O": ["ECDIS", "Radar", "Passage planning", "UKC", "GMDSS", "Alarm & power-fail tests", "Equipment tests vs PMS", "Steering", "Watchkeeping"],
  "3/O": ["LSA & FFA", "GMDSS", "Rest hours & drills", "Watchkeeping", "Emergency equipment", "Gas testing & enclosed space"],
  "C/E": ["Engine room", "Steering", "Defect reporting", "Rest hours & drills", "Alarm & power-fail tests", "Emergency equipment", "Permits & RA", "PPE & personal safety"],
}

export const TOPIC_TASK: Partial<Record<Topic, string>> = {
  ECDIS: "Run through ECDIS safety settings, SCAMIN and the failure procedure",
  Radar: "Check radar running hours against the maker's limit and log the PM",
  UKC: "Print the UKC calculation for this port and know the company policy",
  "Passage planning": "Walk the passage plan berth to berth, incl. abort points",
  GMDSS: "Do the GMDSS battery on/off-load test and update the log",
  "Alarm & power-fail tests": "Run ECDIS UPS, VDR, BNWAS and nav lights power-fail tests",
  "Equipment tests vs PMS": "Match monthly GPS, AIS and radar test dates with the PMS",
  "Documents & SMS": "Lay out certificates against the PIQ and know where the SMS covers each",
  "Rest hours & drills": "Cross-check rest hours with drill times and the bell book",
  "Defect reporting": "Bring the defect list up to date with photos and close-outs",
  Watchkeeping: "Re-read standing orders and the change-of-watch checklist",
  Steering: "Have steering gear timing records and the emergency steering drill ready",
  "LSA & FFA": "Check immersion suits, pyrotechnics and the fireman's radios",
  "Engine room": "Check UMS alarm records and the OWS inspection due date",
  Cargo: "Brief the duty AB on the current cargo operation",
  "PIQ accuracy": "Compare PIQ photos and data with the ship as she is today",
  "Permits & RA": "Check permits and risk assessments exist for routine jobs too",
  "Emergency equipment": "Practise starting the emergency generator and fire pump",
  "Gas testing & enclosed space": "Check gas meter calibration and span gas dates",
  "PPE & personal safety": "Check helmet dates and that working lifejackets are in the PMS",
  "Mooring & access": "Check mooring line certificates against the MSMP and the brake test record",
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
export const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-")
  return `${+d} ${MONTHS[+m - 1]}${y && y !== "2026" ? ` ${y}` : ""}`
}
export const fmtCoord = ([lat, lng]: [number, number]) =>
  `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lng).toFixed(2)}°${lng >= 0 ? "E" : "W"}`
export const placeLabel = (d: Debrief) =>
  d.port === "Port not stated" ? (d.country ? `${d.country} (port not stated)` : "Port not stated") : `${d.port}, ${d.country}`

// ---- Aggregates
export function topicCounts(list: Debrief[] = DEBRIEFS) {
  const m = new Map<Topic, number>()
  for (const d of list) {
    const ts = new Set<Topic>(d.questions.map((q) => q.topic))
    d.negTopics?.forEach((t) => ts.add(t))
    ts.forEach((t) => m.set(t, (m.get(t) || 0) + 1))
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

export function areaCounts() {
  const m = new Map<Area, number>()
  for (const d of DEBRIEFS) d.areas.forEach((a) => m.set(a, (m.get(a) || 0) + 1))
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

export function majorCounts() {
  const m = new Map<string, number>()
  for (const d of DEBRIEFS) m.set(d.major || "Not stated", (m.get(d.major || "Not stated") || 0) + 1)
  return [...m.entries()].sort((a, b) => (a[0] === "Not stated" ? 1 : b[0] === "Not stated" ? -1 : b[1] - a[1]))
}

export const PORTS = DEBRIEFS.filter((d) => d.coords && d.port !== "Port not stated")
export const STATS = {
  debriefs: DEBRIEFS.length,
  ports: PORTS.length,
  countries: new Set(DEBRIEFS.map((d) => d.country).filter(Boolean)).size,
  questions: DEBRIEFS.reduce((n, d) => n + d.questions.length, 0),
  majors: new Set(DEBRIEFS.map((d) => d.major).filter(Boolean)).size,
}

// ---- Brief builder
export interface Brief {
  major: string
  port: string
  rank: string
  matched: Debrief[]
  confidence: { level: string; score: number }
  focus: { topic: Topic; inMatched: number; overall: number; pct: number }[]
  questions: { q: string; topic: Topic; source: string }[]
  negatives: { text: string; source: string }[]
  tasks: string[]
}

export function buildBrief(major: string, port: string, rank: string): Brief {
  const matched = DEBRIEFS.filter((d) => d.major === major || (port && d.port === port))
  const relevant = RANK_TOPICS[rank] || RANK_TOPICS["2/O"]
  const overall = new Map(topicCounts())
  const inM = new Map(topicCounts(matched))
  const focus = relevant
    .map((t) => ({ topic: t, inMatched: inM.get(t) || 0, overall: overall.get(t) || 0 }))
    .map((f) => ({ ...f, score: f.inMatched * 4 + f.overall }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ score, ...f }) => ({ ...f, pct: matched.length && f.inMatched ? f.inMatched / matched.length : f.overall / DEBRIEFS.length }))

  const src = (d: Debrief) => `${d.major ? d.major + " · " : ""}${d.port === "Port not stated" ? d.country || "Port n/s" : d.port} · ${fmtDate(d.date)}`
  const asked = (d: Debrief, q: Question) => (q.who || d.rank) === rank
  const entries = DEBRIEFS.flatMap((d) => d.questions.map((q) => ({ d, q })))
  const score = (e: { d: Debrief; q: Question }) => (asked(e.d, e.q) ? 4 : 0) + (matched.includes(e.d) ? 2 : 0) + (relevant.includes(e.q.topic) ? 1 : 0)
  const seen = new Set<string>()
  const questions: Brief["questions"] = []
  for (const e of entries.filter((e) => score(e) >= 1 && (!(e.q.who || e.d.rank) || asked(e.d, e.q))).sort((a, b) => score(b) - score(a) || b.d.date.localeCompare(a.d.date))) {
    if (questions.length >= 6) break
    if (seen.has(e.q.q)) continue
    seen.add(e.q.q)
    questions.push({ q: e.q.q, topic: e.q.topic, source: src(e.d) })
  }
  const negatives = DEBRIEFS.flatMap((d) => (d.negatives || []).map((text) => ({ text, source: src(d) })))
  const n = matched.length
  const confidence = n >= 3 ? { level: "Medium", score: 3 } : n === 2 ? { level: "Medium-low", score: 2 } : n === 1 ? { level: "Low", score: 1 } : { level: "Very low", score: 1 }
  const tasks = focus.map((f) => TOPIC_TASK[f.topic]).filter(Boolean) as string[]
  return { major, port, rank, matched, confidence, focus, questions, negatives, tasks }
}

// ---- Mock interview bank (model answers written for this prototype)
export interface InterviewQ {
  q: string
  context: string
  rubric: { label: string; keys: string[]; hint: string }[]
  model: string
  samples: string[]
}

export const INTERVIEW: Record<string, InterviewQ[]> = {
  "2/O": [
    {
      q: "Leaving port tonight, which radar will you rely on, and why?",
      context: "Asked of a 2/O at Cartagena (Equinor, Jul)",
      rubric: [
        { label: "Technical", keys: ["x-band", "x band", "3 cm", "resolution", "discrimination", "sart"], hint: "Name X-band for close quarters: sharper resolution, and it shows SARTs." },
        { label: "Both radars", keys: ["s-band", "s band", "10 cm", "rain", "clutter", "long range", "longer range"], hint: "Say what the S-band is doing: longer range, better in rain and sea clutter." },
        { label: "Procedure & records", keys: ["procedure", "sms", "company", "running hours", "pms", "maker"], hint: "Point to the bridge procedure and show running hours are within the maker's limit." },
      ],
      model: "X-band for pilotage and close quarters: sharper resolution and bearing discrimination, and it responds to SARTs. The S-band runs on a longer range for early detection because it copes better with rain and sea clutter. That set-up is in our bridge procedures, and both radars' running hours are within the maker's limit in the PMS.",
      samples: [
        "X-band, because it has better resolution in confined waters.",
        "X-band for close quarters because of its resolution and SART response, with the S-band on a longer range for rain and sea clutter. It's in our bridge procedures and running hours are logged in the PMS.",
      ],
    },
    {
      q: "In a collision-avoidance situation, which speed do you use on the radar, STW or SOG?",
      context: "Asked of a 2/O at Cartagena (Equinor, Jul)",
      rubric: [
        { label: "Correct choice", keys: ["stw", "through the water", "sea stabil", "sea-stabil", "water track"], hint: "Speed through the water, sea-stabilised." },
        { label: "Reason", keys: ["aspect", "true heading", "colreg", "current", "tide"], hint: "It shows the target's true aspect; current would distort a ground-stabilised picture." },
        { label: "Contrast", keys: ["sog", "ground", "navigation", "position"], hint: "Ground-stabilised (SOG) is for navigation and position monitoring." },
      ],
      model: "Speed through the water, with the radar sea-stabilised. That shows each target's true aspect, which is what the Collision Regulations are about. Ground-stabilised speed (SOG) is for navigation and position monitoring; with current running it can show a misleading aspect.",
      samples: ["SOG, because it's more accurate from GPS.", "STW, sea-stabilised, so I see the target's true aspect. SOG is for navigation; current would distort the aspect."],
    },
    {
      q: "What is SCAMIN, and when would you switch it off?",
      context: "Asked at Tema and Mollendo (Jul, Sep)",
      rubric: [
        { label: "Definition", keys: ["scale minimum", "scale", "hide", "hidden", "declutter", "clutter"], hint: "Scale minimum: objects are hidden when you zoom out past the scale they were compiled for." },
        { label: "When off", keys: ["route check", "checking", "planning", "passage plan", "off"], hint: "Switch it off when checking the route so no hazard is hidden." },
        { label: "Procedure", keys: ["procedure", "company", "sms"], hint: "Follow the company ECDIS procedure." },
      ],
      model: "SCAMIN is scale minimum: an ENC attribute that hides objects when you zoom out beyond the scale they were compiled for, to cut clutter. I keep it on for normal display but switch it off when visually checking the route, so no hazard is hidden, as our ECDIS procedure says.",
      samples: ["It's a setting for the chart scale.", "Scale minimum hides objects when zoomed out to reduce clutter. I switch it off when checking the route during passage planning, per the company ECDIS procedure."],
    },
  ],
  "3/O": [
    {
      q: "Who is the DPA, and when can you contact them?",
      context: "Asked of a 3/O at Marsden Point (Ampol, Apr)",
      rubric: [
        { label: "Who", keys: ["designated person", "dpa", "ashore", "office"], hint: "The Designated Person Ashore, named on board with 24-hour contacts." },
        { label: "Direct access", keys: ["anyone", "any crew", "directly", "any time", "anytime"], hint: "Anyone on board can contact the DPA directly." },
        { label: "What for", keys: ["safety", "pollution", "concern", "ism"], hint: "For safety or pollution concerns, under the ISM Code." },
      ],
      model: "The Designated Person Ashore, named in the SMS and on the notice board with 24-hour contact details. Anyone on board can contact the DPA directly about safety or pollution concerns, without going through the master. It's an ISM Code requirement.",
      samples: ["The DPA is in the office. The master calls them.", "The Designated Person Ashore. Any crew member can contact them directly about safety or pollution concerns, as the ISM Code requires."],
    },
    {
      q: "Who enters your work and rest hours, and how are they checked?",
      context: "Asked of a 3/O at Marsden Point (Ampol, Apr)",
      rubric: [
        { label: "Own record", keys: ["i enter", "myself", "i record", "own"], hint: "You record your own hours as actually worked." },
        { label: "Verification", keys: ["master", "signed", "sign", "head of department", "verified"], hint: "The master or head of department reviews and signs." },
        { label: "Honesty", keys: ["drill", "log", "match", "non-conform", "accurate"], hint: "Hours must match drills and the log; non-conformities are reported, not adjusted." },
      ],
      model: "I enter my own hours, as actually worked. My head of department and the master review and sign them. They have to match drill times and the deck log, and any non-conformity is reported, not adjusted.",
      samples: ["The chief officer fills them in for us.", "I record my own hours accurately; the master signs them, and they must match drills and the log. Non-conformities get reported."],
    },
  ],
  Master: [
    {
      q: "Walk me through how a defect is reported and closed out on this ship.",
      context: "Negative observation at Toamasina (BP, Sep)",
      rubric: [
        { label: "Reporting", keys: ["report", "pms", "system", "photo"], hint: "Raised in the defect / PMS system with photos." },
        { label: "Risk", keys: ["risk", "interim", "assess"], hint: "Risk assessed, with interim measures where needed." },
        { label: "Close-out", keys: ["office", "close", "verified", "track"], hint: "Reported to the office and tracked to verified close-out." },
      ],
      model: "Whoever finds it raises it in the defect system with photos. The head of department assesses the risk and puts interim measures in place, the office is informed, and it's tracked to a verified close-out. Critical equipment follows the SMS procedure, including notifying charterers when required.",
      samples: ["We tell the office by email.", "It's raised in the PMS defect module with photos, risk-assessed with interim measures, reported to the office and tracked to verified close-out."],
    },
  ],
  "C/O": [
    {
      q: "The PIQ photo of the winch area doesn't match the ship. Why does that matter?",
      context: "Negative observation at Toamasina (BP, Sep)",
      rubric: [
        { label: "What PIQ is", keys: ["declaration", "operator", "questionnaire", "piq"], hint: "The PIQ is the operator's declaration about the ship." },
        { label: "Why it matters", keys: ["control", "accurate", "trust", "observation"], hint: "Inspectors read outdated data as poor control." },
        { label: "Fix", keys: ["update", "before", "modification", "photo"], hint: "Update PIQ photos and data after any change and before inspection." },
      ],
      model: "The PIQ is the operator's declaration about the ship, and the inspector checks it against what they see. Outdated photos read as poor control of information. PIQ photos and data are updated after any modification and checked before every inspection.",
      samples: ["It's just a photo.", "The PIQ is the operator's declaration, so outdated photos show poor control. We update PIQ photos after any modification and before each inspection."],
    },
  ],
  "C/E": [
    {
      q: "In UMS, if an alarm sounds at night, how is it recorded?",
      context: "Asked at Tema (Jul)",
      rubric: [
        { label: "Response", keys: ["duty engineer", "attend", "acknowledge"], hint: "The duty engineer attends and acknowledges." },
        { label: "Record", keys: ["log", "record", "name", "time", "cause"], hint: "Logged with time, cause, action and the engineer's name." },
        { label: "Follow-up", keys: ["defect", "repeat", "printer", "report"], hint: "Repeat alarms become defects; logs match the alarm printer." },
      ],
      model: "The duty engineer attends and acknowledges it, then records the time, cause and action, with their name, in the engine log. Repeated alarms are raised as defects, and the records should match the alarm printer.",
      samples: ["The engineer resets it.", "The duty engineer attends, then logs time, cause, action and their name. Repeats are raised as defects and the log matches the alarm printer."],
    },
  ],
}

export function scoreAnswer(text: string, q: InterviewQ) {
  const t = text.toLowerCase()
  return q.rubric.map((r) => ({ ...r, hit: r.keys.some((k) => t.includes(k)) }))
}

// ---- Debrief structuring (prototype parser, stands in for the AI step)
const TOPIC_WORDS: [Topic, string[]][] = [
  ["ECDIS", ["ecdis", "scamin", "catzoc", "chart"]],
  ["Radar", ["radar", "x band", "s band", "x-band", "s-band", "arpa"]],
  ["UKC", ["ukc", "under keel"]],
  ["Passage planning", ["passage plan", "abort", "pilot card"]],
  ["GMDSS", ["gmdss", "sat c", "epirb", "mf/hf", "battery"]],
  ["Alarm & power-fail tests", ["power fail", "power-fail", "ups", "alarm"]],
  ["Equipment tests vs PMS", ["pms", "monthly test", "inventory", "inventories", "vdr", "bnwas"]],
  ["Documents & SMS", ["certificate", "sms", "audit", "moc", "dpa"]],
  ["Rest hours & drills", ["rest hour", "drill"]],
  ["Defect reporting", ["defect"]],
  ["LSA & FFA", ["lsa", "immersion", "lifejacket", "pyrotechnic"]],
  ["Engine room", ["ums", "ows", "engine"]],
  ["Cargo", ["cargo", "ballast", "odme", "manifold"]],
  ["Permits & RA", ["ptw", "permit", "risk assessment", " ra "]],
  ["Emergency equipment", ["emergency generator", "emg gen", "fire pump"]],
  ["Gas testing & enclosed space", ["gas meter", "enclosed space", "span gas"]],
  ["PPE & personal safety", ["helmet", "ppe", "harness"]],
  ["Mooring & access", ["mooring", "msmp", "gangway", "pilot ladder", "brake"]],
]

export function structureDebrief(raw: string) {
  const t = raw.toLowerCase()
  const port = DEBRIEFS.find((d) => d.port !== "Port not stated" && t.includes(d.port.toLowerCase().split(" ")[0]))
  const major = MAJORS.find((m) => m !== "Other" && new RegExp(`\\b${m.toLowerCase()}\\b`).test(t))
  const date = raw.match(/\b(\d{1,2})[\s.\-/]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s.\-/]*(\d{2,4})?/i)
  const hrs = raw.match(/(\d+(?:\.\d+)?)\s*(?:hrs?|hours)/i)
  const area = /master'?s? cabin|documents/i.test(raw) ? "Master's cabin" : /engine/i.test(raw) ? "Engine room" : /bridge/i.test(raw) ? "Bridge" : "Not stated"
  const items = raw.split(/[\n,;]|(?:\d+\.)/).map((s) => s.trim()).filter((s) => s.length > 6)
  const topics = TOPIC_WORDS.filter(([, w]) => w.some((x) => t.includes(x))).map(([k]) => k)
  const removed: string[] = []
  if (/\b(mt|m\/t|mv)\s+[a-z]/i.test(raw)) removed.push("Ship name")
  if (/\b(?:capt\.?|captain|mr\.?|inspector:?)\s+[a-z]/i.test(raw)) removed.push("Personal names")
  return {
    port: port ? `${port.port}, ${port.country}` : "Not found",
    major: major || "Not stated",
    date: date ? `${date[1]} ${date[2][0].toUpperCase()}${date[2].slice(1, 3).toLowerCase()}${date[3] ? " " + (date[3].length === 2 ? "20" + date[3] : date[3]) : ""}` : "Not found",
    area: hrs ? `${area} · ${hrs[1]} hrs` : area,
    questions: Math.max(0, items.length - 1),
    topics,
    removed,
  }
}

export const SAMPLE_RAW = `Sire at Durres, Albania. 06 Aug 26. ENOC.
Inspector: Capt. Firstname Lastname
Bridge 2 hrs:
- Both ECDIS UPS test
- VDR power fail test
- BNWAS power fail
- Nav lights power fail
- GPS, AIS, radar monthly test as per maker, confirm with PMS record
- GMDSS battery on/off load test
- Nav equipment inventories`

// ---- Industry figures (secondary sources, see footer)
export const INDUSTRY = [
  { value: 5.24, decimals: 2, unit: "", label: "negative observations per SIRE 2.0 inspection in 2025, down from 6.33 in late 2024", source: "INTERTANKO 2025 benchmark, via Maritime Trainer" },
  { value: 37, decimals: 0, unit: "%", label: "of negative observations are human factors", source: "INTERTANKO 2025 benchmark, via Maritime Trainer" },
  { value: 40, decimals: 0, unit: "%", label: "of observations come from just 10 of roughly 300 questions", source: "Kaiko Systems data, via marineinspection.app" },
  { value: 2.9, decimals: 1, unit: "", label: "negatives on well-prepared ships, against a 5.2 benchmark", source: "Kaiko Systems data, via marineinspection.app" },
  { value: 25, decimals: 0, unit: "%", label: "of observations had already been raised on the same ship before", source: "via marineinspection.app" },
  { value: 12, decimals: 0, unit: " mo", label: "a SIRE report stays active for charterers to see", source: "via marineinspection.app" },
]

// ---- Fleet console (sample data)
export const FLEET = [
  { vessel: "MT Vessel A", type: "Product tanker", major: "ENOC", port: "Durres", date: "22 Oct", briefed: 5, crew: 6, score: 74, state: "on-track" },
  { vessel: "MT Vessel B", type: "Chemical tanker", major: "Shell", port: "Antwerp", date: "27 Oct", briefed: 2, crew: 6, score: 58, state: "attention" },
  { vessel: "MT Vessel C", type: "Crude tanker", major: "BP", port: "Fujairah STS", date: "3 Nov", briefed: 0, crew: 5, score: 0, state: "not-started" },
  { vessel: "MT Vessel D", type: "Product tanker", major: "Equinor", port: "Cartagena", date: "9 Nov", briefed: 6, crew: 6, score: 81, state: "ready" },
]

export const REPEATS = [
  { text: "PIQ photos out of date", ships: 3 },
  { text: "Running hours over maker's limit (radar, OWS)", ships: 2 },
  { text: "Defect reporting not followed through", ships: 2 },
]

// ---- What the inspector wants to see, by topic (records to have ready)
export const TOPIC_EVIDENCE: Record<Topic, string[]> = {
  ECDIS: ["Type-specific ECDIS familiarisation for every OOW", "Safety settings set as the company procedure says", "Chart and permit update records", "ECDIS failure procedure you can walk through"],
  Radar: ["Running hours against the maker's limit, in the PMS", "Performance checks and planned maintenance records", "Company guidance on which radar to use, and when"],
  UKC: ["Company UKC policy", "UKC calculation for this port and the last one", "Echo sounder alarm set to match the policy"],
  "Passage planning": ["Berth-to-berth plan with abort points and no-go areas", "Pilot card completed", "Plan checked and signed by the master"],
  GMDSS: ["GMDSS log with daily, weekly and monthly tests", "Battery on-load and off-load test records", "EPIRB and SART test records"],
  "Alarm & power-fail tests": ["Power-failure test records for ECDIS UPS, VDR, BNWAS and nav lights", "Dates that match the PMS"],
  "Equipment tests vs PMS": ["Monthly test records that match the PMS dates", "Maker's test procedures at hand", "Bridge equipment inventory"],
  "Documents & SMS": ["Certificates that match the PIQ", "Knowing where the SMS covers each procedure", "Audit findings and management-of-change records"],
  "Rest hours & drills": ["Rest hours that match drill times and the bell book", "Familiarisation checklists", "Drill records"],
  "Defect reporting": ["Defect list with photos and risk assessment", "Interim measures and close-out evidence"],
  Watchkeeping: ["Signed standing orders", "Change-of-watch checklist", "Heavy-weather checklist entries in the log"],
  Steering: ["Steering gear test records and timings", "Emergency steering drill records"],
  "LSA & FFA": ["LSA and FFA inspection records", "Immersion suits and lifejackets as required", "Pyrotechnics in date"],
  "Engine room": ["UMS alarm records with the engineer's name", "Oily water separator certificate and maintenance"],
  Cargo: ["Senior officers' cargo and ballast handling certificates", "Current cargo plan, with the duty crew briefed"],
  "PIQ accuracy": ["PIQ photos and data updated after any change", "Photos date-stamped, taken with the intrinsically safe camera"],
  "Permits & RA": ["Permit-to-work and risk assessment for routine jobs too: gangway rigging, work aloft, small jobs", "Names on the permit match who did the job", "Toolbox meeting records"],
  "Emergency equipment": ["Know how to start the emergency generator and put it on load", "Every location the emergency fire pump starts from", "Escape routes known and marked"],
  "Gas testing & enclosed space": ["Gas meter calibration and bump-test records, span gas in date", "Enclosed space entry permits and procedure", "Detector alarm settings"],
  "PPE & personal safety": ["Helmet manufacture dates within the maker's limit", "Anti-static winter jackets and rain gear", "Working lifejackets inventoried and inspected in the PMS"],
  "Pollution prevention": ["Oil Record Book Part I and II entries checked against tank soundings", "Garbage management plan and record book", "ODME records and printouts, clock synchronised with the bridge"],
  "Security & cyber": ["Ship security plan drills and records", "Cyber security training records and an IT/OT equipment register", "Gangway visitor log matching familiarisation records"],
  "Training & certificates": ["Officers' matrix matching discharge books", "Cargo endorsements for the ship type", "Simulator and BRM/ERM course certificates in date"],
  "Hull & condition": ["Defect list covering hull damage, with class informed", "Recent photos that match the actual condition", "Coating and corrosion records"],
  "Mooring & access": ["Mooring system management plan up to date", "Line and tail certificates, MBL checked against the ship design MBL", "Winch brake test records", "Gangway and pilot ladder rigging, with permits where required"],
}

// ---- Flashcards for the daily drill (answers written for this prototype)
export const FLASHCARDS: { q: string; a: string; topic: Topic }[] = [
  { q: "What does SCAMIN stand for?", a: "Scale minimum. Objects are hidden when you zoom out past the scale they were compiled for. Switch it off when checking a route.", topic: "ECDIS" },
  { q: "Which radar band shows a SART?", a: "X-band (9 GHz). Keep it in mind for search and rescue.", topic: "Radar" },
  { q: "Collision avoidance: sea- or ground-stabilised?", a: "Sea-stabilised, speed through the water. It shows each target's true aspect.", topic: "Radar" },
  { q: "Who can contact the DPA?", a: "Anyone on board, directly, about safety or pollution concerns. It's an ISM Code requirement.", topic: "Documents & SMS" },
  { q: "What does CATZOC describe?", a: "The zone of confidence: how accurate and reliable the survey data behind an ENC area is.", topic: "ECDIS" },
  { q: "Why not rely on AIS for collision avoidance?", a: "AIS data can be missing, wrong or delayed, and not every vessel transmits. Use radar and a proper lookout.", topic: "Radar" },
  { q: "What is a date-dependent object?", a: "An ENC object valid only for certain dates, like a seasonal buoy. Set the date range when checking the route.", topic: "ECDIS" },
  { q: "What is the PIQ?", a: "The Pre-Inspection Questionnaire: the operator's declaration about the ship. Inspectors check it against what they see.", topic: "PIQ accuracy" },
  { q: "Your answer framework in a SIRE 2.0 interview?", a: "Fact, Procedure, Record: say the fact, show where the SMS covers it, then show the record that proves it's done.", topic: "Documents & SMS" },
]

// ---- How the day usually runs (from debriefs)
export const DAY_TIMELINE = [
  { stage: "Gangway", time: "Arrival", detail: "The inspector may ask the duty AB what operation is going on.", src: "Manzanillo, Oct" },
  { stage: "Opening meeting", time: "First", detail: "Master, chief engineer, chief officer and second engineer.", src: "Toamasina, Sep" },
  { stage: "Master's cabin", time: "Up to 3 hrs", detail: "Certificates, SMS procedures, audits, rest hours and drills.", src: "Antwerp, Shell" },
  { stage: "Bridge", time: "1.5–2 hrs", detail: "Equipment tests, ECDIS and radar settings, UKC, passage plan.", src: "Durres, ENOC · Fujairah" },
  { stage: "Deck, cargo, engine", time: "Varies", detail: "Equipment condition, records and crew interviews.", src: "Toamasina, BP" },
  { stage: "Closing meeting", time: "End", detail: "Observations are read out. The operator then has 14 days to comment on the report.", src: "Industry guidance" },
]

// ---- Flat question bank
export interface BankQ { id: string; q: string; topic: Topic; source: string; rank?: string; date: string }
export const BANK: BankQ[] = DEBRIEFS.flatMap((d) =>
  d.questions.map((q, i) => ({
    id: `${d.id}-${i}`,
    q: q.q,
    topic: q.topic,
    rank: q.who || d.rank,
    date: d.date,
    source: `${d.major ? d.major + " · " : ""}${d.port === "Port not stated" ? d.country || "Port n/s" : d.port} · ${fmtDate(d.date)}`,
  }))
)

export const RANK_NAMES: Record<string, string> = { Master: "Master", "C/O": "Chief Officer", "2/O": "Second Officer", "3/O": "Third Officer", "C/E": "Chief Engineer" }
export const SHIP_TYPES = ["Crude", "Product", "Chemical", "Gas"]
