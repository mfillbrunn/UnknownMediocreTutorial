#!/usr/bin/env python3
"""
Adaptive refinement driver for the Competitive Wordle repository.

This script intentionally does not pin itself to an old Git SHA. It can first
synchronize a clean checkout with origin/main, inventories the current source,
writes a repository-specific Claude Code prompt, optionally invokes Claude Code,
then runs static and executable verification and emits a reviewable Git patch.

Typical use:
    python3 apply_competitive_wordle_refinement_v5.py --root . --sync-main --prepare-only
    claude -p "$(cat .claude/competitive-wordle-refinement-v5.md)"
    python3 apply_competitive_wordle_refinement_v5.py --root . --verify-only --run-tests --emit-diff --strict-verify

Or:
    python3 apply_competitive_wordle_refinement_v5.py --root . --sync-main --run-agent \
        --agent-command "claude -p" --run-tests --emit-diff --strict-verify
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
from typing import Any, Iterable

PROMPT_TEXT = '# Competitive Wordle refinement v5\n\nImplement this specification completely against the repository state that is currently checked out. Do not reapply an obsolete v3/v4 patch by matching old line numbers. Inspect the current implementation first, identify the canonical source of each behavior, and edit that source.\n\nPreserve unrelated user changes. Do not stop after describing a plan. Run the relevant tests and report exact files changed.\n\n## 1. Visual direction and button translucency\n\nThe user said the buttons should be "to a good degree be see-through." Interpret that as **more translucent**, not more visually solid.\n\n- Use alpha in the background color, not `opacity` on the whole control. Text, icons, focus rings, and hit targets must remain fully opaque.\n- Use a restrained translucent range appropriate to the moonlit indigo background, approximately 0.52–0.68 at rest and slightly more opaque on hover/active.\n- Keep contrast at WCAG AA for normal text.\n- Retain the existing muted indigo / dusty rose visual language.\n- Avoid gradients, neon glows, excessive shadows, glass-card nesting, and decorative pills.\n- Disabled controls may be greyed, but must remain legible.\n- Apply this consistently to menu, modal, summary, tutorial, header, and reward controls without changing Wordle tiles or other game-state cells into translucent buttons.\n\nCreate or reuse design tokens rather than repeating literal colors:\n- general game/header surface\n- elevated surface\n- translucent control surface\n- control hover surface\n- border\n- text\n- muted text\n- guesser accent\n- setter accent\n- easy / medium / hard accents\n\n## 2. Star system: authoritative server behavior and matching client preview\n\nChange the setter star model as follows:\n\n- Any outcome that awarded 0 stars before remains 0 unless another existing rule explicitly guarantees a star.\n- Outcomes that previously awarded 1 base star still award 1 base star.\n- Outcomes that previously awarded 2 or 3 base stars now award exactly 2 base stars.\n- The bonus star is the **only** mechanism that can make a total reach 3.\n- Total stars remain capped at 3.\n- Keep the bonus-star eligibility rule itself unchanged unless another item below overrides it.\n\nUse one canonical helper or domain service shared by all server award paths. Avoid having separate threshold logic in preview, persistence, AI, and human-setter paths. The server is authoritative. The client preview must consume the same result or mirror it through a small explicitly tested pure function.\n\nThe intended normalization is:\n\n```text\nold base 0 -> new base 0\nold base 1 -> new base 1\nold base 2 -> new base 2\nold base 3 -> new base 2\n\ntotal = min(3, new base + eligible bonus star)\n```\n\nRequired test matrix:\n\n| Previous base | Bonus | Expected total |\n|---:|:---:|---:|\n| 0 | no | 0 |\n| 1 | no | 1 |\n| 1 | yes | 2 |\n| 2 | no | 2 |\n| 2 | yes | 3 |\n| 3 | no | 2 |\n| 3 | yes | 3 |\n\nUpdate:\n- server calculation\n- client preview\n- star animation/fill state\n- round history and summary data\n- tutorial/rules wording\n- any AI-setter path\n- analytics/stat aggregation only if it derives stars separately\n\nDo not reinterpret a base two-star result as a bonus star. Persist base and bonus separately where the current schema permits it.\n\n## 3. Hidden Guess interaction\n\nWhen Hidden Guess is active for the setter decision:\n\n- A valid setter submission awards exactly 1 total star whether the setter keeps the current secret or changes to another valid secret.\n- Hidden Guess suppresses all additional base stars.\n- Hidden Guess suppresses the bonus star.\n- Invalid submissions still follow existing validation and award nothing.\n- The server and preview must agree.\n- Clear the Hidden Guess turn flag through the existing round/turn cleanup path so it cannot leak to a later decision.\n\nRequired tests:\n\n```text\nhidden + keep + otherwise 1-star + bonus eligible -> 1\nhidden + change + otherwise 2-star + bonus eligible -> 1\nhidden + change + otherwise 3-star + bonus eligible -> 1\nhidden + invalid submission -> 0\nnext normal setter decision after hidden cleanup -> normal rules\n```\n\n## 4. Reward selection is currently broken\n\nReproduce the failure before changing code. Fix the root cause rather than masking it with CSS.\n\nInspect the current reward chooser end to end:\n- card rendering\n- click and keyboard event binding\n- disabled/inert state\n- overlays and `pointer-events`\n- offer/reward IDs\n- socket request and acknowledgement\n- stale offer handling\n- error recovery\n- reroll/refresh flow\n- server validation and application\n\nRequirements:\n\n1. Each selectable reward is a real button or has an accessible button inside it.\n2. The clickable element owns stable `data-offer-id` and `data-reward-id` values.\n3. Decorative icon, sheen, rarity, and description layers must use `pointer-events: none`; they must not intercept the click.\n4. Register the selection listener once. Prefer delegated handling on the chooser container and clean it up when the chooser closes.\n5. Extract and validate IDs before setting an in-flight/disabled state.\n6. Disable the choices only after a valid selection has been initiated.\n7. Include room/game/round/offer identifiers in the request as supported by the current protocol.\n8. Ignore stale acknowledgements from old offers.\n9. On server rejection, socket error, timeout, or application failure, clear the in-flight state and re-enable the still-current offer.\n10. On success, close the chooser exactly once and apply the reward exactly once.\n11. Keyboard Enter and Space must work.\n12. Refresh Choices must generate a new offer ID; an acknowledgement from the old offer cannot select a card from the new offer.\n13. Do not use a full-card pseudo-element that sits above the button hit target.\n\nAdd regression tests for:\n- selecting each visible card by click\n- keyboard selection\n- successful acknowledgement\n- rejection followed by a successful retry\n- double-click deduplication\n- refreshed offer rejecting an old acknowledgement\n- opponent and player reward application where both paths exist\n\n## 5. Remove Bet Miss from reward offers\n\nSearch case-insensitively for all spellings and identifiers, including likely forms such as:\n- `betmiss`\n- `betMiss`\n- `BET_MISS`\n- display text `Bet Miss`\n\nRemove it from:\n- reward registries exposed to selection\n- rarity/category pools\n- random offer generation\n- deterministic Daily Challenge offer generation\n- tutorial/rules reward lists\n- client card metadata\n- tests or fixtures that expect it to be offered\n\nFor backward compatibility, the server may retain a guarded handler capable of resolving an already-active legacy game, but no new normal, AI, tutorial, or Daily Challenge offer may contain it.\n\nAdd a test that enumerates every offer pool/mode/tier and proves Bet Miss cannot be generated.\n\n## 6. Header surfaces\n\nEvery screen header must use the same background surface as the general game.\n\n- Remove setter-specific and guesser-specific header background fills.\n- Role color may remain as a restrained accent on an icon, small border, text label, or focus ring.\n- This applies to desktop, mobile, tutorial, reward, summary, AI, and Daily Challenge states.\n- Consolidate this into one canonical header rule/token rather than overriding it in multiple role selectors.\n- Check pseudo-elements and media-query overrides for residual role fills.\n\n## 7. Stop automatic zooming/scrolling to the guesser feedback row\n\nReproduce the issue and trace all possible causes:\n- `scrollIntoView`\n- `window.scrollTo`\n- element `.focus()`\n- `autofocus`\n- hash navigation\n- DOM replacement\n- sticky positioning\n- scroll anchoring\n- modal focus restoration\n\nAfter feedback is submitted/rendered, the page must preserve the user\'s scroll position. It must not jump to or lock onto the top feedback row.\n\nImplementation guidance:\n- Remove nonessential automatic scrolling.\n- Where focus is required for keyboard play, use `focus({ preventScroll: true })`.\n- Do not continuously restore scroll position or otherwise lock user scrolling.\n- Use `overflow-anchor` only on the specific dynamic region if browser scroll anchoring is the cause.\n- Do not disable normal user scrolling.\n\nAdd an integration/browser test where possible:\n1. place the viewport at a known nonzero scroll position;\n2. submit or receive guesser feedback;\n3. wait for all animations/rendering;\n4. assert the viewport position is unchanged within a small tolerance;\n5. assert the user can then manually scroll.\n\n## 8. Replace the Guess Again popup with a subtle turn indicator\n\nRemove the large/blocking Guess Again popup.\n\nAt the same event that currently opens it:\n- show one nonblocking role-color sheen that travels across the game viewport;\n- optionally pair it with a small, short-lived `Guess again` badge;\n- use `pointer-events: none`;\n- do not move focus;\n- do not alter scroll position;\n- do not block gameplay;\n- do not stack duplicate indicators;\n- run once, then remove/reset cleanly;\n- keep the animation restrained, approximately 0.8–1.2 seconds for the pass and no long persistent overlay;\n- use a static brief fade under `prefers-reduced-motion: reduce`;\n- retain an `aria-live="polite"` announcement so the turn change is not color-only.\n\nUse the active role\'s accent color without changing the header background.\n\n## 9. Quest highlight controls visible by default\n\nThe highlight controls that belong to a quest must be present on the quest badge by default.\n\n- Do not require clicking the badge to reveal them.\n- Remove the badge click-to-expand dependency and any hidden/collapsed default CSS.\n- Keep selected, disabled, and unavailable states explicit.\n- Buttons must remain usable by keyboard and fit on small screens.\n- Clicking a highlight button must not also trigger the parent badge.\n- The badge itself should not masquerade as a button when it no longer expands.\n- Preserve the existing quest-highlight behavior; change discovery and presentation, not scoring.\n\nAdd a rendering test that loads a quest and confirms its highlight controls are visible and actionable before any badge click.\n\n## 10. CSS redundancy reduction\n\nAudit every CSS file actually loaded by the application, including style tags and dynamically loaded screen styles.\n\nDo not solve this request by adding another broad `refinement-v5.css` that overrides v3/v4. Consolidate instead.\n\nRequired process:\n\n1. Build a stylesheet load-order map from HTML/templates and runtime imports.\n2. Identify:\n   - duplicate selectors\n   - exact duplicate declaration blocks\n   - selectors that differ only to override old theme layers\n   - repeated media-query blocks\n   - repeated role color literals\n   - dead selectors no longer present in markup\n   - excessive `!important`\n   - rules made obsolete by later files\n3. Establish one small token/source-of-truth layer for color, spacing, radii, typography, surfaces, role accents, difficulty colors, and motion.\n4. Move component rules to the component\'s canonical stylesheet.\n5. Merge or delete obsolete refinement/override files and remove their `<link>`/import references.\n6. Preserve genuinely separate component styles; the goal is not one giant file.\n7. Prefer low-specificity component classes and `:where()` where appropriate.\n8. Avoid selectors coupled to incidental DOM depth.\n9. Remove dead comments and contradictory declarations.\n10. Keep source maps/build behavior intact if a bundler is present.\n\nQuantitative acceptance:\n- exact duplicate selector count should decrease materially;\n- exact duplicate declaration-block count should decrease materially;\n- loaded stylesheet count should not increase;\n- `!important` count should not increase and should preferably decrease;\n- total CSS bytes should decrease unless a clearly documented accessibility rule offsets it.\n\nThe patch driver creates a baseline redundancy report. Produce an after-report and summarize the deltas. Explain any remaining intentional duplicates.\n\n## 11. Tests and completion criteria\n\nRun the repository\'s existing tests and add focused tests for the changed behavior. At minimum:\n\n- JavaScript syntax checks\n- star normalization matrix\n- Hidden Guess matrix and cleanup\n- reward selection click/keyboard/ack/retry/stale-offer behavior\n- Bet Miss absent from all generated offers\n- quest controls visible without expansion\n- no automatic feedback-row scroll, using a browser test where the repository supports one\n- Guess Again indicator does not steal focus or intercept pointer input\n- header role classes do not change header background\n- Daily Challenge reward generation also excludes Bet Miss\n\nBefore finishing:\n- run `git diff --check`;\n- inspect mobile and desktop layouts;\n- verify reduced-motion behavior;\n- verify keyboard focus visibility;\n- verify reward selection manually or through a DOM test;\n- list all files changed;\n- give test commands and results;\n- call out any compatibility handler retained for old Bet Miss games.\n\nDo not leave TODOs, placeholder icons, duplicate event listeners, or an additional catch-all override stylesheet.\n'

TEXT_EXTENSIONS = {
    ".css", ".html", ".htm", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx",
    ".json", ".md", ".sql", ".yml", ".yaml", ".vue", ".svelte",
}
SKIP_DIRS = {
    ".git", "node_modules", "dist", "build", "coverage", ".next", ".cache",
    ".competitive-overhaul-backup", "__pycache__",
}
SEARCH_TERMS = [
    "betmiss", "bet miss", "hidden guess", "hiddenGuess", "spyCharge",
    "bonus star", "bonusStar", "scrollIntoView", "scrollTo", "Guess again",
    "guess-again", "power-choice", "reward", "quest", "highlight",
    "header", "guesser", "setter",
]


class DriverError(RuntimeError):
    pass


def run(
    cmd: list[str],
    *,
    cwd: Path,
    check: bool = True,
    capture: bool = True,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        cmd,
        cwd=str(cwd),
        text=True,
        capture_output=capture,
        env=env,
    )
    if check and proc.returncode != 0:
        stdout = proc.stdout.strip() if proc.stdout else ""
        stderr = proc.stderr.strip() if proc.stderr else ""
        details = "\n".join(part for part in [stdout, stderr] if part)
        raise DriverError(f"Command failed ({proc.returncode}): {shlex.join(cmd)}\n{details}")
    return proc


def git(root: Path, *args: str, check: bool = True) -> str:
    return run(["git", *args], cwd=root, check=check).stdout.strip()


def ensure_repo(root: Path) -> None:
    if git(root, "rev-parse", "--is-inside-work-tree", check=False) != "true":
        raise DriverError(f"Not a Git working tree: {root}")


def current_head(root: Path) -> str:
    return git(root, "rev-parse", "HEAD")


def current_branch(root: Path) -> str:
    return git(root, "rev-parse", "--abbrev-ref", "HEAD")


def status_porcelain(root: Path) -> str:
    return git(root, "status", "--porcelain=v1", "-uall")


def sync_main(
    root: Path,
    remote: str,
    base_branch: str,
    autostash: bool,
) -> dict[str, Any]:
    before = current_head(root)
    dirty = bool(status_porcelain(root))
    stashed = False
    stash_label = f"competitive-wordle-v5-{dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"

    if dirty and not autostash:
        raise DriverError(
            "Working tree is dirty. Commit/stash it first, or pass --autostash. "
            "The driver will not discard local work."
        )

    if dirty:
        run(
            ["git", "stash", "push", "--include-untracked", "-m", stash_label],
            cwd=root,
        )
        stashed = True

    try:
        run(["git", "fetch", "--prune", remote, base_branch], cwd=root)
        branch = current_branch(root)
        upstream = f"{remote}/{base_branch}"
        if branch == base_branch:
            run(["git", "merge", "--ff-only", upstream], cwd=root)
            operation = f"fast-forwarded {base_branch} to {upstream}"
        else:
            run(["git", "rebase", upstream], cwd=root)
            operation = f"rebased {branch} onto {upstream}"
    except Exception:
        if stashed:
            print(
                f"Rebase/sync failed. Your changes remain in stash '{stash_label}'.",
                file=sys.stderr,
            )
        raise
    else:
        if stashed:
            pop = run(["git", "stash", "pop"], cwd=root, check=False)
            if pop.returncode != 0:
                raise DriverError(
                    "The repository synced, but the automatic stash could not be "
                    "restored cleanly. Resolve the stash conflict manually. "
                    f"Stash label: {stash_label}\n{pop.stdout}\n{pop.stderr}"
                )

    return {
        "before": before,
        "after": current_head(root),
        "branch": current_branch(root),
        "operation": operation,
        "autostashed": stashed,
    }


def iter_text_files(root: Path) -> Iterable[Path]:
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        try:
            rel = path.relative_to(root)
        except ValueError:
            continue
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        if path.suffix.lower() not in TEXT_EXTENSIONS:
            continue
        try:
            if path.stat().st_size > 2_000_000:
                continue
        except OSError:
            continue
        yield path


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def source_inventory(root: Path) -> dict[str, Any]:
    files = list(iter_text_files(root))
    by_ext = collections.Counter(path.suffix.lower() for path in files)
    relevant = []
    for path in files:
        rel = path.relative_to(root).as_posix()
        low = rel.lower()
        if any(token in low for token in (
            "power", "reward", "quest", "star", "spy", "summary", "header",
            "menu", "feedback", "tutorial", "rule", "daily",
        )):
            relevant.append(rel)
    return {
        "text_file_count": len(files),
        "counts_by_extension": dict(sorted(by_ext.items())),
        "relevant_files": sorted(relevant)[:300],
    }


def search_context(root: Path, per_term_limit: int = 24) -> dict[str, list[str]]:
    results: dict[str, list[str]] = {term: [] for term in SEARCH_TERMS}
    for path in iter_text_files(root):
        rel = path.relative_to(root).as_posix()
        text = read_text(path)
        lines = text.splitlines()
        for term in SEARCH_TERMS:
            if len(results[term]) >= per_term_limit:
                continue
            needle = term.casefold()
            for line_no, line in enumerate(lines, 1):
                if needle in line.casefold():
                    excerpt = re.sub(r"\s+", " ", line.strip())
                    results[term].append(f"{rel}:{line_no}: {excerpt[:220]}")
                    if len(results[term]) >= per_term_limit:
                        break
    return results


def loaded_css_references(root: Path) -> list[str]:
    refs: set[str] = set()
    link_re = re.compile(
        r"""(?:href|src)\s*=\s*["']([^"']+\.css(?:\?[^"']*)?)["']""",
        re.IGNORECASE,
    )
    import_re = re.compile(
        r"""(?:@import\s+(?:url\()?["']?([^"')\s]+\.css)|import\s+["']([^"']+\.css)["'])""",
        re.IGNORECASE,
    )
    for path in iter_text_files(root):
        if path.suffix.lower() not in {".html", ".htm", ".js", ".mjs", ".ts", ".tsx", ".css"}:
            continue
        text = read_text(path)
        for match in link_re.finditer(text):
            refs.add(match.group(1).split("?", 1)[0])
        for match in import_re.finditer(text):
            value = match.group(1) or match.group(2)
            if value:
                refs.add(value.split("?", 1)[0])
    return sorted(refs)


