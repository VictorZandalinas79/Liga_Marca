import requests

id = 6889
endpoints = [
    f"https://www.futbolfantasy.com/api/jugadores/{id}",
    f"https://www.futbolfantasy.com/jugadores/modal/{id}",
    f"https://www.futbolfantasy.com/jugadores/ficha_modal/{id}",
    f"https://www.futbolfantasy.com/jugadores/{id}",
    f"https://www.futbolfantasy.com/analytics/biwenger/player/{id}"
]

for url in endpoints:
    r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
    print(r.status_code, url)
