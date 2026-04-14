#!/usr/bin/env python3
"""Send plan/ticket summaries to Hermes notify hook (Telegram relay)."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.parse
import uuid
from pathlib import Path
from typing import Any
from urllib import error, request


DEFAULT_HOOK_URL = "http://localhost:8642/hooks/notify"
DEFAULT_TIMEOUT_SECS = 3
MAX_PREVIEW_CHARS = 220
DEFAULT_SOURCE = "codex"


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return

    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"").strip("'")
        os.environ.setdefault(key, value)


def git_branch(cwd: Path) -> str:
    try:
        out = subprocess.check_output(
            ["git", "branch", "--show-current"],
            cwd=str(cwd),
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        return out or "unknown"
    except Exception:
        return "unknown"


def parse_markdown_title_and_preview(path: Path) -> tuple[str, str]:
    text = path.read_text(encoding="utf-8")

    title = path.stem
    heading_title_set = False
    has_frontmatter_title = False
    preview_lines: list[str] = []

    lines = text.splitlines()

    # Optional YAML frontmatter
    if len(lines) >= 3 and lines[0].strip() == "---":
        for idx in range(1, len(lines)):
            current = lines[idx].strip()
            if current == "---":
                lines = lines[idx + 1 :]
                break
            if current.startswith("title:"):
                candidate = current.split(":", 1)[1].strip().strip('"').strip("'")
                if candidate:
                    title = candidate
                    has_frontmatter_title = True

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("#"):
            if has_frontmatter_title:
                continue
            if not heading_title_set:
                heading = stripped.lstrip("#").strip()
                if heading:
                    title = heading
                    heading_title_set = True
            continue
        if not stripped:
            continue
        if stripped.startswith("```"):
            continue
        if stripped.startswith("---"):
            continue
        if stripped.startswith("id:") or stripped.startswith("title:"):
            continue
        if stripped.startswith("status:") or stripped.startswith("priority:"):
            continue
        if stripped.startswith("owner:") or stripped.startswith("depends_on:"):
            continue
        if stripped.startswith("acceptance:"):
            continue
        preview_lines.append(stripped)
        if len(" ".join(preview_lines)) >= MAX_PREVIEW_CHARS:
            break

    preview = " ".join(preview_lines)
    preview = preview[:MAX_PREVIEW_CHARS].rstrip()
    if not preview:
        preview = f"Updated {path.name}"

    return title, preview


def build_payload(
    *,
    file_path: Path,
    agent: str,
    status: str,
    source: str,
    change_kind: str,
    diff_amount: str,
    cwd: Path,
) -> dict[str, Any]:
    title, preview = parse_markdown_title_and_preview(file_path)
    rel = os.path.relpath(file_path, cwd)

    session_id = f"plan-relay-{int(time.time())}"
    short_cwd = str(cwd).replace(str(Path.home()), "~", 1)

    return {
        "event": "Stop",
        "source": source,
        "session_id": session_id,
        "cwd": str(cwd),
        "short_cwd": short_cwd,
        "project": cwd.name,
        "branch": git_branch(cwd),
        "agent": agent,
        "model": "python/plan-relay",
        "turn_count": None,
        "shots": None,
        "diff": {
            "stat": f"plan relay: {rel}",
            "files": {
                "added": [],
                "modified": [rel],
                "deleted": [],
            },
        },
        "metadata": {
            "kind": "plan_relay",
            "status": status,
            "change_kind": change_kind,
            "diff_amount": diff_amount,
            "runtime_surface": source,
            "plan_file": rel,
            "plan_title": title,
            "plan_preview": preview,
        },
        "plan": {
            "title": title,
            "file": rel,
            "status": status,
            "change_kind": change_kind,
            "diff_amount": diff_amount,
            "preview": preview,
        },
    }


def post_payload(payload: dict[str, Any], hook_url: str, hook_secret: str | None) -> tuple[int, str]:
    body = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if hook_secret:
        headers["X-Hook-Secret"] = hook_secret

    req = request.Request(hook_url, data=body, headers=headers, method="POST")
    with request.urlopen(req, timeout=DEFAULT_TIMEOUT_SECS) as res:  # noqa: S310
        return res.getcode(), res.read().decode("utf-8", errors="replace")


def parse_telegram_target(target: str) -> tuple[str, str | None]:
    # Format: telegram:<chat_id>[:<thread_id>]
    parts = target.split(":")
    if len(parts) < 2 or parts[0].strip().lower() != "telegram":
        raise ValueError("telegram target must look like telegram:<chat_id>[:<thread_id>]")
    chat_id = parts[1].strip()
    thread_id = parts[2].strip() if len(parts) > 2 and parts[2].strip() else None
    if not chat_id:
        raise ValueError("missing telegram chat_id")
    return chat_id, thread_id


def send_telegram_message(
    *,
    token: str,
    target: str,
    message: str,
) -> tuple[int, str]:
    chat_id, thread_id = parse_telegram_target(target)
    payload: dict[str, str] = {
        "chat_id": chat_id,
        "text": message,
        "disable_web_page_preview": "true",
    }
    if thread_id:
        payload["message_thread_id"] = thread_id

    data = urllib.parse.urlencode(payload).encode("utf-8")
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    req = request.Request(url, data=data, method="POST")
    with request.urlopen(req, timeout=DEFAULT_TIMEOUT_SECS) as res:  # noqa: S310
        return res.getcode(), res.read().decode("utf-8", errors="replace")


def send_telegram_document(
    *,
    token: str,
    target: str,
    file_path: Path,
    caption: str,
) -> tuple[int, str]:
    chat_id, thread_id = parse_telegram_target(target)
    boundary = f"----planrelay{uuid.uuid4().hex}"
    file_bytes = file_path.read_bytes()
    filename = file_path.name

    parts: list[bytes] = []

    def add_field(name: str, value: str) -> None:
        parts.append(f"--{boundary}\r\n".encode("utf-8"))
        parts.append(
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode("utf-8")
        )

    add_field("chat_id", chat_id)
    if thread_id:
        add_field("message_thread_id", thread_id)
    if caption:
        add_field("caption", caption[:1024])  # Telegram caption limit

    parts.append(f"--{boundary}\r\n".encode("utf-8"))
    parts.append(
        (
            f'Content-Disposition: form-data; name="document"; filename="{filename}"\r\n'
            f"Content-Type: text/markdown\r\n\r\n"
        ).encode("utf-8")
    )
    parts.append(file_bytes)
    parts.append(b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode("utf-8"))

    body = b"".join(parts)
    url = f"https://api.telegram.org/bot{token}/sendDocument"
    req = request.Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with request.urlopen(req, timeout=DEFAULT_TIMEOUT_SECS) as res:  # noqa: S310
        return res.getcode(), res.read().decode("utf-8", errors="replace")


def build_telegram_message(payload: dict[str, Any]) -> str:
    plan = payload.get("plan", {})
    status = plan.get("status", "updated")
    change_kind = plan.get("change_kind", "updated")
    diff_amount = plan.get("diff_amount", "")
    title = plan.get("title", "plan")
    file = plan.get("file", "")
    preview = plan.get("preview", "")
    project = payload.get("project", "project")
    branch = payload.get("branch", "unknown")
    agent = payload.get("agent", "agent")
    source = payload.get("source", "codex")
    change_label = "Plan created" if change_kind == "new" else "Plan updated"
    exec_cmd = f"bun run plan:tg -- --file {file} --agent {agent} --status {status}"
    diff_line = f"\nΔ {diff_amount}" if diff_amount else ""
    return (
        f"🧭 {change_label} ({status})\n"
        f"📦 {project}/{branch}\n"
        f"🤖 {agent}@{source}\n"
        f"📄 {title}\n"
        f"🗂️ {file}\n"
        f"📝 {preview}{diff_line}\n"
        f"▶️ {exec_cmd}"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Relay plan/ticket updates to Hermes Telegram hook")
    parser.add_argument("--file", required=True, help="Path to plan or ticket markdown file")
    parser.add_argument("--agent", default="other-agent", help="Agent label for notification")
    parser.add_argument("--status", default="updated", help="Plan status label")
    parser.add_argument(
        "--change-kind",
        choices=["new", "updated"],
        default="updated",
        help="Whether this relay represents a new or updated file",
    )
    parser.add_argument(
        "--diff-amount",
        default="",
        help='Diff amount summary, e.g. "+12/-3 lines"',
    )
    parser.add_argument(
        "--source",
        default=DEFAULT_SOURCE,
        choices=["codex", "claude", "hermes"],
        help="Attribution source for mission-control payloads",
    )
    parser.add_argument("--hook-url", default=None, help="Override Hermes hook URL")
    parser.add_argument("--hook-secret", default=None, help="Override Hermes hook secret")
    parser.add_argument(
        "--transport",
        choices=["auto", "hook", "telegram"],
        default="auto",
        help="Send path: auto (hook then telegram), hook only, or telegram only",
    )
    parser.add_argument("--telegram-target", default=None, help="telegram:<chat_id>[:<thread_id>]")
    parser.add_argument("--telegram-token", default=None, help="Override TELEGRAM_BOT_TOKEN")
    parser.add_argument(
        "--attach-file",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Attach the markdown file in Telegram message (default: true)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print payload only")
    args = parser.parse_args()

    cwd = Path.cwd()
    file_path = (cwd / args.file).resolve() if not os.path.isabs(args.file) else Path(args.file)

    if not file_path.exists():
        print(f"error: file not found: {file_path}", file=sys.stderr)
        return 2

    load_dotenv(Path.home() / ".hermes" / ".env")
    hook_url = args.hook_url or os.getenv("HERMES_HOOK_URL", DEFAULT_HOOK_URL)
    hook_secret = args.hook_secret or os.getenv("HERMES_HOOK_SECRET")
    telegram_token = args.telegram_token or os.getenv("TELEGRAM_BOT_TOKEN")
    telegram_target = (
        args.telegram_target
        or os.getenv("TELEGRAM_NOTIFY_TARGET")
        or os.getenv("FACTORY_NOTIFY_TARGET")
    )
    if telegram_target is not None:
        telegram_target = telegram_target.strip() or None

    payload = build_payload(
        file_path=file_path,
        agent=args.agent,
        status=args.status,
        source=args.source,
        change_kind=args.change_kind,
        diff_amount=args.diff_amount,
        cwd=cwd,
    )

    if args.dry_run:
        print(json.dumps(payload, indent=2))
        print("\n--- telegram preview ---\n")
        print(build_telegram_message(payload))
        return 0

    want_hook = args.transport in {"auto", "hook"}
    want_tg = args.transport in {"auto", "telegram"}

    hook_ok = False
    if want_hook:
        try:
            code, body = post_payload(payload, hook_url, hook_secret)
            print(f"sent: HTTP {code} -> {hook_url}")
            if body.strip():
                print(body.strip())
            hook_ok = 200 <= code < 300
            if args.transport == "hook":
                return 0 if hook_ok else 1
            if hook_ok:
                return 0
        except error.HTTPError as exc:
            text = exc.read().decode("utf-8", errors="replace")
            print(f"hook error: HTTP {exc.code}: {text}", file=sys.stderr)
            if args.transport == "hook":
                return 1
        except Exception as exc:  # noqa: BLE001
            print(f"hook error: {exc}", file=sys.stderr)
            if args.transport == "hook":
                return 1

    if want_tg:
        if not telegram_token:
            if hook_ok:
                return 0
            print("telegram fallback unavailable: TELEGRAM_BOT_TOKEN missing", file=sys.stderr)
            return 1
        if not telegram_target:
            if hook_ok:
                return 0
            print(
                "telegram fallback unavailable: set --telegram-target or TELEGRAM_NOTIFY_TARGET/FACTORY_NOTIFY_TARGET",
                file=sys.stderr,
            )
            return 1
        try:
            message = build_telegram_message(payload)
            if args.attach_file:
                code, body = send_telegram_document(
                    token=telegram_token,
                    target=telegram_target,
                    file_path=file_path,
                    caption=message,
                )
                print(f"sent: Telegram document HTTP {code} -> {telegram_target}")
            else:
                code, body = send_telegram_message(
                    token=telegram_token,
                    target=telegram_target,
                    message=message,
                )
                print(f"sent: Telegram HTTP {code} -> {telegram_target}")
            if body.strip():
                print(body.strip())
            ok = 200 <= code < 300
            if ok:
                return 0
            return 0 if hook_ok else 1
        except Exception as exc:  # noqa: BLE001
            print(f"telegram error: {exc}", file=sys.stderr)
            return 0 if hook_ok else 1

    return 0 if hook_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
