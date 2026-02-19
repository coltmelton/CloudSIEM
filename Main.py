#!/usr/bin/env python3
"""Simple event simulator for CloudSEIM API."""

import argparse
import random
import time
from datetime import datetime, timezone

import requests


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def random_ip() -> str:
    return f"192.168.{random.randint(0, 10)}.{random.randint(1, 254)}"


def make_auth_event() -> dict:
    user = random.choice(["alice", "bob", "charlie", "dana"])
    success = random.random() > 0.65
    return {
        "eventType": "auth",
        "action": "login",
        "userId": user,
        "ipAddress": random_ip(),
        "success": success,
        "timestamp": iso_now(),
    }


def make_mouse_event() -> dict:
    expected = random.uniform(100, 500)
    mouse = expected * random.uniform(0.45, 1.65)
    return {
        "eventType": "mouse",
        "action": "mouse_move",
        "ipAddress": random_ip(),
        "expectedPathDistance": round(expected, 2),
        "mousePathDistance": round(mouse, 2),
        "timestamp": iso_now(),
    }


def make_api_event() -> dict:
    key = random.choice(["key-a", "key-b", "key-c"])
    return {
        "eventType": "api",
        "action": "request",
        "apiKeyId": key,
        "ipAddress": random_ip(),
        "endpoint": random.choice(["/v1/login", "/v1/orders", "/v1/profile"]),
        "timestamp": iso_now(),
    }


def build_event() -> dict:
    etype = random.choices(["auth", "mouse", "api"], weights=[4, 2, 4], k=1)[0]
    if etype == "auth":
        return make_auth_event()
    if etype == "mouse":
        return make_mouse_event()
    return make_api_event()


def send_events(api_base: str, total_events: int, delay_ms: int) -> None:
    endpoint = api_base.rstrip("/") + "/logs"
    sent = 0
    alerts = 0

    for _ in range(total_events):
        payload = build_event()
        try:
            res = requests.post(endpoint, json=payload, timeout=5)
            res.raise_for_status()
            data = res.json()
            sent += 1
            alerts += int(data.get("alertsCreated", 0))
        except Exception as exc:  # noqa: BLE001
            print(f"request failed: {exc}")

        time.sleep(max(0, delay_ms) / 1000.0)

    print(f"done: sent={sent}, alerts={alerts}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="CloudSEIM event simulator")
    parser.add_argument("--api-base", required=True, help="API base URL")
    parser.add_argument("--events", type=int, default=100, help="Number of events to send")
    parser.add_argument("--delay-ms", type=int, default=50, help="Delay between events")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    send_events(args.api_base, args.events, args.delay_ms)


if __name__ == "__main__":
    main()
