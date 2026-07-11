"""Fail safely when committed files contain likely credentials or private keys."""

import argparse
import re
import shutil
import subprocess  # nosec B404
import sys
from dataclasses import dataclass
from pathlib import Path


MAX_BLOB_BYTES = 5 * 1024 * 1024
ALLOWED_ENV_SUFFIXES = (".example", ".sample", ".template")
SENSITIVE_FILE_SUFFIXES = {".key", ".p12", ".pfx", ".pem"}
CONFIG_FILE_SUFFIXES = {".cfg", ".conf", ".ini", ".properties", ".toml", ".txt", ".yaml", ".yml"}
SECRET_ENV_KEYS = rb"(?:AWS_SECRET_ACCESS_KEY|DATABASE_URL|DB_PASSWORD|JWT_SECRET|QB_CLIENT_SECRET)"
PLACEHOLDER_VALUES = rb"(?:$|<|\$\{|change[-_]?me|example|placeholder|your[-_])"
CONTENT_PATTERNS = (
	(
		"private key material",
		re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
	),
	(
		"AWS access key identifier",
		re.compile(rb"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"),
	),
	(
		"GitHub access token",
		re.compile(rb"\bgithub_pat_[A-Za-z0-9_]{20,}\b|\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
	),
	(
		"live payment secret",
		re.compile(rb"\bsk_live_[A-Za-z0-9]{16,}\b"),
	),
	(
		"hard-coded application secret",
		re.compile(
			rb"(?im)^\s*"
			+ SECRET_ENV_KEYS
			+ rb"\s*=\s*['\"](?!\s*"
			+ PLACEHOLDER_VALUES
			+ rb")[^'\"\r\n]{8,}['\"]"
		),
	),
	(
		"hard-coded environment default",
		re.compile(
			rb"(?i)os\.getenv\(\s*['\"]"
			+ SECRET_ENV_KEYS
			+ rb"['\"]\s*,\s*['\"](?!\s*"
			+ PLACEHOLDER_VALUES
			+ rb")[^'\"\r\n]{8,}['\"]"
		),
	),
)
CONFIG_ASSIGNMENT_PATTERN = re.compile(
	rb"(?im)^\s*"
	+ SECRET_ENV_KEYS
	+ rb"\s*[:=]\s*(?!\s*"
	+ PLACEHOLDER_VALUES
	+ rb")[^\s#]{8,}"
)
GIT_EXECUTABLE = shutil.which("git")


@dataclass(frozen=True)
class Finding:
	reason: str
	path: str
	commit: str | None = None


def _git(repo_root: Path, *args: str) -> bytes:
	if GIT_EXECUTABLE is None:
		raise RuntimeError("Git is required for the repository secret scan")
	# Arguments come only from this scanner and shell expansion is disabled.
	result = subprocess.run(
		[GIT_EXECUTABLE, *args],
		cwd=repo_root,
		check=True,
		stdout=subprocess.PIPE,
		stderr=subprocess.PIPE,
	)  # nosec B603
	return result.stdout


def _is_sensitive_path(path: str) -> bool:
	file_path = Path(path)
	lower_name = file_path.name.lower()
	if file_path.suffix.lower() in SENSITIVE_FILE_SUFFIXES:
		return True
	if lower_name == ".env" or lower_name.startswith(".env."):
		return not lower_name.endswith(ALLOWED_ENV_SUFFIXES)
	return False


def _scan_content(path: str, content: bytes, commit: str | None) -> list[Finding]:
	if _is_sensitive_path(path):
		return [Finding("sensitive credential file", path, commit)]
	if len(content) > MAX_BLOB_BYTES or b"\x00" in content[:8192]:
		return []
	findings = [
		Finding(reason, path, commit)
		for reason, pattern in CONTENT_PATTERNS
		if pattern.search(content)
	]
	if Path(path).suffix.lower() in CONFIG_FILE_SUFFIXES and CONFIG_ASSIGNMENT_PATTERN.search(content):
		findings.append(Finding("assigned application secret", path, commit))
	return findings


def scan_working_tree(repo_root: Path) -> list[Finding]:
	"""Scan tracked and non-ignored working-tree files without printing contents."""
	paths = _git(
		repo_root,
		"ls-files",
		"-z",
		"--cached",
		"--others",
		"--exclude-standard",
	).split(b"\0")
	findings = []
	for raw_path in paths:
		if not raw_path:
			continue
		path = raw_path.decode("utf-8", errors="surrogateescape")
		file_path = repo_root / path
		if not file_path.is_file():
			continue
		findings.extend(_scan_content(path, file_path.read_bytes(), None))
	return findings


def scan_history(repo_root: Path) -> list[Finding]:
	"""Scan every unique path/blob pair reachable from local Git history."""
	commits = _git(repo_root, "rev-list", "--all").decode("ascii").splitlines()
	seen_entries: set[tuple[str, str]] = set()
	findings = []
	for commit in commits:
		entries = _git(repo_root, "ls-tree", "-r", "-z", "--full-tree", commit).split(b"\0")
		for entry in entries:
			if not entry:
				continue
			header, raw_path = entry.split(b"\t", 1)
			_mode, object_type, blob_id = header.decode("ascii").split()
			if object_type != "blob":
				continue
			path = raw_path.decode("utf-8", errors="surrogateescape")
			entry_key = (blob_id, path)
			if entry_key in seen_entries:
				continue
			seen_entries.add(entry_key)
			content = _git(repo_root, "cat-file", "blob", blob_id)
			findings.extend(_scan_content(path, content, commit))
	return findings


def _unique_findings(findings: list[Finding]) -> list[Finding]:
	return sorted(
		set(findings),
		key=lambda finding: (finding.path, finding.reason, finding.commit or ""),
	)


def main() -> int:
	parser = argparse.ArgumentParser()
	parser.add_argument(
		"--history",
		action="store_true",
		help="scan all commits reachable from local refs instead of the working tree",
	)
	parser.add_argument(
		"--repo",
		type=Path,
		default=Path(__file__).resolve().parents[2],
		help="repository root (defaults to this project's root)",
	)
	args = parser.parse_args()
	repo_root = args.repo.resolve()

	try:
		findings = scan_history(repo_root) if args.history else scan_working_tree(repo_root)
	except (OSError, subprocess.CalledProcessError) as exc:
		print(f"Secret scan could not inspect the repository ({type(exc).__name__}).")
		return 2

	findings = _unique_findings(findings)
	if not findings:
		print("Repository secret scan passed.")
		return 0

	print("Repository secret scan failed; no secret values are shown:")
	for finding in findings:
		location = f" at commit {finding.commit[:12]}" if finding.commit else ""
		print(f"- {finding.reason}: {finding.path}{location}")
	return 1


if __name__ == "__main__":
	sys.exit(main())
