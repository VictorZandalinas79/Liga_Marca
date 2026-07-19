#!/usr/bin/env python3
"""
Script de sincronización automática para partidos en vivo.
Rediseñado para utilizar el nuevo motor V3 (MatchEventDownloader)
de trigger_descarga_eventos.py, pero ejecutándose en bucle (polling).
"""

import sys
import time
import requests
import json
from trigger_descarga_eventos import MatchEventDownloader, SDAPI_OUTLET_KEY

class LiveMatchSync(MatchEventDownloader):
    def run(self):
        print(f"\n{'='*60}")
        print(f"🔴 SINCRONIZACIÓN EN VIVO (Motor V3 RELEVO) - Partido {self.match_id}")
        print(f"{'='*60}")

        if not self.download_squads(): 
            print("⚠️ No se pudieron descargar los squads, continuando...")
        self.load_positions_from_squads()
        headers = self.load_headers()

        print(f"\n⏳ Obteniendo eventos del partido en tiempo real...")
        
        while True:
            # Reseteamos el estado temporal para recalcular puntos correctamente
            # con las reglas actuales de cada minuto.
            self.on_pitch = set()
            self.players_team = {}
            self.entry_minutes = {}
            self.total_minutes = {}
            self.points = {}
            self.stats = {}
            self.team_total_events = {}
            self.processed_events = set()
            self.team_goals_conceded = {}
            self.team_goals_scored = {}
            self.teams = set()
            
            current_minute = 0
            match_ended = False

            url = (f"https://api.performfeeds.com/soccerdata/matchevent/"
                   f"{SDAPI_OUTLET_KEY}/{self.match_id}"
                   f"?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback")

            try:
                res = requests.get(url, headers=headers, timeout=30)
                content = res.text
                start = content.find('{')
                end = content.rfind('}')
                
                if start != -1 and end != -1:
                    data = json.loads(content[start:end+1])
                    if "errorCode" not in data:
                        events = data.get('liveData', {}).get('event', [])
                        
                        # Ordenar pre-partido primero
                        events.sort(key=lambda x: (
                            -1 if x.get('periodId') == 16 else x.get('periodId', 0),
                            x.get('timeMin', 0), x.get('timeSec', 0), x.get('id', 0)
                        ))

                        for event in events:
                            t_min = event.get('timeMin', 0)
                            if t_min > current_minute: current_minute = t_min
                            self.process_event(event, current_minute)
                            if event.get('typeId') == 37:
                                match_ended = True
                        
                        # Retirar a todos al finalizar la evaluación del minuto actual
                        # para calcular los minutos jugados.
                        for pid in list(self.on_pitch):
                            self.remove_player(pid, current_minute)

                        self.upload_to_supabase()
                        self.update_match_score(match_ended=match_ended, current_minute=current_minute)

                        print(f"\n📊 Minuto {current_minute}' - Datos actualizados (Motor V3)")
                        
                        if match_ended:
                            print("\n🏁 Partido finalizado. Última actualización completada.")
                            break
                    else:
                        print(f"❌ Error de API: {data.get('errorCode')}")
            
            except Exception as e:
                print(f"❌ Error en el loop de sync: {e}")
            
            # Esperar antes de la siguiente petición
            time.sleep(30)


def main():
    print(f"\n{'='*60}")
    print("🔴 LIVE MATCH SYNC (V3) - Sincronización de Partidos en Vivo")
    print(f"{'='*60}")

    if len(sys.argv) >= 3:
        fixture_id = sys.argv[1]
        match_id = sys.argv[2]
        sync = LiveMatchSync(fixture_id, match_id)
        sync.run()
    else:
        print("❌ Uso: python sync_live_matches.py <fixture_id> <match_id>")

if __name__ == "__main__":
    main()
