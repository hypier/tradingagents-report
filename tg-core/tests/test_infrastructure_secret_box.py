import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from infrastructure.secret_box import (
    LLM_API_KEY_AAD,
    SECRET_BOX_VERSION,
    decrypt_llm_api_key,
    decrypt_secret,
)


def test_decrypt_secret_roundtrip_matches_web_format():
    key = os.urandom(32)
    iv = os.urandom(12)
    plaintext = b"sk-test-secret"
    ciphertext = AESGCM(key).encrypt(iv, plaintext, LLM_API_KEY_AAD.encode())
    encoded = ".".join(
        [
            SECRET_BOX_VERSION,
            base64.b64encode(iv).decode(),
            base64.b64encode(ciphertext).decode(),
        ]
    )

    assert decrypt_secret(encoded, LLM_API_KEY_AAD, key) == "sk-test-secret"
    assert decrypt_llm_api_key(encoded, key) == "sk-test-secret"