def normalize_ws(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def css_redundancy_report(root: Path) -> dict[str, Any]:
    selector_locations: dict[str, list[str]] = collections.defaultdict(list)
    declaration_locations: dict[str, list[str]] = collections.defaultdict(list)
    important_count = 0
    total_bytes = 0
    css_files: list[str] = []

    comment_re = re.compile(r"/\*.*?\*/", re.DOTALL)
    simple_rule_re = re.compile(r"([^{}]+)\{([^{}]*)\}", re.DOTALL)

    for path in sorted(root.rglob("*.css")):
        rel_path = path.relative_to(root)
        if any(part in SKIP_DIRS for part in rel_path.parts):
            continue
        rel = rel_path.as_posix()
        text = read_text(path)
        css_files.append(rel)
        total_bytes += len(text.encode("utf-8"))
        important_count += text.count("!important")
        stripped = comment_re.sub("", text)

        for match in simple_rule_re.finditer(stripped):
            selector = normalize_ws(match.group(1))
            body = match.group(2)
            if not selector or selector.startswith("@"):
                continue
            declarations = []
            for raw in body.split(";"):
                raw = normalize_ws(raw)
                if not raw or ":" not in raw:
                    continue
                prop, value = raw.split(":", 1)
                declarations.append((prop.strip().lower(), normalize_ws(value)))
            if not declarations:
                continue
            declaration_key = ";".join(f"{p}:{v}" for p, v in sorted(declarations))
            line = stripped.count("\n", 0, match.start()) + 1
            location = f"{rel}:{line}"
            selector_locations[selector].append(location)
            declaration_locations[declaration_key].append(location)

    duplicate_selectors = {
        selector: locations
        for selector, locations in selector_locations.items()
        if len(locations) > 1
    }
    duplicate_declarations = {
        key: locations
        for key, locations in declaration_locations.items()
        if len(locations) > 1
    }

    return {
        "generated_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "parser_note": (
            "Approximate source audit using simple non-nested rule parsing. "
            "Nested at-rules are inventoried by file bytes but may not be fully represented."
        ),
        "css_files": css_files,
        "loaded_css_references": loaded_css_references(root),
        "css_file_count": len(css_files),
        "total_css_bytes": total_bytes,
        "important_count": important_count,
        "unique_selector_count": len(selector_locations),
        "duplicate_selector_count": len(duplicate_selectors),
        "duplicate_selector_occurrences": sum(len(v) - 1 for v in duplicate_selectors.values()),
        "duplicate_declaration_block_count": len(duplicate_declarations),
        "duplicate_declaration_occurrences": sum(len(v) - 1 for v in duplicate_declarations.values()),
        "top_duplicate_selectors": dict(
            sorted(
                duplicate_selectors.items(),
                key=lambda item: (-len(item[1]), item[0]),
            )[:80]
        ),
        "top_duplicate_declaration_blocks": [
            {"declarations": key[:500], "locations": locations}
            for key, locations in sorted(
                duplicate_declarations.items(),
                key=lambda item: (-len(item[1]), item[0]),
            )[:50]
        ],
    }


