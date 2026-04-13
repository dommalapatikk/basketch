# Engineering Thought Leaders Research

Deep research on 26 engineering thought leaders, their principles, and how they apply to basketch (React + Supabase + TypeScript/Python data pipeline).

---

## Category 1: System Design & Architecture

### Martin Fowler
*Enterprise architecture, refactoring, microservices, testing*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **The Two Hats** | At any moment you are either adding behavior or restructuring code — never both at the same time |
| 2 | **Preparatory Refactoring** | First refactor so the change is easy, then make the easy change |
| 3 | **Rule of Three** | Tolerate duplication twice. The third time, extract an abstraction |
| 4 | **Code Smells** | Long Function, Feature Envy, Shotgun Surgery, Primitive Obsession, Data Clumps — signals that code needs restructuring |
| 5 | **MonolithFirst** | Almost all successful microservice stories started with a monolith. Start monolithic, split only when forced |
| 6 | **Strangler Fig Pattern** | Gradually replace parts of an old system by routing new functionality to a new system |
| 7 | **TestPyramid** | Many unit tests (fast), fewer integration tests, very few E2E tests (slow) |
| 8 | **Mocks Aren't Stubs** | Prefer fakes (working lightweight implementations) over mocks. Overusing mocks leads to tests that pass but don't verify real behavior |
| 9 | **Sacrificial Architecture** | Design knowing it will be replaced. Protect data and domain logic; treat the UI as disposable |
| 10 | **YAGNI** | Don't build features or abstractions based on predicted future needs |
| 11 | **Trunk-Based Development** | Short-lived branches (max 1-2 days). No long-lived branches. Integrate to main at least daily |
| 12 | **Technical Debt Quadrant** | Only Prudent-Deliberate debt is acceptable: "Ship now, refactor before next feature" |
| 13 | **Evolutionary Architecture** | Architecture should evolve incrementally, guided by fitness functions (automated checks) |
| 14 | **Repository Pattern** | Wrap all database calls behind a collection-like interface. Components never call the database directly |
| 15 | **Conway's Law** | Organizations design systems that mirror their communication structures. One team = one system |

**Source:** *Refactoring* (1999/2018), *PoEAA* (2002), martinfowler.com, conference talks

---

### Alex Xu (ByteByteGo)
*System design, scaling, API patterns, capacity planning*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **4-Step Design Framework** | (1) Understand scope, (2) High-level design, (3) Deep dive on 2-3 hardest parts, (4) Wrap up with bottlenecks and failure modes |
| 2 | **Cache-Aside Pattern** | Check cache first, on miss read from DB and write to cache. TTL is the simplest invalidation strategy |
| 3 | **Vertical First Scaling** | Bigger machine → Read replicas → Sharding. Sharding is last resort |
| 4 | **Cursor Pagination** | Cursor-based pagination over offset-based. Offset breaks when rows change between pages |
| 5 | **Idempotent Writes** | POST requests should include idempotency keys. Use UPSERT to prevent duplicates on retry |
| 6 | **Back-of-Envelope Estimation** | DAU × actions ÷ 86,400 = QPS. Match infrastructure to actual load, not imagined load |
| 7 | **SQL vs NoSQL Decision** | SQL when: relationships matter, need JOINs, schema well-defined. NoSQL when: document-shaped, need horizontal scaling at massive scale |
| 8 | **Rate Limiting (Token Bucket)** | Simple, memory-efficient, allows bursts. Default choice for client-side API rate limiting |

**Source:** *System Design Interview* Vol 1 & 2, ByteByteGo YouTube, newsletter

---

### Milan Jovanovic
*Clean Architecture, modular monolith, domain-driven design*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **Dependencies Point Inward** | Business rules never import frameworks. Infrastructure wraps around domain, never the reverse |
| 2 | **Modular Monolith** | Service boundaries without distributed systems overhead. Each module has own types, tables, explicit interfaces |
| 3 | **Use Cases as Organizing Principle** | Organize by feature/use-case, not by technical layer |
| 4 | **Explicit Contracts at Boundaries** | Every module exports a defined interface. Other modules cannot reach past it |
| 5 | **Ubiquitous Language** | One concept, one name, everywhere — table, type, endpoint, component |

