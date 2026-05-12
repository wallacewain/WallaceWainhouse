# Recipe Maker / Reader — Design Notes

## wmw-recipe/1 Schema

Every exported JSON starts with:
```json
{
  "schema": "wmw-recipe/1",
  "license": "CC BY-NC 4.0",
  "id": "<uid>",
  "title": "...",
  "serves": 4,
  "cuisine": "Italian",
  "tags": ["pasta", "weeknight"],
  "description": "...",
  "tips": ["overall recipe tip"],
  "ingredients": [ /* see below */ ],
  "steps": [ /* see below */ ],
  "media": [ /* see below */ ]
}
```

---

## Step Object

```json
{
  "id": "abc1234",
  "order": 1,
  "process": "Fry",
  "process_category": "cook",
  "ingredient_ids": ["ing-id-1", "ing-id-2"],
  "vessel": "Frying pan",
  "heat": "Med-high",
  "heat_unit": "descriptive",
  "duration_s": 300,
  "duration_type": "recorded",
  "notes": "Fine dice, about 5mm",
  "target": "Golden",
  "tips": ["If garlic starts to brown, pull the pan off the heat"],

  "photos": ["media-id-1"],

  // ── Graph / parallel fields ──
  "after": [],
  "parallel_ok": false,
  "parallel_with": [],
  "stream": null,

  // ── Attention / timing contract fields ──
  "attention": "constant",
  "check_interval_s": null,
  "can_extend_s": 60,
  "can_interrupt": false
}
```

---

## Parallel Step Model

Steps form a **directed acyclic graph (DAG)**, not just a linear list.

### Key fields

| Field | Type | Meaning |
|-------|------|--------|
| `after` | `string[]` | This step cannot start until all listed step IDs are complete |
| `parallel_with` | `string[]` | Informational: runs concurrently with these step IDs |
| `parallel_ok` | `bool` | True if this step has any parallel context |
| `stream` | `string\|null` | Named parallel lane, e.g. `"sauce"`, `"protein"`, `"garnish"` |

### Merge points

A step is a **merge point** if its `after` array contains 2+ step IDs.

```
Step A (simmer sauce, 30 min) ─┐
                                ├── Step C (combine and reduce, 5 min)
Step B (boil pasta, 10 min) ───┘
```

Step C:
```json
{
  "id": "step-c",
  "process": "Combine",
  "after": ["step-a", "step-b"],
  "parallel_with": []
}
```

The recipe reader must:
1. Find all steps whose `after` includes merge-step predecessors
2. Schedule predecessors so they finish as close together as possible
3. Alert the chef when a merge point is approaching (e.g. "sauce done in 5 min, pasta has 8 min left — reduce heat")

### Streams

`stream` names a logical lane for visual layout in the reader timeline:

```json
"stream": "sauce"   // lane 1
"stream": "protein" // lane 2
"stream": null      // main / default lane
```

The reader renders one swimlane per unique stream value. Steps without a stream go in the default lane.

---

## Attention & Interrupt Fields

These let the recipe reader know how much chef attention a step requires and what flexibility exists around timing.

### `attention`

| Value | Meaning | Examples |
|-------|---------|---------|
| `"constant"` | Chef cannot leave — must watch the whole time | Searing steak, tempering chocolate, deep-frying |
| `"periodic"` | Check at regular intervals | Stirring risotto, skimming stock, caramelising onions |
| `"passive"` | Set and forget with occasional glance | Oven roasting, slow simmer, steaming |
| `"none"` | Completely unattended | Marinating, chilling, proofing dough, resting meat |

### `check_interval_s`

For `"periodic"` steps: how often (in seconds) the chef should check.  
`null` for all other attention levels.

### `can_extend_s`

How long (seconds) the food can safely wait after the step completes before quality degrades.

