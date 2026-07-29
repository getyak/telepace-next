"""Idempotently create telepace's Stripe billing objects (test or live mode).

Creates, reusing anything that already exists (matched by lookup_key /
meter event name):

  - one Billing Meter   `qualified_interview_overage`
  - product "telepace Pro"  → $79/mo base price   + $0.50/interview metered
  - product "telepace Team" → $249/mo base price  + $0.35/interview metered

Checkout only needs the *base* price ids (metered overage is attached to the
subscription by adding the metered price as a second line item at checkout —
we instead attach it here so both prices belong to one product and the
webhook-driven plan mapping stays simple; the base price alone is passed to
checkout and Stripe bills meter events against the customer).

Run:  uv run python scripts/stripe_bootstrap.py
Reads TELEPACE_STRIPE_SECRET_KEY from .env / env. Prints the env lines to
append to .env.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Allow running from repo root without installing the package.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from interfaces.rest_api.config import get_settings

METER_EVENT_NAME = "qualified_interview_overage"

PLANS = [
    {
        "kind": "pro",
        "product_name": "telepace Pro",
        "base_lookup": "telepace_pro_base",
        "base_amount": 7900,  # $79.00 / month
        "overage_lookup": "telepace_pro_overage",
        "overage_amount": 50,  # $0.50 / qualified interview beyond quota
    },
    {
        "kind": "team",
        "product_name": "telepace Team",
        "base_lookup": "telepace_team_base",
        "base_amount": 24900,  # $249.00 / month
        "overage_lookup": "telepace_team_overage",
        "overage_amount": 35,  # $0.35 / qualified interview beyond quota
    },
]


def main() -> None:
    import stripe

    settings = get_settings()
    secret = settings.stripe_secret_key or os.environ.get("TELEPACE_STRIPE_SECRET_KEY")
    if not secret:
        print("TELEPACE_STRIPE_SECRET_KEY not set (in .env or env). Aborting.")
        raise SystemExit(1)
    client = stripe.StripeClient(secret)

    # --- billing meter (shared by both metered prices) ----------------------
    meter_id = None
    for meter in client.billing.meters.list(params={"status": "active"}).auto_paging_iter():
        if meter.event_name == METER_EVENT_NAME:
            meter_id = meter.id
            print(f"meter exists: {meter.id} ({METER_EVENT_NAME})")
            break
    if meter_id is None:
        meter = client.billing.meters.create(
            params={
                "display_name": "Qualified interview overage",
                "event_name": METER_EVENT_NAME,
                "default_aggregation": {"formula": "sum"},
                "customer_mapping": {
                    "type": "by_id",
                    "event_payload_key": "stripe_customer_id",
                },
                "value_settings": {"event_payload_key": "value"},
            }
        )
        meter_id = meter.id
        print(f"meter created: {meter_id} ({METER_EVENT_NAME})")

    env_lines: list[str] = []
    existing_prices = {
        p.lookup_key: p
        for p in client.prices.list(
            params={"lookup_keys": [x for plan in PLANS for x in (plan["base_lookup"], plan["overage_lookup"])], "limit": 100}
        ).data
        if p.lookup_key
    }

    for plan in PLANS:
        base = existing_prices.get(plan["base_lookup"])
        if base is not None:
            product_id = base.product
            print(f"{plan['kind']}: base price exists {base.id}")
        else:
            product = client.products.create(
                params={
                    "name": plan["product_name"],
                    "metadata": {"telepace_plan": plan["kind"]},
                }
            )
            product_id = product.id
            base = client.prices.create(
                params={
                    "product": product_id,
                    "currency": "usd",
                    "unit_amount": plan["base_amount"],
                    "recurring": {"interval": "month"},
                    "lookup_key": plan["base_lookup"],
                    "metadata": {"telepace_plan": plan["kind"], "role": "base"},
                }
            )
            print(f"{plan['kind']}: created product {product_id} base price {base.id}")

        overage = existing_prices.get(plan["overage_lookup"])
        if overage is not None:
            print(f"{plan['kind']}: overage price exists {overage.id}")
        else:
            overage = client.prices.create(
                params={
                    "product": product_id,
                    "currency": "usd",
                    "unit_amount": plan["overage_amount"],
                    "recurring": {
                        "interval": "month",
                        "usage_type": "metered",
                        "meter": meter_id,
                    },
                    "lookup_key": plan["overage_lookup"],
                    "metadata": {"telepace_plan": plan["kind"], "role": "overage"},
                }
            )
            print(f"{plan['kind']}: created overage price {overage.id}")

        env_lines.append(f"TELEPACE_STRIPE_PRICE_{plan['kind'].upper()}={base.id}")
        env_lines.append(
            f"TELEPACE_STRIPE_PRICE_{plan['kind'].upper()}_OVERAGE={overage.id}"
        )

    print("\nAppend to .env:\n")
    for line in env_lines:
        print(f"  {line}")
    print(f"  TELEPACE_STRIPE_METER_EVENT_NAME={METER_EVENT_NAME}")
    print(
        "\nWebhook: create an endpoint for events "
        "customer.subscription.created/updated/deleted pointing at "
        "<api>/v1/billing/webhook, then set TELEPACE_STRIPE_WEBHOOK_SECRET."
    )


if __name__ == "__main__":
    main()
