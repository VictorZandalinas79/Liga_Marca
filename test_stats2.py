import sys
sys.path.append('frontend-web')
from trigger_descarga_eventos import MatchEventDownloader

downloader = MatchEventDownloader('57dotnff3xaafnxfltzt4czdg', '57dotnff3xaafnxfltzt4czdg')
downloader.upload_to_supabase = lambda *args, **kwargs: None
downloader.run()

pid = 'ieu0x9fy8hpqyztdjg8bgpnt'
stats = downloader.stats[pid]
pos = downloader.player_positions_map.get(pid)
rules = downloader.scoring_rules.get('relevo_limits', {}).get(pos, {})
mins = downloader.total_minutes.get(pid, 0)
def req(rate): return (rate * mins) / 90.0

rate_val = rules.get('last_man_per_min', 0.02) * 90
req_val = req(rate_val)

print(f"Mins: {mins}")
print(f"rate_val: {rate_val}")
print(f"req_val: {req_val}")

def check_fmt(val, limit, is_pct=False, is_or=False):
    sign = ">=" if not is_pct else ">"
    v_str = f"{val:.0f}%" if is_pct else f"{val:g}"
    l_str = f"{limit:.0f}%" if is_pct else f"{limit:.1f}"
    return f"{v_str} ({sign} {l_str})"

t1 = check_fmt(1, req_val)
print(f"t1: {t1}")

