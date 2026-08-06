"""Borra de la tabla `players` a los que ya no están en el mercado de Biwenger.

La lista de jugadores de la app se ciñe a la última descarga de Biwenger.
`merge_players_data.py` ya aplica esa regla en cada sincronización, pero deja
vivos a los que en ese momento tenían referencias (plantillas, puntuaciones,
eventos): esas referencias se marchan luego —al cerrar una temporada se vacía
`player_scores`, por ejemplo— y el jugador se queda para siempre en la tabla
como un resto invisible.

Este script recoge esos restos sin necesidad de volver a scrapear Biwenger:
solo mira lo que la última sincronización ya decidió.

  Fuera del mercado = `is_in_biwenger = false`  (Biwenger dejó de listarlo)
                      o `precio` vacío          (nunca estuvo: solo está en Opta)

De esos se borra al que no tenga ninguna referencia. Quien esté en la plantilla
de alguien se conserva —se mantiene en el equipo de su dueño— y solo se
comprueba que quede oculto (`is_in_biwenger = false`), que es lo que impide a
los demás ficharlo y lo que lo saca de la página de Jugadores.

Uso:
    python limpiar_jugadores_fuera_biwenger.py            # informe, no toca nada
    python limpiar_jugadores_fuera_biwenger.py --aplicar  # borra de verdad
"""

import sys

from merge_players_data import (
    MAX_DELETE_RATIO,
    api_display_name,
    referenced_player_ids,
    supabase,
)


def fetch_all_players():
    filas, page, size = [], 0, 1000
    while True:
        resp = supabase.table("players").select(
            "id, short_name, first_name, last_name, precio, is_in_biwenger, team_id"
        ).range(page * size, (page + 1) * size - 1).execute()
        if not resp.data:
            break
        filas.extend(resp.data)
        page += 1
        if len(resp.data) < size:
            break
    return filas


def esta_fuera(player):
    """Lo que la app ya no ofrece: sin precio de Biwenger o retirado del mercado."""
    if player.get("is_in_biwenger") is False:
        return True
    precio = player.get("precio")
    return precio is None or precio == 0


def main():
    aplicar = "--aplicar" in sys.argv

    jugadores = fetch_all_players()
    print(f"-> {len(jugadores)} jugadores en la BD.")

    fuera = [p for p in jugadores if esta_fuera(p)]
    if not fuera:
        print("-> Todos los jugadores de la BD están en el mercado. Nada que hacer.")
        return

    print(f"-> {len(fuera)} fuera del mercado (sin precio de Biwenger o retirados).")

    ids = [p["id"] for p in fuera]
    referencias = referenced_player_ids(ids)
    fichados = referencias["team_players"]
    con_historial = set().union(*referencias.values()) - fichados
    borrables = [pid for pid in ids if pid not in fichados and pid not in con_historial]

    nombres = {p["id"]: api_display_name(p) for p in fuera}

    if fichados:
        print(f"-> {len(fichados)} están en la plantilla de alguien: se conservan ocultos.")
        for pid in sorted(fichados):
            print(f"   · {nombres.get(pid, pid)}")
    if con_historial:
        print(f"-> {len(con_historial)} tienen puntuaciones o eventos: se conservan ocultos.")

    # El mismo freno que el sync: borrar de golpe una parte grande de la tabla no
    # se puede deshacer, y si tantos jugadores han quedado sin precio lo que hay
    # que revisar es la sincronización, no vaciar la BD.
    if borrables and len(borrables) > MAX_DELETE_RATIO * len(jugadores):
        print(
            f"-> ABORTADO: {len(borrables)} de {len(jugadores)} jugadores "
            f"(más del {MAX_DELETE_RATIO:.0%}). Revisar la última sincronización antes de borrar."
        )
        return

    print(f"-> {len(borrables)} borrables (nadie los tiene fichados ni tienen historial):")
    for pid in borrables:
        print(f"   · {nombres.get(pid, pid)} ({pid})")

    # Los que se conservan tienen que quedar ocultos igualmente: un jugador sin
    # precio con la marca todavía en true seguiría saliendo en los listados.
    conservados = [pid for pid in ids if pid not in borrables and
                   next(p for p in fuera if p["id"] == pid).get("is_in_biwenger") is not False]

    if not aplicar:
        print("\n(Informe solamente. Repite con --aplicar para borrar.)")
        if conservados:
            print(f"Se ocultarían además {len(conservados)} jugadores conservados que siguen marcados como activos.")
        return

    borrados = 0
    for i in range(0, len(borrables), 100):
        lote = borrables[i:i + 100]
        try:
            supabase.table("players").delete().in_("id", lote).execute()
            borrados += len(lote)
        except Exception as e:
            print(f"   Aviso: lote de {len(lote)} rechazado ({e}). Reintentando uno a uno...")
            for pid in lote:
                try:
                    supabase.table("players").delete().eq("id", pid).execute()
                    borrados += 1
                except Exception as e2:
                    print(f"   No se pudo borrar {nombres.get(pid, pid)}: {e2}")
    print(f"-> {borrados} jugadores borrados.")

    if conservados:
        for i in range(0, len(conservados), 100):
            lote = conservados[i:i + 100]
            try:
                supabase.table("players").update({"is_in_biwenger": False}).in_("id", lote).execute()
            except Exception as e:
                print(f"   Aviso: fallo al ocultar lote de {len(lote)} ({e}).")
        print(f"-> {len(conservados)} jugadores conservados marcados como fuera del mercado.")


if __name__ == "__main__":
    main()
