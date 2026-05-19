import logging
import time
from typing import Any, List, Optional
import httpx
from core.settings import settings

logger = logging.getLogger(__name__)

class AuthNexusClient:
    """
    Client for interacting with the AuthNexus Admin API.
    Handles authentication, user provisioning, and role assignments.
    """
    _token: Optional[str] = None
    _refresh_token: Optional[str] = None
    _token_expiry: float = 0

    @classmethod
    async def _refresh_access_token(cls) -> bool:
        """
        Swaps the refresh token for a new access token via the /api/auth/refresh endpoint.
        Uses the nexus_refresh_token cookie.
        """
        if not cls._refresh_token:
            return False

        url = f"{settings.AUTH_AUTHORITY}/api/auth/refresh"
        cookies = {"nexus_refresh_token": cls._refresh_token}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, cookies=cookies)
                if resp.status_code == 200:
                    data = resp.json()
                    # Extract new access token
                    cls._token = data.get("access_token") or resp.cookies.get("access_token") or data.get("token")
                    
                    # Update refresh token if rotated
                    new_refresh = resp.cookies.get("nexus_refresh_token")
                    if new_refresh:
                        cls._refresh_token = new_refresh
                        
                    # Update expiry
                    cls._token_expiry = time.time() + 900
                    logger.info("[AuthNexusClient] Token refreshed successfully via cookie.")
                    return True
                else:
                    logger.warning(f"[AuthNexusClient] Refresh failed ({resp.status_code}): {resp.text}")
                    return False
        except Exception as e:
            logger.error(f"[AuthNexusClient] Error during token refresh: {e}")
            return False

    @classmethod
    async def _get_token(cls) -> Optional[str]:
        """
        Obtains a Bearer token via the /api/login endpoint.
        Caches the token until it expires.
        """
        # If token is still valid with plenty of time, return it
        if cls._token and time.time() < cls._token_expiry - 300:
            return cls._token

        # If token is expiring soon and we have a refresh token, try to refresh first
        if cls._refresh_token and cls._token and time.time() >= cls._token_expiry - 300:
            if await cls._refresh_access_token():
                return cls._token
            else:
                # If refresh fails, clear tokens to force full login
                cls._token = None
                cls._refresh_token = None

        if not all([settings.AUTHNEXUS_ADMIN_USER, settings.AUTHNEXUS_ADMIN_PASSWORD, settings.AUTHNEXUS_ORG_ID]):
            logger.warning("[AuthNexusClient] Admin credentials not fully configured. Sync disabled.")
            return None

        url = f"{settings.AUTH_AUTHORITY}/api/login"
        payload = {
            "username": settings.AUTHNEXUS_ADMIN_USER,
            "password": settings.AUTHNEXUS_ADMIN_PASSWORD,
            "org_id": settings.AUTHNEXUS_ORG_ID
        }

        logger.debug(f"[AuthNexusClient] Attempting login to {url} as user={settings.AUTHNEXUS_ADMIN_USER}")

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, json=payload)
                logger.debug(f"[AuthNexusClient] Login response status={resp.status_code}")
                
                if resp.status_code != 200:
                    logger.error(f"[AuthNexusClient] Login failed: {resp.status_code} — {resp.text}")
                    return None

                data = resp.json()
                logger.debug(f"[AuthNexusClient] Login response keys: {list(data.keys())}")
                
                # Try multiple possible token field names, including cookies
                cls._token = (
                    data.get("access_token") 
                    or data.get("token") 
                    or data.get("accessToken")
                    or resp.cookies.get("access_token")
                )

                # Store the refresh token cookie
                cls._refresh_token = resp.cookies.get("nexus_refresh_token")
                
                if not cls._token:
                    logger.error(f"[AuthNexusClient] No token found in login response. Full response: {data}")
                    return None

                cls._token_expiry = time.time() + 900
                expiry_str = time.strftime('%H:%M:%S', time.localtime(cls._token_expiry))
                refresh_str = time.strftime('%H:%M:%S', time.localtime(cls._token_expiry - 300))
                
                logger.info(f"[AuthNexusClient] Successfully obtained admin token. Valid until {expiry_str} (refresh scheduled for {refresh_str})")
                return cls._token
        except Exception as e:
            logger.error(f"[AuthNexusClient] Failed to login to AuthNexus: {e}", exc_info=True)
            return None

    @classmethod
    async def create_user(
        cls, 
        username: str, 
        email: Optional[str], 
        first_name: str, 
        last_name: str, 
        initial_password: str = "User@1234"
    ) -> Optional[str]:
        """
        Provisions a new human user in AuthNexus.
        Returns the auth_user_id if successful.
        """
        token = await cls._get_token()
        if not token:
            logger.warning(f"[AuthNexusClient] Skipping create_user for {username}: no admin token.")
            return None

        url = f"{settings.AUTH_AUTHORITY}/api/admin/users"
        headers = {"Authorization": f"Bearer {token}"}
        payload = {
            "userName": username,
            "firstName": first_name,
            "lastName": last_name,
            "email": email,
            "initialPassword": initial_password,
            "target_org_id": settings.AUTHNEXUS_ORG_ID
        }

        logger.debug(f"[AuthNexusClient] Creating user: username={username}, email={email}")

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
                
                # Retry once if 401
                if resp.status_code == 401:
                    logger.warning("[AuthNexusClient] 401 Unauthorized on create_user. Forcing token refresh and retrying...")
                    cls._token = None
                    cls._token_expiry = 0
                    new_token = await cls._get_token()
                    if new_token:
                        headers["Authorization"] = f"Bearer {new_token}"
                        resp = await client.post(url, json=payload, headers=headers)

                logger.debug(f"[AuthNexusClient] create_user response status={resp.status_code}")
                
                if resp.status_code == 409:
                    logger.info(f"[AuthNexusClient] User {username} already exists in AuthNexus.")
                    return None
                
                if resp.status_code >= 400:
                    logger.error(f"[AuthNexusClient] create_user failed: {resp.status_code} — {resp.text}")
                    return None

                data = resp.json()
                logger.debug(f"[AuthNexusClient] create_user response keys: {list(data.keys()) if isinstance(data, dict) else type(data)}")
                
                user_id = None
                if isinstance(data, dict):
                    user_id = data.get("id") or data.get("userId") or data.get("user_id")
                
                if user_id:
                    logger.info(f"[AuthNexusClient] User {username} created with auth_user_id={user_id}")
                else:
                    logger.warning(f"[AuthNexusClient] User {username} created but no ID in response. Full response: {data}")
                
                return str(user_id) if user_id else None
        except Exception as e:
            logger.error(f"[AuthNexusClient] Failed to create user {username} in AuthNexus: {e}", exc_info=True)
            return None

    @classmethod
    async def update_user_profile(
        cls, 
        auth_user_id: str, 
        first_name: str, 
        last_name: str
    ) -> bool:
        """
        No-op shim for compatibility during migration. AN admin panel owns identity updates.
        """
        logger.debug(f"[AuthNexusClient] update_user_profile (shim) called for {auth_user_id} -> {first_name} {last_name}")
        return True

    @classmethod
    async def assign_to_project(cls, user_id: str, role_keys: List[str]) -> bool:
        """
        Assigns roles to a user in the project.
        """
        token = await cls._get_token()
        if not token:
            logger.warning(f"[AuthNexusClient] Skipping assign_to_project for {user_id}: no admin token.")
            return False

        url = f"{settings.AUTH_AUTHORITY}/api/admin/projects/{settings.AUTH_PROJECT_ID}/bulk-assignments?org_id={settings.AUTHNEXUS_ORG_ID}"
        headers = {"Authorization": f"Bearer {token}"}
        payload = {
            "userIds": [user_id],
            "projectId": settings.AUTH_PROJECT_ID,
            "organizationId": settings.AUTHNEXUS_ORG_ID,
            "roleKeys": role_keys
        }

        logger.debug(f"[AuthNexusClient] assign_to_project: userIds={[user_id]}, projectId={settings.AUTH_PROJECT_ID}, organizationId={settings.AUTHNEXUS_ORG_ID}, roleKeys={role_keys}")

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
                
                # Retry once if 401
                if resp.status_code == 401:
                    logger.warning("[AuthNexusClient] 401 Unauthorized on assign_to_project. Forcing token refresh and retrying...")
                    cls._token = None
                    cls._token_expiry = 0
                    new_token = await cls._get_token()
                    if new_token:
                        headers["Authorization"] = f"Bearer {new_token}"
                        resp = await client.post(url, json=payload, headers=headers)

                if resp.status_code >= 400:
                    logger.error(f"[AuthNexusClient] assign_to_project failed: {resp.status_code} — {resp.text}")
                    return False

                logger.info(f"[AuthNexusClient] Roles synced for user {user_id}.")
                return True
        except Exception as e:
            logger.error(f"[AuthNexusClient] Failed to assign roles in AuthNexus: {e}", exc_info=True)
            return False

    @classmethod
    async def bulk_assign_roles(cls, user_ids: List[str], role_keys: List[str]) -> bool:
        """
        Shim to keep bulk_assign_roles working during transition phases.
        Assigns roles to each user individually.
        """
        if not user_ids:
            return True
        success = True
        for user_id in user_ids:
            res = await cls.assign_to_project(user_id, role_keys)
            if not res:
                success = False
        return success

    @classmethod
    async def assign_roles(cls, user_id: str, role_keys: List[str]) -> bool:
        """
        Convenience wrapper for assigning roles to a single user.
        """
        return await cls.assign_to_project(user_id, role_keys)

    @classmethod
    async def list_project_assignments(cls) -> List[dict]:
        """
        Lists all active project assignments from ZITADEL/AuthNexus.
        """
        token = await cls._get_token()
        if not token:
            logger.warning("[AuthNexusClient] Skipping list_project_assignments: no admin token.")
            return []

        url = f"{settings.AUTH_AUTHORITY}/api/admin/projects/{settings.AUTH_PROJECT_ID}/assignments?org_id={settings.AUTHNEXUS_ORG_ID}"
        headers = {"Authorization": f"Bearer {token}"}

        logger.debug("[AuthNexusClient] Fetching project assignments")

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, headers=headers)
                
                # Retry once if 401
                if resp.status_code == 401:
                    logger.warning("[AuthNexusClient] 401 Unauthorized on list_project_assignments. Forcing token refresh and retrying...")
                    cls._token = None
                    cls._token_expiry = 0
                    new_token = await cls._get_token()
                    if new_token:
                        headers["Authorization"] = f"Bearer {new_token}"
                        resp = await client.get(url, headers=headers)

                if resp.status_code >= 400:
                    logger.error(f"[AuthNexusClient] list_project_assignments failed: {resp.status_code} — {resp.text}")
                    return []

                data = resp.json()
                assignments = data if isinstance(data, list) else data.get("result") or []
                active_assignments = [
                    a for a in assignments 
                    if a.get("state") == "USER_GRANT_STATE_ACTIVE" or a.get("state") == "active"
                ]
                return active_assignments
        except Exception as e:
            logger.error(f"[AuthNexusClient] Failed to list project assignments in AuthNexus: {e}", exc_info=True)
            return []

    @classmethod
    async def get_user(cls, user_id: str) -> Optional[dict]:
        """
        Fetches user profile information by user ID from ZITADEL/AuthNexus.
        """
        token = await cls._get_token()
        if not token:
            logger.warning(f"[AuthNexusClient] Skipping get_user for {user_id}: no admin token.")
            return None

        url = f"{settings.AUTH_AUTHORITY}/api/admin/users/{user_id}?org_id={settings.AUTHNEXUS_ORG_ID}"
        headers = {"Authorization": f"Bearer {token}"}

        logger.debug(f"[AuthNexusClient] Fetching user: user_id={user_id}")

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, headers=headers)
                
                # Retry once if 401
                if resp.status_code == 401:
                    logger.warning("[AuthNexusClient] 401 Unauthorized on get_user. Forcing token refresh and retrying...")
                    cls._token = None
                    cls._token_expiry = 0
                    new_token = await cls._get_token()
                    if new_token:
                        headers["Authorization"] = f"Bearer {new_token}"
                        resp = await client.get(url, headers=headers)

                if resp.status_code == 404:
                    logger.info(f"[AuthNexusClient] User {user_id} not found.")
                    return None

                if resp.status_code >= 400:
                    logger.error(f"[AuthNexusClient] get_user failed: {resp.status_code} — {resp.text}")
                    return None

                return resp.json()
        except Exception as e:
            logger.error(f"[AuthNexusClient] Failed to get user {user_id} in AuthNexus: {e}", exc_info=True)
            return None

    @classmethod
    async def delete_user(cls, user_id: str) -> bool:
        """
        Deletes a user from AuthNexus (used as compensating transaction).
        """
        token = await cls._get_token()
        if not token:
            logger.warning(f"[AuthNexusClient] Skipping delete_user for {user_id}: no admin token.")
            return False

        url = f"{settings.AUTH_AUTHORITY}/api/admin/users/{user_id}?org_id={settings.AUTHNEXUS_ORG_ID}"
        headers = {"Authorization": f"Bearer {token}"}

        logger.debug(f"[AuthNexusClient] Deleting user: user_id={user_id}")

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.delete(url, headers=headers)
                
                # Retry once if 401
                if resp.status_code == 401:
                    logger.warning("[AuthNexusClient] 401 Unauthorized on delete_user. Forcing token refresh and retrying...")
                    cls._token = None
                    cls._token_expiry = 0
                    new_token = await cls._get_token()
                    if new_token:
                        headers["Authorization"] = f"Bearer {new_token}"
                        resp = await client.delete(url, headers=headers)

                if resp.status_code >= 400:
                    logger.error(f"[AuthNexusClient] delete_user failed: {resp.status_code} — {resp.text}")
                    return False

                logger.info(f"[AuthNexusClient] User {user_id} successfully deleted from AuthNexus.")
                return True
        except Exception as e:
            logger.error(f"[AuthNexusClient] Failed to delete user {user_id} in AuthNexus: {e}", exc_info=True)
            return False