def compact_json(value: Any, max_chars: int = 20_000) -> str:
    rendered = json.dumps(value, indent=2, sort_keys=True)
    if len(rendered) <= max_chars:
        return rendered
    return rendered[:max_chars] + "\n... [inventory truncated by driver]"


def write_prompt(root: Path, baseline: dict[str, Any]) -> Path:
    claude_dir = root / ".claude"
    claude_dir.mkdir(parents=True, exist_ok=True)
    inventory = source_inventory(root)
    hits = search_context(root)
    head = current_head(root)
    branch = current_branch(root)
    status = status_porcelain(root)

    context = f"""
## Repository-specific context generated by the v5 driver

- Current branch: `{branch}`
- Current HEAD: `{head}`
- Working tree dirty before implementation: `{bool(status)}`
- CSS baseline file: `.claude/css-redundancy-before-v5.json`

### Relevant source inventory

```json
{compact_json(inventory, 28_000)}
```

### Current semantic search hits

```json
{compact_json(hits, 38_000)}
```

### CSS baseline summary

```json
{compact_json({
    key: baseline[key]
    for key in (
        "css_file_count",
        "total_css_bytes",
        "important_count",
        "duplicate_selector_count",
        "duplicate_selector_occurrences",
        "duplicate_declaration_block_count",
        "duplicate_declaration_occurrences",
        "loaded_css_references",
        "top_duplicate_selectors",
    )
}, 30_000)}
```

Use this context only as a starting map. Open the actual files and follow current code paths before editing.
"""
    prompt_path = claude_dir / "competitive-wordle-refinement-v5.md"
    prompt_path.write_text(PROMPT_TEXT + "\n" + context, encoding="utf-8")
    return prompt_path


