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


def compute_team_sanctions(lineup, prev_mine, held_by_others_prev, points, player_meta, cfg, valid_formations, pos_max, prev_penalties=None, lineup_prev=None, zeroed_prev=None):
    """Devuelve tupla (sanctions, zeroed) para un equipo."""
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

    # Identificar sanciones no resueltas de la jornada anterior
    unresolved_types = set()
    if prev_penalties and lineup_prev:
        for p in prev_penalties:
            if isinstance(p, dict):
                desc = p.get("description", "")
            else:
                desc = p[0] if p else ""
            
            # 1. Dolly rule (exclusividad)
            if desc.startswith("Jugador de "):
                # El formato es "Jugador de {owners_str}: {name}" (o con espacios en el separador)
                clean_desc = desc[:-len(" (no cambiado)")] if desc.endswith(" (no cambiado)") else desc
                parts = clean_desc.split(":")
                if len(parts) >= 2:
                    player_name = parts[-1].strip().lower()
                    # Buscar el ID de ese jugador en lineup_prev
                    offender = None
                    for pid in lineup_prev:
                        name = player_meta.get(pid, {}).get("name", "").lower()
                        if name == player_name:
                            offender = pid
                            break
                    if offender and offender in lineup:
                        # No ha cambiado el jugador que causaba la exclusividad
                        # Se vuelve a penalizar al jugador y al mejor del resto
                        rest = best_player([x for x in lineup if x != offender], zeroed, points)
                        lbl = desc if desc.endswith(" (no cambiado)") else f"{desc} (no cambiado)"
                        zero([offender, rest], lbl)
                        unresolved_types.add("exclusivity")
            
            # 2. Más de max_players_per_team
            elif "jugadores de un mismo equipo" in desc:
                # Contar qué equipo real causaba la infracción en lineup_prev
                real_team_counts_prev = {}
                for pid in lineup_prev:
                    rt = player_meta.get(pid, {}).get("real_team")
                    if rt:
                        real_team_counts_prev[rt] = real_team_counts_prev.get(rt, 0) + 1
                
                for rt, count in real_team_counts_prev.items():
                    if count > cfg["max_players_per_team"]:
                        # Verificar si sigue superando el límite en lineup
                        real_team_counts_now = {}
                        for pid in lineup:
                            rt_now = player_meta.get(pid, {}).get("real_team")
                            if rt_now:
                                real_team_counts_now[rt_now] = real_team_counts_now.get(rt_now, 0) + 1
                        
                        if real_team_counts_now.get(rt, 0) > cfg["max_players_per_team"]:
                            # No se ha resuelto
                            team_players = [pid for pid in lineup if player_meta.get(pid, {}).get("real_team") == rt]
                            best_of_lineup = best_player(lineup, zeroed, points)
                            introduced = [pid for pid in team_players if pid not in prev_mine]
                            exclude = zeroed | ({best_of_lineup} if best_of_lineup else set())
                            best_introduced = best_player(introduced, exclude, points)
                            lbl = desc if desc.endswith(" (no cambiado)") else f"{desc} (no cambiado)"
                            zero([best_of_lineup, best_introduced], lbl)
                            unresolved_types.add("max_players")
            
            # 3. Presupuesto superado
            elif "Presupuesto superado" in desc:
                total_price = sum(player_meta.get(p, {}).get("precio", 0) or 0 for p in lineup)
                if total_price > cfg["budget_limit"]:
                    # No se ha resuelto
                    first = best_player(lineup, zeroed, points)
                    second = best_player(lineup, zeroed | {first} if first else zeroed, points)
                    lbl = desc if desc.endswith(" (no cambiado)") else f"{desc} (no cambiado)"
                    zero([first, second], lbl)
                    unresolved_types.add("budget")
            
            # 4. Táctica incorrecta
            elif "Táctica incorrecta" in desc:
                counts = {"GK": 0, "DEF": 0, "MID": 0, "FWD": 0}
                for pid in lineup:
                    counts[pos_code(player_meta.get(pid, {}).get("position"))] += 1
                formation = (counts["DEF"], counts["MID"], counts["FWD"])
                if counts["GK"] != 1 or formation not in valid_formations:
                    # No se ha resuelto
                    offending_pos = None
                    for pos in ("DEF", "MID", "FWD"):
                        if counts[pos] > pos_max.get(pos, 0):
                            offending_pos = pos
                            break
                    lbl = desc if desc.endswith(" (no cambiado)") else f"{desc} (no cambiado)"
                    if offending_pos:
                        in_pos = [pid for pid in lineup if pos_code(player_meta.get(pid, {}).get("position")) == offending_pos]
                        introduced = [pid for pid in in_pos if pid not in prev_mine]
                        worst_intro = best_player(introduced or in_pos, zeroed, points)
                        rest = best_player([pid for pid in lineup if pid != worst_intro], zeroed, points)
                        zero([worst_intro, rest], lbl)
                    else:
                        first = best_player(lineup, zeroed, points)
                        rest = best_player([pid for pid in lineup if pid != first], zeroed, points)
                        zero([first, rest], lbl)
                    unresolved_types.add("tactics")

    # 1) Jugador perteneciente a otro usuario (exclusividad / retención)
    # Se evalúa de manera normal para jugadores nuevos no contemplados en el carry-over
    for pid in lineup:
        if pid in held_by_others_prev and pid not in prev_mine:
            name = player_meta.get(pid, {}).get("name", pid)
            owners = held_by_others_prev.get(pid, ["otro usuario"])
            owners_str = ", ".join(owners)
            offender = pid
            rest = best_player([p for p in lineup if p != offender], zeroed, points)
            zero([offender, rest], f"Jugador de {owners_str}: {name}")

    # 2) Superado el nº de jugadores de un mismo equipo real
    if "max_players" not in unresolved_types:
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
    if "budget" not in unresolved_types:
        total_price = sum(player_meta.get(p, {}).get("precio", 0) or 0 for p in lineup)
        if total_price > cfg["budget_limit"]:
            first = best_player(lineup, zeroed, points)
            second = best_player(lineup, zeroed | {first} if first else zeroed, points)
            zero([first, second], f"Presupuesto superado ({total_price}M/{cfg['budget_limit']}M)")

    # 4) Táctica incorrecta
    if "tactics" not in unresolved_types:
        counts = {"GK": 0, "DEF": 0, "MID": 0, "FWD": 0}
        for pid in lineup:
            counts[pos_code(player_meta.get(pid, {}).get("position"))] += 1
        formation = (counts["DEF"], counts["MID"], counts["FWD"])
        if counts["GK"] != 1 or formation not in valid_formations:
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
                first = best_player(lineup, zeroed, points)
                rest = best_player([p for p in lineup if p != first], zeroed, points)
                zero([first, rest], f"Táctica incorrecta ({counts['GK']}-{formation[0]}-{formation[1]}-{formation[2]})")

    # 5) Exceso de cambios (máx. 3 cambios, salvo J1 y excepción de multas previas)
    if lineup_prev is not None:
        new_players = {pid for pid in lineup if pid not in lineup_prev}
        num_changes = len(new_players)
        
        penalized_prev = zeroed_prev if zeroed_prev else set()
        replaced_penalized = {pid for pid in penalized_prev if pid not in lineup}
        replaced_penalized_count = len(replaced_penalized)
        
        allowed_changes = cfg.get("max_changes_per_matchday", 3) + replaced_penalized_count
        if num_changes > allowed_changes:
            excess = num_changes - allowed_changes
            new_players_sorted = sorted(list(new_players), key=lambda pid: points.get(pid, 0), reverse=True)
            new_players_candidates = [pid for pid in new_players_sorted if pid not in zeroed]
            to_zero = new_players_candidates[:excess]
            zero(to_zero, f"Exceso de cambios ({num_changes} cambios/máx {allowed_changes})")

    return sanctions, zeroed


