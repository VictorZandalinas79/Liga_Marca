#!/usr/bin/env python3
"""
Motor de SANCIONES y PAGOS por jornada (se ejecuta al cerrar la jornada).

Para una jornada N:
  1. Calcula, por equipo de usuario, las sanciones de puntos según las reglas
     del juego (league_config) y las escribe en la tabla `penalties`.
  2. Calcula los puntos NETOS (brutos − sanciones), ordena, y reparte los pagos
     de la jornada: top 3 = pay_winner, bottom 3 = pay_loser, resto = pay_rest.
     Ajusta profiles.amount_paid (columna "Importe") con la DIFERENCIA respecto
     a lo ya aplicado (idempotente: reejecutar no cobra dos veces).

Sanciones (cada una pone a 0 los puntos de ciertos jugadores; el penalti es la
suma de esos puntos). Para no penalizar dos veces al mismo jugador, se lleva un
conjunto de jugadores ya anulados y "el mejor del resto" elige entre los que aún
puntúan.

  - JUGADOR PERTENECIENTE A OTRO EQUIPO / OVEJA DOLLY: alineas un jugador que en
    la jornada anterior tenía otro usuario y tú no (modelo de retención; en J1 no
    aplica). No puntúa ese jugador ni el mejor del resto del equipo.
  - SUPERADO Nº JUGADORES DE UN MISMO EQUIPO (> max_players_per_team): no puntúa
    el mejor de ese equipo real, ni el mejor introducido esta jornada de ese equipo.
  - SUPERADO EL PRESUPUESTO: no puntúan los dos jugadores con mayor puntuación.
  - TÁCTICA INCORRECTA (formación no permitida): no puntúa el mejor introducido
    esta jornada en la posición que rebasa el máximo, ni el mejor de los 10 restantes.

Uso:
  SANCTION_MATCHDAY=7 python "3. calcular_sanciones_y_pagos.py"
  (sin variable: procesa la última jornada con partidos ya finalizados)
"""

import os
import sys
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()


def _clean(v):
    return v.strip().strip('"').strip("'").strip() if v else v