def save_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def invoke_agent(root: Path, command: str, prompt_path: Path) -> None:
    parts = shlex.split(command)
    if not parts:
        raise DriverError("--agent-command is empty")
    prompt_text = prompt_path.read_text(encoding="utf-8")
    expanded = [
        part.replace("{prompt_file}", str(prompt_path)).replace("{root}", str(root))
        for part in parts
    ]
    if any("{prompt}" in part for part in expanded):
        expanded = [part.replace("{prompt}", prompt_text) for part in expanded]
    else:
        expanded.append(prompt_text)
    print(f"Running agent: {shlex.join(expanded[:3])} ...")
    proc = subprocess.run(expanded, cwd=str(root))
    if proc.returncode != 0:
        raise DriverError(f"Agent command failed with exit code {proc.returncode}")


def js_syntax_checks(root: Path) -> dict[str, Any]:
    if not shutil_which("node"):
        return {"available": False, "checked": 0, "failures": ["node executable not found"]}
    failures: list[str] = []
    checked = 0
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in {".js", ".mjs", ".cjs"}:
            continue
        rel_path = path.relative_to(root)
        if any(part in SKIP_DIRS for part in rel_path.parts):
            continue
        checked += 1
        proc = run(["node", "--check", str(path)], cwd=root, check=False)
        if proc.returncode != 0:
            failures.append(f"{rel_path.as_posix()}: {proc.stderr.strip()}")
    return {"available": True, "checked": checked, "failures": failures}


