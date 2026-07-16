import requests
from bs4 import BeautifulSoup

url = "https://www.futbolfantasy.com/jugadores/abdel-abqar"
headers = {'User-Agent': 'Mozilla/5.0'}
response = requests.get(url, headers=headers)
soup = BeautifulSoup(response.text, 'html.parser')

img = soup.select_one('img.img.w-100.mb-1')
print("Img src:", img['src'] if img else None)

info_right = soup.find(lambda tag: tag.name == 'div' and tag.get('class') == ['info-right'] and 'años' in tag.text)
if not info_right:
    # try searching by text
    for d in soup.select('div.info-right'):
        if 'años' in d.text:
            info_right = d
            break

print("Birth date text:", info_right.text if info_right else None)

