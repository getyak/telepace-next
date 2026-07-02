"""Handler agents that implement command-specific side effects.

These conform to the `harness.orchestrator.Agent` protocol and are registered
in the Harness agents map alongside the core LLM-driven agents.
"""

from harness.handlers.dispatch_handler import DispatchHandler

__all__ = ["DispatchHandler"]
