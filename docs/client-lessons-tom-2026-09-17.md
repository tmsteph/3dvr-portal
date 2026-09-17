# Tom Client Lessons — 2026-09-17

Tom is a useful real-world test case for how 3DVR should deliver AI-assisted technical services and how those services can evolve into products.

## Core lesson

Clients do not need “more AI.” They need a dependable operating layer that remembers the project, understands the infrastructure, reduces mistakes, keeps context intact, and quietly moves work forward.

That is the product direction.

## Service lessons

### 1. Sell outcomes, not AI
The client cares that the system is working, secure, understandable, documented, and recoverable. The specific model or agent should stay secondary to the result.

### 2. Price for value and efficiency
A short, high-value diagnostic can reveal or resolve meaningful risk quickly. Pure hourly billing can punish us for being efficient.

Prefer a structure such as:

1. Paid diagnostic / minimum engagement
2. Recommended remediation
3. Implementation
4. Verification
5. Optional recurring maintenance

Fixed milestones or minimum diagnostic fees should be favored when the outcome is more valuable than the time spent.

### 3. Fix-first beats endless discovery
Inspect enough to understand the system and the risks, then repair the highest-value issue, verify the result, and document what changed.

Discovery should serve action, not become the product.

### 4. Production work needs explicit gates
Default flow:

- read-only inspection first
- identify the exact change and expected effect
- obtain approval before material production changes
- make staged/reversible changes when possible
- verify after the change
- record rollback/recovery information

### 5. Access should be boring
Use least privilege. Avoid passwords or secrets drifting through chat, repos, notes, or screenshots. Prefer the client entering credentials directly where practical.

AI/tool access and authorization should be explicit and understandable.

### 6. Preserve one project context
Switching between assistants, terminals, chats, and tools can make the client feel lost even when the technical work is correct.

The Portal should maintain a persistent project state:

- what we found
- what changed
- what is currently true
- what is blocked
- what needs approval
- what happens next

The client should not have to reconstruct project memory.

### 7. Communication automation needs validation
Before sending client-facing messages:

- read the latest thread
- compare the draft against the client's actual request
- validate dates, times, names, and commitments
- check that another reply has not already been sent
- only then send

This should become a reusable outbound-message safety gate.

### 8. Keep adjacent opportunities separate
Infrastructure consulting, automation consulting, and product ideas may teach each other, but they should remain separate offers unless combining them clearly benefits the client.

Avoid muddying a simple paid engagement with every related 3DVR idea.

## Product implications

Tom is a prototype user for the broader 3DVR personal/business operating layer.

A useful AI system for this kind of client should:

- remember the entire project history
- maintain structured state instead of relying on chat memory alone
- understand systems and access boundaries
- distinguish observation from authorization
- prevent duplicate or contradictory communication
- keep a durable action log
- surface a short “what happened / what next” view
- make recovery and handoff easy
- work across whichever model or agent is currently available

This directly reinforces the digital-organism / autobiographical-memory architecture: the system should know what it has done, why it did it, what changed as a result, and what remains unresolved.

## Reusable 3DVR service loop

**Observe → Diagnose → Propose → Approve → Fix → Verify → Record → Follow up**

Every stage should leave behind enough structured state that another agent, another device, or a future session can continue without forcing the client to repeat the story.

## Business hypothesis to test

3DVR can start with practical AI-assisted technical services and progressively productize the repeated pieces.

Service work becomes:

- revenue
- customer discovery
- workflow training data
- reusable automation
- product requirements
- evidence for what should become recurring software

The goal is not to stay a consultancy forever. The goal is to use real client work to discover and build the dependable operating layer people will eventually subscribe to.
