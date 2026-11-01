"""Auth for the /query surface. Security contract: the caller's Supabase JWT is used for
every read, so Postgres RLS is the single gate deciding which documents/trees are visible.
The query service holds no service key — it cannot see anything the caller cannot."""

import base64
import hashlib
import hmac
import json
import time
import uuid

from supabase import create_client


def verify_token(jwt: str, anon_url: str, anon_key: str):
    """Return the authenticated user for a JWT, or raise PermissionError."""
    client = create_client(anon_url, anon_key)
    try:
        resp = client.auth.get_user(jwt)
    except Exception as e:
        raise PermissionError("invalid token") from e
    if resp is None or resp.user is None:
        raise PermissionError("invalid token")
    return resp.user


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def mint_user_token(secret: str, user_id: str, email: str | None, ttl_s: int = 300, now=None,
                    jti: str | None = None) -> str:
    """Short-lived HS256 access token for one user, signed with the project's JWT
    secret. Used only by the briefs worker to answer a user's saved question AS that
    user, so RLS scopes the answer. Carries `email` because caller_email() (staff
    scoping) reads it. Five minutes covers one answer; nothing stores the token.

    Anyone holding the secret can mint a token for any user, MasterAdmin included
    (SEC-10): the secret's file ACL is the real control (deploy/README.md). The
    jti gives each legitimate token a name the worker log records."""
    iat = int(now if now is not None else time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {"sub": user_id, "role": "authenticated", "aud": "authenticated",
               "iat": iat, "exp": iat + ttl_s, "jti": jti or uuid.uuid4().hex}
    if email:
        payload["email"] = email
    signing = ".".join(_b64url(json.dumps(p, separators=(",", ":")).encode()) for p in (header, payload))
    sig = hmac.new(secret.encode(), signing.encode(), hashlib.sha256).digest()
    return f"{signing}.{_b64url(sig)}"


def scoped_client(anon_url: str, anon_key: str, jwt: str):
    """Anon client whose PostgREST calls carry the caller's JWT, so RLS applies to reads."""
    client = create_client(anon_url, anon_key)
    client.postgrest.auth(jwt)
    return client
