from interfaces.mcp_server.tools.ask_followup import ask_followup
from interfaces.mcp_server.tools.create_campaign import create_campaign
from interfaces.mcp_server.tools.dispatch_invites import dispatch_invites
from interfaces.mcp_server.tools.get_campaign_insights import get_campaign_insights
from interfaces.mcp_server.tools.get_campaign_progress import get_campaign_progress
from interfaces.mcp_server.tools.list_campaigns import list_campaigns
from interfaces.mcp_server.tools.push_insights import push_insights
from interfaces.mcp_server.tools.refine_outline import refine_outline
from interfaces.mcp_server.tools.start_campaign import start_campaign

TOOL_HANDLERS = {
    "create_campaign": create_campaign,
    "get_campaign_progress": get_campaign_progress,
    "get_campaign_insights": get_campaign_insights,
    "ask_followup": ask_followup,
    "push_insights": push_insights,
    "list_campaigns": list_campaigns,
    "refine_outline": refine_outline,
    "start_campaign": start_campaign,
    "dispatch_invites": dispatch_invites,
}

__all__ = [
    "TOOL_HANDLERS",
    "ask_followup",
    "create_campaign",
    "dispatch_invites",
    "get_campaign_insights",
    "get_campaign_progress",
    "list_campaigns",
    "push_insights",
    "refine_outline",
    "start_campaign",
]