def shutil_which(command: str) -> str | None:
    paths = os.environ.get("PATH", "").split(os.pathsep)
    extensions = [""] if os.name != "nt" else os.environ.get("PATHEXT", "").split(os.pathsep)
    for directory in paths:
        candidate_base = Path(directory) / command
        for ext in extensions:
            candidate = Path(str(candidate_base) + ext)
            if candidate.is_file() and os.access(candidate, os.X_OK):
                return str(candidate)
    return None


def package_test_commands(root: Path) -> list[list[str]]:
    package = root / "package.json"
    if not package.exists() or not shutil_which("npm"):
        return []
    try:
        data = json.loads(package.read_text(encoding="utf-8"))
    except Exception:
        return []
    scripts = data.get("scripts") or {}
    commands: list[list[str]] = []
    for name in ("test", "test:unit", "test:integration", "lint"):
        value = scripts.get(name)
        if not value:
            continue
        if name == "test" and "no test specified" in str(value).lower():
            continue
        commands.append(["npm", "run", name])
    return commands


def run_test_commands(root: Path) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for command in package_test_commands(root):
        proc = run(command, cwd=root, check=False)
        results.append({
            "command": shlex.join(command),
            "returncode": proc.returncode,
            "stdout_tail": (proc.stdout or "")[-4000:],
            "stderr_tail": (proc.stderr or "")[-4000:],
        })
    return results


