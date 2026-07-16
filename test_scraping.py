import requests
from bs4 import BeautifulSoup
import re

url = "https://www.futbolfantasy.com/analytics/biwenger/mercado/biwenger-fantasy"
headers = {'User-Agent': 'Mozilla/5.0'}
response = requests.get(url, headers=headers)
soup = BeautifulSoup(response.text, 'html.parser')

players = soup.select('tr')
for row in players[:5]:
    name_el = row.select_one('span.d-none.d-md-inline')
    team_el = row.select_one('span.d-none:not(.d-md-inline)') # Usually the team is nearby or inside another span
    
    val_el = row.select_one('td.text-center.font-weight-bold')
    
    if name_el and val_el:
        print(f"Name: {name_el.text.strip()}, Val: {val_el.text.strip()}")
        # try to find team
        team_el = row.select_one('span')
        if team_el:
            print(f"Team span: {team_el.text}")

print("Next link:", soup.select_one('a.next.link.nav-link'))

