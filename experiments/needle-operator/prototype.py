"""Isolated Needle 3 -> Operator routing experiment.

No production actions are performed. Tools return mock/read-only data only.
Telemetry is disabled before importing Needle.
"""

import os

os.environ.setdefault("NEEDLE_TELEMETRY", "0")
os.environ.setdefault("DO_NOT_TRACK", "1")

import needle


@needle.tool
def operator_status() -> dict:
  """Read a small local Operator status snapshot."""
  return {
    "operator": "available",
    "mode": "prototype",
    "production_actions": False,
  }


@needle.tool
def open_portal_route(route: str) -> dict:
  """Propose opening a safe 3DVR Portal route.

  Args:
    route: Portal-relative route such as /operator/ or /pocket-window/.
  """
  return {"proposed_route": route, "executed": False}


@needle.tool
def escalate_to_operator(request: str, reason: str = "needs broader reasoning") -> dict:
  """Escalate a request to full Operator instead of guessing locally.

  Args:
    request: The user's original request.
    reason: Why local Needle should hand the request off.
  """
  return {
    "escalate": True,
    "request": request,
    "reason": reason,
    "executed": False,
  }


def main() -> None:
  agent = needle.Needle(
    tools=[operator_status, open_portal_route, escalate_to_operator],
    system="device: 3dvr-edge; assistant: Operator edge router",
    generation=3,
  )

  print("3DVR Needle edge prototype. Ctrl-C to exit.")
  while True:
    try:
      query = input("> ").strip()
    except (EOFError, KeyboardInterrupt):
      print()
      break

    if not query:
      continue

    response = agent.run(query, max_steps=4, strict=True)
    print(response)


if __name__ == "__main__":
  main()