def grep_occurrences(root: Path, needle_patterns: list[str]) -> list[dict[str, Any]]:
    compiled = [re.compile(pattern, re.IGNORECASE) for pattern in needle_patterns]
    hits: list[dict[str, Any]] = []
    for path in iter_text_files(root):
        rel = path.relative_to(root).as_posix()
        for line_no, line in enumerate(read_text(path).splitlines(), 1):
            if any(pattern.search(line) for pattern in compiled):
                hits.append({
                    "path": rel,
                    "line": line_no,
                    "text": re.sub(r"\s+", " ", line.strip())[:300],
                })
    return hits


def static_acceptance(root: Path) -> dict[str, Any]:
    betmiss_hits = grep_occurrences(root, [r"\bbet[\s_-]*miss\b", r"\bbetMiss\b"])
    suspicious_betmiss = []
    for hit in betmiss_hits:
        context = f"{hit['path']} {hit['text']}".casefold()
        if any(token in context for token in (
            "pool", "catalog", "registry", "rarity", "offer", "choice",
            "daily", "tutorial", "rules", "rewardids", "available",
        )):
            suspicious_betmiss.append(hit)

    scroll_hits = grep_occurrences(root, [r"scrollIntoView", r"window\.scrollTo", r"\.scrollTo\("])
    feedback_scroll_hits = [
        hit for hit in scroll_hits
        if any(token in f"{hit['path']} {hit['text']}".casefold()
               for token in ("feedback", "guess", "row"))
    ]

    hidden_hits = grep_occurrences(root, [r"hidden[\s_-]*guess", r"hiddenGuess"])
    reward_test_hits = grep_occurrences(
        root,
        [r"(reward|power).*(select|pick|choice).*(test|spec)",
         r"(test|it)\s*\(.*(reward|power).*(select|pick|choice)"],
    )
    star_test_hits = grep_occurrences(
        root,
        [r"(hidden[\s_-]*guess|bonus[\s_-]*star).*(test|expect|assert)",
         r"(expect|assert).*(star)"],
    )

    role_header_background_hits: list[dict[str, Any]] = []
    css_rule_re = re.compile(r"([^{}]+)\{([^{}]*)\}", re.DOTALL)
    for path in root.rglob("*.css"):
        rel_path = path.relative_to(root)
        if any(part in SKIP_DIRS for part in rel_path.parts):
            continue
        text = read_text(path)
        for match in css_rule_re.finditer(text):
            selector = normalize_ws(match.group(1))
            body = match.group(2)
            low_selector = selector.casefold()
            if "header" not in low_selector:
                continue
            if not ("setter" in low_selector or "guesser" in low_selector):
                continue
            if re.search(r"\bbackground(?:-color|-image)?\s*:", body, re.IGNORECASE):
                line = text.count("\n", 0, match.start()) + 1
                role_header_background_hits.append({
                    "path": rel_path.as_posix(),
                    "line": line,
                    "selector": selector[:300],
                })

    return {
        "betmiss_all_hits": betmiss_hits,
        "betmiss_suspicious_offer_hits": suspicious_betmiss,
        "automatic_scroll_hits": scroll_hits,
        "feedback_related_scroll_hits": feedback_scroll_hits,
        "hidden_guess_hits": hidden_hits[:80],
        "reward_selection_test_hits": reward_test_hits[:80],
        "star_test_hits": star_test_hits[:80],
        "role_specific_header_background_hits": role_header_background_hits,
    }