def run_matchday(sb, matchday):
    cfg = load_config(sb)
    fantasy_starting_matchday = cfg.get("fantasy_starting_matchday", 1)
    valid_formations, pos_max = formation_maxes(cfg["formations"])
    log(f"⚙️  Config: presupuesto={cfg['budget_limit']}M, máx/equipo={cfg['max_players_per_team']}, "
        f"pagos(g/p/r)={cfg['pay_winner']}/{cfg['pay_loser']}/{cfg['pay_rest']}")

    # Equipos de usuario
    user_teams = fetch_all(sb, "user_teams", "id,user_id")
    team_to_user = {t["id"]: t["user_id"] for t in user_teams}

    # Perfiles de usuario para obtener nombres y división
    profiles = fetch_all(sb, "profiles", "id,full_name,email,division")
    user_names = {
        p["id"]: p.get("full_name") or (p.get("email") or "").split("@")[0] or "otro usuario"
        for p in profiles
    }
    user_divisions = {
        p["id"]: p.get("division")
        for p in profiles
    }
    team_to_username = {
        t["id"]: user_names.get(t["user_id"], "otro usuario")
        for t in user_teams
    }

    # 1. Obtener todas las alineaciones registradas hasta la jornada actual
    all_tp = fetch_all(sb, "team_players", "team_id,player_id,matchday")

    def get_lineup_for_matchday(tp_list, team_id, m):
        max_md = None
        for r in tp_list:
            if r["team_id"] == team_id and r["matchday"] is not None and r["matchday"] <= m:
                if max_md is None or r["matchday"] > max_md:
                    max_md = r["matchday"]
        if max_md is None:
            return []
        return [r["player_id"] for r in tp_list if r["team_id"] == team_id and r["matchday"] == max_md]

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

    # Puntos por jugador en todas las jornadas hasta la jornada actual
    scores_all = fetch_all(sb, "player_scores", "player_id,total_points,matchday")
    scores_by_md = {}
    for s in scores_all:
        md = s["matchday"]
        if md is not None and md <= matchday:
            pid = s["player_id"]
            scores_by_md.setdefault(md, {})[pid] = scores_by_md.setdefault(md, {}).get(pid, 0) + (s.get("total_points") or 0)

    # 2. Calcular de manera secuencial desde J1 hasta la jornada actual
    lineup_history = {}
    zeroed_history = {}
    penalties_history = {}

    user_teams_ids = [t["id"] for t in user_teams]
    lineup_history[0] = {tid: [] for tid in user_teams_ids}
    zeroed_history[0] = {tid: set() for tid in user_teams_ids}
    penalties_history[0] = {tid: [] for tid in user_teams_ids}

    for m in range(1, matchday + 1):
        lineup_history[m] = {}
        zeroed_history[m] = {}
        penalties_history[m] = {}

        for tid in user_teams_ids:
            lineup_history[m][tid] = get_lineup_for_matchday(all_tp, tid, m)

        held_by_others_prev_m = {}
        for tid in user_teams_ids:
            held_by_others_prev_m[tid] = {}
            prev_mine_other = lineup_history[m - 1]
            for owner_tid, pids in prev_mine_other.items():
                if owner_tid != tid:
                    owner_name = team_to_username.get(owner_tid, "otro usuario")
                    for pid in pids:
                        held_by_others_prev_m[tid].setdefault(pid, []).append(owner_name)

        points_m = scores_by_md.get(m, {})
        for tid in user_teams_ids:
            lineup = lineup_history[m][tid]
            if not lineup:
                zeroed_history[m][tid] = set()
                penalties_history[m][tid] = []
                continue

            prev_mine = set(lineup_history[m - 1][tid])
            held_by_others_prev = held_by_others_prev_m[tid]

            # La jornada en la que arranca el juego no tiene "anterior" a efectos de
            # sanciones (exceso de cambios, multas no resueltas, etc.), aunque
            # fantasy_starting_matchday no sea la J1 real de la liga.
            has_prev = m > fantasy_starting_matchday
            prev_penalties = penalties_history[m - 1][tid] if has_prev else None
            lineup_prev = lineup_history[m - 1][tid] if has_prev else None
            zeroed_prev = zeroed_history[m - 1][tid] if has_prev else None

            sanctions, zeroed = compute_team_sanctions(
                lineup, prev_mine, held_by_others_prev, points_m, player_meta,
                cfg, valid_formations, pos_max,
                prev_penalties=prev_penalties, lineup_prev=lineup_prev, zeroed_prev=zeroed_prev
            )

            zeroed_history[m][tid] = zeroed
            penalties_history[m][tid] = sanctions

    # Limpia sanciones previas de esta jornada (idempotencia)
    try:
        sb.table("penalties").delete().eq("matchday", matchday).execute()
    except Exception as e:
        log(f"⚠️ No se pudieron borrar sanciones previas: {e}")

    results = []  # (team_id, user_id, raw, penalty, net)
    penalty_rows = []
    for team_id in user_teams_ids:
        user_id = team_to_user.get(team_id)
        lineup = lineup_history[matchday][team_id]
        if not lineup:
            continue

        points_now = scores_by_md.get(matchday, {})
        raw = sum(points_now.get(p, 0) for p in lineup)
        sanctions = penalties_history[matchday][team_id]
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

    # Agrupar resultados por división para el reparto de pagos (1/4 ganan, 1/4 pierden)
    div_results = {1: [], 2: [], 3: [], None: []}
    for r in results:
        team_id, user_id, raw, pen, net = r
        div = user_divisions.get(user_id)
        if div in (1, 2, 3):
            div_results[div].append(r)
        else:
            div_results[None].append(r)

    for div in div_results:
        div_results[div].sort(key=lambda x: x[4], reverse=True)
    
    winners = set()
    losers = set()
    
    def get_quarter(n):
        return max(1, round(n / 4.0)) if n > 0 else 0

    # 1ª División
    r1 = div_results[1]
    n1 = len(r1)
    q1 = get_quarter(n1)
    for i in range(q1):
        if i < n1: winners.add(r1[i][0])
    for i in range(q1):
        idx = n1 - 1 - i
        if idx >= q1: losers.add(r1[idx][0])

    # 2ª División
    r2 = div_results[2]
    n2 = len(r2)
    q2 = get_quarter(n2)
    for i in range(q2):
        if i < n2: winners.add(r2[i][0])
    for i in range(q2):
        idx = n2 - 1 - i
        if idx >= q2: losers.add(r2[idx][0])

    # 3ª División
    r3 = div_results[3]
    n3 = len(r3)
    q3_losers = get_quarter(n3)
    q3_winners = q2  # Igual al número de perdedores en Segunda
    for i in range(q3_winners):
        if i < n3: winners.add(r3[i][0])
    for i in range(q3_losers):
        idx = n3 - 1 - i
        if idx >= q3_winners: losers.add(r3[idx][0])

    # El ranking general lo mantenemos para guardarlo en la base de datos
    ranked = sorted(results, key=lambda r: r[4], reverse=True)

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
    cfg = load_config(sb)
    env_md = os.environ.get("SANCTION_MATCHDAY", "").strip()
    matchday = int(env_md) if env_md.isdigit() else detect_matchday(sb)
    if not matchday:
        log("ℹ️ No hay ninguna jornada finalizada que procesar")
        return
        
    fantasy_starting_matchday = cfg.get("fantasy_starting_matchday", 1)
    if matchday < fantasy_starting_matchday:
        log(f"ℹ️ La jornada {matchday} es anterior al inicio de la liga ({fantasy_starting_matchday}). No se calculan sanciones ni pagos.")
        return
        
    log("=" * 60)
    log(f"🏁 Procesando sanciones y pagos de la jornada {matchday}")
    log("=" * 60)
    run_matchday(sb, matchday)
    log("✅ Hecho")

if __name__ == "__main__":
    main()
