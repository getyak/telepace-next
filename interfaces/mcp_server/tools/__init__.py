from interfaces.mcp_server.tools.ask_followup import ask_followup
from interfaces.mcp_server.tools.create_campaign import create_campaign
from interfaces.mcp_server.tools.get_campaign_insights import get_campaign_insights
from interfaces.mcp_server.tools.get_campaign_progress import get_campaign_progress
from interfaces.mcp_server.tools.push_insights import push_insights

TOOL_HANDLERS = {
    "create_campaign": create_campaign,
    "get_campaign_progress": get_campaign_progress,
    "get_campaign_insights": get_campaign_insights,
    "ask_followup": ask_followup,
    "push_insights": push_insights,
}

__all__ = [
    "TOOL_HANDLERS",
    "ask_followup",
    "create_campaign",
    "get_campaign_insights",
    "get_campaign_progress",
    "push_insights",
]
