#!/usr/bin/env python3
import sys
import os
import textwrap

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, KeepTogether
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
except ImportError:
    print("Falta instalar reportlab. Ejecutando: pip install reportlab")
    os.system("pip install reportlab")
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, KeepTogether
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

sys.path.append(os.path.join(os.path.dirname(__file__), 'frontend-web'))
from trigger_descarga_eventos import MatchEventDownloader

def generar_pdf(fixture_id, match_id):
    print(f"Descargando eventos y calculando puntuaciones para fixture: {fixture_id}...")
    
    downloader = MatchEventDownloader(fixture_id, match_id)
    downloader.upload_to_supabase = lambda: print("   ℹ️ Subida a BD desactivada para la generación del PDF.")
    downloader.update_match_score = lambda *args, **kwargs: None
    downloader.run()
    
    pdf_filename = f"Reporte_Completo_{fixture_id}.pdf"
    doc = SimpleDocTemplate(pdf_filename, pagesize=A4, rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30)
    
    styles = getSampleStyleSheet()
    title_style = styles['Title']
    
    player_header_style = ParagraphStyle(
        'PlayerHeader', 
        parent=styles['Heading2'], 
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=6
    )
    
    elements = []
    elements.append(Paragraph(f"Desglose de Puntuación (Métricas y Relevo) - Partido {fixture_id}", title_style))
    elements.append(Spacer(1, 15))
    
    R = downloader.scoring_rules
    R_p = R.get('participation', {})
    R_e = R.get('events', {})
    
    players = []
    team_points = {}
    team_players = {}
    
    for pid, name in downloader.player_names.items():
        if pid not in downloader.stats: continue
        stats = downloader.stats[pid]
        pos = downloader.player_positions_map.get(pid, 'MED')
        mins = downloader.total_minutes.get(pid, 0)
        if mins == 0 and not stats: continue
        
        team_id = downloader.players_team.get(pid, "")
        pts = downloader.points.get(pid, 0)
        
        players.append({
            "pid": pid, "name": name, "team": str(team_id), "pos": pos, "min": mins, "pts": pts, "stats": stats
        })
        
        # Agrupar para el resumen
        t_id = str(team_id)
        if t_id not in team_points:
            team_points[t_id] = 0
            team_players[t_id] = []
        team_points[t_id] += pts
        team_players[t_id].append({"name": name, "pos": pos, "pts": pts})
        
    players = sorted(players, key=lambda x: (x["team"], -x["pts"]))
    
    # ---------------------------------------------------------
    # RESUMEN POR EQUIPOS
    # ---------------------------------------------------------
    elements.append(Paragraph("Resumen de Puntos por Equipo", styles['Heading2']))
    elements.append(Spacer(1, 10))
    
    for t_id, pts_total in team_points.items():
        elements.append(Paragraph(f"<b>Equipo: {t_id}</b> - Puntos Totales: <b>{pts_total:g}</b>", styles['Heading3']))
        t_players = sorted(team_players[t_id], key=lambda x: -x['pts'])
        
        # Agrupar en columnas para que no sea muy largo (opcional)
        sum_rows = [["Jugador", "Pos.", "Puntos"]]
        for p in t_players:
            sum_rows.append([p['name'], p['pos'], f"{p['pts']:g}"])
            
        sum_table = Table(sum_rows, colWidths=[200, 60, 60])
        sum_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#334155")),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ]))
        elements.append(sum_table)
        elements.append(Spacer(1, 15))
        
    elements.append(Paragraph("Desglose Individual", styles['Heading2']))
    elements.append(Spacer(1, 10))
    
    for p in players:
        pid = p["pid"]
        stats = p["stats"]
        pos = p["pos"]
        
        # Helper rules
        def g(key): return stats.get(key, 0)
        def rule_val(key, default=0):
            val = R_e.get(key)
            if val is not None:
                if isinstance(val, dict): return val.get(pos, val.get('all', val.get('MED', default)))
                return val
            # penalties_per_X check
            penalties = downloader.scoring_rules.get('penalties_per_X', {})
            if key in penalties:
                p_rule = penalties.get(key, {})
                pos_rule = p_rule.get(pos, p_rule.get('all', {}))
                if isinstance(pos_rule, dict): return pos_rule.get('points', default)
                return pos_rule
            return default
            
        rows = []
        rows.append(["Bloque", "Métrica", "Cant.", "Valor U.", "Puntos"])
        
        def add(bloque, label, count, unit, flat=False, force_pts=None):
            if force_pts is not None:
                pts = force_pts
            else:
                pts = unit if flat else count * unit
                
            rows.append([
                bloque, 
                label, 
                "-" if flat else str(count), 
                "-" if flat else f"{unit:g}", 
                f"{pts:g}"
            ])
            
        # B1: Participación
        mins = p["min"]
        if mins > 0:
            is_starter = downloader.entry_minutes.get(pid, 999) == 0
            if mins >= R_p.get('minutes_threshold', 60):
                label_part = f"Titular ({mins}')" if is_starter else f"Suplente (>=60') ({mins}')"
                add("Participación", label_part, 0, R_p.get('starter_bonus', 2), flat=True)
                wb = g('win_bonus')
                db = g('draw_bonus')
                if wb > 0:
                    add("Participación", "Victoria (>=60')", 0, wb, flat=True)
                elif db > 0:
                    add("Participación", "Empate (>=60')", 0, db, flat=True)
            else:
                label_part = f"Titular (<60') ({mins}')" if is_starter else f"Suplente ({mins}')"
                add("Participación", label_part, 0, R_p.get('substitute_bonus', 1), flat=True)
        else:
            add("Participación", "No jugó", 0, 0, flat=True)
                
        # B2: Goles y Asistencias
        add("Goles/Asis", f"Gol ({pos})", g('goals'), rule_val('goal', 3))
        add("Goles/Asis", "Gol Propia", g('own_goals'), rule_val('own_goal', -2))
        add("Goles/Asis", "Asistencia Gol", g('assists'), rule_val('assist_goal', 1.5))
        add("Goles/Asis", "Asistencia sin gol", g('fantasy_assist'), rule_val('assist_no_goal', 0.5))
        
        # B3: Defensa
        cs_val = rule_val('clean_sheet', 0)
        cs_pts = cs_val if stats.get('clean_sheet') else 0
        add("Defensa", f"Portería Cero ({pos})", 0, cs_val, flat=True, force_pts=cs_pts)
        
        gc = g('goals_conceded')
        gc_unit = rule_val('goal_conceded', -0.5)
        gc_pts = gc * gc_unit if gc > 1 else 0
        add("Defensa", f"Gol Encajado ({pos})", gc, gc_unit, force_pts=gc_pts)
        
        # B4: Penaltis
        add("Penaltis", "Penalti Provocado", g('penalties_won'), rule_val('penalty_won', 1))
        add("Penaltis", "Penalti Cometido", g('penalties_conceded'), rule_val('penalty_conceded', -1))
        add("Penaltis", "Penalti Fallado", g('penalties_missed'), rule_val('penalty_missed', -2))
        add("Penaltis", "Penalti Parado", g('penalties_saved'), rule_val('penalty_save', 3))
        
        # B5: Tarjetas
        add("Tarjetas", "Amarilla", g('yellow_cards'), rule_val('yellow_card', -0.5))
        add("Tarjetas", "Doble Amarilla", g('second_yellow_cards'), rule_val('second_yellow_card', -1))
        add("Tarjetas", "Roja Directa", g('red_cards'), rule_val('red_card', -2))
        
        # B6: Portero
        add("Portero", "Paradas", g('saves'), rule_val('saves', 0.5))
        
        # B7: Otras Acciones
        add("Otras", "Despejes", g('clearances'), rule_val('clearances', 0.5))
        add("Otras", "Tiros a puerta", g('shots_on_target'), rule_val('shots_on_target', 0.3))
        add("Otras", "Regates comp.", g('takeons_won'), rule_val('takeons_won', 0.5))
        add("Otras", "Balones al área", g('box_entries'), rule_val('box_entries', 0.1))
        add("Otras", "Balón recuperado", g('ball_recoveries'), rule_val('ball_recoveries', 0.1))
        
        # B8: Penalizaciones
        lost = g('dispossessed') + g('bad_touches')
        add("Pérdidas", "Pérdida de balón", lost, rule_val('lost_balls', -0.1))
        
        # Helper para reglas RELEVO
        relevo_pts = g('relevo_points')
        rules = downloader.scoring_rules.get('relevo_limits', {}).get(pos, {})
        def rate_val(key, default):
            return rules.get(key, default)
            
        def check_fmt(val, rate_limit, is_pct=False):
            if is_pct:
                return f"{val:.0f}% (>{rate_limit:.0f}%)"
            else:
                # Para conteos por minuto
                per_min = (val / mins) if mins > 0 else 0
                return f"{val} ({per_min:.3f}/m >= {rate_limit:.3f}/m)"

        blocks_info = []
        
        if pos == 'POR':
            # B1
            saves = g('saves')
            t1 = check_fmt(saves, rate_val('saves_per_min', 0.06))
            blocks_info.append(("Bloque 1", f"Paradas: {t1}", g('block_1_pts') == 1.0))
            
            # B2
            calidad = downloader.player_calidad_parada.get(pid, 0.0)
            calidad_min = (calidad / mins) if mins > 0 else 0
            saves_min = (saves / mins) if mins > 0 else 0
            lim2 = rate_val('calidad_parada_multiplier', 0.5) * saves_min
            blocks_info.append(("Bloque 2", f"Calidad P.: {calidad_min:.3f}/m (> {lim2:.3f}/m)", g('block_2_pts') == 1.0))
            
            # B3
            lp = g('long_balls_completed')
            t3a = check_fmt(lp, rate_val('long_passes_per_min', 0.05))
            p_c = g('passes_completed'); p_a = g('passes_attempted')
            p_pct = (p_c / p_a * 100) if p_a > 0 else 0
            p_att_min = (p_a / mins) if mins > 0 else 0
            t3b = f"Pases: {p_pct:.0f}% (>{rate_val('pass_pct', 65)}%) y {p_a} int. ({p_att_min:.3f}/m >={rate_val('pass_att_per_min', 0.3):.3f}/m)"
            blocks_info.append(("Bloque 3", f"{t3a} OR {t3b}", g('block_3_pts') == 1.0))
            
            # B4
            claims = g('claims')
            t4a = check_fmt(claims, rate_val('claims_per_min', 0.02))
            punches = g('punches_ok') + g('punches_fail')
            t4b = check_fmt(punches, rate_val('punches_per_min', 0.03))
            blocks_info.append(("Bloque 4", f"Blocaje: {t4a} OR Puños: {t4b}", g('block_4_pts') == 1.0))
            
        elif pos == 'DEF':
            # B1
            lm = g('relevo_def_action_last_man')
            t1 = check_fmt(lm, rate_val('last_man_per_min', 0.02))
            blocks_info.append(("Bloque 1", f"Último H.: {t1}", g('block_1_pts') == 1.0))
            
            # B2
            lp = g('long_balls_completed')
            t2a = check_fmt(lp, rate_val('long_passes_per_min', 0.05))
            fp = g('forward_passes')
            t2b = check_fmt(fp, rate_val('forward_passes_per_min', 0.05))
            blocks_info.append(("Bloque 2", f"P. Largo: {t2a} OR P. Adelante: {t2b}", g('block_2_pts') == 1.0))
            
            # B3
            a_w = g('aerials_won'); a_l = g('aerials_lost')
            a_pct = (a_w / (a_w + a_l) * 100) if (a_w + a_l) > 0 else 0
            t3a = check_fmt(a_pct, rate_val('aerials_pct', 60), is_pct=True)
            g_w = g('relevo_ground_duels_won'); g_t = g('relevo_ground_duels_total')
            g_pct = (g_w / g_t * 100) if g_t > 0 else 0
            t3b = check_fmt(g_pct, rate_val('ground_duels_pct', 60), is_pct=True)
            blocks_info.append(("Bloque 3", f"Aéreos: {t3a} OR Duelos Suelo: {t3b}", g('block_3_pts') == 1.0))
            
            # B4
            abp = g('relevo_abp_remates')
            t4a = check_fmt(abp, rate_val('abp_remates_per_min', 0.01))
            cross = g('successful_crosses')
            t4b = check_fmt(cross, rate_val('crosses_per_min', 0.02))
            blocks_info.append(("Bloque 4", f"Remates ABP: {t4a} OR Centros: {t4b}", g('block_4_pts') == 1.0))
            
        elif pos == 'MED':
            # B1
            p_opp = g('pass_opp_half_completed'); p_opp_att = g('pass_opp_half_attempted')
            p_opp_pct = (p_opp / p_opp_att * 100) if p_opp_att > 0 else 0
            t1 = check_fmt(p_opp_pct, rate_val('pass_opp_pct', 50), is_pct=True)
            blocks_info.append(("Bloque 1", f"Pases C. Rival: {t1}", g('block_1_pts') == 1.0))
            
            # B2
            a_w = g('aerials_won'); a_l = g('aerials_lost')
            a_pct = (a_w / (a_w + a_l) * 100) if (a_w + a_l) > 0 else 0
            t2a = check_fmt(a_pct, rate_val('aerials_pct', 60), is_pct=True)
            g_w = g('relevo_ground_duels_won'); g_t = g('relevo_ground_duels_total')
            g_pct = (g_w / g_t * 100) if g_t > 0 else 0
            t2b = check_fmt(g_pct, rate_val('ground_duels_pct', 60), is_pct=True)
            blocks_info.append(("Bloque 2", f"Aéreos: {t2a} OR Duelos Suelo: {t2b}", g('block_2_pts') == 1.0))
            
            # B3
            s_on = g('shots_on_target'); s_tot = g('shots_total')
            s_pct = (s_on / s_tot * 100) if s_tot > 0 else 0
            t3a = check_fmt(s_pct, rate_val('shots_on_pct', 50), is_pct=True)
            t_w = g('takeons_won'); t_tot = t_w + g('takeons_lost') + g('takeons_overrun')
            t_pct = (t_w / t_tot * 100) if t_tot > 0 else 0
            t3b = check_fmt(t_pct, rate_val('takeons_pct', 35), is_pct=True)
            blocks_info.append(("Bloque 3", f"Tiros P: {t3a} OR Regates: {t3b}", g('block_3_pts') == 1.0))
            
            # B4
            assis = g('assists') + g('fantasy_assist')
            t4a = check_fmt(assis, rate_val('assists_per_min', 0.03))
            cross = g('successful_crosses')
            t4b = check_fmt(cross, rate_val('crosses_per_min', 0.02))
            blocks_info.append(("Bloque 4", f"Asis: {t4a} OR Centros: {t4b}", g('block_4_pts') == 1.0))

        elif pos == 'DEL':
            # B1
            p_opp = g('pass_opp_half_completed'); p_opp_att = g('pass_opp_half_attempted')
            p_opp_pct = (p_opp / p_opp_att * 100) if p_opp_att > 0 else 0
            t1 = check_fmt(p_opp_pct, rate_val('pass_opp_pct', 50), is_pct=True)
            blocks_info.append(("Bloque 1", f"Pases C. Rival: {t1}", g('block_1_pts') == 1.0))
            
            # B2
            a_w = g('aerials_won'); a_l = g('aerials_lost')
            a_pct = (a_w / (a_w + a_l) * 100) if (a_w + a_l) > 0 else 0
            t2a = check_fmt(a_pct, rate_val('aerials_pct', 40), is_pct=True)
            rec = g('relevo_recup_campo_rival')
            t2b = check_fmt(rec, rate_val('recup_opp_per_min', 0.03)) # 0.03 en BD
            blocks_info.append(("Bloque 2", f"Aéreos: {t2a} OR Recup C. Rival: {t2b}", g('block_2_pts') == 1.0))
            
            # B3
            s_on = g('shots_on_target'); s_tot = g('shots_total')
            s_pct = (s_on / s_tot * 100) if s_tot > 0 else 0
            t3a = check_fmt(s_pct, rate_val('shots_on_pct', 60), is_pct=True)
            head = g('relevo_remates_cabeza')
            t3b = check_fmt(head, rate_val('head_shots_per_min', 0.02))
            blocks_info.append(("Bloque 3", f"Tiros P: {t3a} OR Remate Cabeza: {t3b}", g('block_3_pts') == 1.0))
            
            # B4
            assis = g('assists') + g('fantasy_assist')
            t4a = check_fmt(assis, rate_val('assists_per_min', 0.03))
            t_w = g('takeons_won'); t_tot = t_w + g('takeons_lost') + g('takeons_overrun')
            t_pct = (t_w / t_tot * 100) if t_tot > 0 else 0
            t4b = check_fmt(t_pct, rate_val('takeons_pct', 35), is_pct=True)
            blocks_info.append(("Bloque 4", f"Asis: {t4a} OR Regates: {t4b}", g('block_4_pts') == 1.0))

        has_relevo = relevo_pts != 0 or any(stats.get(f'block_{i}_pts') for i in range(1, 5))
        for b_name, b_text, ok in blocks_info:
            add("RELEVO", f"{b_name}: {b_text}", 0, 1 if ok else 0, flat=True)
        if relevo_pts == -1: add("RELEVO", "Penalización (-1)", 0, -1, flat=True)
        
        # Filtramos la cabecera si no hay más filas
        if len(rows) > 1:
            t = Table(rows, colWidths=[100, 220, 50, 50, 60])
            style = TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#334155")),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 9),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
                
                ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor("#f8fafc")),
                ('ALIGN', (0, 1), (1, -1), 'LEFT'),
                ('ALIGN', (2, 1), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 1), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ])
            
            # Pintar de verde/rojo la columna de Puntos
            for i in range(1, len(rows)):
                try:
                    pt_val = float(rows[i][4])
                    if pt_val > 0:
                        style.add('TEXTCOLOR', (4, i), (4, i), colors.HexColor("#16a34a"))
                        style.add('FONTNAME', (4, i), (4, i), 'Helvetica-Bold')
                    elif pt_val < 0:
                        style.add('TEXTCOLOR', (4, i), (4, i), colors.HexColor("#dc2626"))
                        style.add('FONTNAME', (4, i), (4, i), 'Helvetica-Bold')
                except:
                    pass
            t.setStyle(style)
            
            header = Paragraph(f"<b>{p['name']}</b> | {p['pos']} | Equipo: {p['team']} | Puntos Totales: <b>{p['pts']:g}</b>", player_header_style)
            
            block = KeepTogether([header, Spacer(1, 4), t, Spacer(1, 15)])
            elements.append(block)

    doc.build(elements)
    print("=" * 60)
    print(f"✅ ¡PDF Detallado Generado con éxito!")
    print(f"   Archivo: {pdf_filename}")
    print("=" * 60)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python generar_reporte_pdf.py <fixture_id> [match_id]")
        sys.exit(1)
    generar_pdf(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else sys.argv[1])
