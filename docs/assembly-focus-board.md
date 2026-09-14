# Assembly Focus Board

The Assembly Focus Board is a derived **Now / Next / Waiting** view over existing Assembly records. It does not create a second task system or store its own workflow state.

## Derivation

**Now** shows at most three open commitments, ordered first by due date and then by creation time. The small limit is intentional: the view is for attention, not exhaustive project management.

**Next** contains the remaining open commitments plus any initiative that currently has no open commitment. An initiative without active work appears as “Needs a next commitment.”

**Waiting** contains unresolved decisions and open needs. These are the records most likely to require a choice, answer, resource, or another person before movement can continue.

## Source of truth

The board reads the same browser-local Assembly state used by People, Teams, Initiatives, Commitments, Decisions, Needs, and Offers. It never writes to local storage.

When Assembly records change, the focus UI recalculates from canonical state. Imported workspaces and changes from another browser tab are recalculated the same way.

## Design boundary

Now / Next / Waiting is a view, not a new status field. If the organization later needs explicit workflow states, those should become part of the canonical work contract rather than silently emerging inside this dashboard.
