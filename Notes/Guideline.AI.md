# Project Guidelines

Follow  **SOLID** ,  **DRY** ,  **KISS** , and **Andrej Karpathy** principles while building the application. Each application must maintain production standards and be easy to customize if required in the future.

---

# Golden Rule: Until I don't tell you don't try to edit and update code, first propose the plan, once verify from my side then tell you to do that then only do untill don't edit and commit the direct chnage sin code. Never made chnages in docker files in code, if any suggestion required then suggest me first to maual approve.

## Core Guidelines

1. If any email-services, in-house built services, microservices, etc. are being created, provide one option in env to enable or disable them while keeping the nomenclature maintained across the project.
2. Always use a config file — one for development locally and one for deployment to use with actual data.
3. Add logs conditionally on each API to track which one is called, what the error or response will be with status code. Manage this with env variable — in development, full logs run; in production, only error/warn logs execute.
4. Always follow the hierarchy of Role Access on the dashboard and remove unnecessary blocks or containers from the UI.
5. Follow component-based architecture for the client side.
6. While asking for a review and responding you, the answer should be easy to understand — do not use too fancy words, keep inshort summary, no long theory and overcommenting.
7. Never execute to fix ESLint errors or commit files to GitHub until specifically told to. This saves tokens from being exhausted unknowingly and unnecessarily.
8. Always follow the right approach that matches standard practices in coding.
9. Always maintain responsive UI. We target 3 different types of responsiveness —  **mobile** ,  **tablet** , and **desktop** — keep this in mind before any planning or making changes in code.
10. Always create a component so that it can be used wherever needed as a common component. Examples: advanced filtering, filtering, sorting, debounce logic, searching, pagination, etc.
11. For any popup dialog box, keep it like a confirmation dialog box with icon-based actions (e.g., close with a cross icon). While the dialog box is open, keep the background blurred and strictly prevent background scrolling — it will be static until the dialog box is closed successfully.
12. Follow the same hover-over CSS across the project to maintain consistency.
13. Always execute a plan in short with only necessary details. If possible, create a table based on current code — what will change, what it will impact, and whether any other functionality breaks due to this change, and if yes, what that will be.
14. Never expose API keys or sensitive tokens in the UI to prevent security breaches.
15. In code if we use `in_stock`, `in_maintain` — in the UI it will always appear as  **In Stock** ,  **In Maintain** .
16. Always add a comment on each API describing what it does and what it is capable of.
17. Always create a global error component so that it can be called and re-used wherever needed across the project.
18. Always create a toast component so that success and failure responses can be shown wherever needed, it will always apearing in bottom right posiiton, auto dissappear after the dealy of 5-sec, with option close(eg:- cross icon for close))
19. Every API call in the backend and frontend must pass via middleware.
20. Never store sensitive information in LocalStorage until it will be an special case told to say.
21. Never use `type = any` in TypeScript.
22. Always add one `/api/health` endpoint for API health check. All APIs created must return a response in this format:
    **Success Response:**

    ```json
    {
      "status": "success",
      "status_code": 200,
      "message": "Notification microservice is running",
      "timestamp": "2026-04-22T05:39:44.400383+00:00",
      "data": {
        "service": "email-microservice"
      }
    }
    ```

    **Error Response:**

    ```json
    {
      "status": "error",
      "status_code": 404,
      "message": "Service not found", # this will be proper error msg
      "timestamp": "2026-04-22T05:39:44.400383+00:00",
      "data": null,
      "error": {
        "code": "SERVICE_NOT_FOUND",
        "details": "No service registered with the given name"
      }
    }
    ```
23. Maintain folder structure. Example:

    ```
    /services
    /controllers
    /middlewares
    /utils
    /config
    ```
24. All environment variables must be validated at app startup. If a required variable is missing, the app must exit with a clear error message — not fail silently at runtime.
25. No raw numbers or strings in logic. Use constants or enums.

    ```
    Bad:  if (role === 3)
    Good: if (role === ROLES.ADMIN)
    ```
26. Every async function must have error handling. No unhandled promise rejections allowed anywhere in the codebase.
27. All list APIs must support pagination by default. No API should return unbounded results. Standard params: `page`, `limit`, `sort_by`, `order` (asc/desc).
28. All APIs that mutate data (POST, PUT, DELETE) must validate the request body before it reaches the service layer.
29. If we are implementing DELETE feature then only use soft delete by default (`is_deleted`, `deleted_at`). Never hard delete records unless explicitly required and documented, or I told you.
30. All database tables must have `created_at` and `updated_at` timestamps.
31. API versioning from day one — `/api/v1/...`. Never expose unversioned routes in production.
32. Every data-driven screen must handle 3 states explicitly:

    * **Loading state**
    * **Empty state**
    * **Error state**

    Never leave a blank screen for the user.
33. All API calls must go through a centralized service/api layer. No raw `fetch()` or `axios()` calls directly inside components.
34. Always use TanStack Query for all server-state management on the client side.
    No direct axios/fetch calls inside components — all API calls go through
    TanStack Query hooks (useQuery, useMutation). This handles loading, empty,
    and error states consistently across the project.
35. All static display labels, button text, and messages must come from a constants file — never hardcoded inside JSX, until I told you.
36. Rate limiting must be applied on all public-facing APIs (login, signup, OTP, password reset, etc.).
37. All user inputs must be sanitized before processing or storing.
38. Branch naming convention:
    feature/
    fix/
    hotfix/
    chore/
    refactor/

    Commit message format:
    feat: | fix: | chore: | refactor: | docs:
39. Every service or module must have its own README section before it goes for code review.
40. Keep a `CHANGELOG.md` — update it on every meaningful release.
41. Branch naming convention:

    ```
    feature/
    fix/
    hotfix/
    chore/
    refactor/
    ```

    Commit message format:

    ```
    feat: | fix: | chore: | refactor: | docs:
    ```
42. Every service or module must have its own README section before it goes for code review.
43. Keep a `CHANGELOG.md` — update it on every meaningful release.
44. It was strictally to use https://www.ux4g.gov.in/  website for color code never used which is not mentioned

---

## Final Review Before Code Commit

1. Add all test files in `.gitignore`
2. Add all env files in `.gitignore`
3. Add `.env.example` for a clear view of what needs to be added in env for easy setup of the application
4. Update all READMEs, follow marmaid diagram for flow understanding.
5. Always add unnecessary junk files in `.gitignore` to keep a clean architecture

---

## Environment Variables

Refer to `.env.example` for all required environment variables before setting up the project.

---

## Changelog

Refer to `CHANGELOG.md` for version history and release notes.
