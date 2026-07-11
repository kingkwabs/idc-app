import pytest
from cryptography.fernet import Fernet

from qb_token_crypto import (
	QB_TOKEN_ENVELOPE_PREFIX,
	QBTokenConfigurationError,
	QBTokenCrypto,
	QBTokenDecryptionError,
)


def test_versioned_fernet_round_trip_hides_plaintext():
	crypto = QBTokenCrypto(
		key=Fernet.generate_key().decode("ascii"),
		environment="production",
	)
	ciphertext = crypto.encrypt("sensitive-refresh-token")

	assert ciphertext.startswith(QB_TOKEN_ENVELOPE_PREFIX)
	assert "sensitive-refresh-token" not in ciphertext
	assert crypto.decrypt(ciphertext) == "sensitive-refresh-token"


def test_production_requires_a_valid_key(monkeypatch):
	monkeypatch.delenv("QB_TOKEN_ENCRYPTION_KEY", raising=False)
	with pytest.raises(QBTokenConfigurationError):
		QBTokenCrypto(environment="production")
	with pytest.raises(QBTokenConfigurationError):
		QBTokenCrypto(key="not-a-fernet-key", environment="production")

	monkeypatch.setenv("APP_ENV", "production")
	with pytest.raises(QBTokenConfigurationError):
		QBTokenCrypto(environment="sandbox")


def test_plaintext_is_legacy_but_unknown_or_wrong_envelopes_fail():
	key = Fernet.generate_key().decode("ascii")
	crypto = QBTokenCrypto(key=key, environment="sandbox")
	assert crypto.decrypt("legacy-plaintext") == "legacy-plaintext"

	with pytest.raises(QBTokenDecryptionError):
		crypto.decrypt("qb:v2:future-value")

	wrong_key_ciphertext = QBTokenCrypto(
		key=Fernet.generate_key().decode("ascii"),
		environment="sandbox",
	).encrypt("value")
	with pytest.raises(QBTokenDecryptionError):
		crypto.decrypt(wrong_key_ciphertext)