**Source:** Blog, YouTube, Clean Architecture courses

---

## Category 2: Observability & Operations

### Charity Majors
*Observability, progressive delivery, MTTR, engineering culture*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **Observability ≠ Monitoring** | Monitoring tells you WHEN; observability lets you understand WHY for problems you've never seen before |
| 2 | **Wide Structured Events** | One rich event per request/operation with 50-200 fields. Replaces scattered logs and pre-aggregated metrics |
| 3 | **Testing in Production** | Pre-production catches known bugs; production is where you discover unknown-unknowns. Build tooling for safe exposure |
| 4 | **Staging Is Dead** | Staging drifts, gives false confidence. Invest in safe prod deploys instead |
| 5 | **High Cardinality + Dimensionality** | Debug by any field combination (user_id, deploy_sha, feature_flag). Traditional metrics systems can't do this |
| 6 | **Progressive Delivery** | Deploy to 1% → watch instrumentation → widen. Separate deploy (shipping code) from release (enabling features) |
| 7 | **MTTR Over MTBF** | Fast recovery beats failure prevention. Small frequent deploys reduce blast radius |
| 8 | **You Build It, You Run It** | Engineers who write code own it in production. Pain in production drives better design |
| 9 | **Blameless Postmortems** | "What did the system allow to happen?" not "who screwed up?" Focus on systemic improvements |

