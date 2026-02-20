# HN Showcase — Benchmark Candidate Set
*Prepared: 2026-02-20 | Independently verified by J against live projects*

All 15 entries were evaluated by reading the actual project (GitHub README, live site, or App Store listing), not from DB descriptions. Notes flag disagreements with the original DB rating.

---

## GEM (3)

**Post 46994974** — *Show HN: YOR – open-source bimanual mobile robot for <$10k*
> Open-source bimanual mobile manipulator: omnidirectional base, two 6-DoF arms, telescopic lift, onboard Jetson + ZED for SLAM. Validated on whole-body control and bimanual tasks. Under $10k, vs $50k+ proprietary alternatives.
**Why gem:** Genuine hardware category disruption. Replaces proprietary systems not with software but with a fully open-source build list. "Why didn't this exist?" energy. You'd send this to any engineer who builds robots or thinks about them.

**Post 47014500** — *Show HN: Sameshi – a ~1200 Elo chess engine that fits within 2KB*
> Full chess engine (Negamax + alpha-beta pruning, 120-cell mailbox board) in a single 1.95KB header file. Elo measured over 240 automated games against Stockfish using proper logistic formula.
**Why gem:** Pure demoscene-grade constraint craft. Any programmer shares this regardless of whether they play chess. The Elo measurement methodology is rigorous, not hand-waved.

**Post 47088108** — *Show HN: Open-source MCP servers making every country's law searchable by AI*
> 20+ Apache 2.0 MCP servers sourcing real statutory text from official government databases (wetten.overheid.nl, gesetze-im-internet.de, legislation.gov.uk, etc.). AI queries server → retrieves exact article text → cites real source. 15 countries + 49 EU regulations live.
**Why gem:** Solves a genuine AI hallucination failure mode (legal questions) with real infrastructure. Zero-to-one: before this, AI either hallucinated law or said "consult a lawyer." ⚠️ *Note: Built by Ansvar AI, a commercial compliance startup — the MCP servers are their open-source component. Real and working, but not a solo hacker project.*

---

## BANGER (3)

**Post 47040375** — *Show HN: Free Alternative to Wispr Flow, Superwhisper, and Monologue* (276 pts)
> macOS app: hold Fn to dictate, AI pastes into active text field. Context-aware — reads active app name/email thread to spell names correctly. Uses Groq API for <1s latency. Free. Open-source. No server, no data retention.
**Why banger:** Replaces three $10/month SaaS tools with a free, open-source weekend build that matches the flagship feature (Deep Context). Verified working from README. Honest about tradeoff (Groq API vs local models). Clear "oh that's good, and it's free."

**Post 47022745** — *Show HN: Pangolin: Open-source identity-based VPN (Twingate/Zscaler alternative)* (81 pts)
> WireGuard-based ZTNA: resource-centric model (expose specific apps/SSH/CIDR ranges, not flat device network). NAT hole-punching for peer-to-peer (no central relay). Browser-based access + native clients. AGPLv3. On DigitalOcean Marketplace. Cloud offering live at app.pangolin.net.
**Why banger:** Real architectural insight: Tailscale = device-centric flat network (ACL complexity at scale). Zscaler = central relay (latency). Pangolin = resource-centric P2P. Genuine differentiation, real product with live cloud offering. Not a gem because enterprise networking is a known, well-funded category.

**Post 47019133** — *Show HN: Off Grid – Run AI text, image gen, vision offline on your phone* (124 pts)
> Android + iOS app: text gen (llama.cpp, 15-30 tok/s, any GGUF), image gen (Stable Diffusion, Snapdragon NPU at 5-10s), vision AI (Qwen3-VL/SmolVLM), voice (Whisper), document analysis. All on-device, nothing leaves phone. MIT licensed. On Google Play.
**Why banger:** Not just a chat wrapper — genuinely comprehensive offline AI suite with hardware-accelerated inference on both platforms. Real performance benchmarks. On Google Play, actually ships. ⚠️ *Borderline gem: the combination of ALL modalities in one offline app hasn't been done this completely. Not upgraded because "local LLM mobile apps" is a known category even if none match this scope.*

---

## SOLID (3)

**Post 47075124** — *Show HN: Micasa – track your house from the terminal* (568 pts)
> Go TUI for home management: maintenance schedules, appliances, incidents, vendors, quotes, file attachments — all in a single SQLite file. Vim-style modal UI (nav/edit modes), multicolumn sort, fuzzy-jump to columns. Verified: real product with strong landing page, cross-platform binaries.
**Why solid:** Clearly thought through keyboard workflows, privacy-first, actually useful if you have the problem. One interesting angle: VisiData-inspired modal TUI for a domain (home management) that usually lives in notes apps. Not banger because the audience is narrow (terminal users who own property).

**Post 47011567** — *Show HN: SQL-tap – Real-time SQL traffic viewer for PostgreSQL and MySQL* (232 pts)
> Transparent proxy daemon that parses the native wire protocol. TUI + web client. Inspect queries, view transactions, run EXPLAIN on any captured query. No application code changes — just change the port. Homebrew installable, Docker examples included.
**Why solid:** One clear clever angle: native wire protocol parsing means genuinely zero code changes. Real tool, ships today. Not banger because "SQL query inspector" is a solved category (Datadog, pgAdmin, Rails query log). The no-code-changes angle elevates it to solid.

