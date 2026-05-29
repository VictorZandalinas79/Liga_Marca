"""
Script para acumular stat_name de matches_stats_players.parquet por cada id_jugador,
calcular sus 3 posiciones principales en el campo y contar los partidos jugados (MP).
"""

import pandas as pd

# Mapeo de las formaciones (string) al ID numérico correspondiente
FORMATION_MAP = {
    '442': 2, '41212': 3, '433': 4, '451': 5, '4411': 6, '4141': 7,
    '4231': 8, '4321': 9, '532': 10, '541': 11, '352': 12, '343': 13,
    '4222': 15, '3511': 16, '3421': 17, '3412': 18, '3142': 19,
    '343d': 20, '4132': 21, '4240': 22, '4312': 23, '3241': 24, '3331': 25
}

def assign_position(formation, slot):
    """
    Asigna la demarcación en inglés según el ID de formación y el slot del jugador.
    """
    try: 
        f, s = int(float(formation)), int(float(slot))
    except (ValueError, TypeError): 
        return None
    
    if s <= 0: 
        return None
    
    if s == 1: return 'Goalkeeper'
    
    # Laterales
    if 2 <= f <= 23:
        if s == 2: return 'Right Back'
        if s == 3: return 'Left Back'
        
    # Centrales
    if (f in [2,3,4,5,6,7,8,9,15,19,21,22,23] and s == 5) or (f in [11,12,13,16,17,18,20,24,25] and s == 6): 
        return 'Right Center Back'
    if (f in [2,3,4,5,6,7,8,9,15,19,21,22,23] and s == 6) or (f in [11,12,13,16,17,18,20,24,25] and s == 4): 
        return 'Left Center Back'
        
    # Interiores (NUEVO)
    if (f in [2,3,6,21,23] and s == 7) or (f == 9 and s == 8): 
        return 'Right Midfielder'
    if (f in [2,3,6,21,23] and s == 11) or (f == 9 and s == 7): 
        return 'Left Midfielder'
        
    # Mediocentros
    if (f in [2,6,8,15,22] and s == 4) or (f in [5,12,13,16] and s == 8) or (f in [11,12] and s == 4) or (f == 23 and s == 10) or (f == 5 and s == 7): 
        return 'Central Midfielder'
    if (f in [24,25] and s in [2,3]) or (f in [3,4,7,9,21,23] and s == 4) or (f in [10,13,17,18] and s == 7) or (f in [2,6,8,11,15,17,18,19,20,25] and s == 8) or (f in [5,11] and s == 10) or (f in [10,12,16] and s == 11): 
        return 'Defensive Midfielder'
    if (f == 5 and s == 4) or (f in [4,15,19,20,24,25] and s == 7) or (f in [3,4,7,21,23,24] and s == 8) or (f == 18 and s == 9) or (f in [6,7,9,12,16,21,22] and s == 10) or (f in [9,15,17,19] and s == 11): 
        return 'Attacking Midfielder'
        
    # Extremos (Modificados para no solapar con los Interiores)
    if (f in [5,7,8,11,22] and s == 7) or (f in [4,13,20,24,25] and s == 10): 
        return 'Right Winger'
    if (f in [4,5,7,11,13,20,22,24,25] and s == 11): 
        return 'Left Winger'
        
    # Delanteros
    if (f in [2,3,6,10,12,15,16,19,21,22,23] and s in [9,10]) or (f in [4,5,8,9,11,13,17,20,24,25] and s == 9): 
        return 'Striker'
        
    return None

