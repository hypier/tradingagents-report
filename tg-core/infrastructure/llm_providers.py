"""Read LLM provider credentials from the shared PostgreSQL catalog."""

from __future__ import annotations

from infrastructure import database
from infrastructure.secret_box import decrypt_llm_api_key


def get_provider_runtime_config(provider_id: str) -> dict:
    """Return decrypted api_key and optional backend_url for a provider.

    Raises ValueError when the provider is missing, disabled, or has no key.
    """
    provider = provider_id.strip().lower()
    with database.connect() as conn:
        row = conn.execute(
            """
            SELECT id, enabled, backend_url, api_key_ciphertext
            FROM llm_providers
            WHERE id = %s
            """,
            (provider,),
        ).fetchone()
    if row is None:
        raise ValueError(f"LLM provider '{provider}' is not configured")
    if not row.get("enabled"):
        raise ValueError(f"LLM provider '{provider}' is disabled")
    ciphertext = row.get("api_key_ciphertext")
    if not ciphertext:
        raise ValueError(f"LLM provider '{provider}' has no API key configured")
    result = {
        "provider": row["id"],
        "api_key": decrypt_llm_api_key(str(ciphertext)),
    }
    backend_url = row.get("backend_url")
    if isinstance(backend_url, str) and backend_url.strip():
        result["backend_url"] = backend_url.strip()
    return result
