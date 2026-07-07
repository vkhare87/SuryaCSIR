"""Auth for the /query surface. Security contract: the caller's Supabase JWT is used for
every read, so Postgres RLS is the single gate deciding which documents/trees are visible.
The query service holds no service key — it cannot see anything the caller cannot."""

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


def scoped_client(anon_url: str, anon_key: str, jwt: str):
    """Anon client whose PostgREST calls carry the caller's JWT, so RLS applies to reads."""
    client = create_client(anon_url, anon_key)
    client.postgrest.auth(jwt)
    return client
