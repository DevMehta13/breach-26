import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_db
from backend.core.auth import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
    get_current_user,
)
from backend.core.oauth import get_google_auth_url, exchange_code_for_tokens
from backend.models.user import User
from backend.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    GoogleAuthRequest,
    GoogleCallbackRequest,
    TokenResponse,
    UserResponse,
)

_optional_bearer = HTTPBearer(auto_error=False)

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        auth_provider="native",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    return TokenResponse(access_token=create_access_token(user.id))


# ── Google OAuth2 Flow ───────────────────────────────────────────


@router.get("/google/url")
async def google_oauth_url():
    """Return the Google OAuth consent URL (includes gmail.readonly scope)."""
    return {"url": get_google_auth_url()}


@router.post("/google/callback")
async def google_oauth_callback(
    body: GoogleCallbackRequest,
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
):
    """Exchange Google authorization code for tokens.

    Two modes:
    1. **Login/Signup** (no JWT): Creates or updates user, returns JWT.
    2. **Account Linking** (valid JWT present): Links Google tokens to the
       already-authenticated user and returns a success message.
    """
    google_data = await exchange_code_for_tokens(body.code)

    # ── Account Linking: logged-in user connecting Google ─────
    if credentials:
        try:
            payload = decode_access_token(credentials.credentials)
            user_id = payload.get("sub")
            if user_id:
                result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
                current_user = result.scalar_one_or_none()
                if current_user:
                    current_user.google_access_token = google_data["access_token"]
                    if google_data["refresh_token"]:
                        current_user.google_refresh_token = google_data["refresh_token"]
                    current_user.google_token_expiry = google_data["expires_at"]
                    current_user.avatar_url = google_data.get("avatar_url") or current_user.avatar_url
                    await db.commit()
                    return {"linked": True, "message": "Google account linked successfully"}
        except Exception:
            pass  # Invalid JWT — fall through to normal login flow

    # ── Normal Login / Signup ─────────────────────────────────
    result = await db.execute(select(User).where(User.email == google_data["email"]))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            email=google_data["email"],
            full_name=google_data["full_name"],
            avatar_url=google_data["avatar_url"],
            auth_provider="google",
            google_access_token=google_data["access_token"],
            google_refresh_token=google_data["refresh_token"],
            google_token_expiry=google_data["expires_at"],
        )
        db.add(user)
    else:
        user.avatar_url = google_data.get("avatar_url") or user.avatar_url
        user.google_access_token = google_data["access_token"]
        if google_data["refresh_token"]:
            user.google_refresh_token = google_data["refresh_token"]
        user.google_token_expiry = google_data["expires_at"]

    await db.commit()
    await db.refresh(user)

    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/google", response_model=TokenResponse)
async def google_auth_legacy(body: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    """Legacy endpoint: accepts a Google access token directly (no code exchange).

    Kept for backwards compatibility. Prefer /google/callback for the full
    OAuth2 flow with gmail.readonly scope.
    """
    from backend.core.oauth import GOOGLE_USERINFO_URL
    import httpx

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {body.token}"},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token")

    data = resp.json()
    google_user = {
        "email": data.get("email"),
        "full_name": data.get("name", ""),
        "avatar_url": data.get("picture"),
    }

    result = await db.execute(select(User).where(User.email == google_user["email"]))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            email=google_user["email"],
            full_name=google_user["full_name"],
            avatar_url=google_user["avatar_url"],
            auth_provider="google",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    elif user.auth_provider == "google":
        user.avatar_url = google_user.get("avatar_url") or user.avatar_url
        await db.commit()

    return TokenResponse(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.from_user(current_user)
