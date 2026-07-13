from __future__ import annotations

import os
import secrets
from typing import Annotated

from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

API_KEY_ENV = "TRADINGAGENTS_API_KEY"
_bearer_token = HTTPBearer(auto_error=False)


def require_api_key(
    provided: Annotated[HTTPAuthorizationCredentials | None, Security(_bearer_token)],
) -> None:
    expected = os.getenv(API_KEY_ENV)
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"API authentication is not configured; set {API_KEY_ENV}",
        )
    if provided is None or not secrets.compare_digest(provided.credentials, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or missing bearer token",
        )