SUPABASE_URL = _clean(os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL"))
SUPABASE_KEY = _clean(os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY"))

POS_MAP = {
    "goalkeeper": "GK", "gk": "GK",
    "defender": "DEF", "def": "DEF",
    "midfielder": "MID", "mid": "MID",
    "forward": "FWD", "attacker": "FWD", "fwd": "FWD",
}

DEFAULT_CONFIG = {
    "budget_limit": 275,
    "max_players_per_team": 4,
    "formations": ["3-5-2", "3-4-3", "4-4-2", "4-3-3", "4-5-1", "5-4-1", "5-3-2"],
    "pay_winner": 0,
    "pay_loser": 2,
    "pay_rest": 1,
}


def log(msg):
    print(msg, flush=True)


def pos_code(position):
    return POS_MAP.get((position or "").lower(), "MID")


def get_client():
    if not SUPABASE_URL or not SUPABASE_KEY:
        log("❌ Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def load_config(sb):
    try:
        res = sb.table("league_config").select("*").eq("id", 1).limit(1).execute()
        if res.data:
            return {**DEFAULT_CONFIG, **res.data[0]}
    except Exception as e:
        log(f"⚠️ No se pudo leer league_config ({e}); uso valores por defecto")
    return dict(DEFAULT_CONFIG)


def formation_maxes(formations):
    """Máximo permitido de DEF/MID/FWD a lo largo de todas las tácticas válidas."""
    max_def = max_mid = max_fwd = 0
    valid = set()
    for f in formations:
        parts = [p.strip() for p in str(f).split("-")]
        if len(parts) != 3:
            continue
        try:
            d, m, w = int(parts[0]), int(parts[1]), int(parts[2])
        except ValueError:
            continue
        valid.add((d, m, w))
        max_def, max_mid, max_fwd = max(max_def, d), max(max_mid, m), max(max_fwd, w)
    return valid, {"DEF": max_def, "MID": max_mid, "FWD": max_fwd}


def fetch_all(sb, table, columns, eq=None):
    """Carga paginada de una tabla (Supabase limita a 1000 filas)."""
    rows, frm, size = [], 0, 1000
    while True:
        q = sb.table(table).select(columns)
        if eq:
            for k, v in eq.items():
                q = q.eq(k, v)
        page = q.range(frm, frm + size - 1).execute().data or []
        rows.extend(page)
        if len(page) < size:
            break
        frm += size
    return rows


def detect_matchday(sb):
    """Última jornada con todos sus partidos finalizados."""
    fixtures = fetch_all(sb, "fixtures", "matchday,status")
    by_md = {}
    for f in fixtures:
        md = f.get("matchday")
        if md and md > 0:
            by_md.setdefault(md, []).append((f.get("status") or "").lower())
    finished = [md for md, st in by_md.items() if all(s == "finished" for s in st)]
    return max(finished) if finished else None


def best_player(candidates, zeroed, points):
    """Jugador con más puntos entre los candidatos que aún no han sido anulados."""
    best, best_pts = None, None
    for pid in candidates:
        if pid in zeroed:
            continue
        p = points.get(pid, 0)
        if best is None or p > best_pts:
            best, best_pts = pid, p
    return best


def compute_team_sanctions(lineup, prev_mine, held_by_others_prev, points, player_meta, cfg, valid_formations, pos_max):
    """Devuelve lista de (descripcion, puntos_penalizados) para un equipo."""
    sanctions = []
    zeroed = set()

    def zero(pids, label):
        gained = 0
        newly = []
        for pid in pids:
            if pid and pid not in zeroed:
                zeroed.add(pid)
                newly.append(pid)
                gained += points.get(pid, 0)
        if newly:
            sanctions.append((label, gained))

    # 1) Jugador perteneciente a otro usuario (exclusividad / retención)
    for pid in lineup:
        if pid in held_by_others_prev and pid not in prev_mine:
            name = player_meta.get(pid, {}).get("name", pid)
            owners = held_by_others_prev.get(pid, ["otro usuario"])
            owners_str = ", ".join(owners)
            offender = pid
            rest = best_player([p for p in lineup if p != offender], zeroed, points)
            zero([offender, rest], f"Jugador de {owners_str}: {name}")

    # 2) Superado el nº de jugadores de un mismo equipo real
    real_team_count = {}
    for pid in lineup:
        rt = player_meta.get(pid, {}).get("real_team")
        if rt:
            real_team_count[rt] = real_team_count.get(rt, 0) + 1
    for rt, count in real_team_count.items():
        if count > cfg["max_players_per_team"]:
            team_players = [p for p in lineup if player_meta.get(p, {}).get("real_team") == rt]
            best_of_lineup = best_player(lineup, zeroed, points)
            introduced = [p for p in team_players if p not in prev_mine]
            exclude = zeroed | ({best_of_lineup} if best_of_lineup else set())
            best_introduced = best_player(introduced, exclude, points)
            zero([best_of_lineup, best_introduced],
                 f"Más de {cfg['max_players_per_team']} jugadores de un mismo equipo ({count})")

    # 3) Superado el presupuesto
    total_price = sum(player_meta.get(p, {}).get("precio", 0) or 0 for p in lineup)
    if total_price > cfg["budget_limit"]:
        first = best_player(lineup, zeroed, points)
        second = best_player(lineup, zeroed | {first} if first else zeroed, points)
        zero([first, second], f"Presupuesto superado ({total_price}M/{cfg['budget_limit']}M)")

    # 4) Táctica incorrecta
    counts = {"GK": 0, "DEF": 0, "MID": 0, "FWD": 0}
    for pid in lineup:
        counts[pos_code(player_meta.get(pid, {}).get("position"))] += 1
    formation = (counts["DEF"], counts["MID"], counts["FWD"])
    if counts["GK"] != 1 or formation not in valid_formations:
        # Posición que rebasa el máximo permitido
        offending_pos = None
        for pos in ("DEF", "MID", "FWD"):
            if counts[pos] > pos_max.get(pos, 0):
                offending_pos = pos
                break
        if offending_pos:
            in_pos = [p for p in lineup if pos_code(player_meta.get(p, {}).get("position")) == offending_pos]
            introduced = [p for p in in_pos if p not in prev_mine]
            worst_intro = best_player(introduced or in_pos, zeroed, points)
            rest = best_player([p for p in lineup if p != worst_intro], zeroed, points)
            zero([worst_intro, rest], f"Táctica incorrecta ({counts['GK']}-{formation[0]}-{formation[1]}-{formation[2]})")
        else:
            # Formación inválida sin exceso claro de posición: anula top + mejor del resto
            first = best_player(lineup, zeroed, points)
            rest = best_player([p for p in lineup if p != first], zeroed, points)
            zero([first, rest], f"Táctica incorrecta ({counts['GK']}-{formation[0]}-{formation[1]}-{formation[2]})")

    return sanctions


def run_matchday(sb, matchday):
    cfg = load_config(sb)
    valid_formations, pos_max = formation_maxes(cfg["formations"])
    log(f"⚙️  Config: presupuesto={cfg['budget_limit']}M, máx/equipo={cfg['max_players_per_team']}, "
        f"pagos(g/p/r)={cfg['pay_winner']}/{cfg['pay_loser']}/{cfg['pay_rest']}")

    # Equipos de usuario
    user_teams = fetch_all(sb, "user_teams", "id,user_id")
    team_to_user = {t["id"]: t["user_id"] for t in user_teams}

    # Perfiles de usuario para obtener nombres
    profiles = fetch_all(sb, "profiles", "id,full_name,email")
    user_names = {
        p["id"]: p.get("full_name") or (p.get("email") or "").split("@")[0] or "otro usuario"
        for p in profiles
    }
    team_to_username = {
        t["id"]: user_names.get(t["user_id"], "otro usuario")
        for t in user_teams
    }

    # 1. Obtener todas las alineaciones registradas hasta la jornada actual
    all_tp = fetch_all(sb, "team_players", "team_id,player_id,matchday")

    # 2. Filtrar para la jornada N: buscar la última jornada registrada <= matchday por equipo
    max_md_now = {}
    for r in all_tp:
        md = r["matchday"]
        tid = r["team_id"]
        if md <= matchday:
            if tid not in max_md_now or md > max_md_now[tid]:
                max_md_now[tid] = md

    lineup_now = {}
    for r in all_tp:
        tid = r["team_id"]
        if r["matchday"] == max_md_now.get(tid):
            lineup_now.setdefault(tid, []).append(r["player_id"])

    # 3. Filtrar para la jornada N-1: buscar la última jornada registrada <= matchday - 1 por equipo
    prev_matchday = matchday - 1
    max_md_prev = {}
    for r in all_tp:
        md = r["matchday"]
        tid = r["team_id"]
        if md <= prev_matchday:
            if tid not in max_md_prev or md > max_md_prev[tid]:
                max_md_prev[tid] = md

    lineup_prev = {}
    for r in all_tp:
        tid = r["team_id"]
        if r["matchday"] == max_md_prev.get(tid):
            lineup_prev.setdefault(tid, set()).add(r["player_id"])

    if not lineup_now:
        log(f"ℹ️ No hay alineaciones para la jornada {matchday}; nada que procesar")
        return

    # Jugadores que en N-1 tenía OTRO usuario (para la regla de exclusividad)
    held_prev_by_team = lineup_prev  # team_id -> set(player_id)

    # Catálogo de jugadores (posición, equipo real, precio, nombres)
    players = fetch_all(sb, "players", "id,position,team_id,precio,short_name,first_name")
    player_meta = {
        p["id"]: {
            "position": p.get("position"),
            "real_team": p.get("team_id"),
            "precio": p.get("precio") or 0,
            "name": p.get("short_name") or p.get("first_name") or p.get("id"),
        }
        for p in players
    }

    # Puntos por jugador en la jornada N
    scores = fetch_all(sb, "player_scores", "player_id,total_points,matchday", eq={"matchday": matchday})
    points = {}
    for s in scores:
        points[s["player_id"]] = points.get(s["player_id"], 0) + (s.get("total_points") or 0)

    # Limpia sanciones previas de esta jornada (idempotencia)
    try:
        sb.table("penalties").delete().eq("matchday", matchday).execute()
    except Exception as e:
        log(f"⚠️ No se pudieron borrar sanciones previas: {e}")

    results = []  # (team_id, user_id, raw, penalty, net)
    penalty_rows = []
    for team_id, lineup in lineup_now.items():
        user_id = team_to_user.get(team_id)
        prev_mine = held_prev_by_team.get(team_id, set())
        held_by_others_prev = {}
        for owner_tid, pids in held_prev_by_team.items():
            if owner_tid != team_id:
                owner_name = team_to_username.get(owner_tid, "otro usuario")
                for pid in pids:
                    held_by_others_prev.setdefault(pid, []).append(owner_name)

        raw = sum(points.get(p, 0) for p in lineup)
        sanctions = compute_team_sanctions(
            lineup, prev_mine, held_by_others_prev, points, player_meta,
            cfg, valid_formations, pos_max,
        )
        penalty_total = sum(pts for _, pts in sanctions)
        for desc, pts in sanctions:
            penalty_rows.append({
                "team_id": team_id, "user_id": user_id,
                "matchday": matchday, "description": desc, "points": pts,
            })
        results.append((team_id, user_id, raw, penalty_total, raw - penalty_total))

    if penalty_rows:
        sb.table("penalties").insert(penalty_rows).execute()
    log(f"⚖️  {len(penalty_rows)} sanción(es) registrada(s) en la jornada {matchday}")

    # Reparto de pagos: top 3 = ganador, bottom 3 = perdedor, resto = resto
    ranked = sorted(results, key=lambda r: r[4], reverse=True)
    winners = {r[0] for r in ranked[:3]}
    losers = {r[0] for r in ranked[-3:] if r[0] not in winners}

    for rank, (team_id, user_id, raw, pen, net) in enumerate(ranked, start=1):
        if team_id in winners:
            amount = cfg["pay_winner"]
        elif team_id in losers:
            amount = cfg["pay_loser"]
        else:
            amount = cfg["pay_rest"]

        # Aplica la DIFERENCIA respecto a lo ya cobrado en esta jornada
        prev = sb.table("matchday_payments").select("amount").eq("team_id", team_id).eq("matchday", matchday).limit(1).execute()
        prev_amount = prev.data[0]["amount"] if prev.data else 0
        delta = float(amount) - float(prev_amount or 0)

        if delta != 0 and user_id:
            prof = sb.table("profiles").select("amount_paid").eq("id", user_id).limit(1).execute()
            base = float(prof.data[0]["amount_paid"] or 0) if prof.data else 0
            sb.table("profiles").update({"amount_paid": base + delta}).eq("id", user_id).execute()

        sb.table("matchday_payments").upsert({
            "team_id": team_id, "user_id": user_id, "matchday": matchday,
            "net_points": net, "rank": rank, "amount": amount,
        }, on_conflict="team_id,matchday").execute()

    log(f"💶  Pagos aplicados: {len(winners)} ganador(es), {len(losers)} perdedor(es), "
        f"{len(ranked) - len(winners) - len(losers)} resto")


def main():
    sb = get_client()
    env_md = os.environ.get("SANCTION_MATCHDAY", "").strip()
    matchday = int(env_md) if env_md.isdigit() else detect_matchday(sb)
    if not matchday:
        log("ℹ️ No hay ninguna jornada finalizada que procesar")
        return
    log("=" * 60)
    log(f"🏁 Procesando sanciones y pagos de la jornada {matchday}")
    log("=" * 60)
    run_matchday(sb, matchday)
    log("✅ Hecho")


if __name__ == "__main__":
    main()
