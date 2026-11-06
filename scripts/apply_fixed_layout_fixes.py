import re
from pathlib import Path

# 1. Update frontend/src/index.css
css_path = Path("frontend/src/index.css")
css_content = css_path.read_text(encoding="utf-8")

old_body_regex = r"body\s*\{[^}]*min-height:\s*100vh;[^}]*\}"
new_body = """html,
  body {
    height: 100%;
    margin: 0;
    padding: 0;
  }

  body {
    background-color: var(--background);
    color: var(--text-primary);
    font-family: 'Inter', 'Noto Sans Telugu', system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    height: 100%;
    margin: 0;
    padding: 0;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    overflow: hidden;
  }

  #root {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }"""

css_content, count = re.subn(old_body_regex, new_body, css_content, count=1)
if count > 0:
    css_path.write_text(css_content, encoding="utf-8")
    print("Updated frontend/src/index.css")
else:
    print("Could not find body in index.css")

# 2. Update TeacherLayout.tsx
tl_path = Path("frontend/src/components/layout/TeacherLayout.tsx")
tl_content = tl_path.read_text(encoding="utf-8")
tl_content = tl_content.replace('h-screen flex flex-col', 'h-full flex flex-col')
tl_content = tl_content.replace('flex-1 flex overflow-hidden', 'flex-1 min-h-0 flex overflow-hidden')
tl_content = tl_content.replace('main className="flex-1 min-w-0 bg-[#F8FAF7] overflow-y-auto"', 'main className="flex-1 min-w-0 min-h-0 bg-[#F8FAF7] overflow-y-auto"')
tl_path.write_text(tl_content, encoding="utf-8")
print("Updated TeacherLayout.tsx")

# 3. Update StudentLayout.tsx
sl_path = Path("frontend/src/components/layout/StudentLayout.tsx")
sl_content = sl_path.read_text(encoding="utf-8")
sl_content = sl_content.replace('h-screen flex flex-col', 'h-full flex flex-col')
sl_content = sl_content.replace('flex-1 flex overflow-hidden', 'flex-1 min-h-0 flex overflow-hidden')
sl_content = sl_content.replace('main className="flex-1 min-w-0 bg-[#F8FAF7] overflow-y-auto"', 'main className="flex-1 min-w-0 min-h-0 bg-[#F8FAF7] overflow-y-auto"')
sl_path.write_text(sl_content, encoding="utf-8")
print("Updated StudentLayout.tsx")

# 4. Update InstitutionAdminLayout.tsx
ia_path = Path("frontend/src/components/layout/InstitutionAdminLayout.tsx")
ia_content = ia_path.read_text(encoding="utf-8")
ia_content = ia_content.replace('h-screen flex flex-col', 'h-full flex flex-col')
ia_content = ia_content.replace('flex-1 flex overflow-hidden', 'flex-1 min-h-0 flex overflow-hidden')
ia_content = ia_content.replace('main className="flex-1 min-w-0 bg-[#F8FAF7] overflow-y-auto"', 'main className="flex-1 min-w-0 min-h-0 bg-[#F8FAF7] overflow-y-auto"')
ia_path.write_text(ia_content, encoding="utf-8")
print("Updated InstitutionAdminLayout.tsx")

# 5. Update AppHeader.tsx
ah_path = Path("frontend/src/components/layout/AppHeader.tsx")
ah_content = ah_path.read_text(encoding="utf-8")
ah_content = ah_content.replace(
    '<header className="sticky top-0 z-40 bg-[#FFFFFF]',
    '<header className="shrink-0 z-30 bg-[#FFFFFF]'
)
ah_path.write_text(ah_content, encoding="utf-8")
print("Updated AppHeader.tsx")
