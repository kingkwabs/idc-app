"""Versioned encryption for QuickBooks credentials stored in the database."""

import os
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken


# These prefixes identify the ciphertext envelope format; they are not credentials.
QB_TOKEN_ENVELOPE_PREFIX = "qb:v1:"  # nosec B105
_QB_TOKEN_ENVELOPE_MARKER = "qb:"  # nosec B105
_PRODUCTION_ENVIRONMENTS = {"prod", "production"}


class QBTokenCryptoError(RuntimeError):
	"""Base error for QuickBooks credential protection failures."""


class QBTokenConfigurationError(QBTokenCryptoError):
	"""Raised when QuickBooks credential encryption is misconfigured."""


class QBTokenDecryptionError(QBTokenCryptoError):
	"""Raised when a stored QuickBooks credential cannot be decrypted."""


class QBTokenCrypto:
	"""Encrypt and decrypt versioned QuickBooks credential envelopes."""

	def __init__(
		self,
		key: Optional[str] = None,
		environment: Optional[str] = None,
	):
		self.environment = (
			environment or os.getenv("QB_ENVIRONMENT", "production")
		).strip().lower()
		raw_key = key if key is not None else os.getenv("QB_TOKEN_ENCRYPTION_KEY")
		raw_key = raw_key.strip() if raw_key else ""
		app_environment = os.getenv("APP_ENV", "").strip().lower()
		render_deployment = os.getenv("RENDER", "").strip().lower() not in {
			"",
			"0",
			"false",
			"no",
		}
		production = (
			self.environment in _PRODUCTION_ENVIRONMENTS
			or app_environment in _PRODUCTION_ENVIRONMENTS
			or render_deployment
		)

		if not raw_key:
			if production:
				raise QBTokenConfigurationError(
					"QB_TOKEN_ENCRYPTION_KEY is required in production"
				)
			self._fernet = None
			return

		try:
			self._fernet = Fernet(raw_key.encode("ascii"))
		except (TypeError, ValueError, UnicodeEncodeError) as exc:
			raise QBTokenConfigurationError(
				"QB_TOKEN_ENCRYPTION_KEY must be a valid Fernet key"
			) from exc

	@property
	def enabled(self) -> bool:
		return self._fernet is not None

	@staticmethod
	def is_encrypted(value: str) -> bool:
		return isinstance(value, str) and value.startswith(QB_TOKEN_ENVELOPE_PREFIX)

	def encrypt(self, plaintext: str) -> str:
		if not isinstance(plaintext, str) or not plaintext:
			raise QBTokenCryptoError("QuickBooks credential values must be non-empty strings")
		if not self._fernet:
			return plaintext

		ciphertext = self._fernet.encrypt(plaintext.encode("utf-8")).decode("ascii")
		return f"{QB_TOKEN_ENVELOPE_PREFIX}{ciphertext}"

	def decrypt(self, stored_value: str) -> str:
		if not isinstance(stored_value, str) or not stored_value:
			raise QBTokenDecryptionError("Stored QuickBooks credential is empty")

		if not stored_value.startswith(_QB_TOKEN_ENVELOPE_MARKER):
			return stored_value
		if not self.is_encrypted(stored_value):
			raise QBTokenDecryptionError(
				"Stored QuickBooks credential uses an unsupported encryption version"
			)
		if not self._fernet:
			raise QBTokenConfigurationError(
				"QB_TOKEN_ENCRYPTION_KEY is required to read encrypted credentials"
			)

		ciphertext = stored_value[len(QB_TOKEN_ENVELOPE_PREFIX):]
		try:
			return self._fernet.decrypt(ciphertext.encode("ascii")).decode("utf-8")
		except (InvalidToken, UnicodeDecodeError, UnicodeEncodeError) as exc:
			raise QBTokenDecryptionError(
				"Stored QuickBooks credential could not be decrypted"
			) from exc