def css_delta(before: dict[str, Any] | None, after: dict[str, Any]) -> dict[str, Any]:
    if not before:
        return {}
    keys = [
        "css_file_count",
        "total_css_bytes",
        "important_count",
        "duplicate_selector_count",
        "duplicate_selector_occurrences",
        "duplicate_declaration_block_count",
        "duplicate_declaration_occurrences",
    ]
    return {
        key: {
            "before": before.get(key),
            "after": after.get(key),
            "delta": (
                after.get(key) - before.get(key)
                if isinstance(before.get(key), int) and isinstance(after.get(key), int)
                else None
            ),
        }
        for key in keys
    }


def load_json_if_exists(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else None
    except Exception:
        return None


def emit_diff(root: Path, destination: Path) -> None:
    proc = run(
        ["git", "diff", "--binary", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/"],
        cwd=root,
        check=True,
    )
    destination.write_text(proc.stdout, encoding="utf-8")


def verify(root: Path, run_tests: bool, strict: bool, emit: bool) -> dict[str, Any]:
    claude_dir = root / ".claude"
    baseline_path = claude_dir / "css-redundancy-before-v5.json"
    after_path = claude_dir / "css-redundancy-after-v5.json"
    baseline = load_json_if_exists(baseline_path)
    after = css_redundancy_report(root)
    save_json(after_path, after)

    diff_check = run(["git", "diff", "--check"], cwd=root, check=False)
    syntax = js_syntax_checks(root)
    static = static_acceptance(root)
    tests = run_test_commands(root) if run_tests else []

    report: dict[str, Any] = {
        "generated_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "head": current_head(root),
        "branch": current_branch(root),
        "working_tree_status": status_porcelain(root),
        "git_diff_check": {
            "returncode": diff_check.returncode,
            "stdout": diff_check.stdout,
            "stderr": diff_check.stderr,
        },
        "javascript_syntax": syntax,
        "tests": tests,
        "static_acceptance": static,
        "css_after": after,
        "css_delta": css_delta(baseline, after),
    }

    report_path = root / "competitive_wordle_refinement_v5_report.json"
    save_json(report_path, report)

    if emit:
        emit_diff(root, root / "competitive_wordle_refinement_v5.patch")

    failures: list[str] = []
    if diff_check.returncode != 0:
        failures.append("git diff --check failed")
    if syntax.get("failures"):
        failures.append(f"{len(syntax['failures'])} JavaScript syntax check(s) failed")
    if any(item["returncode"] != 0 for item in tests):
        failures.append("one or more repository test commands failed")
    if static["betmiss_suspicious_offer_hits"]:
        failures.append("Bet Miss still appears in a likely offer/catalog/daily/tutorial source")
    if static["role_specific_header_background_hits"]:
        failures.append("role-specific header background declarations remain")
    if not static["hidden_guess_hits"]:
        failures.append("no Hidden Guess implementation/test references were found")
    if strict and not static["reward_selection_test_hits"]:
        failures.append("no reward-selection regression test was detected")
    if strict and not static["star_test_hits"]:
        failures.append("no star/Hidden Guess assertion was detected")

    if strict and baseline:
        delta = report["css_delta"]
        before_duplicate_total = sum(
            int(baseline.get(key) or 0)
            for key in (
                "duplicate_selector_occurrences",
                "duplicate_declaration_occurrences",
            )
        )
        improved_redundancy = any(
            isinstance(delta.get(key, {}).get("delta"), int)
            and delta[key]["delta"] < 0
            for key in (
                "duplicate_selector_occurrences",
                "duplicate_declaration_occurrences",
                "total_css_bytes",
                "css_file_count",
            )
        )
        if before_duplicate_total > 0 and not improved_redundancy:
            failures.append(
                "CSS redundancy did not improve in selectors, declaration blocks, "
                "loaded scope, or total bytes"
            )
        if (
            delta.get("important_count", {}).get("delta") is not None
            and delta["important_count"]["delta"] > 0
        ):
            failures.append("CSS !important count increased")

    report["verification_failures"] = failures
    save_json(report_path, report)

    if failures:
        message = "Verification found:\n- " + "\n- ".join(failures)
        if strict:
            raise DriverError(message)
        print(message, file=sys.stderr)
    else:
        print("Verification completed without detected failures.")

    print(f"Report: {report_path}")
    if emit:
        print(f"Patch: {root / 'competitive_wordle_refinement_v5.patch'}")
    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=".", help="Repository root")
    parser.add_argument(
        "--sync-main",
        action="store_true",
        help="Fetch and fast-forward main, or rebase the current feature branch onto origin/main",
    )
    parser.add_argument("--remote", default="origin")
    parser.add_argument("--base-branch", default="main")
    parser.add_argument(
        "--autostash",
        action="store_true",
        help="Stash tracked and untracked local work before sync and restore it afterward",
    )
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--run-agent", action="store_true")
    parser.add_argument("--agent-command", default="claude -p")
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--run-tests", action="store_true")
    parser.add_argument("--emit-diff", action="store_true")
    parser.add_argument("--strict-verify", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = Path(args.root).expanduser().resolve()
    ensure_repo(root)

    sync_result = None
    if args.sync_main:
        sync_result = sync_main(
            root,
            remote=args.remote,
            base_branch=args.base_branch,
            autostash=args.autostash,
        )
        print(json.dumps(sync_result, indent=2))

    claude_dir = root / ".claude"
    before_path = claude_dir / "css-redundancy-before-v5.json"

    if args.verify_only:
        verify(root, args.run_tests, args.strict_verify, args.emit_diff)
        return 0

    baseline = css_redundancy_report(root)
    save_json(before_path, baseline)
    prompt_path = write_prompt(root, baseline)
    print(f"Prompt: {prompt_path}")
    print(f"CSS baseline: {before_path}")

    if args.run_agent:
        invoke_agent(root, args.agent_command, prompt_path)
        verify(root, args.run_tests, args.strict_verify, args.emit_diff)
    elif not args.prepare_only:
        print(
            "\nPreparation complete. Run Claude Code with:\n"
            f"  claude -p \"$(cat {shlex.quote(str(prompt_path))})\"\n"
            "Then verify with:\n"
            "  python3 apply_competitive_wordle_refinement_v5.py "
            "--root . --verify-only --run-tests --emit-diff --strict-verify"
        )

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DriverError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(2)