**Post 47072863** — *Show HN: An encrypted, local, cross-platform journaling app* (124 pts)
> AES-256-GCM encryption with X25519 key-file auth (add/remove auth methods without re-encrypting entries — O(1) key wrapping). Zero network. Tauri + SolidJS + Rust. Imports from Day One, jrnl. Calendar UI, themes, statistics, auto-backup. Verified: full-featured, actively maintained.
**Why solid:** Real crypto implementation with genuinely clever key management design. Thoughtful rebuild of an unmaintained predecessor (Mini Diary). Not banger because local journaling apps are a crowded category and this doesn't do anything most secure journaling tools don't do — it just does it correctly.

---

## MID (3)

Each mid illustrates a different failure pattern.

**Post 47025220** — *Show HN: DSCI – Dead Simple CI* (19 pts)
> CI pipeline framework: use regular programming languages (Bash, Raku, Python) instead of YAML. Integrates with Gitea/Forgejo/GitLab via webhooks. Go-based runner, multi-language SDKs. 23 stars, 0 forks.
**Why mid:** Real project, real commits, real integrations. But it competes directly with Drone, Woodpecker, Jenkins, GitLab CI — all of which also support non-YAML scripting via plugins. "No YAML" isn't a moat. Niche audience (self-hosted VPS devops), zero adoption signal. Competent but not differentiated. *Pattern: built something real in a crowded space with no compelling reason to choose it.*

**Post 47036063** — *Show HN: Maths, CS and AI Compendium* (88 pts)
> 10-chapter open textbook: vectors, matrices, calculus, stats, probability, ML, NLP. Intuition-first voice. Used by candidates who got into DeepMind/OpenAI. Well-structured Markdown files on GitHub.
**Why mid:** Genuine effort, real content, clearly thought about pedagogy. But it's static Markdown files — no runnable notebooks, no exercises, no interactive demos, no auto-grading. Dozens of similar GitHub repos exist (Mathematics for ML, CS229 notes, etc.). Useful as a reference but not curated enough to share unprompted. *Pattern: useful educational content, good curation, but "reference" ≠ "product worth curating."*

**Post 47041288** — *Show HN: Deep Research for Flights* (14 pts)
> Type a messy travel plan in natural language ("I want to go from NYC to Tokyo sometime in March, flexible on dates"). AI converts to structured flight searches. No affiliate links. Clean interface.
**Why mid:** Pleasant UX for a real friction point. But Google Flights flex dates, Kayak Explore, and Skyscanner all handle flexible natural-language-ish searches. No evidence of better data, cheaper results, or novel routing. "AI-powered search UX" on a fully-solved problem with no demonstrable edge. *Pattern: AI wrapper on a problem incumbents already solve, no differentiated data or algorithm.*

---

## PASS (3)

**Post 46978700** — *Show HN: NOOR – A Sovereign AI developed on a smartphone under siege in Yemen*
> "I have successfully built and encrypted the core logic for NOOR — a decentralized and unbiased AI system. My Goal: To secure $400 for a laptop development station." Crypto wallet address in post. No code, no demo, no verifiable output.
**Why pass:** Compelling narrative, zero technical substance. A $400 crypto fundraiser with vague claims about "encrypted truth protocols" running in Termux. *Pattern: emotional story as a substitute for a project.*

**Post 47031605** — *Show HN: Free Browser-Based Dev Tools (No Signup, Client-Side)* (2 pts)
> 9 tools on separate GitHub Pages: JSON Formatter, Regex Tester, Base64 Encoder/Decoder, URL Encoder/Decoder, Hash Generator, Color Picker, Lorem Ipsum Generator, JWT Decoder, Unix Timestamp Converter. Client-side, no signup.
**Why pass:** Every one of these tools exists on CyberChef, in browser DevTools, and on 50 other static sites. No chaining, no advanced features, no novel UX. "Weekend project to scratch my own itch" — the itch is already scratched by better-maintained tools. *Pattern: functional project with zero differentiation from free dominant alternatives — the hardest pass to spot.*

**Post 47057956** — *Show HN: Free printable micro-habit tracker inspired by Atomic Habits* (13 pts)
> Type habits, pick month, click Print. No signup, no ads. Generates a printable monthly checkbox calendar.
**Why pass:** Works fine. But a Google Sheets template, a Notion calendar, or a piece of paper does this identically. Nothing to curate — no interesting technical choice, no novel UX, no community angle. *Pattern: single-gimmick utility — one thing, done adequately, that any spreadsheet already does.*

---

## Summary of changes from initial draft
- **Mids replaced (all 3):** Jemini (news-tied), Wildex (derivative but unclear pattern), Price Per Ball (good but weak) → DSCI, Maths Compendium, Deep Research for Flights (cover 3 distinct mid patterns)
- **Pass replaced (1):** 2D platformer (upgraded to mid — real methodology, playable game, replicable agent engineering pattern) → Free Browser-Based Dev Tools
- **GEM flag added:** Open Law MCP is a commercial startup's OSS component
- **BANGER flag added:** Off Grid is borderline gem territory

*Total: 15 posts across 5 tiers. All independently verified against live projects.*
