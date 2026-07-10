import re

with open('frontend-web/src/app/(dashboard)/clasificacion/page.tsx', 'r') as f:
    content = f.read()

interfaces = re.search(r'(interface UserStanding.*?})\n\ninterface', content, re.DOTALL).group(1)

start_idx = content.find('const fetchStandings = async () => {')
idx = start_idx
open_braces = 0
found_first = False
end_idx = -1
while idx < len(content):
    if content[idx] == '{':
        open_braces += 1
        found_first = True
    elif content[idx] == '}':
        open_braces -= 1
        if found_first and open_braces == 0:
            end_idx = idx + 1
            break
    idx += 1

func_body = content[start_idx:end_idx]

# Clean up func_body
func_body = func_body.replace('const fetchStandings = async () => {', '')
# Remove fetchMatchdays()
func_body = re.sub(r'\s*await fetchMatchdays\(\)', '', func_body)
# Fix early returns
func_body = re.sub(r'setLoading\(false\)\s*return', 'return { standings: [], lastPlayedMatchday: 1 }', func_body)
# Remove setState calls
func_body = re.sub(r'setLastPlayedMatchday\(maxPlayed\)', '', func_body)
func_body = re.sub(r'setStandings\(standingsData\)', '', func_body)
func_body = re.sub(r'setLoading\(false\)', '', func_body)

# Remove the sorting logic based on state variables
sort_logic_regex = r'standingsData\.sort\(\(a, b\) => {.*?}\)'
func_body = re.sub(sort_logic_regex, '', func_body, flags=re.DOTALL)

# Default sort by total_points before assigning current_position
func_body = func_body.replace(
    'standingsData.forEach((standing, index) => {',
    'standingsData.sort((a, b) => b.total_points - a.total_points);\n      standingsData.forEach((standing, index) => {'
)

# Remove trailing brace
func_body = func_body.rstrip().rstrip('}')

output = """import { applySanctionsToTeam } from '@/lib/infractions'

export """ + interfaces + """

export async function getStandings(supabase: any): Promise<{ standings: UserStanding[], lastPlayedMatchday: number }> {
""" + func_body + """
  return { standings: standingsData, lastPlayedMatchday: maxPlayed };
}
"""

with open('frontend-web/src/lib/standings.ts', 'w') as f:
    f.write(output)

print("Fix complete.")
