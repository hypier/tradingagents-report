"""AES-GCM secret format shared with tg-web: v1.<b64-iv>.<b64-ciphertext>."""

from __future__ import annotations

import base64
import binascii
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

SECRET_BOX_VERSION = "v1"
LLM_API_KEY_AAD = "llm-provider-api-key"


def load_master_key_from_env(
    env_name: str = "BILLING_CONFIG_ENCRYPTION_KEY",
) -> bytes | None:
    raw = os.environ.get(env_name, "").strip()
    if not raw:
        return None
    try:
        key = _decode_base64(raw)
    except (binascii.Error, ValueError) as exc:
        raise ValueError(f"{env_name} must be Base64-encoded") from exc
    if len(key) != 32:
        raise ValueError(f"{env_name} must decode to exactly 32 bytes")
    return key


def decrypt_secret(value: str, context: str, key: bytes) -> str:
    version, encoded_iv, encoded_ciphertext = value.split(".", 2)
    if version != SECRET_BOX_VERSION or not encoded_iv or not encoded_ciphertext:
        raise ValueError("Unsupported encrypted secret format")
    plaintext = AESGCM(key).decrypt(
        _decode_base64(encoded_iv),
        _decode_base64(encoded_ciphertext),
        context.encode("utf-8"),
    )
    return plaintext.decode("utf-8")


def decrypt_llm_api_key(ciphertext: str, key: bytes | None = None) -> str:
    master = key if key is not None else load_master_key_from_env()
    if master is None:
        raise ValueError(
            "BILLING_CONFIG_ENCRYPTION_KEY is required to decrypt LLM API keys"
        )
    return decrypt_secret(ciphertext, LLM_API_KEY_AAD, master)


def _decode_base64(value: str) -> bytes:
    normalized = value.replace("-", "+").replace("_", "/")
    padded = normalized + ("=" * ((4 - len(normalized) % 4) % 4))
    return base64.b64decode(padded)
