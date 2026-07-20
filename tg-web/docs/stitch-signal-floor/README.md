# Stitch output — Signal Floor

Generated via Stitch MCP (`@_davideast/stitch-mcp`) from locked [`../DESIGN.md`](../DESIGN.md).

## Project

| Field | Value |
|-------|-------|
| Project ID | `1569462075777471397` |
| Open in Stitch | https://stitch.withgoogle.com/projects/1569462075777471397 |
| Design system asset | `02eab4d5ab8846b3a979ff7033739af0` (displayName: Signal Floor) |

## Screens

| File | Screen | Screen ID |
|------|--------|-----------|
| [01-research-desk.png](./01-research-desk.png) | Research Desk (Home) | `183094128b664f2599250784e85bf443` |
| [02-report-detail.png](./02-report-detail.png) | Report Detail | `b13e698481734e2aaaf5f9b4602cff43` |
| [03-tasks-center.png](./03-tasks-center.png) | Tasks Center | `c266b2a0039a4eac85a9f4b25b2ec4ea` |

IDs also recorded in [`project.json`](./project.json).

## How this was generated

1. `create_project` → TG Web — Signal Floor  
2. `upload_design_md` ← `tg-web/DESIGN.md`  
3. `create_design_system_from_design_md`  
4. `generate_screen_from_text` ×3 with `designSystem: assets/02eab4d5ab8846b3a979ff7033739af0`, `deviceType: DESKTOP`, `modelId: GEMINI_3_FLASH`  
5. `get_screen_image` → PNGs in this folder  

Note: Cursor’s built-in `user-stitch` MCP session was not loaded; generation used the same API key from `~/.cursor/mcp.json` through the Stitch MCP CLI proxy.