def get_positions_and_mp(players_df: pd.DataFrame, teams_path: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Extrae las 3 posiciones más jugadas y los partidos jugados (MP).
    """
    # 1. Obtener formaciones de los equipos
    teams_df = pd.read_parquet(teams_path)
    formations = teams_df[teams_df['stat_name'] == 'formationUsed'].copy()
    formations['formation_id'] = formations['stat_value'].map(FORMATION_MAP)
    formations = formations[['id_equipo', 'id_partido', 'formation_id']].dropna()

    # 2. Obtener los slots de los jugadores
    slots = players_df[players_df['stat_name'] == 'formationPlace'].copy()
    slots['slot'] = pd.to_numeric(slots['stat_value'], errors='coerce')
    slots = slots[['id_jugador', 'id_equipo', 'id_partido', 'slot']].dropna()

    # 3. Merge y asignación de demarcación
    pos_df = slots.merge(formations, on=['id_equipo', 'id_partido'], how='inner')
    pos_df['Position'] = pos_df.apply(lambda row: assign_position(row['formation_id'], row['slot']), axis=1)

    # 4. Calcular el Top 3 de posiciones por jugador
    pos_counts = pos_df.dropna(subset=['Position']).groupby(['id_jugador', 'Position']).size().reset_index(name='count')
    pos_counts = pos_counts.sort_values(by=['id_jugador', 'count'], ascending=[True, False])
    
    top_pos = pos_counts.groupby('id_jugador').head(3).copy()
    top_pos['rank'] = top_pos.groupby('id_jugador').cumcount() + 1
    
    top_pos_pivoted = top_pos.pivot(index='id_jugador', columns='rank', values='Position').reset_index()
    top_pos_pivoted = top_pos_pivoted.rename(columns={1: 'Position 1', 2: 'Position 2', 3: 'Position 3'})
    
    # Asegurar que existan las 3 columnas por si algún jugador no llega a tener 3
    for col in ['Position 1', 'Position 2', 'Position 3']:
        if col not in top_pos_pivoted.columns:
            top_pos_pivoted[col] = ''

    # 5. Calcular Partidos Jugados (MP)
    mins = players_df[players_df['stat_name'] == 'minsPlayed'].copy()
    mins['mins'] = pd.to_numeric(mins['stat_value'], errors='coerce').fillna(0)
    mp_df = mins[mins['mins'] > 0].groupby('id_jugador').size().reset_index(name='MP')

    return top_pos_pivoted, mp_df

def aggregate_player_stats(
    players_input_path: str = "data/Segunda División/2025_2026/rows_data/matches_stats_players.parquet",
    teams_input_path: str = "data/Segunda División/2025_2026/rows_data/matches_stats_teams.parquet",
    output_path: str | None = None
) -> pd.DataFrame:
    """
    Acumula las stats numéricas, calcula posiciones y partidos jugados.
    """
    df = pd.read_parquet(players_input_path)

    # Obtener Posiciones y Partidos Jugados (MP)
    top_pos_df, mp_df = get_positions_and_mp(df, teams_input_path)

    # Convertir stat_value a numérico y acumular stats tradicionales
    df['stat_value'] = pd.to_numeric(df['stat_value'], errors='coerce').fillna(0)

    aggregated = df.groupby(
        ['id_jugador', 'jugador', 'stat_name'],
        as_index=False
    )['stat_value'].sum()

    pivoted = aggregated.pivot_table(
        index=['id_jugador', 'jugador'],
        columns='stat_name',
        values='stat_value',
        fill_value=0
    ).reset_index()

    # Merge final con las Posiciones y MP
    final_df = pivoted.merge(top_pos_df, on='id_jugador', how='left')
    final_df = final_df.merge(mp_df, on='id_jugador', how='left')

    # Limpieza de nulos (por si un jugador no tiene posiciones calculadas o no jugó)
    final_df['MP'] = final_df['MP'].fillna(0).astype(int)
    for col in ['Position 1', 'Position 2', 'Position 3']:
        final_df[col] = final_df[col].fillna('')

    # Reordenar para que MP y las Posiciones queden al principio (opcional pero recomendable)
    cols = ['id_jugador', 'jugador', 'MP', 'Position 1', 'Position 2', 'Position 3']
    other_cols = [c for c in final_df.columns if c not in cols]
    final_df = final_df[cols + other_cols]

    if output_path:
        final_df.to_parquet(output_path, index=False)
        print(f"Archivo guardado en: {output_path}")

    return final_df


if __name__ == "__main__":
    result = aggregate_player_stats(
        players_input_path="data/Segunda División/2025_2026/rows_data/matches_stats_players.parquet",
        teams_input_path="data/Segunda División/2025_2026/rows_data/matches_stats_teams.parquet",
        output_path="data/Segunda División/2025_2026/rows_data/players_stats_aggregated.parquet"
    )
    print(f"Total jugadores: {len(result)}")
    print(f"Total columnas: {len(result.columns)}")
    print("\nEjemplo de columnas agregadas (primeras 15):", result.columns.tolist()[:15])