| Value | Meaning |
|-------|--------|
| `null` | Must act immediately (e.g. seared steak — it's overcooking as we speak) |
| `60` | 1 minute of leeway |
| `600` | 10 minutes (e.g. roasted veg keeping warm in oven) |
| `-1` | Indefinite (stock on low heat, marinade overnight, proved dough in fridge) |

### `can_interrupt`

Can this step be paused mid-way and resumed later?

- `false`: Once started, must complete in one go (searing, blanching, frying battered food)
- `true`: Can step away and come back (kneading dough, simmering stock, marinating)

### Auto-inference defaults (by process)

The recipe maker auto-sets these when a process is selected. They can be overridden in edit mode.

| Process | attention | check_interval_s | can_extend_s | can_interrupt |
|---------|-----------|-----------------|--------------|---------------|
| Fry / Sauté / Stir-fry | constant | — | 60 | false |
| Deep-fry | constant | — | 30 | false |
| Sear | constant | — | null | false |
| Brown | periodic | 120 | 120 | false |
| Sweat | periodic | 120 | 300 | true |
| Caramelise | periodic | 60 | 60 | false |
| Simmer (pan) | passive | 300 | 600 | true |
| Reduce | periodic | 120 | 120 | false |
| Deglaze | constant | — | null | false |
| Roast / Bake | passive | 600 | 900 | true |
| Grill / Broil / Gratinate | constant | — | 120 | false |
| Slow roast | none | — | 1800 | true |
| Boil | periodic | 180 | 120 | true |
| Steam | passive | 300 | 300 | true |
| Poach | periodic | 120 | 120 | true |
| Blanch | constant | — | null | false |
| Pressure cook | none | — | 1200 | false |
| Rest / Cool / Chill / Proof | none | — | -1 | true |

---

## Recipe Reader — Scheduling Algorithm

### Single recipe

1. **Build DAG** from each step's `after` array
2. **Topological sort** to find valid execution order
3. **Critical path** = longest chain of sequential steps (determines minimum total time)
4. **Schedule parallel streams** backwards from the merge point:
   - Each stream's start time = merge_point_start - stream_duration
   - Alert if a stream can't fit: "Start pasta 20 min before service"
5. **Real-time adjustment**: if a step runs long/short, recalculate downstream schedule

### Multi-recipe (restaurant) coordination

Load N recipe files. Each has its own DAG.

**Goal**: all `serve`/`plate` steps land within a target service window.

Algorithm:
```
service_time = user-set target (e.g. 19:30)
for each recipe:
  total_time = critical_path_duration(recipe)
  start_time[recipe] = service_time - total_time
```

Cross-recipe merge points (e.g. "plate all dishes together"):
```json
{
  "process": "Plate",
  "after": ["last-step-recipe-1", "last-step-recipe-2"]
}
```
This is expressed in a "service file" — a recipe file that imports step IDs from other recipes. (Future feature.)

### Chef alerts

The reader should fire alerts for:

| Event | Alert |
|-------|-------|
| `attention: "constant"` step starting | "⚠️ [Process] starting — don't walk away" |
| `check_interval_s` elapsed | "⏰ Check [ingredient] — [process]" |
| `can_extend_s` running out | "🔴 [Step] finishing in 2 min — start [next step]" |
| `can_extend_s: null` step done | "🚨 [Step] done — must act NOW" |
| Merge point approaching | "🔀 [Step A] finishes in 5 min — [Step B] has 8 min left" |
| `can_interrupt: false` step starting | "🔒 [Step] must complete in one go" |

---

## Ingredient Object

```json
{
  "id": "uid",
  "name": "Carrot",
  "qty": 2,
  "unit": "whole",
  "category": "Veg"
}
```

`qty` and `unit` are optional (null = unspecified). The record mode captures name + category; qty/unit can be filled in via edit mode.

---

## Media Object

```json
{
  "id": "uid",
  "type": "image/jpeg",
  "caption": "After 5 min — should look like this",
  "storage": "embedded",
  "data": "data:image/jpeg;base64,...",
  "filename": "step-3-photo.jpg"
}
```

When saving to folder (FSA API), `storage` becomes `"external"` and `data` is removed. The reader looks for media files in a `media/` subdirectory next to the JSON file.

---

## Things Still To Build

- **Recipe Reader** (`/tools/recipe-reader/index.html`):
  - Load 1+ recipe files
  - Render per-stream timeline
  - Live step-through with timer
  - Merge point detection and warnings
  - Chef alerts (attention, can_extend_s warnings)
  - Multi-recipe service time coordination

- **Edit mode** additions:
  - `stream` field on steps
  - `attention` / `check_interval_s` / `can_extend_s` / `can_interrupt` overrides per step
  - Ingredient qty/unit editing

- **Parallel step UX** in record mode:
  - Visual indicator of which steps are currently parallel
  - Ability to name a stream when starting a parallel branch
  - "Merge here" button to create a step that waits for multiple streams
