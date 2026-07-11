import subprocess

from scripts.check_repository_secrets import scan_history, scan_working_tree


def git(repo, *args):
	return subprocess.run(
		["git", *args],
		cwd=repo,
		check=True,
		capture_output=True,
		text=True,
	)


def initialize_repository(tmp_path):
	git(tmp_path, "init", "-q")
	git(tmp_path, "config", "user.name", "Secret Scan Test")
	git(tmp_path, "config", "user.email", "secret-scan@example.com")
	return tmp_path


def commit_all(repo, message):
	git(repo, "add", "-A")
	git(repo, "commit", "-qm", message)


def test_working_tree_allows_documented_placeholders(tmp_path):
	repo = initialize_repository(tmp_path)
	(repo / ".env.quickbooks.template").write_text(
		"QB_CLIENT_SECRET=your_quickbooks_client_secret_here\n",
		encoding="utf-8",
	)
	(repo / "README.md").write_text("No credentials here.\n", encoding="utf-8")
	(repo / "settings.py").write_text(
		"QB_CLIENT_SECRET = os.getenv('QB_CLIENT_SECRET', '')\n",
		encoding="utf-8",
	)

	assert scan_working_tree(repo) == []


def test_working_tree_flags_likely_access_key_without_exposing_value(tmp_path):
	repo = initialize_repository(tmp_path)
	access_key = "AKIA" + ("A" * 16)
	(repo / "settings.txt").write_text(f"key={access_key}\n", encoding="utf-8")

	findings = scan_working_tree(repo)

	assert [(finding.reason, finding.path) for finding in findings] == [
		("AWS access key identifier", "settings.txt")
	]
	assert all(access_key not in repr(finding) for finding in findings)


def test_working_tree_flags_assigned_config_secret(tmp_path):
	repo = initialize_repository(tmp_path)
	secret = "runtime-" + ("value" * 4)
	(repo / "service.conf").write_text(
		f"QB_CLIENT_SECRET={secret}\n",
		encoding="utf-8",
	)

	findings = scan_working_tree(repo)

	assert [(finding.reason, finding.path) for finding in findings] == [
		("assigned application secret", "service.conf")
	]
	assert all(secret not in repr(finding) for finding in findings)


def test_history_flags_deleted_private_key_commit(tmp_path):
	repo = initialize_repository(tmp_path)
	(repo / "README.md").write_text("clean\n", encoding="utf-8")
	commit_all(repo, "initial")
	key_path = repo / "server.pem"
	key_path.write_text(
		"-----BEGIN " + "PRIVATE KEY-----\nnot-real\n-----END PRIVATE KEY-----\n",
		encoding="utf-8",
	)
	commit_all(repo, "add key")
	key_path.unlink()
	commit_all(repo, "remove key")

	working_findings = scan_working_tree(repo)
	history_findings = scan_history(repo)

	assert working_findings == []
	assert any(finding.path == "server.pem" for finding in history_findings)
	assert any(finding.commit for finding in history_findings)
