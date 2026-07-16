import requests
from bs4 import BeautifulSoup
import re

url = "https://www.futbolfantasy.com/analytics/biwenger/mercado/biwenger-fantasy"
headers = {'User-Agent': 'Mozilla/5.0'}
response = requests.get(url, headers=headers)
soup = BeautifulSoup(response.text, 'html.parser')

row = soup.select_one('tr.elemento_jugador')
print(row.prettify())
