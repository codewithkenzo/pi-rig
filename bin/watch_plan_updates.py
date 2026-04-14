#!/usr/bin/env python3
"""Watch .claude/plans and .tickets markdown files and relay updates to Telegram."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


DEFAULT_PATHS = [".claude/plans", ".tickets"]
DEFAULT_STATE_FILE = ".pi/plan-watch-state.json"
BACKOFF_BASE_SECS = 2.0
BACKOFF_MAX_SECS = 60.0


@dataclass(frozen=True)
class FileMeta:
    mtime_ns: int
    size: int


@dataclass(frozen=True)
class PendingRelay:
    mtime_ns: int
    size: int
    attempts: int
    next_retry_at: float
    last_error: str


def parse_frontmatter_status(path: Path) -> str:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except Exception:
        return "updated"
    if len(lines) < 3 or lines[0].strip() != "---":
        return "updated"
    for line in lines[1:]:
        s = line.strip()
        if s == "---":
            break
        if s.startswith("status:"):
            value = s.split(":", 1)[1].strip().strip('"').strip("'")
            return value or "updated"
    return "updated"


def scan(paths: Iterable[Path]) -> dict[str, FileMeta]:
    result: dict[str, FileMeta] = {}
    for base in paths:
        if not base.exists():
            continue
        for p in sorted(base.rglob("*.md")):
            if not p.is_file():
                continue
            try:
                st = p.stat()
            except FileNotFoundError:
                continue
            result[str(p)] = FileMeta(mtime_ns=st.st_mtime_ns, size=st.st_size)
    return result


def load_state(path: Path) -> tuple[dict[str, FileMeta], dict[str, PendingRelay]]:
    if not path.exists():
        return {}, {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}, {}

    def parse_file_meta_map(data: object) -> dict[str, FileMeta]:
        state: dict[str, FileMeta] = {}
        if not isinstance(data, dict):
            return state
        for k, v in data.items():
            if not isinstance(v, dict):
                continue
            try:
                state[str(k)] = FileMeta(mtime_ns=int(v["mtime_ns"]), size=int(v["size"]))
            except Exception:
                continue
        return state

    def parse_pending_map(data: object) -> dict[str, PendingRelay]:
        state: dict[str, PendingRelay] = {}
        if not isinstance(data, dict):
            return state
        for k, v in data.items():
            if not isinstance(v, dict):
                continue
            try:
                state[str(k)] = PendingRelay(
                    mtime_ns=int(v["mtime_ns"]),
                    size=int(v["size"]),
                    attempts=max(0, int(v.get("attempts", 0))),
                    next_retry_at=float(v.get("next_retry_at", 0.0)),
                    last_error=str(v.get("last_error", "")),
                )
            except Exception:
                continue
        return state

    if isinstance(raw, dict) and ("delivered" in raw or "pending" in raw):
        return parse_file_meta_map(raw.get("delivered")), parse_pending_map(raw.get("pending"))

    # Backwards compatibility with the old flat state file format.
    return parse_file_meta_map(raw), {}


def save_state(
    path: Path,
    delivered: dict[str, FileMeta],
    pending: dict[str, PendingRelay],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = {
        "delivered": {k: {"mtime_ns": v.mtime_ns, "size": v.size} for k, v in delivered.items()},
        "pending": {
            k: {
                "mtime_ns": v.mtime_ns,
                "size": v.size,
                "attempts": v.attempts,
                "next_retry_at": v.next_retry_at,
                "last_error": v.last_error,
            }
            for k, v in pending.items()
        },
    }
    path.write_text(json.dumps(raw, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def changed_files(
    delivered: dict[str, FileMeta],
    pending: dict[str, PendingRelay],
    curr: dict[str, FileMeta],
    now: float,
) -> list[Path]:
    changed: list[Path] = []
    for p, meta in curr.items():
        old = delivered.get(p)
        if old == meta:
            continue
        retry = pending.get(p)
        if (
            retry is not None
            and retry.mtime_ns == meta.mtime_ns
            and retry.size == meta.size
            and now < retry.next_retry_at
        ):
            continue
        changed.append(Path(p))
    return sorted(changed)


def detect_change_kind(path: str, delivered: dict[str, FileMeta]) -> str:
    return "new" if path not in delivered else "updated"


def line_count(path: Path) -> int:
    try:
        return path.read_text(encoding="utf-8").count("\n") + 1
    except Exception:
        return 0


def compute_diff_amount(
    *,
    root: Path,
    rel: Path,
    absolute: Path,
    change_kind: str,
    previous: FileMeta | None,
    current: FileMeta,
) -> str:
    if change_kind == "new":
        lines = line_count(absolute)
        if lines > 0:
            return f"+{lines}/-0 lines (new)"
        return f"+{current.size}B/-0B (new)"

    try:
        out = subprocess.check_output(
            ["git", "diff", "--numstat", "--", str(rel)],
            cwd=str(root),
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        if out:
            first = out.splitlines()[0].split("\t")
            if len(first) >= 2 and first[0].isdigit() and first[1].isdigit():
                return f"+{first[0]}/-{first[1]} lines"
    except Exception:
        pass

    if previous is not None:
        delta = current.size - previous.size
        sign = "+" if delta >= 0 else ""
        return f"{sign}{delta}B size"
    return ""


def relay(
    file_path: Path,
    *,
    agent: str,
    root: Path,
    transport: str,
    source: str,
    telegram_target: str | None,
    attach_file: bool,
    change_kind: str,
    diff_amount: str,
) -> tuple[bool, str]:
    rel = file_path.resolve().relative_to(root.resolve())
    status = parse_frontmatter_status(file_path)
    cmd = [
        "python3",
        "bin/notify_plan_to_tg.py",
        "--file",
        str(rel),
        "--agent",
        agent,
        "--status",
        status,
        "--change-kind",
        change_kind,
        "--diff-amount",
        diff_amount,
        "--source",
        source,
        "--transport",
        transport,
    ]
    if telegram_target:
        cmd.extend(["--telegram-target", telegram_target])
    if attach_file:
        cmd.append("--attach-file")
    else:
        cmd.append("--no-attach-file")
    proc = subprocess.run(cmd, cwd=str(root), capture_output=True, text=True)
    out = proc.stdout.strip()
    err = proc.stderr.strip()
    if out:
        print(out)
    if err:
        print(err, file=sys.stderr)
    combined = "\n".join(part for part in (out, err) if part)
    return proc.returncode == 0, combined or f"relay exited with code {proc.returncode}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Watch plans/tickets and relay changes")
    parser.add_argument("--paths", nargs="*", default=DEFAULT_PATHS, help="Directories to watch")
    parser.add_argument("--state-file", default=DEFAULT_STATE_FILE)
    parser.add_argument("--interval", type=float, default=1.5)
    parser.add_argument("--agent", default="musashi")
    parser.add_argument(
        "--source",
        choices=["codex", "claude", "hermes"],
        default="codex",
        help="Attribution source for relayed notifications",
    )
    parser.add_argument("--transport", choices=["auto", "hook", "telegram"], default="auto")
    parser.add_argument(
        "--telegram-target",
        default=os.getenv("TELEGRAM_NOTIFY_TARGET") or os.getenv("FACTORY_NOTIFY_TARGET"),
        help="Explicit telegram:<chat_id>[:<thread_id>] for relay sends",
    )
    parser.add_argument(
        "--attach-file",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Attach markdown files on Telegram sends (default: true)",
    )
    parser.add_argument("--seed", action="store_true", help="Write baseline state and exit")
    parser.add_argument("--once", action="store_true", help="Run one scan and exit")
    args = parser.parse_args()

    root = Path.cwd()
    watch_paths = [root / p for p in args.paths]
    state_path = root / args.state_file

    delivered, pending = load_state(state_path)
    curr = scan(watch_paths)

    if args.seed:
        save_state(state_path, curr, {})
        print(f"seeded watcher state: {state_path}")
        return 0

    if not state_path.exists():
        save_state(state_path, curr, {})
        delivered = curr
        print(f"seeded watcher state: {state_path}")

    while True:
        curr = scan(watch_paths)
        now = time.time()
        changed = changed_files(delivered, pending, curr, now)
        if changed:
            print(f"detected {len(changed)} changed plan/ticket file(s)")
            mutated = False
            for path in changed:
                print(f"relay -> {path.relative_to(root)}")
                rel = str(path)
                meta = curr[rel]
                prev_meta = delivered.get(rel)
                change_kind = detect_change_kind(rel, delivered)
                diff_amount = compute_diff_amount(
                    root=root,
                    rel=path.relative_to(root),
                    absolute=path,
                    change_kind=change_kind,
                    previous=prev_meta,
                    current=meta,
                )
                ok, note = relay(
                    path,
                    agent=args.agent,
                    root=root,
                    transport=args.transport,
                    source=args.source,
                    telegram_target=args.telegram_target,
                    attach_file=args.attach_file,
                    change_kind=change_kind,
                    diff_amount=diff_amount,
                )
                if ok:
                    delivered[rel] = meta
                    pending.pop(rel, None)
                    mutated = True
                else:
                    prev_attempts = pending.get(rel).attempts if rel in pending else 0
                    attempts = prev_attempts + 1
                    backoff = min(BACKOFF_MAX_SECS, BACKOFF_BASE_SECS * (2 ** (attempts - 1)))
                    pending[rel] = PendingRelay(
                        mtime_ns=meta.mtime_ns,
                        size=meta.size,
                        attempts=attempts,
                        next_retry_at=now + backoff,
                        last_error=note[:240],
                    )
                    mutated = True
            if mutated:
                save_state(state_path, delivered, pending)
        if args.once:
            return 0
        time.sleep(max(0.3, args.interval))


if __name__ == "__main__":
    raise SystemExit(main())