**Source:** charity.wtf, *Observability Engineering* (O'Reilly 2022), Honeycomb blog, QCon/SREcon talks

---

### Bryan Cantrill
*Systems programming, observability, engineering values*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **Observability Is the Foundation** | Instrumentation and logging are designed in from the start, as core as business logic |
| 2 | **Rigor in the Small** | Sloppy error handling in one function becomes a production outage at scale. Every function boundary is a contract |
| 3 | **Values Drive Decisions** | Name your engineering values explicitly (correctness, debuggability, simplicity, performance) and prioritize them |
| 4 | **Debuggability by Design** | When a system fails, can you determine WHY from its artifacts? If you need to reproduce it, your system is insufficiently debuggable |

**Source:** DTrace talks, Oxide Computer talks, conference presentations

---

### Cindy Sridharan
*Distributed systems observability, monitoring, testing*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **Three Pillars: Logs, Metrics, Traces** | Logs = what happened. Metrics = how much. Traces = the path. You need all three |
| 2 | **Alert on Symptoms, Not Causes** | Alert on "error rate > 1%" not "CPU > 80%". Users don't care about CPU |
| 3 | **Request ID = Free Tracing** | A requestId in every log line gives you distributed tracing without Datadog |

**Source:** *Distributed Systems Observability* (O'Reilly), blog posts

---

## Category 3: Software Craftsmanship

### Linus Torvalds
*Code quality, data structures, simplicity*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **"Good Taste" in Code** | Elegant code eliminates special cases through better structure. If your code has a special case, you have the wrong abstraction |
| 2 | **Data Structures First** | "Bad programmers worry about the code. Good programmers worry about data structures." Get the data model right; the code follows |
| 3 | **Simplicity Over Cleverness** | Complexity is a bug, not a feature. The correct solution is the simplest one that works |
| 4 | **Abstractions Must Earn Their Keep** | A bad abstraction is worse than no abstraction. It hides the wrong things and forces you to fight it |
| 5 | **Release Early, With Discipline** | Ship working increments constantly, but never ship something you know is broken |
| 6 | **Strong Opinions, Updated by Evidence** | Commit to decisions. Change only on concrete evidence, not vibes |

**Source:** TED Talk (2016), Google Tech Talk on Git (2007), LKML archives, interviews

---

### Robert C. Martin (Uncle Bob)
*SOLID principles, Clean Code, Clean Architecture*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **SOLID Principles** | Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion |
| 2 | **Boy Scout Rule** | Always leave the code cleaner than you found it |
| 3 | **Clean Architecture (Dependency Rule)** | Dependencies point inward. Business logic never depends on frameworks, UI, or databases |
| 4 | **Functions Do One Thing** | If you can extract a meaningful sub-step, the function does more than one thing |
| 5 | **Meaningful Names Over Comments** | Code should be self-documenting through precise naming. Comments explain WHY, not WHAT |

**Source:** *Clean Code* (2008), *Clean Architecture* (2017), blog posts

---

### Kent Beck
*TDD, Extreme Programming, simple design*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **Red-Green-Refactor** | Write failing test → make it pass with simplest code → refactor. Never skip the refactor |
| 2 | **Four Rules of Simple Design** | (1) Passes tests, (2) Reveals intention, (3) No duplication, (4) Fewest elements — in priority order |
| 3 | **Make It Work, Make It Right, Make It Fast** | Correctness → clean design → performance. Never optimize before the code is correct |
| 4 | **YAGNI** | Do not build until you have a concrete, immediate need. Speculative generality is waste |
| 5 | **Continuous Integration** | Integrate to main multiple times per day. Small, frequent merges prevent integration hell |

**Source:** *TDD By Example* (2002), *Extreme Programming Explained* (2004), talks

---

### Sandi Metz
*Practical OOP, composition, abstraction discipline*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **Sandi Metz's Rules** | Classes ≤ 100 lines, methods ≤ 5 lines, ≤ 4 parameters, controllers instantiate 1 object |
| 2 | **Flocking Rules** | Find most alike things → find smallest difference → make smallest change to remove it. Repeat |
| 3 | **Composition Over Inheritance** | Objects collaborate through interfaces, not parent-child hierarchies |
| 4 | **"Duplication > Wrong Abstraction"** | It is better to have duplicated code than an abstraction that doesn't fit |
| 5 | **Message-Oriented Design** | Design around behavior ("What message should I send?") not data ("What data do I need?") |

**Source:** *POODR* (2012), *99 Bottles of OOP* (2018), conference talks

---

## Category 4: Systems & Reliability

### Werner Vogels
*Distributed systems, failure design, API philosophy*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **"Everything Fails All the Time"** | Design every system assuming any component can fail at any moment |
| 2 | **You Build It, You Run It** | The team that builds a service operates it in production. Pain drives better design |
| 3 | **APIs Are Forever** | Once public, an API cannot be changed without breaking consumers. Design for permanence |
| 4 | **Two-Pizza Teams (applied to modules)** | Modules should be small enough that one person can understand them completely |
| 5 | **Primitives, Not Frameworks** | Small composable utilities over opinionated frameworks. Primitives combine in ways designers never anticipated |

**Source:** Amazon blog, re:Invent keynotes, interviews

---

### Kelsey Hightower
*Cloud native, infrastructure simplicity, developer experience*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **Eliminate Complexity, Don't Abstract It** | The best infrastructure is infrastructure you don't run. Remove layers before automating them |
| 2 | **No Code Is Best Code** | Every line is a liability. Achieve through configuration or existing services rather than custom code |
| 3 | **Developer Experience = Product Requirement** | If deploying is painful, people deploy less. git clone → running locally in ≤ 3 commands |
| 4 | **Automate Toil, Not Thinking** | Automate repetitive tasks (deploy, lint, test). Keep humans for judgment (migrations, architecture) |
| 5 | **Ship the Simplest Thing** | A monolith that ships beats microservices that don't |

**Source:** Conference talks, tweets, Kubernetes community contributions

---

### James Hamilton
*Infrastructure design, operations cost, failure recovery*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **Design for Operations** | Operational cost usually exceeds development cost. Design for operability first |
| 2 | **Automate Everything** | Any manual step will eventually be done wrong. Zero-command deploys, scripted migrations |
| 3 | **Design for Recovery, Not Prevention** | MTTR > MTBF. Make processing idempotent so re-running is always safe |
| 4 | **No Single Points of Failure** | Every critical path needs a fallback. Cache critical data for offline capability |

**Source:** AWS papers, blog posts on large-scale operations

---

## Category 5: Language & Framework Design

### Anders Hejlsberg
*Type systems, developer productivity, language evolution*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **Types Are Enforced Documentation** | A type system's primary job is self-documenting code that stays accurate as code changes |
| 2 | **Gradual Typing** | Allow untyped code to coexist with typed code, then tighten incrementally |
| 3 | **Don't Break Existing Code** | Add new columns with defaults, deprecate then remove. Never just remove |
| 4 | **Productivity and Safety Are Not Opposites** | A good type system makes you faster — autocomplete, refactoring, inline docs |

**Source:** TypeScript design notes, C# design talks, interviews

---

### Dan Abramov
*React philosophy, state management, component design*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **UI = f(state)** | UI should be a pure function of application state. Same state = same render |
| 2 | **Colocation** | Keep related code together. Don't hoist state higher than necessary |
| 3 | **Make Illegal States Unrepresentable** | Discriminated unions over multiple booleans. Eliminate impossible state combinations |
| 4 | **Absorb Complexity in the Right Place** | Custom hooks absorb complexity so components stay simple |
| 5 | **Progressive Disclosure** | Simple things simple, complex things possible. Easy defaults, escape hatches for advanced use |

**Source:** Overreacted blog, React docs, conference talks

---

### Rich Harris
*Compiler-first frameworks, reactivity, web performance*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **Frameworks Organize Your Mind** | The value of a framework is the mental model, not the code it ships |
| 2 | **Compile Away the Abstraction** | Anything the compiler can resolve at build time should not be resolved at runtime |
| 3 | **Accessibility Is Not Optional** | Semantic HTML, keyboard support, ARIA labels are build requirements, not nice-to-haves |

**Source:** "Rethinking Reactivity" talk, Svelte docs, Vercel blog

---

### Ryan Dahl
*Runtime design, event-driven architecture, explicit conventions*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **Foundational Decisions Are Hard to Change** | tsconfig, schema, folder structure — spend time getting them right. Retrofitting strict mode is painful |
| 2 | **Event-Driven / Non-Blocking** | Batch operations instead of synchronous loops. 1 round trip for 1000 records, not 1000 round trips |
| 3 | **Explicit Over Implicit** | Explicit imports, explicit permissions, no magic resolution. Read a file and understand it |
| 4 | **Standard APIs Over Custom Abstractions** | Use fetch over Axios, Web Streams over custom streaming, URL over custom parsers |

**Source:** "10 Things I Regret About Node.js" talk, Deno design docs

---

## Category 6: Web Performance

### Addy Osmani
*JavaScript performance, loading strategies, Core Web Vitals*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **The Cost of JavaScript** | JS is the most expensive resource byte-for-byte — must be downloaded, parsed, compiled, executed |
| 2 | **PRPL Pattern** | Push critical resources, Render initial route, Pre-cache remaining, Lazy-load on demand |
| 3 | **Core Web Vitals as Design Constraints** | LCP, INP, CLS are not post-launch metrics — they are design constraints to build against |
| 4 | **Import on Interaction** | Don't load code until the user interacts with the feature. Modal code loads on click, not page load |
| 5 | **Performance Budgets** | "Main bundle ≤ 150KB gzipped." Without a budget, performance degrades gradually and invisibly |

**Source:** *Learning JavaScript Design Patterns*, web.dev, Chrome DevRel blog

---

### Steve Souders
*Frontend performance, rendering optimization*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **80-90% of Response Time Is Frontend** | Biggest performance wins are in how you deliver and render assets, not in backend optimization |
| 2 | **Don't Block the Render** | Defer everything not needed for first paint. Analytics async, icons lazy-loaded, critical CSS inlined |

**Source:** *High Performance Web Sites* (2007), *Even Faster Web Sites* (2009)

---

### Ilya Grigorik
*Browser networking, TCP/TLS, HTTP/2, latency*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **Latency Is the Bottleneck** | Reduce sequential network requests. Promise.all() or single RPC over 5 sequential queries |
| 2 | **Every Byte Not Sent Is Fastest** | .select('id, name') not .select('*'). Filter server-side, not client-side |
| 3 | **Connection Reuse** | Single client instance (singleton). Preconnect to known origins |

**Source:** *High Performance Browser Networking*, Google performance talks

---

## Category 7: Engineering Leadership

### Will Larson
*Staff engineering, engineering management, systems thinking*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **Work on What Matters** | Avoid snacking (low-effort, low-impact), preening (high-visibility, low-impact), and chores that consume building time |
| 2 | **Systems Thinking** | Solving the same problem repeatedly = broken system. Fix the system, not the instance |
| 3 | **Technical Strategy as Documentation** | Write down decisions (ADRs). Unwritten strategy changes silently |
| 4 | **Finish What You Start** | 90%-complete = 0% useful. Ship incrementally but ship completely |

**Source:** *Staff Engineer* (2021), *An Elegant Puzzle* (2019), blog

---

### Pat Kua
*Technical leadership, architecture decisions*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **Tech Leads Are Multipliers** | Leverage comes from enabling others, not writing the most code |
| 2 | **Record Architecture Decisions** | Use lightweight ADRs. When someone asks "why?", point to the file |
| 3 | **Breadth of Influence** | Practice the "staff" habit: write conventions so anyone can be productive by reading, not asking |

**Source:** *Talking with Tech Leads*, ThoughtWorks blog, talks

---

### Camille Fournier
*Engineering management, time management, decision-making*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **Separate IC and Lead Hats** | Timebox architectural thinking separately from implementation time |
| 2 | **Reversibility as Decision Guide** | Easily reversible = decide fast. Hard to reverse = deliberate. CSS framework = fast. DB schema = careful |
| 3 | **Debug the System, Not the Person** | "What check would have caught this?" Add a test, type, lint rule, or DB constraint |

**Source:** *The Manager's Path* (2017), talks, blog

---

### Tanya Reilly
*Staff engineering, glue work, systems thinking*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **"Being Glue"** | Glue work (docs, CI/CD, onboarding, code review) holds projects together. Schedule it deliberately |
| 2 | **Compass, Not a Map** | Define principles ("We prioritize speed over features") that resolve hundreds of decisions without deliberation |
| 3 | **"Write the Document"** | When something is confusing or debated, write it down. The act of writing clarifies thinking |

**Source:** *The Staff Engineer's Path* (2022), "Being Glue" talk

---

## Category 8: Developer Experience

### Julia Evans
*Fundamentals, debugging, learning by doing*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **Understand the Fundamentals** | Before using a tool, understand what it does underneath. Run EXPLAIN ANALYZE, read the wire data |
| 2 | **Ask Specific Questions** | Replace "it's broken" with "What HTTP status came back? What query did the ORM send?" |
| 3 | **Experiments Over Documentation** | Write a 10-line script to test one assumption. Takes 2 minutes, gives certainty |
| 4 | **Make the Invisible Visible** | Log input shape, output shape, duration, decision branches. Visibility is the precondition for understanding |

**Source:** Wizard Zines, jvns.ca blog, conference talks

---

## Category 9: Security

### Troy Hunt
*Web security, OWASP, practical security*

| # | Principle | Summary |
|---|-----------|---------|
| 1 | **HTTPS Everywhere** | Every page, every API, every resource. No exceptions |
| 2 | **Don't Roll Your Own Auth** | Use Supabase Auth, not custom user/password tables. Use built-in JWT handling |
| 3 | **Validate Everything, Trust Nothing** | Server-side validation is mandatory. Client-side is UX courtesy, not security |
| 4 | **Security Is a Spectrum** | Start high-impact/low-effort: HTTPS, parameterized queries, secure headers, RLS |
| 5 | **Minimize Blast Radius** | Don't store data you don't need. Hash passwords. Have a deletion plan (GDPR) |

**Source:** troyhunt.com, Have I Been Pwned, Pluralsight courses

---

## Cross-Cutting Themes

These principles appear across multiple leaders:

| Theme | Who Says It | Applied Principle |
|-------|-------------|-------------------|
| **Simplicity first** | Torvalds, Beck, Metz, Hightower, Dahl | Start simple. Add complexity only when forced by real requirements |
| **Make failure visible** | Vogels, Cantrill, Majors, Sridharan, Hamilton | Every error should be logged, visible, and actionable |
| **Design for change** | Fowler, Martin, Metz, Vogels, Larson | Interfaces over implementations. Small modules. Explicit dependencies |
| **Measure then optimize** | Osmani, Souders, Grigorik, Sridharan | Don't guess. Use Lighthouse, DevTools, EXPLAIN ANALYZE |
| **Automate safety nets** | Beck, Hamilton, Hunt, Fournier | Tests, linting, type checking, RLS, CI/CD — every check is a bug prevented |
| **Data structures drive code** | Torvalds, Xu, Hejlsberg, Abramov | Get the data model right; the code follows naturally |
| **Duplication > wrong abstraction** | Metz, Fowler, Torvalds | Tolerate duplication until the real pattern emerges |
| **MTTR > MTBF** | Majors, Hamilton, Vogels | Fast recovery beats failure prevention |
| **Types as documentation** | Hejlsberg, Abramov, Cantrill | Type systems make code self-documenting and catch lies at compile time |
| **Ship small, ship often** | Torvalds, Fowler, Beck, Majors | Small increments with fast feedback loops |

---

## Master Engineering Checklist

Derived from all 26 thought leaders:

### Before Writing Code
- [ ] Data model defined first? (Torvalds)
- [ ] Scope bounded — what is NOT included? (Xu, Fowler)
- [ ] Simplest approach identified? (Beck, Torvalds, Hightower)
- [ ] Engineering values prioritized for this task? (Cantrill)
- [ ] Discriminated unions for state, not booleans? (Abramov)

### While Writing Code
- [ ] One function, one job? (Uncle Bob)
- [ ] Names self-documenting? (Uncle Bob)
- [ ] Two hats — not mixing feature + refactor? (Fowler)
- [ ] Types enforcing contracts? (Hejlsberg)
- [ ] Explicit imports, no magic? (Dahl)
- [ ] Standard APIs preferred over custom? (Dahl)
- [ ] select('columns') not select('*')? (Grigorik)
- [ ] Batch operations, not loops? (Grigorik, Dahl)
- [ ] Error handling at every boundary? (Cantrill)
- [ ] Structured logging with context fields? (Majors, Evans)

### Testing
- [ ] Test pyramid respected? Many unit, some integration, few E2E (Fowler)
- [ ] Fakes over mocks where possible? (Fowler)
- [ ] Edge cases from use cases covered? (Beck)
- [ ] Idempotent writes — safe to re-run? (Xu, Hamilton)

### Performance
- [ ] Core Web Vitals treated as design constraints? (Osmani)
- [ ] JS bundle size checked? (Osmani, Souders)
- [ ] Lazy loading for below-fold content? (Osmani)
- [ ] Sequential requests parallelized? (Grigorik)
- [ ] Preconnect to known origins? (Grigorik)

### Security
- [ ] HTTPS everywhere? (Hunt)
- [ ] Auth via Supabase, not custom? (Hunt)
- [ ] Server-side validation on all inputs? (Hunt)
- [ ] RLS enabled on all tables? (Hunt)
- [ ] No secrets in client-side code? (Hunt)

### Observability
- [ ] Structured events per request/operation? (Majors)
- [ ] High-cardinality fields included? (Majors)
- [ ] Health check endpoint? (Cantrill)
- [ ] Alerts on symptoms, not causes? (Sridharan)

### Before Shipping
- [ ] Self-review on the diff view? (Torvalds)
- [ ] Deploy and release decoupled? (Majors)
- [ ] Rollback path verified? (Hamilton)
- [ ] CI + deployment status checked? (Fowler)
- [ ] Performance budget not exceeded? (Osmani)

### After Shipping
- [ ] Deployment verified live? (Majors, Fowler)
- [ ] Error rate monitored? (Sridharan)
- [ ] If incident: blameless postmortem written? (Majors)
- [ ] If same bug class repeated: fix the system? (Larson)
