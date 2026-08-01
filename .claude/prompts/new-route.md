# Prompt scaffold: new route / feature slice

Stack-conditional scaffold. Use the section(s) matching the detected stack. All responses follow the
`{status, status_code, message, timestamp, data}` contract; validate input at the boundary; tests land in the same pass.

---

## Python API — FastAPI + Pydantic v2

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/<resource>", tags=["<resource>"])


class Create<Resource>(BaseModel):
    # validate at the boundary — Pydantic v2 model
    name: str


class <Resource>Out(BaseModel):
    id: str
    name: str


@router.post("")
async def create_<resource>(body: Create<Resource>, user=Depends(get_current_user)):
    # authorize: may THIS caller act here? scope queries to the caller where data is owned.
    result = await service.create(body, owner=user.sub)
    return envelope(status_code=201, message="<resource> created", data=<Resource>Out.model_validate(result).model_dump())  # standard envelope helper (rules/api-standards.md)
```

- Input validated by the Pydantic model; typed; `mypy --strict` clean.
- Response uses the envelope contract. Return 404 (not 403) for resources the caller may not see.
- Test: happy path + unauthorized + not-found + validation-error, all asserting the envelope shape.

---

## React component (React 18, function + hooks)

```tsx
export function <Resource>Panel({ id }: { id: string }) {
  const { data, error, isLoading } = use<Resource>(id)   // typed hook, no `any`

  if (isLoading) return <Spinner />                       // loading state
  if (error) return <ErrorState message={error.message} />// error state
  if (!data?.length) return <EmptyState />                // empty state
  return <ul className="flex flex-col gap-2">{/* Tailwind utilities only */}</ul>
}
```

- Loading + error + empty are all designed, not just the happy path.
- No `any`; no `.then()` (async/await in the hook). ≤200 lines → split.

---

## Vue component (Vue 3 `<script setup>`)

```vue
<script setup lang="ts">
const props = defineProps<{ id: string }>()
const { data, error, isLoading } = use<Resource>(props.id)
</script>

<template>
  <Spinner v-if="isLoading" />
  <ErrorState v-else-if="error" :message="error.message" />
  <EmptyState v-else-if="!data?.length" />
  <ul v-else class="flex flex-col gap-2"><!-- Tailwind utilities only --></ul>
</template>
```
