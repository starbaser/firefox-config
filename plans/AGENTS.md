# Planning: dossiers and code packets

These are working instructions for owner-invoked epics. Apply them when creating,
discussing or continuing an epic; ordinary work does not require planning files.
The owner can request the work conversationally. No pasted prompt is required.

An epic lives at `plans/issues/<epic>/README.md`, relative to the project root.
Use a descriptive name and let the subject determine the document structure.
Read the relevant dossier before continuing its work. Dossiers and packets are
records of design and evidence; current direction and verified source govern
when those records are stale.

## Dossier

The README is the owner's main place to understand, challenge and shape the
architecture. Explain the problem, mechanisms, consequences and consequential
alternatives with enough depth to reason about the implementation. Use examples,
code, algorithms and diagrams, including UML, where they improve understanding.
There are no required dossier headings or length targets.

Orient through the project guide and relevant documentation, then inspect the
source and evidence behind consequential claims, including first-party
dependencies. Distinguish observed behavior, intended behavior and uncertainty.
Explain the contracts, ownership, data flow and failure behavior that matter,
and how the result will be demonstrated. Investigate uncertain mechanisms as
part of developing the design.

Preserve consequential decisions and their reasons where they explain the
architecture. Distinguish owner decisions, architect recommendations and open
questions. Summarize faithfully; quote when exact wording matters. Retain
meaningful changes of direction and why they occurred. Do not infer agreement
from silence or attribute reasoning to the owner that they did not give.
Active notes and unresolved questions may remain in the dossier while the
design develops. Bring material owner choices back with a recommendation.

## Code packets

Once direction is agreed, the architect acts as the code exemplar. Use the
highest-capability architect selected for the session to solve the implementation
up front and write a substantial code guide that smaller implementing models,
such as Luna or Terra, can carry through. Cover as much of the agreed work as
current source, investigation and foresight allow, including the downstream
connections needed to make the pieces work together.

Write the code intended to become production source in Markdown code blocks:
complete algorithms and function bodies, concrete schemas and types, classes,
modules or entire files wherever they can already be worked out. Carry the
implementation through its difficult control flow, state transitions, ownership,
failure handling and integration. An outline, interface inventory, signature
skeleton or TODO list is insufficient when the architect can supply the code.
Do not leave the central problem to a helper whose name merely restates the task.

Interleave substantial code sections with explanations of what they do, why the
design works, where the code belongs, which existing mechanisms it reuses or
replaces, and how the sections connect. Explain consequential choices and edge
cases at the point an implementer needs them. Supply concrete test code, fixtures
and expected behavior as far as they can be worked out, especially where the
test itself requires design. Link shared architectural reasoning and exact reuse
sources; include the local explanation needed to apply them correctly.

Packets serve the implementing model and have no obligation to be convenient
for the owner to inspect. Optimize for faithful implementation by a less capable
model; do not compress away code or reasoning to make a packet look concise.
There is no length quota or prescribed form. Choose useful sections and file
boundaries: packets may live in the dossier, one companion file or several files
beside it. Algorithms, UML and other diagrams are useful when they clarify the
implementation; they complement the code.

Make independent pieces easy to delegate in parallel. Establish shared types
and interfaces, identify concrete source ownership and dependencies, and explain
which pieces can proceed together and where integration must wait. Give a worker
enough code, context and behavioral completion criteria to implement its part
without redesigning adjacent parts. Keep inseparable decisions with the architect;
packet boundaries need not correspond one-to-one with workers or fixed models.

Identify the inspected source basis, including relevant working changes, and
distinguish existing source from proposed code. Verify the APIs being used and
work through foreseeable design questions during authoring. When evidence or a
real dependency limits foresight, name the unresolved point and what will resolve
it; do not invent certainty or hide it in pseudocode. Routine imports, repetitive
plumbing and source-dependent adjustments may remain with implementers when
their intended behavior is clear. Explain any substantive omission.

Packet authoring puts the implementation in the guide; it does not itself apply
that implementation to production files. State which excerpts or mechanisms were
actually checked, and never imply that proposed code compiled or passed tests
without that evidence. Implementers adapt mechanical details to current source
and verify behavior; discrepancies that change agreed behavior or architecture
come back with evidence and a recommendation. Existing session scope and
authorization determine whether implementation follows authoring; packets create
no new approval gates or implementation authority.

## Continuing the work

The dossier owns the epic's current assessment: what has landed, what evidence
demonstrates, its limits and what remains. Update it when a finding, decision,
landing or handoff changes what someone needs to understand or do next. Link
detailed evidence when useful and keep the architectural account easy to find.

Revise affected packets when the design changes. After implementation, link to
the result and mark supersession where an old packet would mislead; production
source owns subsequent code changes. Completed epics may remain at stable paths
with a closing assessment. Git preserves revisions.

Keep navigation in the project's existing documentation map. A separate rules
file, checkpoint, roadmap, execution ledger, issue forms or archive is optional;
add a document only when it has a useful purpose of its own. Keep these standing
instructions separate from the epic's changing task state.
