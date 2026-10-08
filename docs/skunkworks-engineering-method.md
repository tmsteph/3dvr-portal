# 3DVR Skunkworks Engineering Method

> Discover → Build → Break → Learn → Refine → Repeat.

## Principle
Requirements are hypotheses until tested against reality. Simulations verify models under assumptions; they do not prove that the assumptions, requirements, or problem framing are correct. Prefer small, reversible experiments that expose what we don't know.

## Two modes

### Garage mode — discovery
- State the problem, user outcome, assumptions, unknowns, and cheapest falsifiable test.
- Build the smallest useful prototype; mock external effects and isolate risky work.
- Test with real devices, people, workloads, and failure cases whenever practical.
- Record surprises, rejected assumptions, observed behavior, and revised requirements.
- Optimize for learning speed, not production polish.

### Production mode — reliability
- Promote a prototype only after defining acceptance criteria from evidence.
- Require security review, tests, observability, documentation, rollback, and ownership.
- Use staged/canary releases, measure actual behavior, and stop on unexpected failures.
- Keep credentials, customer systems, production data, and external messaging outside uncontrolled experiments.
- Human approval remains required for consequential actions.

## Experiment template
1. **Problem / desired outcome:** What user behavior should improve?
2. **Hypothesis:** What do we currently believe?
3. **Unknowns / risks:** What could make the requirement wrong?
4. **Smallest test:** What quick, safe experiment would disprove the hypothesis?
5. **Evidence:** What did simulation, field testing, or users actually show?
6. **Decision:** Iterate, pivot, discard, or promote?
7. **New requirements:** What did we learn that changes the specification?
8. **Production gate:** Tests, safety, security, monitoring, rollback, documentation.

## AI-agent working agreement
Agents should challenge unclear requirements constructively, propose a small experiment before extensive implementation, distinguish simulated results from real-world validation, and report uncertainty honestly. Never interpret “move fast” as permission to alter production, customer environments, or contact people without authorization.

## Example: Pocket Window
Hypothesis: camera-relative movement creates compelling depth. Prototype exaggerated parallax in the browser, test on real phones, observe reversed touch and distracting head tracking, revise interaction requirements, then harden the chosen input model before production.

## Default loop
**Explore cheaply. Validate physically. Ship responsibly. Learn continuously.**
