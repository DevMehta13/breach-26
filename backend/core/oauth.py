"""Google OAuth2 authorization code flow with Gmail scope.

Handles:
  1. Generating the Google consent URL (with gmail.readonly scope)
  2. Exchanging the authorization code for access + refresh tokens
  3. Fetching user profile info from Google
"""

from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status

from backend.core.config import get_settings

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

# Scopes: profile/email for login, gmail.readonly for inbox sync
SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.readonly",
]


def get_google_auth_url() -> str:
    """Build the Google OAuth consent URL with gmail.readonly scope."""
    settings = get_settings()
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",  # Requests refresh_token
        "prompt": "consent",       # Force consent to always get refresh_token
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def exchange_code_for_tokens(code: str) -> dict:
    """Exchange an authorization code for access_token, refresh_token, and user info.

    Returns dict with keys:
      - access_token, refresh_token, expires_at (datetime)
      - email, full_name, avatar_url
    """
    settings = get_settings()

    # Step 1: Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )

    if token_resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Google token exchange failed: {token_resp.text}",
        )

    token_data = token_resp.json()
    access_token = token_data["access_token"]
    refresh_token = token_data.get("refresh_token")  # Only on first consent
    expires_in = token_data.get("expires_in", 3600)
    expires_at = datetime.now(timezone.utc).replace(microsecond=0)
    from datetime import timedelta
    expires_at = expires_at + timedelta(seconds=expires_in)

    # Step 2: Fetch user profile
    async with httpx.AsyncClient() as client:
        userinfo_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if userinfo_resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Failed to fetch Google user info",
        )

    userinfo = userinfo_resp.json()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": expires_at,
        "email": userinfo.get("email"),
        "full_name": userinfo.get("name", ""),
        "avatar_url": userinfo.get("picture"),
    }


async def refresh_google_token(refresh_token: str) -> dict:
    """Use a refresh token to get a new access token.

    Returns dict with: access_token, expires_at
    """
    settings = get_settings()

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "refresh_token": refresh_token,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "grant_type": "refresh_token",
            },
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Failed to refresh Google token. User must re-authenticate.",
        )

    data = resp.json()
    from datetime import timedelta
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=data.get("expires_in", 3600))

    return {
        "access_token": data["access_token"],
        "expires_at": expires_at,
    }
