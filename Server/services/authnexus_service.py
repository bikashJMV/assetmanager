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
        initial_password: str = "Welcome123!"
    ) -> Optional[str]:
        """
        Provisions a new human user in AuthNexus.
        Returns the auth_user_id if successful.
        """
        token = await cls._get_token()
        if not token:
            logger.warning(f"[AuthNexusClient] Skipping create_user for {username}: no admin token.")
            return None

        url = f"{settings.AUTH_AUTHORITY}/api/admin/users/add"
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
        Updates the human user's profile (firstName, lastName) in AuthNexus.
        """
        token = await cls._get_token()
        if not token:
            logger.warning(f"[AuthNexusClient] Skipping update_user_profile for {auth_user_id}: no admin token.")
            return False

        # Endpoint based on standard Zitadel/AuthNexus pattern
        url = f"{settings.AUTH_AUTHORITY}/api/admin/users/{auth_user_id}/profile"
        headers = {"Authorization": f"Bearer {token}"}
        payload = {
            "firstName": first_name,
            "lastName": last_name
        }

        logger.debug(f"[AuthNexusClient] Updating profile for {auth_user_id}: {payload}")

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.put(url, json=payload, headers=headers)
                
                # Retry once if 401
                if resp.status_code == 401:
                    logger.warning("[AuthNexusClient] 401 Unauthorized on update_user_profile. Forcing token refresh and retrying...")
                    cls._token = None
                    cls._token_expiry = 0
                    new_token = await cls._get_token()
                    if new_token:
                        headers["Authorization"] = f"Bearer {new_token}"
                        resp = await client.put(url, json=payload, headers=headers)

                if resp.status_code >= 400:
                    logger.error(f"[AuthNexusClient] update_user_profile failed: {resp.status_code} — {resp.text}")
                    return False
                
                logger.info(f"[AuthNexusClient] Profile updated for {auth_user_id}")
                return True
        except Exception as e:
            logger.error(f"[AuthNexusClient] Failed to update profile for {auth_user_id}: {e}", exc_info=True)
            return False

    @classmethod
    async def bulk_assign_roles(cls, user_ids: List[str], role_keys: List[str]) -> bool:
        """
        Assigns roles to multiple users in the project.
        Uses skipIfExists=False to ensure roles are synced/overwritten.
        """
        if not user_ids:
            return True

        token = await cls._get_token()
        if not token:
            logger.warning("[AuthNexusClient] Skipping bulk_assign_roles: no admin token.")
            return False

        url = f"{settings.AUTH_AUTHORITY}/api/admin/projects/{settings.AUTH_PROJECT_ID}/bulk-assignments"
        headers = {"Authorization": f"Bearer {token}"}
        payload = {
            "userIds": user_ids,
            "projectId": settings.AUTH_PROJECT_ID,
            "organizationId": settings.AUTHNEXUS_ORG_ID,
            "roleKeys": role_keys,
            "skipIfExists": False
        }

        logger.debug(f"[AuthNexusClient] bulk_assign_roles: userIds={user_ids}, roleKeys={role_keys}")

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
                
                # Retry once if 401
                if resp.status_code == 401:
                    logger.warning("[AuthNexusClient] 401 Unauthorized on bulk_assign_roles. Forcing token refresh and retrying...")
                    cls._token = None
                    cls._token_expiry = 0
                    new_token = await cls._get_token()
                    if new_token:
                        headers["Authorization"] = f"Bearer {new_token}"
                        resp = await client.post(url, json=payload, headers=headers)

                if resp.status_code >= 400:
                    logger.error(f"[AuthNexusClient] bulk_assign_roles failed: {resp.status_code} — {resp.text}")
                    return False

                logger.info(f"[AuthNexusClient] Roles synced for {len(user_ids)} users.")
                return True
        except Exception as e:
            logger.error(f"[AuthNexusClient] Failed to bulk assign roles in AuthNexus: {e}", exc_info=True)
            return False

    @classmethod
    async def assign_roles(cls, user_id: str, role_keys: List[str]) -> bool:
        """
        Convenience wrapper for assigning roles to a single user.
        """
        return await cls.bulk_assign_roles([user_id], role_keys)
